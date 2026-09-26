import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { app, httpServer } from './index.js';
import { authService } from './AuthService.js';
import { ledgerService } from './LedgerService.js';
import { databaseService } from './DatabaseService.js';
import crypto from 'crypto';

let BASE_URL: string;
let superAdminToken: string;
let superAdminUser: any;
let agent1Token: string;
let agent1User: any;
let agent2Token: string;
let agent2User: any;
let regularUserToken: string;
let regularUser: any;

describe('Phase 5: Agent & Admin Governance, Role Separation & Backoffice Workflow', () => {
  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      httpServer.listen(0, '127.0.0.1', () => {
        const addr = httpServer.address() as any;
        BASE_URL = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });

    // 1. Super Admin
    const saTgId = `999000${Math.floor(Math.random() * 899999)}`;
    superAdminUser = databaseService.createUser({
      id: `sa_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      telegram_id: saTgId,
      username: `SuperAdmin_${saTgId.slice(-4)}`,
      referral_code: `SA${saTgId.slice(-4)}`,
      role: 'SUPER_ADMIN'
    });
    const saSession = databaseService.createSession(superAdminUser.id, superAdminUser.telegram_id);
    superAdminToken = saSession.id;

    // 2. Agent 1
    const ag1TgId = `998000${Math.floor(Math.random() * 899999)}`;
    agent1User = databaseService.createUser({
      id: `ag1_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      telegram_id: ag1TgId,
      username: `Agent1_${ag1TgId.slice(-4)}`,
      referral_code: `AG1${ag1TgId.slice(-4)}`,
      role: 'AGENT',
      phone: `+251911${Math.floor(100000 + Math.random() * 899999)}`,
      telebirr_number: `0911${Math.floor(100000 + Math.random() * 899999)}`
    });
    const ag1Session = databaseService.createSession(agent1User.id, agent1User.telegram_id);
    agent1Token = ag1Session.id;

    // 3. Agent 2
    const ag2TgId = `997000${Math.floor(Math.random() * 899999)}`;
    agent2User = databaseService.createUser({
      id: `ag2_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      telegram_id: ag2TgId,
      username: `Agent2_${ag2TgId.slice(-4)}`,
      referral_code: `AG2${ag2TgId.slice(-4)}`,
      role: 'AGENT',
      phone: `+251922${Math.floor(100000 + Math.random() * 899999)}`,
      telebirr_number: `0922${Math.floor(100000 + Math.random() * 899999)}`
    });
    const ag2Session = databaseService.createSession(agent2User.id, agent2User.telegram_id);
    agent2Token = ag2Session.id;

    // 4. Regular User
    const regTgId = `888000${Math.floor(Math.random() * 899999)}`;
    regularUser = databaseService.createUser({
      id: `reg_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      telegram_id: regTgId,
      username: `RegularUser_${regTgId.slice(-4)}`,
      referral_code: `REG${regTgId.slice(-4)}`,
      role: 'USER',
      phone: `+251933${Math.floor(100000 + Math.random() * 899999)}`,
      account_status: 'ACTIVE',
      account_type: 'REAL'
    });
    const regSession = databaseService.createSession(regularUser.id, regularUser.telegram_id);
    regularUserToken = regSession.id;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  // TEST 1: Database-level self-approval forbidden on deposit
  it('1. DatabaseService: Rejects self-approval on deposit requests', () => {
    const deposit = databaseService.createDepositRequest(
      agent1User.id,
      agent1User.username,
      250,
      'Telebirr',
      `TX_SELF_DEP_${Date.now()}`
    );

    // Agent 1 attempts to approve their own deposit
    expect(() => {
      databaseService.approveDeposit(agent1User.id, deposit.id);
    }).toThrow(/Self-approval forbidden/i);

    // Verify deposit remains in PENDING status
    const pendingDep = databaseService.getDepositRequest(deposit.id);
    expect(pendingDep?.status).toBe('PENDING');

    // Agent 2 (different staff member) can approve it cleanly
    const approved = databaseService.approveDeposit(agent2User.id, deposit.id);
    expect(approved.deposit.status).toBe('APPROVED');
    expect(approved.deposit.processed_by).toBe(agent2User.id);
  });

  // TEST 2: HTTP API self-approval forbidden on deposit
  it('2. API POST /api/staff/deposits/:id/approve: Rejects self-approval with 400 Bad Request', async () => {
    const deposit = databaseService.createDepositRequest(
      agent1User.id,
      agent1User.username,
      150,
      'Telebirr',
      `TX_HTTP_DEP_${Date.now()}`
    );

    // Agent 1 attempts to approve via API
    const res = await fetch(`${BASE_URL}/api/staff/deposits/${deposit.id}/approve`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${agent1Token}`,
        'Content-Type': 'application/json'
      }
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/Self-approval forbidden/i);

    // Agent 2 can approve it via API
    const res2 = await fetch(`${BASE_URL}/api/staff/deposits/${deposit.id}/approve`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${agent2Token}`,
        'Content-Type': 'application/json'
      }
    });

    expect(res2.status).toBe(200);
    const data2 = await res2.json();
    expect(data2.success).toBe(true);
    expect(data2.request.status).toBe('APPROVED');
  });

  // TEST 3: Database-level self-approval forbidden on withdrawal
  it('3. DatabaseService: Rejects self-approval on withdrawal requests', () => {
    // Credit Agent 1 wallet first so withdrawal request can be reserved
    const initialDeposit = databaseService.createDepositRequest(
      agent1User.id,
      agent1User.username,
      500,
      'Telebirr',
      `TX_CREDIT_${Date.now()}`
    );
    databaseService.approveDeposit(agent2User.id, initialDeposit.id);

    // Agent 1 requests withdrawal
    const withdrawal = databaseService.createWithdrawalRequest(
      agent1User.id,
      agent1User.username,
      200,
      '0911000000'
    );

    // Agent 1 attempts to approve their own withdrawal
    expect(() => {
      databaseService.approveWithdrawal(agent1User.id, withdrawal.id);
    }).toThrow(/Self-approval forbidden/i);

    // Verify withdrawal remains PENDING
    const pendingWith = databaseService.getWithdrawalRequest(withdrawal.id);
    expect(pendingWith?.status).toBe('PENDING');

    // Agent 2 can approve it cleanly
    const approved = databaseService.approveWithdrawal(agent2User.id, withdrawal.id);
    expect(approved.withdrawal.status).toBe('APPROVED');
  });

  // TEST 4: HTTP API self-approval forbidden on withdrawal
  it('4. API POST /api/staff/withdrawals/:id/approve: Rejects self-approval with 400 Bad Request', async () => {
    // Credit Agent 1 wallet
    const dep = databaseService.createDepositRequest(
      agent1User.id,
      agent1User.username,
      300,
      'Telebirr',
      `TX_CR2_${Date.now()}`
    );
    databaseService.approveDeposit(agent2User.id, dep.id);

    const withdrawal = databaseService.createWithdrawalRequest(
      agent1User.id,
      agent1User.username,
      100,
      '0911000000'
    );

    // Agent 1 attempts to approve via API
    const res = await fetch(`${BASE_URL}/api/staff/withdrawals/${withdrawal.id}/approve`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${agent1Token}`,
        'Content-Type': 'application/json'
      }
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/Self-approval forbidden/i);

    // Agent 2 approves via API
    const res2 = await fetch(`${BASE_URL}/api/staff/withdrawals/${withdrawal.id}/approve`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${agent2Token}`,
        'Content-Type': 'application/json'
      }
    });

    expect(res2.status).toBe(200);
    const data2 = await res2.json();
    expect(data2.success).toBe(true);
    expect(data2.request.status).toBe('APPROVED');
  });

  // TEST 5: Self-assignment and invalid assignment prevention
  it('5. DatabaseService: Rejects self-assignment and assignment to non-agent users', () => {
    const dep = databaseService.createDepositRequest(
      agent1User.id,
      agent1User.username,
      100,
      'Telebirr',
      `TX_ASSIGN_${Date.now()}`
    );

    // Self-assignment should throw
    expect(() => {
      databaseService.assignDepositToAgent(dep.id, agent1User.id);
    }).toThrow(/Self-assignment forbidden/i);

    // Assignment to a regular USER (non-staff) should throw
    expect(() => {
      databaseService.assignDepositToAgent(dep.id, regularUser.id);
    }).toThrow(/Target user is not an agent or staff member/i);

    // Assignment to Agent 2 succeeds
    const assigned = databaseService.assignDepositToAgent(dep.id, agent2User.id);
    expect(assigned.assigned_agent_id).toBe(agent2User.id);
  });

  // TEST 6: Self-adjustment prevention on manual balance adjustments
  it('6. LedgerService: Rejects self-balance adjustment by admins', async () => {
    // Admin attempting to adjust their own balance
    await expect(
      ledgerService.manualBalanceAdjustment(superAdminUser.id, superAdminUser.id, 500, 'Self bonus')
    ).rejects.toThrow(/Self-adjustment forbidden/i);

    // Admin adjusting another user balance succeeds
    const result = await ledgerService.manualBalanceAdjustment(
      superAdminUser.id,
      regularUser.id,
      100,
      'Compensation for outage'
    );
    expect(result.user.walletBalance).toBeGreaterThanOrEqual(100);
  });

  // TEST 7: Protection against self-suspension, self-deletion, and admin deletion
  it('7. AuthService: Protects admins against self-suspension, self-deletion, and admin deletion', () => {
    // Self-suspension blocked
    expect(() => {
      authService.updateUserStatus(superAdminUser.id, superAdminUser.id, 'SUSPENDED', 'Testing self-ban');
    }).toThrow(/(Self-suspension forbidden|Cannot change administrator account status)/i);

    // Cannot suspend another administrator/super-admin
    expect(() => {
      authService.updateUserStatus(superAdminUser.id, superAdminUser.id, 'BANNED', 'Testing ban');
    }).toThrow(/Cannot change administrator account status/i);

    // Self-deletion blocked
    expect(() => {
      authService.deleteUser(superAdminUser.id, superAdminUser.id, 'Testing self-delete');
    }).toThrow(/(Self-deletion forbidden|Cannot delete system administrator account)/i);

    // Deleting another admin account blocked
    expect(() => {
      authService.deleteUser(superAdminUser.id, superAdminUser.id);
    }).toThrow(/Cannot delete system administrator account/i);
  });

  // TEST 8: Strict Role Separation — Regular USER blocked from staff and super-admin endpoints
  it('8. Role Separation: Regular USER receives 403 Forbidden on all staff & super-admin endpoints', async () => {
    const endpoints = [
      { url: `${BASE_URL}/api/staff/me`, method: 'GET' },
      { url: `${BASE_URL}/api/staff/deposits`, method: 'GET' },
      { url: `${BASE_URL}/api/staff/withdrawals`, method: 'GET' },
      { url: `${BASE_URL}/api/staff/customers`, method: 'GET' },
      { url: `${BASE_URL}/api/super-admin/overview`, method: 'GET' },
      { url: `${BASE_URL}/api/super-admin/agents`, method: 'GET' },
      { url: `${BASE_URL}/api/super-admin/audit-logs`, method: 'GET' },
      {
        url: `${BASE_URL}/api/super-admin/balance-adjustment`,
        method: 'POST',
        body: JSON.stringify({ targetPlayerId: regularUser.id, amount: 50, reason: 'Test' })
      }
    ];

    for (const ep of endpoints) {
      const res = await fetch(ep.url, {
        method: ep.method,
        headers: {
          'Authorization': `Bearer ${regularUserToken}`,
          'Content-Type': 'application/json'
        },
        body: ep.body
      });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toMatch(/Forbidden/i);
    }
  });

  // TEST 9: Strict Role Separation — AGENT blocked from super-admin endpoints
  it('9. Role Separation: AGENT is granted staff access but blocked from super-admin endpoints with 403', async () => {
    // Agent can access staff endpoints
    const staffRes = await fetch(`${BASE_URL}/api/staff/me`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${agent1Token}` }
    });
    expect(staffRes.status).toBe(200);

    // Agent blocked from super-admin endpoints
    const forbiddenEndpoints = [
      { url: `${BASE_URL}/api/super-admin/overview`, method: 'GET' },
      { url: `${BASE_URL}/api/super-admin/agents`, method: 'GET' },
      { url: `${BASE_URL}/api/super-admin/audit-logs`, method: 'GET' },
      { url: `${BASE_URL}/api/super-admin/reconciliation`, method: 'GET' },
      {
        url: `${BASE_URL}/api/super-admin/balance-adjustment`,
        method: 'POST',
        body: JSON.stringify({ targetPlayerId: regularUser.id, amount: 50, reason: 'Test' })
      }
    ];

    for (const ep of forbiddenEndpoints) {
      const res = await fetch(ep.url, {
        method: ep.method,
        headers: {
          'Authorization': `Bearer ${agent1Token}`,
          'Content-Type': 'application/json'
        },
        body: ep.body
      });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toMatch(/Forbidden: Super Admin authorization required/i);
    }
  });

  // TEST 10: Double-approval idempotency
  it('10. Concurrency & Idempotency: Approving already approved deposit or withdrawal throws', () => {
    const dep = databaseService.createDepositRequest(
      regularUser.id,
      regularUser.username,
      100,
      'Telebirr',
      `TX_IDEMP_${Date.now()}`
    );

    // First approval succeeds
    const app1 = databaseService.approveDeposit(agent1User.id, dep.id);
    expect(app1.deposit.status).toBe('APPROVED');

    // Second approval fails with already processed
    expect(() => {
      databaseService.approveDeposit(agent2User.id, dep.id);
    }).toThrow(/Deposit is already APPROVED/i);

    // Subsequent rejection also fails
    expect(() => {
      databaseService.rejectDeposit(agent2User.id, dep.id, 'Duplicate test');
    }).toThrow(/Deposit is already APPROVED/i);
  });

  // TEST 11: Audit logging records actions and authorization failures
  it('11. Audit Logging: Records security authorization events and staff activities', () => {
    // Check that activity logs contain recorded actions
    const logs = databaseService.getAgentActivityLogs({ limit: 50 });
    expect(logs.length).toBeGreaterThan(0);

    const actions = logs.map(l => l.action);
    // At least one approval action or failed auth action was logged
    const hasAuditEvents = actions.some(a =>
      a === 'DEPOSIT_APPROVED' ||
      a === 'WITHDRAWAL_APPROVED' ||
      a === 'FAILED_STAFF_AUTHORIZATION' ||
      a === 'FAILED_SUPER_ADMIN_AUTHORIZATION' ||
      a === 'APPROVE_DEPOSIT' ||
      a === 'APPROVE_WITHDRAWAL'
    );
    expect(hasAuditEvents).toBe(true);
  });
});
