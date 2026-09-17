import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { app, httpServer } from './index.js';
import { authService } from './AuthService.js';
import { ledgerService } from './LedgerService.js';
import { databaseService } from './DatabaseService.js';

let BASE_URL: string;
let adminToken: string;
let adminUser: any;
let userTokenA: string;
let userA: any;
let userTokenB: string;
let userB: any;

describe('Financial Approval Workflow Verification Suite', () => {
  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      httpServer.listen(0, '127.0.0.1', () => {
        const addr = httpServer.address() as any;
        BASE_URL = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });

    // 1. Create verified Admin user and session
    adminUser = databaseService.getUserById('usr_admin_fin') || databaseService.createUser({
      id: 'usr_admin_fin',
      telegram_id: '999111222',
      username: 'FinancialAdmin',
      referral_code: 'FINADMIN1',
      role: 'ADMIN'
    });
    const adminSession = databaseService.createSession(adminUser.id, adminUser.telegram_id);
    adminToken = adminSession.id;

    // 2. Create standard Player A
    const tgIdA = Math.floor(770000000 + Math.random() * 899999);
    const initDataA = authService.createSignedTelegramInitData(
      { id: tgIdA, first_name: 'PlayerA', username: `player_a_${tgIdA}` },
      process.env.TELEGRAM_BOT_TOKEN || 'test_mock_bot_token_123456:ABCdefGHIjklMNOpqrSTUvwxYZ'
    );
    const authA = await authService.authenticateTelegram(initDataA);
    const regA = await authService.completeRegistration(authA.tempToken!, 'PlayerA');
    expect(regA.success).toBe(true);
    userA = regA.user;
    userTokenA = regA.sessionToken!;

    // 3. Create standard Player B
    const tgIdB = Math.floor(770000000 + Math.random() * 899999);
    const initDataB = authService.createSignedTelegramInitData(
      { id: tgIdB, first_name: 'PlayerB', username: `player_b_${tgIdB}` },
      process.env.TELEGRAM_BOT_TOKEN || 'test_mock_bot_token_123456:ABCdefGHIjklMNOpqrSTUvwxYZ'
    );
    const authB = await authService.authenticateTelegram(initDataB);
    const regB = await authService.completeRegistration(authB.tempToken!, 'PlayerB');
    expect(regB.success).toBe(true);
    userB = regB.user;
    userTokenB = regB.sessionToken!;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  // TEST 1: User deposit creates PENDING request without crediting balance
  it('1. USER DEPOSIT: creates a PENDING request and does NOT credit user balance upon creation', async () => {
    const initialBalance = ledgerService.getUser(userA.playerId)!.walletBalance;

    const res = await fetch(`${BASE_URL}/api/wallet/deposit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userTokenA}`
      },
      body: JSON.stringify({
        playerId: userA.playerId,
        amount: 500,
        paymentMethod: 'Telebirr',
        status: 'APPROVED' // Client attempt to spoof status must be ignored
      })
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.deposit).toBeDefined();
    expect(data.deposit.status).toBe('PENDING');
    expect(data.deposit.amount).toBe(500);

    // Balance must NOT have changed
    const balanceAfterReq = ledgerService.getUser(userA.playerId)!.walletBalance;
    expect(balanceAfterReq).toBe(initialBalance);
  });

  // TEST 2: User withdrawal creates PENDING request with balance hold, not approved
  it('2. USER WITHDRAWAL: creates a PENDING request and reserves balance without final approval', async () => {
    // Seed Player A with active balance first
    await ledgerService.recordTransaction(
      userA.playerId,
      'deposit',
      1000,
      'Initial fund for withdrawal test',
      undefined,
      undefined,
      `dep_seed_${Date.now()}`
    );

    const balanceBefore = ledgerService.getUser(userA.playerId)!.walletBalance;
    const reservedBefore = ledgerService.getUser(userA.playerId)!.reservedBalance || 0;

    const res = await fetch(`${BASE_URL}/api/wallet/withdraw`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userTokenA}`
      },
      body: JSON.stringify({
        playerId: userA.playerId,
        amount: 400,
        address: '0912345678',
        withdrawAddress: '0912345678',
        status: 'APPROVED' // Client spoof attempt
      })
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.withdrawal).toBeDefined();
    expect(data.withdrawal.status).toBe('PENDING');
    expect(data.withdrawal.amount).toBe(400);
    expect(data.withdrawal.address).toBe('0912345678');

    // Balance must be held in reserved_balance, active balance reduced by 400
    const userAfter = ledgerService.getUser(userA.playerId)!;
    expect(userAfter.walletBalance).toBe(balanceBefore - 400);
    expect(userAfter.reservedBalance).toBe(reservedBefore + 400);
  });

  // TEST 3: Pending requests appear in Admin Dashboard
  it('3. ADMIN DASHBOARD: Pending deposit and withdrawal requests appear in admin lists', async () => {
    // Get deposits
    const depRes = await fetch(`${BASE_URL}/api/admin/deposits?status=PENDING`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    expect(depRes.status).toBe(200);
    const depData = await depRes.json();
    expect(depData.success).toBe(true);
    const foundDeposit = depData.deposits.find((d: any) => d.playerId === userA.playerId && d.status === 'PENDING');
    expect(foundDeposit).toBeDefined();

    // Get withdrawals
    const wthRes = await fetch(`${BASE_URL}/api/admin/withdrawals?status=PENDING`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    expect(wthRes.status).toBe(200);
    const wthData = await wthRes.json();
    expect(wthData.success).toBe(true);
    const foundWth = wthData.withdrawals.find((w: any) => w.playerId === userA.playerId && w.status === 'PENDING');
    expect(foundWth).toBeDefined();
    expect(foundWth.amount).toBe(400); // Stored as positive number
  });

  // TEST 4: Admin approves deposit -> credits balance, APPROVED status, logs transaction & audit
  it('4. ADMIN APPROVES DEPOSIT: credits user balance exactly once, sets status APPROVED, creates audit trail', async () => {
    // Create new clean deposit request
    const depReq = ledgerService.createDepositRequest(userB.playerId, userB.username, 300, 'Telebirr');
    expect(depReq.status).toBe('PENDING');

    const balanceBefore = ledgerService.getUser(userB.playerId)!.walletBalance;

    // Admin approves
    const approveRes = await fetch(`${BASE_URL}/api/admin/deposits/${depReq.id}/approve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    expect(approveRes.status).toBe(200);
    const data = await approveRes.json();
    expect(data.success).toBe(true);
    expect(data.request.status).toBe('APPROVED');

    // Balance credited exactly once
    const balanceAfter = ledgerService.getUser(userB.playerId)!.walletBalance;
    expect(balanceAfter).toBe(balanceBefore + 300);

    // Verify audit log exists
    const auditRes = await fetch(`${BASE_URL}/api/admin/audit-logs`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const auditData = await auditRes.json();
    const log = auditData.logs.find((l: any) => l.action === 'APPROVE_DEPOSIT' && l.target_record_id === depReq.id);
    expect(log).toBeDefined();
    expect(log.admin_user_id).toBe(adminUser.id);
  });

  // TEST 5: Admin rejects deposit -> does not credit balance, REJECTED status, logs audit
  it('5. ADMIN REJECTS DEPOSIT: changes status to REJECTED, leaves balance uncredited, records audit', async () => {
    const depReq = ledgerService.createDepositRequest(userB.playerId, userB.username, 150, 'CBE');
    const balanceBefore = ledgerService.getUser(userB.playerId)!.walletBalance;

    const rejectRes = await fetch(`${BASE_URL}/api/admin/deposits/${depReq.id}/reject`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({ reason: 'Unverified transaction receipt' })
    });

    expect(rejectRes.status).toBe(200);
    const data = await rejectRes.json();
    expect(data.success).toBe(true);
    expect(data.request.status).toBe('REJECTED');
    expect(data.request.rejectionReason).toBe('Unverified transaction receipt');

    // Balance must NOT have changed
    const balanceAfter = ledgerService.getUser(userB.playerId)!.walletBalance;
    expect(balanceAfter).toBe(balanceBefore);

    // Audit log
    const auditRes = await fetch(`${BASE_URL}/api/admin/audit-logs`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const auditData = await auditRes.json();
    const log = auditData.logs.find((l: any) => l.action === 'REJECT_DEPOSIT' && l.target_record_id === depReq.id);
    expect(log).toBeDefined();
  });

  // TEST 6: Admin approves withdrawal -> deducts reserved balance, status APPROVED, creates transaction & audit
  it('6. ADMIN APPROVES WITHDRAWAL: deducts reserved balance, sets status APPROVED, creates transaction & audit', async () => {
    // Seed Player B balance
    await ledgerService.recordTransaction(
      userB.playerId,
      'deposit',
      500,
      'Seed Player B for withdrawal approval',
      undefined,
      undefined,
      `dep_seedB_${Date.now()}`
    );

    const wthReq = ledgerService.createWithdrawalRequest(userB.playerId, userB.username, 200, '0988776655');
    expect(wthReq.status).toBe('PENDING');

    const balanceDuringHold = ledgerService.getUser(userB.playerId)!.walletBalance;
    const reservedDuringHold = ledgerService.getUser(userB.playerId)!.reservedBalance || 0;

    const approveRes = await fetch(`${BASE_URL}/api/admin/withdrawals/${wthReq.id}/approve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    expect(approveRes.status).toBe(200);
    const data = await approveRes.json();
    expect(data.success).toBe(true);
    expect(data.request.status).toBe('APPROVED');

    // Reserved balance must now be released (deducted by 200), active balance remains unchanged (already deducted)
    const userAfter = ledgerService.getUser(userB.playerId)!;
    expect(userAfter.walletBalance).toBe(balanceDuringHold);
    expect(userAfter.reservedBalance).toBe(reservedDuringHold - 200);

    // Ledger entry recorded
    const ledger = ledgerService.getLedgerForUser(userB.playerId);
    const tx = ledger.find((e) => e.referenceId === `wth_comp_${wthReq.id}`);
    expect(tx).toBeDefined();
    expect(tx?.type).toBe('withdrawal');
    expect(tx?.amount).toBe(200);

    // Audit log recorded
    const auditRes = await fetch(`${BASE_URL}/api/admin/audit-logs`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const auditData = await auditRes.json();
    const log = auditData.logs.find((l: any) => l.action === 'APPROVE_WITHDRAWAL' && l.target_record_id === wthReq.id);
    expect(log).toBeDefined();
  });

  // TEST 7: Admin rejects withdrawal -> restores held funds to active balance, status REJECTED, audit logged
  it('7. ADMIN REJECTS WITHDRAWAL: restores held funds to active balance, sets status REJECTED, audit logged', async () => {
    const wthReq = ledgerService.createWithdrawalRequest(userB.playerId, userB.username, 100, '0988776655');
    expect(wthReq.status).toBe('PENDING');

    const balanceDuringHold = ledgerService.getUser(userB.playerId)!.walletBalance;
    const reservedDuringHold = ledgerService.getUser(userB.playerId)!.reservedBalance || 0;

    const rejectRes = await fetch(`${BASE_URL}/api/admin/withdrawals/${wthReq.id}/reject`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({ reason: 'Incorrect phone number' })
    });

    expect(rejectRes.status).toBe(200);
    const data = await rejectRes.json();
    expect(data.success).toBe(true);
    expect(data.request.status).toBe('REJECTED');
    expect(data.request.rejectionReason).toBe('Incorrect phone number');

    // Balance restored to active wallet, reserved decremented
    const userAfter = ledgerService.getUser(userB.playerId)!;
    expect(userAfter.walletBalance).toBe(balanceDuringHold + 100);
    expect(userAfter.reservedBalance).toBe(reservedDuringHold - 100);

    // Audit log
    const auditRes = await fetch(`${BASE_URL}/api/admin/audit-logs`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const auditData = await auditRes.json();
    const log = auditData.logs.find((l: any) => l.action === 'REJECT_WITHDRAWAL' && l.target_record_id === wthReq.id);
    expect(log).toBeDefined();
  });

  // TEST 8: Non-admin user cannot call approval endpoints
  it('8. SECURITY RBAC: Regular user cannot call admin deposit or withdrawal approval/rejection endpoints', async () => {
    const depReq = ledgerService.createDepositRequest(userA.playerId, userA.username, 100, 'Telebirr');
    const wthReq = ledgerService.createWithdrawalRequest(userA.playerId, userA.username, 50, '0911223344');

    const forbiddenEndpoints = [
      { url: `${BASE_URL}/api/admin/deposits/${depReq.id}/approve`, method: 'POST' },
      { url: `${BASE_URL}/api/admin/deposits/${depReq.id}/reject`, method: 'POST' },
      { url: `${BASE_URL}/api/admin/withdrawals/${wthReq.id}/approve`, method: 'POST' },
      { url: `${BASE_URL}/api/admin/withdrawals/${wthReq.id}/reject`, method: 'POST' }
    ];

    for (const ep of forbiddenEndpoints) {
      const res = await fetch(ep.url, {
        method: ep.method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userTokenA}`
        }
      });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toMatch(/admin authorization required|admin privileges required/i);
    }
  });

  // TEST 9: Duplicate approval and duplicate rejection blocked
  it('9. FINANCIAL SAFETY IDEMPOTENCY: Duplicate approvals and duplicate rejections are blocked', async () => {
    // 1. Duplicate Deposit Approval
    const depReq = ledgerService.createDepositRequest(userA.playerId, userA.username, 75, 'Telebirr');
    const app1 = await fetch(`${BASE_URL}/api/admin/deposits/${depReq.id}/approve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    expect(app1.status).toBe(200);

    const balanceAfterFirstApprove = ledgerService.getUser(userA.playerId)!.walletBalance;

    // Second approve attempt must be blocked
    const app2 = await fetch(`${BASE_URL}/api/admin/deposits/${depReq.id}/approve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    expect(app2.status).toBe(400);
    const app2Data = await app2.json();
    expect(app2Data.error).toMatch(/already/i);

    // Balance must NOT double-credit
    expect(ledgerService.getUser(userA.playerId)!.walletBalance).toBe(balanceAfterFirstApprove);

    // Attempting to reject an already approved deposit must also fail
    const rejAfterApp = await fetch(`${BASE_URL}/api/admin/deposits/${depReq.id}/reject`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    expect(rejAfterApp.status).toBe(400);

    // 2. Duplicate Withdrawal Approval
    const wthReq = ledgerService.createWithdrawalRequest(userA.playerId, userA.username, 60, '0911223344');
    const wApp1 = await fetch(`${BASE_URL}/api/admin/withdrawals/${wthReq.id}/approve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    expect(wApp1.status).toBe(200);

    // Second withdrawal approval must be blocked
    const wApp2 = await fetch(`${BASE_URL}/api/admin/withdrawals/${wthReq.id}/approve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    expect(wApp2.status).toBe(400);
    const wApp2Data = await wApp2.json();
    expect(wApp2Data.error).toMatch(/already/i);
  });
});
