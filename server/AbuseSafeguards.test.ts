import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { httpServer } from './index.js';
import { authService } from './AuthService.js';
import { databaseService } from './DatabaseService.js';
import { setVerifiedPhone } from './testHelpers.js';

let BASE: string;
const call = async (method: string, path: string, token?: string, body?: any) => {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: res.status, data: await res.json() as any };
};

const staff = (id: string, role: 'AGENT' | 'SUPER_ADMIN') => {
  databaseService.createUser({ id, telegram_id: `tg_${id}`, username: id, role, referral_code: `REF_${id}` });
  return databaseService.createSession(id, `tg_${id}`).id;
};
const uid = () => `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

describe('Abuse safeguards (agents, payouts, referrals, staff data)', () => {
  let agentA: string, agentB: string, superAdmin: string;

  beforeAll(async () => {
    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', () => {
      BASE = `http://127.0.0.1:${(httpServer.address() as any).port}`;
      resolve();
    }));
    agentA = staff('usr_safeguard_agent_a', 'AGENT');
    agentB = staff('usr_safeguard_agent_b', 'AGENT');
    superAdmin = staff('usr_safeguard_super', 'SUPER_ADMIN');
  });
  afterAll(async () => {
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  describe('1. Agents only process deposits assigned to them', () => {
    it('blocks other agents, self-claiming, and unassigned deposits; allows the assigned agent', async () => {
      const customer = authService.register('Deposit Customer', '0944200001', 'cust_pw_1');
      const dep = databaseService.createDepositRequest(customer.user!.playerId, 'Deposit Customer', 300, 'Telebirr', `SG_${uid()}`);

      // Unassigned: no agent may process it
      expect((await call('POST', `/api/staff/deposits/${dep.id}/approve`, agentA)).status).toBe(403);
      // Agents cannot claim it
      expect((await call('POST', `/api/staff/deposits/${dep.id}/assign`, agentA, { agentId: 'usr_safeguard_agent_a' })).status).toBe(403);

      // Super Admin assigns it to agent A
      expect((await call('POST', `/api/staff/deposits/${dep.id}/assign`, superAdmin, { agentId: 'usr_safeguard_agent_a' })).status).toBe(200);

      // Agent B still cannot approve or reject it
      expect((await call('POST', `/api/staff/deposits/${dep.id}/approve`, agentB)).status).toBe(403);
      expect((await call('POST', `/api/staff/deposits/${dep.id}/reject`, agentB, { reason: 'x' })).status).toBe(403);
      expect(databaseService.getWallet(customer.user!.playerId)!.balance).toBe(0);

      // Agent A can
      const ok = await call('POST', `/api/staff/deposits/${dep.id}/approve`, agentA);
      expect(ok.status).toBe(200);
      expect(databaseService.getWallet(customer.user!.playerId)!.balance).toBe(300);
    });

    it('auto-assigns deposits to the agent holding the active payment account', async () => {
      const prev = databaseService.getActivePaymentAccount();
      const acc = databaseService.createPaymentAccount({
        provider: 'Telebirr', account_name: 'Agent A Till', phone_number: '0944299999', assigned_agent_id: 'usr_safeguard_agent_a'
      } as any);
      databaseService.getDb().prepare('UPDATE payment_accounts SET is_active = CASE WHEN id = ? THEN 1 ELSE 0 END').run(acc.id);
      try {
        const customer = authService.register('Till Customer', '0944200002', 'cust_pw_2');
        const dep = databaseService.createDepositRequest(customer.user!.playerId, 'Till Customer', 150, 'Telebirr', `SG_${uid()}`);
        expect(dep.assigned_agent_id).toBe('usr_safeguard_agent_a');
        expect((await call('POST', `/api/staff/deposits/${dep.id}/approve`, agentB)).status).toBe(403);
        expect((await call('POST', `/api/staff/deposits/${dep.id}/approve`, agentA)).status).toBe(200);
      } finally {
        databaseService.getDb().prepare('UPDATE payment_accounts SET is_active = CASE WHEN id = ? THEN 1 ELSE 0 END').run(prev?.id ?? '');
      }
    });
  });

  describe('2. Withdrawals only go to the verified phone', () => {
    it('rejects other destinations and accounts without a verified phone', async () => {
      const reg = authService.register('Payout User', '0944200003', 'payout_pw_1');
      databaseService.updateWalletBalance(reg.user!.playerId, 500);

      const other = await call('POST', '/api/wallet/withdraw', reg.token, { amount: 100, address: '0944888888' });
      expect(other.status).toBe(400);
      expect(other.data.error).toMatch(/verified Telebirr number/i);
      expect(databaseService.getWallet(reg.user!.playerId)!.balance).toBe(500);

      const own = await call('POST', '/api/wallet/withdraw', reg.token, { amount: 100, address: '+251944200003' });
      expect(own.status).toBe(200);

      // Account without a phone (e.g. Telegram-only before verification)
      const noPhoneId = `usr_nophone_${uid()}`;
      databaseService.createUser({ id: noPhoneId, telegram_id: `tg_${noPhoneId}`, username: 'NoPhone', referral_code: `REF_${noPhoneId}` });
      databaseService.updateWalletBalance(noPhoneId, 500);
      const tok = databaseService.createSession(noPhoneId, `tg_${noPhoneId}`).id;
      expect((await call('POST', '/api/wallet/withdraw', tok, { amount: 100, address: '0944200004' })).status).toBe(403);

      // Sanity: once verified, it works
      setVerifiedPhone(noPhoneId, '0944200004');
      expect((await call('POST', '/api/wallet/withdraw', tok, { amount: 100, address: '0944200004' })).status).toBe(200);
    });
  });

  describe('3. Referral rewards resist farming', () => {
    const makeReferee = (referrerId: string, n: number) => {
      const id = `usr_referee_${uid()}_${n}`;
      databaseService.createUser({ id, telegram_id: `tg_${id}`, username: id, referral_code: `REF_${id}`, referred_by: referrerId });
      return id;
    };
    const approvedDeposit = (userId: string, amount: number) => {
      const dep = databaseService.createDepositRequest(userId, 'Ref', amount, 'Telebirr', `SG_${uid()}`);
      databaseService.approveDeposit('usr_safeguard_super', dep.id);
    };

    it('requires the referred player to deposit enough and actually play', () => {
      const referrer = `usr_referrer_${uid()}`;
      databaseService.createUser({ id: referrer, telegram_id: `tg_${referrer}`, username: 'Referrer', referral_code: `REF_${referrer}` });
      const referee = makeReferee(referrer, 1);
      const rewards = databaseService.rewardService;

      approvedDeposit(referee, 10); // tiny deposit
      expect(rewards.getReferralRewards(referrer).unclaimedCount).toBe(0);
      expect(() => rewards.claimReferralRewards(referrer)).toThrow(/qualifying deposit/i);

      approvedDeposit(referee, 90); // total 100, but hasn't played
      expect(rewards.getReferralRewards(referrer).unclaimedCount).toBe(0);

      rewards.recordCardPurchase(referee, 'room_10birr', 5);
      expect(rewards.getReferralRewards(referrer).unclaimedCount).toBe(1);
      expect(rewards.claimReferralRewards(referrer).rewardAmount).toBe(10);
    });

    it('caps rewards per referrer per day', () => {
      const prevCap = process.env.REFERRAL_MAX_REWARDS_PER_DAY;
      process.env.REFERRAL_MAX_REWARDS_PER_DAY = '2';
      try {
        const referrer = `usr_referrer_${uid()}`;
        databaseService.createUser({ id: referrer, telegram_id: `tg_${referrer}`, username: 'CapReferrer', referral_code: `REF_${referrer}` });
        for (let i = 0; i < 3; i++) {
          const r = makeReferee(referrer, i);
          approvedDeposit(r, 100);
          databaseService.rewardService.recordCardPurchase(r, 'room_10birr', 5);
        }
        expect(databaseService.rewardService.claimReferralRewards(referrer).qualifiedClaimed).toBe(2);
        expect(() => databaseService.rewardService.claimReferralRewards(referrer)).toThrow(/daily referral reward limit/i);
      } finally {
        if (prevCap === undefined) delete process.env.REFERRAL_MAX_REWARDS_PER_DAY;
        else process.env.REFERRAL_MAX_REWARDS_PER_DAY = prevCap;
      }
    });
  });

  describe('4. Staff customer data', () => {
    it('masks phones for agents, shows them to Super Admins, and never exposes password hashes', async () => {
      const reg = authService.register('Private Customer', '0944200005', 'private_pw_1');
      const id = reg.user!.playerId;

      const agentList = await call('GET', '/api/staff/customers?search=Private', agentA);
      const agentRow = agentList.data.customers.find((c: any) => c.id === id);
      expect(agentRow.phone).toBe('+25194***0005');

      const agentDetail = await call('GET', `/api/staff/customers/${id}`, agentA);
      expect(agentDetail.data.customer.phone).toBe('+25194***0005');
      expect(agentDetail.data.user.phone).toBe('+25194***0005');
      expect(JSON.stringify(agentDetail.data)).not.toMatch(/password_(hash|salt)/);

      const adminList = await call('GET', '/api/staff/customers?search=Private', superAdmin);
      expect(adminList.data.customers.find((c: any) => c.id === id).phone).toBe('+251944200005');

      const adminDetail = await call('GET', `/api/super-admin/users/${id}/details`, superAdmin);
      expect(JSON.stringify(adminDetail.data)).not.toMatch(/password_(hash|salt)/);

      const statusChange = await call('PUT', `/api/super-admin/users/${id}/status`, superAdmin, { status: 'ACTIVE', reason: 'check' });
      expect(JSON.stringify(statusChange.data)).not.toMatch(/password_(hash|salt)/);
    });
  });
});
