import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { app, httpServer } from './index.js';
import { authService } from './AuthService.js';
import { ledgerService } from './LedgerService.js';
import { databaseService } from './DatabaseService.js';
import { dailyJackpotService } from './DailyJackpotService.js';

let BASE_URL: string;
let normalUserToken: string;
let normalUser: any;
let agentToken: string;
let agentUser: any;
let superAdminToken: string;
let superAdminUser: any;

describe('Agent and Super Admin Dashboard Integration Test Suite', () => {
  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      httpServer.listen(0, '127.0.0.1', () => {
        const addr = httpServer.address() as any;
        BASE_URL = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });

    // 1. Create Super Admin (SUPER_ADMIN role)
    superAdminUser = databaseService.getUserById('usr_super_admin') || databaseService.createUser({
      id: 'usr_super_admin',
      telegram_id: '111222333',
      username: 'PlatformOwner',
      referral_code: 'SUPADMIN1',
      role: 'SUPER_ADMIN'
    });
    const superAdminSession = databaseService.createSession(superAdminUser.id, superAdminUser.telegram_id);
    superAdminToken = superAdminSession.id;

    // 2. Create Agent user (AGENT role)
    agentUser = databaseService.getUserById('usr_agent_test') || databaseService.createUser({
      id: 'usr_agent_test',
      telegram_id: '444555666',
      username: 'AbebeAgent',
      referral_code: 'AGENTABEBE',
      role: 'AGENT',
      phone: '+251911998877',
      telebirr_number: '0911998877',
      assigned_agent_name: 'Abebe Kebede'
    });
    const agentSession = databaseService.createSession(agentUser.id, agentUser.telegram_id);
    agentToken = agentSession.id;

    // 3. Create Normal User (USER role)
    const tgId = Math.floor(884000000 + Math.random() * 899999);
    const initData = authService.createSignedTelegramInitData(
      { id: tgId, first_name: 'TestCustomer', username: `cust_${tgId}` },
      process.env.TELEGRAM_BOT_TOKEN || 'test_mock_bot_token_123456:ABCdefGHIjklMNOpqrSTUvwxYZ'
    );
    const authRes = await authService.authenticateTelegram(initData);
    const regRes = await authService.completeRegistration(
      authRes.tempToken!,
      'CustomerOne'
    );
    expect(regRes.success).toBe(true);
    normalUser = regRes.user;
    normalUserToken = regRes.sessionToken!;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  // ═══════════════════════════════════════════════════════════
  // 1. ROLE-BASED ACCESS CONTROL & ENDPOINT ISOLATION
  // ═══════════════════════════════════════════════════════════
  describe('1. Role-Based Access Control & API Isolation', () => {
    it('Normal user receives 403 Forbidden on staff endpoints', async () => {
      const res = await fetch(`${BASE_URL}/api/staff/me`, {
        headers: { Authorization: `Bearer ${normalUserToken}` }
      });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toBe('Forbidden: Staff authorization required');
    });

    it('Normal user receives 403 Forbidden on super-admin endpoints', async () => {
      const res = await fetch(`${BASE_URL}/api/super-admin/overview`, {
        headers: { Authorization: `Bearer ${normalUserToken}` }
      });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toBe('Forbidden: Super Admin authorization required');
    });

    it('Agent can access staff endpoints successfully', async () => {
      const res = await fetch(`${BASE_URL}/api/staff/me`, {
        headers: { Authorization: `Bearer ${agentToken}` }
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.profile.role).toBe('AGENT');
      expect(data.profile.username).toBe('AbebeAgent');
      expect(data.profile.telebirr_number).toBe('0911998877');
    });

    it('Agent CANNOT access Super Admin overview (403 Forbidden)', async () => {
      const res = await fetch(`${BASE_URL}/api/super-admin/overview`, {
        headers: { Authorization: `Bearer ${agentToken}` }
      });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toBe('Forbidden: Super Admin authorization required');
    });

    it('Agent CANNOT create new agents (403 Forbidden)', async () => {
      const res = await fetch(`${BASE_URL}/api/super-admin/agents`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${agentToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          username: 'UnauthorizedAgent',
          password: 'SecretPassword123'
        })
      });
      expect(res.status).toBe(403);
    });

    it('Agent CANNOT modify payment accounts (403 Forbidden)', async () => {
      const res = await fetch(`${BASE_URL}/api/super-admin/payment-accounts`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${agentToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          provider: 'Telebirr',
          account_name: 'Hacked Account',
          phone_number: '0999999999'
        })
      });
      expect(res.status).toBe(403);
    });

    it('Super Admin can access both super-admin and staff endpoints', async () => {
      const overviewRes = await fetch(`${BASE_URL}/api/super-admin/overview`, {
        headers: { Authorization: `Bearer ${superAdminToken}` }
      });
      expect(overviewRes.status).toBe(200);
      const overviewData = await overviewRes.json();
      expect(overviewData.success).toBe(true);
      expect(overviewData.stats).toBeDefined();

      const staffMeRes = await fetch(`${BASE_URL}/api/staff/me`, {
        headers: { Authorization: `Bearer ${superAdminToken}` }
      });
      expect(staffMeRes.status).toBe(200);
      const staffMeData = await staffMeRes.json();
      expect(staffMeData.profile.role).toBe('SUPER_ADMIN');
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 2. DYNAMIC PAYMENT NUMBER & SUPER ADMIN AUDITED SWITCH
  // ═══════════════════════════════════════════════════════════
  describe('2. Telebirr Payment Numbers & Historical Immutability', () => {
    let initialAccount: any;
    let newAccount: any;

    it('Customer deposit screen gets active payment number from public endpoint', async () => {
      const res = await fetch(`${BASE_URL}/api/payment/active-account`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.account).toBeDefined();
      expect(typeof data.account.phone_number).toBe('string');
      initialAccount = data.account;
    });

    it('Super Admin adds a new payment account and sets it active', async () => {
      // 1. Create account
      const createRes = await fetch(`${BASE_URL}/api/super-admin/payment-accounts`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${superAdminToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          provider: 'Telebirr',
          account_name: 'Bingo Betting Super Admin Deposit',
          phone_number: '0988776655',
          instructions: 'Send money via Telebirr USSD or App',
          assigned_agent_id: agentUser.id
        })
      });
      expect(createRes.status).toBe(200);
      const createData = await createRes.json();
      expect(createData.success).toBe(true);
      newAccount = createData.account;
      expect(newAccount.phone_number).toBe('0988776655');

      // 2. Activate account with reason
      const activateRes = await fetch(`${BASE_URL}/api/super-admin/payment-accounts/${newAccount.id}/activate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${superAdminToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          reason: 'Switching primary deposit number for Sunday peak rush'
        })
      });
      expect(activateRes.status).toBe(200);
      const activateData = await activateRes.json();
      expect(activateData.success).toBe(true);
    });

    it('Customer endpoint immediately reflects the newly activated number without restart', async () => {
      const res = await fetch(`${BASE_URL}/api/payment/active-account`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.account.phone_number).toBe('0988776655');
      expect(data.account.id).toBe(newAccount.id);
    });

    it('Payment account switch records an immutable audit log', async () => {
      const res = await fetch(`${BASE_URL}/api/super-admin/payment-accounts/logs`, {
        headers: { Authorization: `Bearer ${superAdminToken}` }
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.logs)).toBe(true);
      const matchingLog = data.logs.find((l: any) => l.account_id === newAccount.id);
      expect(matchingLog).toBeDefined();
      expect(matchingLog.new_number).toBe('0988776655');
      expect(matchingLog.changed_by).toBe(superAdminUser.id);
      expect(matchingLog.note).toContain('Sunday peak rush');
    });

    it('Historical deposit preserves the payment number that was active when submitted', async () => {
      // 1. Submit a deposit now with new active number
      const depRes = await fetch(`${BASE_URL}/api/wallet/deposit`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${normalUserToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          amount: 500,
          paymentMethod: 'Telebirr',
          referenceId: `TX_REF_${Date.now()}_A`,
          customerPhone: '0912001122'
        })
      });
      expect(depRes.status).toBe(200);
      const depData = await depRes.json();
      const depId = depData.deposit.id;

      // Verify that deposit has the current payment phone stored
      const depositInDb = databaseService.getDepositRequest(depId);
      expect(depositInDb?.payment_phone).toBe('0988776655');
      expect(depositInDb?.payment_account_id).toBe(newAccount.id);

      // 2. Switch back to initial account
      if (initialAccount?.id) {
        await fetch(`${BASE_URL}/api/super-admin/payment-accounts/${initialAccount.id}/activate`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${superAdminToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ reason: 'Reverting to initial account' })
        });

        // 3. Verify historical deposit STILL has '0988776655' (not retroactively changed!)
        const depositCheck = databaseService.getDepositRequest(depId);
        expect(depositCheck?.payment_phone).toBe('0988776655');
        expect(depositCheck?.payment_account_id).toBe(newAccount.id);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 3. DEPOSIT MANAGEMENT & IDEMPOTENCY
  // ═══════════════════════════════════════════════════════════
  describe('3. Deposit Processing & Idempotency Safeguards', () => {
    let depositId: string;

    it('Customer creates a pending deposit', async () => {
      const res = await fetch(`${BASE_URL}/api/wallet/deposit`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${normalUserToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          amount: 1500,
          paymentMethod: 'Telebirr',
          referenceId: `TXN_DEP_${Date.now()}_IDEMP`,
          customerPhone: '0911223344'
        })
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      depositId = data.deposit.id;
      expect(depositId).toBeDefined();
    });

    it('Agent can assign deposit to self', async () => {
      const res = await fetch(`${BASE_URL}/api/staff/deposits/${depositId}/assign`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${agentToken}`,
          'Content-Type': 'application/json'
        }
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.deposit.assignedAgentId).toBe(agentUser.id);
    });

    it('Agent approves deposit exactly once, crediting user balance', async () => {
      const balanceBefore = databaseService.getWallet(normalUser.id)!.balance;

      const res = await fetch(`${BASE_URL}/api/staff/deposits/${depositId}/approve`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${agentToken}`,
          'Content-Type': 'application/json'
        }
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);

      const balanceAfter = databaseService.getWallet(normalUser.id)!.balance;
      expect(balanceAfter).toBe(balanceBefore + 1500);

      // Verify transaction record exists in ledger
      const entries = databaseService.getLedgerEntries(normalUser.id);
      const depositLedger = entries.find((e) => e.type === 'DEPOSIT' && e.amount === 1500);
      expect(depositLedger).toBeDefined();
      expect(depositLedger?.amount).toBe(1500);
    });

    it('DOUBLE APPROVAL PREVENTED: Second approval attempt fails and does NOT double-credit', async () => {
      const balanceBefore = databaseService.getWallet(normalUser.id)!.balance;

      const res = await fetch(`${BASE_URL}/api/staff/deposits/${depositId}/approve`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${agentToken}`,
          'Content-Type': 'application/json'
        }
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/already APPROVED/i);

      // CRITICAL: Ensure balance was NOT credited twice!
      const balanceAfter = databaseService.getWallet(normalUser.id)!.balance;
      expect(balanceAfter).toBe(balanceBefore);
    });

    it('Agent rejects a deposit request and balance is NOT credited', async () => {
      // 1. Create another deposit
      const createRes = await fetch(`${BASE_URL}/api/wallet/deposit`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${normalUserToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          amount: 800,
          paymentMethod: 'Telebirr',
          referenceId: `TXN_DEP_REJ_${Date.now()}`
        })
      });
      const createData = await createRes.json();
      const rejDepId = createData.deposit.id;

      const balanceBefore = databaseService.getWallet(normalUser.id)!.balance;

      // 2. Reject it
      const res = await fetch(`${BASE_URL}/api/staff/deposits/${rejDepId}/reject`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${agentToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ reason: 'Invalid Telebirr transaction reference' })
      });
      expect(res.status).toBe(200);

      // 3. Balance remains unchanged
      const balanceAfter = databaseService.getWallet(normalUser.id)!.balance;
      expect(balanceAfter).toBe(balanceBefore);

      // 4. Record remains in history
      const rejRecord = databaseService.getDepositRequest(rejDepId);
      expect(rejRecord?.status).toBe('REJECTED');
      expect(rejRecord?.rejection_reason).toBe('Invalid Telebirr transaction reference');
      expect(rejRecord?.processed_by).toBe(agentUser.id);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 4. WITHDRAWAL MANAGEMENT & REFUND SAFETY
  // ═══════════════════════════════════════════════════════════
  describe('4. Withdrawal Management & Reserved Fund Refund on Rejection', () => {
    let withdrawalId: string;

    it('Customer requests a withdrawal, reserving balance', async () => {
      const balanceBefore = databaseService.getWallet(normalUser.id)!.balance;
      expect(balanceBefore).toBeGreaterThanOrEqual(500);

      const res = await fetch(`${BASE_URL}/api/wallet/withdraw`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${normalUserToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          amount: 500,
          paymentMethod: 'Telebirr',
          address: '0911223344'
        })
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      withdrawalId = data.withdrawal.id;

      // Available balance is reserved (decreased by 500)
      const balanceAfter = databaseService.getWallet(normalUser.id)!.balance;
      expect(balanceAfter).toBe(balanceBefore - 500);
    });

    it('Agent rejects withdrawal and reserved balance is SAFELY RESTORED', async () => {
      const balanceBefore = databaseService.getWallet(normalUser.id)!.balance;

      const res = await fetch(`${BASE_URL}/api/staff/withdrawals/${withdrawalId}/reject`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${agentToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ reason: 'Customer Telebirr account name mismatch' })
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);

      // Balance MUST be restored!
      const balanceAfter = databaseService.getWallet(normalUser.id)!.balance;
      expect(balanceAfter).toBe(balanceBefore + 500);

      // Auditable ledger record for refund
      const wthRecord = databaseService.getWithdrawalRequest(withdrawalId);
      expect(wthRecord?.status).toBe('REJECTED');
      expect(wthRecord?.rejection_reason).toBe('Customer Telebirr account name mismatch');
      expect(wthRecord?.processed_by).toBe(agentUser.id);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 5. AGENT MANAGEMENT BY SUPER ADMIN
  // ═══════════════════════════════════════════════════════════
  describe('5. Agent Management by Super Admin', () => {
    let createdAgentId: string;

    it('Super Admin creates a new Agent', async () => {
      const res = await fetch(`${BASE_URL}/api/super-admin/agents`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${superAdminToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          username: 'NewAgentKaleb',
          password: 'PassWord123!',
          phone: '+251922334455',
          telebirr_number: '0922334455',
          assigned_agent_name: 'Kaleb Tadesse'
        })
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.agent.role).toBe('AGENT');
      expect(data.agent.username).toBe('NewAgentKaleb');
      expect(data.agent.telebirr_number).toBe('0922334455');
      createdAgentId = data.agent.id;
    });

    it('Super Admin suspends the agent', async () => {
      const res = await fetch(`${BASE_URL}/api/super-admin/agents/${createdAgentId}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${superAdminToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          account_status: 'SUSPENDED',
          telebirr_number: '0922334499'
        })
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.agent.account_status).toBe('SUSPENDED');
      expect(data.agent.telebirr_number).toBe('0922334499');
    });

    it('Super Admin resets the agent password', async () => {
      const res = await fetch(`${BASE_URL}/api/super-admin/agents/${createdAgentId}/reset-password`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${superAdminToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          new_password: 'SuperFreshPassword999!'
        })
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });

    it('Super Admin reactivates the agent', async () => {
      const res = await fetch(`${BASE_URL}/api/super-admin/agents/${createdAgentId}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${superAdminToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          account_status: 'ACTIVE'
        })
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.agent.account_status).toBe('ACTIVE');
    });

    it('Super Admin inspects agent performance and activity logs', async () => {
      const perfRes = await fetch(`${BASE_URL}/api/super-admin/agents/${agentUser.id}/performance`, {
        headers: { Authorization: `Bearer ${superAdminToken}` }
      });
      expect(perfRes.status).toBe(200);
      const perfData = await perfRes.json();
      expect(perfData.success).toBe(true);
      expect(perfData.performance.deposits_processed).toBeGreaterThanOrEqual(1);

      const actRes = await fetch(`${BASE_URL}/api/super-admin/audit-logs?actor_id=${agentUser.id}`, {
        headers: { Authorization: `Bearer ${superAdminToken}` }
      });
      expect(actRes.status).toBe(200);
      const actData = await actRes.json();
      expect(actData.success).toBe(true);
      expect(Array.isArray(actData.logs)).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 6. WEEKEND JACKPOT GOVERNANCE & REAL PARTICIPANTS
  // ═══════════════════════════════════════════════════════════
  describe('6. Weekend Jackpot Governance & Real Participants Only', () => {
    it('Super Admin retrieves Weekend Jackpot configuration', async () => {
      const res = await fetch(`${BASE_URL}/api/super-admin/jackpot/config`, {
        headers: { Authorization: `Bearer ${superAdminToken}` }
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.config.day_of_week).toBe('Sunday');
      expect(data.config.start_time).toBe('10:00');
      expect(data.config.timezone).toBe('Africa/Addis_Ababa');
    });

    it('Super Admin updates Weekend Jackpot configuration', async () => {
      const res = await fetch(`${BASE_URL}/api/super-admin/jackpot/config`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${superAdminToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          day_of_week: 'Sunday',
          start_time: '10:00',
          timezone: 'Africa/Addis_Ababa',
          min_cards: 100,
          max_cards: 200,
          card_price: 999
        })
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.config.start_time).toBe('10:00');
    });

    it('Super Admin views participating players for current round (REAL DATA ONLY)', async () => {
      // 1. Ensure user has enough balance and purchases 1 Weekend Jackpot card
      databaseService.updateWalletBalance(normalUser.id, 2000);
      const curRound = dailyJackpotService.getOrCreateCurrentRound();

      const purchaseRes = await fetch(`${BASE_URL}/api/daily-jackpot/purchase`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${normalUserToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          cardNumbers: [77]
        })
      });
      expect(purchaseRes.status).toBe(200);
      const purchaseData = await purchaseRes.json();
      expect(purchaseData.success).toBe(true);

      // 2. Super Admin queries participants
      const playersRes = await fetch(`${BASE_URL}/api/super-admin/jackpot/rounds/${curRound.id}/players`, {
        headers: { Authorization: `Bearer ${superAdminToken}` }
      });
      expect(playersRes.status).toBe(200);
      const playersData = await playersRes.json();
      expect(playersData.success).toBe(true);
      expect(Array.isArray(playersData.players)).toBe(true);

      // 3. User appears in participants list with card #77 and 999 spent
      const matchingPlayer = playersData.players.find((p: any) => p.user_id === normalUser.id);
      expect(matchingPlayer).toBeDefined();
      expect(matchingPlayer.username).toBe(normalUser.username);
      expect(matchingPlayer.cards_count).toBeGreaterThanOrEqual(1);
      expect(matchingPlayer.card_numbers).toContain(77);
      expect(matchingPlayer.total_spent).toBeGreaterThanOrEqual(999);

      // 4. CRITICAL: No fake or demo players present in list
      const fakePlayer = playersData.players.find((p: any) => p.username === 'DemoUser' || p.username === 'BotPlayer');
      expect(fakePlayer).toBeUndefined();
    });

    it('Super Admin views Weekend Jackpot round history', async () => {
      const res = await fetch(`${BASE_URL}/api/super-admin/jackpot/rounds`, {
        headers: { Authorization: `Bearer ${superAdminToken}` }
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.rounds)).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 7. FINANCIAL RECONCILIATION & AUDIT TRAIL
  // ═══════════════════════════════════════════════════════════
  describe('7. Financial Reconciliation & Audit Trail', () => {
    it('Super Admin runs financial reconciliation report', async () => {
      const res = await fetch(`${BASE_URL}/api/super-admin/reconciliation`, {
        headers: { Authorization: `Bearer ${superAdminToken}` }
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.report).toBeDefined();
      expect(data.report.summary.total_transactions).toBeGreaterThanOrEqual(1);
      expect(Array.isArray(data.report.transactions)).toBe(true);
    });

    it('Super Admin searches users and inspects detailed activity', async () => {
      const res = await fetch(`${BASE_URL}/api/super-admin/users?query=${normalUser.username}`, {
        headers: { Authorization: `Bearer ${superAdminToken}` }
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.users.length).toBeGreaterThanOrEqual(1);
      const userResult = data.users.find((u: any) => u.id === normalUser.id);
      expect(userResult).toBeDefined();
      expect(userResult.deposit_count).toBeGreaterThanOrEqual(1);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 8. ADMIN V2 — AGENT & PAYMENT ACCOUNT LIFECYCLE CONTROLS
  // ═══════════════════════════════════════════════════════════
  describe('8. Admin V2 — Agent & Payment Account Lifecycle Controls', () => {
    it('Super Admin inspects agent processed transactions', async () => {
      const res = await fetch(`${BASE_URL}/api/super-admin/agents/${agentUser.id}/transactions`, {
        headers: { Authorization: `Bearer ${superAdminToken}` }
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.deposits)).toBe(true);
      expect(Array.isArray(data.withdrawals)).toBe(true);
    });

    it('Super Admin safe-deletes an agent with financial history (Archives, invalidates session, preserves history)', async () => {
      // 1. Agent currently has processed a deposit earlier in the suite
      const delRes = await fetch(`${BASE_URL}/api/super-admin/agents/${agentUser.id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${superAdminToken}`
        },
        body: JSON.stringify({ reason: 'Audit rotation' })
      });
      expect(delRes.status).toBe(200);
      const delData = await delRes.json();
      expect(delData.success).toBe(true);
      expect(delData.action).toBe('ARCHIVED');
      expect(delData.historicalTransactionsCount).toBeGreaterThanOrEqual(1);

      // 2. Agent record still exists in DB with DELETED status
      const updatedAgent = databaseService.getUserById(agentUser.id);
      expect(updatedAgent).toBeDefined();
      expect(updatedAgent!.account_status).toBe('DELETED');

      // 3. Agent's existing session token is REVOKED
      const checkRes = await fetch(`${BASE_URL}/api/staff/deposits`, {
        headers: { Authorization: `Bearer ${agentToken}` }
      });
      expect(checkRes.status).toBe(401);

      // 4. Historical deposit still retains reference to this agent
      const allDeps = databaseService.getDepositRequests();
      const depProcessed = allDeps.find((d) => d.processed_by === agentUser.id);
      expect(depProcessed).toBeDefined();

      // 5. Super Admin can restore the agent
      const restoreRes = await fetch(`${BASE_URL}/api/super-admin/agents/${agentUser.id}/restore`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${superAdminToken}` }
      });
      expect(restoreRes.status).toBe(200);
      const restored = databaseService.getUserById(agentUser.id);
      expect(restored!.account_status).toBe('ACTIVE');
    });

    it('Super Admin creates and then HARD deletes an agent with 0 transactions', async () => {
      // Create new agent with 0 history
      const createRes = await fetch(`${BASE_URL}/api/super-admin/agents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${superAdminToken}`
        },
        body: JSON.stringify({
          username: `ZeroTxAgent_${Date.now()}`,
          phone: '+251999888777',
          role: 'AGENT'
        })
      });
      expect(createRes.status).toBe(200);
      const { agent } = await createRes.json();

      // Delete this zero-history agent
      const delRes = await fetch(`${BASE_URL}/api/super-admin/agents/${agent.id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${superAdminToken}`
        },
        body: JSON.stringify({ reason: 'Clean up test agent' })
      });
      expect(delRes.status).toBe(200);
      const delData = await delRes.json();
      expect(delData.action).toBe('HARD_DELETED');

      // Verify physical deletion
      const deletedCheck = databaseService.getUserById(agent.id);
      expect(deletedCheck).toBeUndefined();
    });

    it('Super Admin deletes payment account with historical transactions: safely archived without breaking history', async () => {
      // Create a test payment account and associate it with a deposit
      const createdAcc = databaseService.createPaymentAccount({
        account_name: 'Historical Telebirr',
        phone_number: '0977665544',
        provider: 'TELEBIRR',
        is_active: 0
      });

      // Create deposit pointing to this payment account
      const dep = databaseService.createDepositRequest({
        user_id: normalUser.id,
        amount: 250,
        payment_account_id: createdAcc.id,
        payment_phone: createdAcc.phone_number,
        payment_method: 'TELEBIRR'
      });

      // Super Admin attempts to delete the payment account
      const delRes = await fetch(`${BASE_URL}/api/super-admin/payment-accounts/${createdAcc.id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${superAdminToken}`
        },
        body: JSON.stringify({ reason: 'Number retired' })
      });
      expect(delRes.status).toBe(200);
      const delData = await delRes.json();
      expect(delData.action).toBe('ARCHIVED');
      expect(delData.historicalDepositsCount).toBeGreaterThanOrEqual(1);

      // Verify historical deposit still retains the exact payment account phone number
      const fetchedDep = databaseService.getDepositRequest(dep.id);
      expect(fetchedDep!.payment_phone).toBe('0977665544');

      // Verify payment account is archived and not active
      const fetchedAcc = databaseService.getPaymentAccountById(createdAcc.id);
      expect(fetchedAcc!.account_status).toBe('DELETED');
      expect(fetchedAcc!.is_active).toBe(0);

      // Verify active payment account query NEVER returns deleted accounts
      const activeAcc = databaseService.getActivePaymentAccount();
      expect(activeAcc?.id).not.toBe(createdAcc.id);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 9. ADMIN V2 — USER ACCOUNT MANAGEMENT & SAFE DELETION
  // ═══════════════════════════════════════════════════════════
  describe('9. Admin V2 — User Account Management & Safe Deletion', () => {
    it('Super Admin views detailed user profile and financial history', async () => {
      const res = await fetch(`${BASE_URL}/api/super-admin/users/${normalUser.id}/details`, {
        headers: { Authorization: `Bearer ${superAdminToken}` }
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.details).toBeDefined();
      expect(data.details.user.id).toBe(normalUser.id);
      expect(data.details.stats.total_deposited).toBeGreaterThanOrEqual(1000);
      expect(Array.isArray(data.details.deposits)).toBe(true);
      expect(Array.isArray(data.details.withdrawals)).toBe(true);
      expect(Array.isArray(data.details.recentTransactions)).toBe(true);
    });

    it('Super Admin updates user account status', async () => {
      const res = await fetch(`${BASE_URL}/api/super-admin/users/${normalUser.id}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${superAdminToken}`
        },
        body: JSON.stringify({ status: 'SUSPENDED', reason: 'Verification review' })
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.user.account_status).toBe('SUSPENDED');

      // Restore to active
      await fetch(`${BASE_URL}/api/super-admin/users/${normalUser.id}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${superAdminToken}`
        },
        body: JSON.stringify({ status: 'ACTIVE', reason: 'Verified' })
      });
    });

    it('Super Admin safe-deletes a user with financial history (Archives, disables login, preserves records)', async () => {
      // User has deposits and transactions
      const res = await fetch(`${BASE_URL}/api/super-admin/users/${normalUser.id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${superAdminToken}`
        },
        body: JSON.stringify({ reason: 'Customer requested account closure' })
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.action).toBe('ARCHIVED');
      expect(data.historicalRecordsCount).toBeGreaterThanOrEqual(1);

      // Verify user in DB is DELETED
      const userInDb = databaseService.getUserById(normalUser.id);
      expect(userInDb).toBeDefined();
      expect(userInDb!.account_status).toBe('DELETED');

      // Verify session is invalidated
      const sessionCheck = databaseService.getSession(normalUserToken);
      expect(sessionCheck).toBeUndefined();

      // Verify user history is preserved
      const stats = databaseService.getUserFinancialStats(normalUser.id);
      expect(stats.total_deposited).toBeGreaterThanOrEqual(1000);
    });

    it('Super Admin hard deletes a user with ZERO financial history', async () => {
      // Create user with 0 history
      const freshUser = databaseService.createUser({
        id: `usr_zero_tx_${Date.now()}`,
        telegram_id: `tg_zero_${Date.now()}`,
        username: `zero_tx_customer`,
        role: 'USER'
      });

      const delRes = await fetch(`${BASE_URL}/api/super-admin/users/${freshUser.id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${superAdminToken}`
        },
        body: JSON.stringify({ reason: 'Unused test account' })
      });
      expect(delRes.status).toBe(200);
      const delData = await delRes.json();
      expect(delData.action).toBe('HARD_DELETED');

      const deletedCheck = databaseService.getUserById(freshUser.id);
      expect(deletedCheck).toBeUndefined();
    });
  });
});
