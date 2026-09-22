import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { app, httpServer } from './index.js';
import { authService } from './AuthService.js';
import { ledgerService } from './LedgerService.js';
import { databaseService } from './DatabaseService.js';

let BASE_URL: string;
let normalUserToken: string;
let normalUser: any;
let adminToken: string;
let adminUser: any;

describe('Admin Dashboard Security & Operations Test Suite', () => {
  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      httpServer.listen(0, '127.0.0.1', () => {
        const addr = httpServer.address() as any;
        BASE_URL = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });

    // Create verified Admin user with persistent session
    adminUser = databaseService.getUserById('usr_admin') || databaseService.createUser({
      id: 'usr_admin',
      telegram_id: '999888777',
      username: 'SystemAdmin',
      referral_code: 'SYSADMIN1',
      role: 'ADMIN'
    });
    const adminSession = databaseService.createSession(adminUser.id, adminUser.telegram_id);
    adminToken = adminSession.id;

    // Create standard normal user (role: USER)
    const tgId = Math.floor(883000000 + Math.random() * 899999);
    const initData = authService.createSignedTelegramInitData(
      { id: tgId, first_name: 'RegularPlayer', username: `regular_${tgId}` },
      process.env.TELEGRAM_BOT_TOKEN || 'test_mock_bot_token_123456:ABCdefGHIjklMNOpqrSTUvwxYZ'
    );
    const authRes = await authService.authenticateTelegram(initData);
    const regRes = await authService.completeRegistration(
      authRes.tempToken!,
      'RegularUser'
    );
    expect(regRes.success).toBe(true);
    normalUser = regRes.user;
    normalUserToken = regRes.sessionToken!;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  // TEST 1: Backend authorization enforcement - Normal user blocked from admin endpoints
  it('1. ADMIN SECURITY: Regular user receives 403 Forbidden on all /api/admin/* endpoints', async () => {
    const endpoints = [
      { url: `${BASE_URL}/api/admin/users`, method: 'GET' },
      { url: `${BASE_URL}/api/admin/deposits`, method: 'GET' },
      { url: `${BASE_URL}/api/admin/withdrawals`, method: 'GET' },
      { url: `${BASE_URL}/api/admin/transactions`, method: 'GET' },
      { url: `${BASE_URL}/api/admin/games`, method: 'GET' },
      { url: `${BASE_URL}/api/admin/audit-logs`, method: 'GET' },
      {
        url: `${BASE_URL}/api/admin/balance-adjustment`,
        method: 'POST',
        body: { targetPlayerId: normalUser.playerId, amount: 100, reason: 'Test' }
      }
    ];

    for (const ep of endpoints) {
      const res = await fetch(ep.url, {
        method: ep.method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${normalUserToken}`,
          // Spoofed client claims that should NEVER be trusted
          'X-Admin': 'true',
          'X-Role': 'ADMIN'
        },
        body: ep.body ? JSON.stringify(ep.body) : undefined
      });

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toMatch(/admin authorization required|admin privileges required/i);
    }
  });

  // TEST 2: Admin user can view all users and audit details
  it('2. USERS MANAGEMENT: Admin can list all users and view registration & activity dates', async () => {
    const res = await fetch(`${BASE_URL}/api/admin/users`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(Array.isArray(data.users)).toBe(true);

    const found = data.users.find((u: any) => u.playerId === normalUser.playerId);
    expect(found).toBeDefined();
    expect(found.username).toBe('RegularUser');
    expect(found.role).toBe('USER');
    expect(found.account_status || found.accountStatus).toBe('ACTIVE');
    expect(found.created_at || found.createdAt).toBeDefined();
  });

  // TEST 3: User status management (Suspension / Ban) and Audit Logging
  it('3. USER STATUS & AUDIT: Admin suspends user, creating audit log record', async () => {
    // Suspend user
    const suspendRes = await fetch(`${BASE_URL}/api/admin/users/${normalUser.playerId}/status`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        status: 'SUSPENDED',
        reason: 'Suspicious bot activity detected'
      })
    });

    expect(suspendRes.status).toBe(200);
    const suspendData = await suspendRes.json();
    expect(suspendData.success).toBe(true);
    expect(suspendData.user.account_status).toBe('SUSPENDED');

    // Verify user record by DB lookup (session is invalid for SUSPENDED users - that is correct VULN-05 behavior)
    const updated = authService.getFullUserRecordByToken(normalUserToken);
    expect(updated?.account_status).toBe('SUSPENDED');

    // Verify audit log
    const auditRes = await fetch(`${BASE_URL}/api/admin/audit-logs`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const auditData = await auditRes.json();
    expect(auditRes.status).toBe(200);

    const log = auditData.logs.find(
      (l: any) => (l.action === 'UPDATE_USER_STATUS' || l.action === 'SUSPEND_USER') && l.target_user_id === normalUser.playerId
    );
    expect(log).toBeDefined();
    expect(log.admin_user_id).toBe('usr_admin');
    expect(log.metadata?.newStatus).toBe('SUSPENDED');

    // Restore to ACTIVE
    await fetch(`${BASE_URL}/api/admin/users/${normalUser.playerId}/status`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({ status: 'ACTIVE' })
    });
  });

  // TEST 4: Deposit Approval Workflow & Double Processing Protection (Financial Safety)
  it('4. DEPOSITS & FINANCIAL SAFETY: Admin approves deposit with idempotency guarantee', async () => {
    // 1. Submit deposit request
    const req = ledgerService.createDepositRequest(
      normalUser.playerId,
      normalUser.username,
      250,
      'telebirr'
    );
    expect(req.id).toBeDefined();
    expect(req.status).toBe('PENDING');

    const balanceBefore = (authService.getFullUserRecordByToken(normalUserToken))!.walletBalance;

    // 2. Admin approves deposit
    const approveRes = await fetch(`${BASE_URL}/api/admin/deposits/${req.id}/approve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    expect(approveRes.status).toBe(200);
    const approveData = await approveRes.json();
    expect(approveData.success).toBe(true);
    expect(approveData.request.status).toBe('APPROVED');

    // Verify user balance credited
    const balanceAfter = (authService.getFullUserRecordByToken(normalUserToken))!.walletBalance;
    expect(balanceAfter).toBe(balanceBefore + 250);

    // 3. Double processing protection: Same deposit cannot be approved twice
    const doubleApproveRes = await fetch(`${BASE_URL}/api/admin/deposits/${req.id}/approve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    expect(doubleApproveRes.status).toBe(400);
    const doubleData = await doubleApproveRes.json();
    expect(doubleData.error).toMatch(/already processed|already approved/i);
  });

  // TEST 5: Withdrawal Rejection & Balance Safety Workflow
  it('5. WITHDRAWALS & REFUNDS: Admin rejects withdrawal safely', async () => {
    // Credit user first to have sufficient balance
    await ledgerService.recordTransaction(
      normalUser.playerId,
      'deposit',
      400,
      'Test deposit for withdrawal',
      undefined,
      undefined,
      `dep_test_${Date.now()}`
    );

    const balanceBeforeRequest = ledgerService.getUser(normalUser.playerId)!.walletBalance;

    // User requests withdrawal of 300 (placed on reserve hold)
    const withdrawal = ledgerService.createWithdrawalRequest(
      normalUser.playerId,
      normalUser.username,
      300,
      '0911000003'
    );

    expect(withdrawal.status).toBe('PENDING');
    const balanceDuringHold = ledgerService.getUser(normalUser.playerId)!.walletBalance;
    expect(balanceDuringHold).toBe(balanceBeforeRequest - 300);

    // Admin rejects withdrawal with reason
    const rejectRes = await fetch(`${BASE_URL}/api/admin/withdrawals/${withdrawal.id}/reject`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({ reason: 'Invalid bank account details' })
    });

    expect(rejectRes.status).toBe(200);
    const rejectData = await rejectRes.json();
    expect(rejectData.success).toBe(true);
    expect(rejectData.request.status).toBe('REJECTED');
    expect(rejectData.request.rejectionReason).toBe('Invalid bank account details');

    // Verify balance was released from reserve and restored
    const balanceAfterReject = ledgerService.getUser(normalUser.playerId)!.walletBalance;
    expect(balanceAfterReject).toBe(balanceBeforeRequest);
  });

  // TEST 6: Manual Balance Adjustment with Audit Trail
  it('6. MANUAL ADJUSTMENTS: Admin applies balance adjustment with strict audit logging', async () => {
    const balanceBefore = ledgerService.getUser(normalUser.playerId)!.walletBalance;

    const adjustRes = await fetch(`${BASE_URL}/api/admin/balance-adjustment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        targetPlayerId: normalUser.playerId,
        amount: 150,
        reason: 'Promotional loyalty credit'
      })
    });

    expect(adjustRes.status).toBe(200);
    const adjustData = await adjustRes.json();
    expect(adjustData.success).toBe(true);
    expect(adjustData.newBalance).toBe(balanceBefore + 150);

    // Verify ledger entry
    const entries = ledgerService.getLedgerForUser(normalUser.playerId);
    const adjustEntry = entries.find((e: any) => e.type === 'adjustment' && e.amount === 150);
    expect(adjustEntry).toBeDefined();

    // Verify audit log record
    const auditRes = await fetch(`${BASE_URL}/api/admin/audit-logs`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const auditData = await auditRes.json();
    const log = auditData.logs.find(
      (l: any) => (l.action === 'MANUAL_BALANCE_ADJUSTMENT' || l.action === 'BALANCE_ADJUSTMENT') && l.target_user_id === normalUser.playerId
    );
    expect(log).toBeDefined();
    expect(log.admin_user_id).toBe('usr_admin');
    expect(log.metadata?.amount).toBe(150);
  });

  // TEST 7: Games History & Completed Games inspection
  it('7. GAMES INSPECTION: Admin can view active and completed game rooms', async () => {
    const res = await fetch(`${BASE_URL}/api/admin/games`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(Array.isArray(data.games)).toBe(true);
    expect(data.games.length).toBeGreaterThan(0);
    expect(data.games[0].roomId).toBeDefined();
    expect(data.games[0].roomName).toBeDefined();
  });
});
