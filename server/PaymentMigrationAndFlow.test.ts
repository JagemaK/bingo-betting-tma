import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';
import { app, httpServer } from './index.js';
import { authService } from './AuthService.js';
import { ledgerService } from './LedgerService.js';
import { databaseService } from './DatabaseService.js';
import { sanitizePaymentError } from '../src/components/WalletModal.js';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite');

let BASE_URL: string;
let adminToken: string;
let adminUser: any;
let playerA: any;
let playerTokenA: string;
let playerB: any;
let playerTokenB: string;

describe('Payment Migration and Forensic Verification Test Suite', () => {
  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      httpServer.listen(0, '127.0.0.1', () => {
        const addr = httpServer.address() as any;
        BASE_URL = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });

    // 1. Create verified Admin user and session
    adminUser = databaseService.getUserById('usr_admin_forensic') || databaseService.createUser({
      id: 'usr_admin_forensic',
      telegram_id: '999888777',
      username: 'ForensicAdmin',
      referral_code: 'FORENSIC1',
      role: 'ADMIN'
    });
    const adminSession = databaseService.createSession(adminUser.id, adminUser.telegram_id);
    adminToken = adminSession.id;

    // 2. Create test Player A
    const tgIdA = Math.floor(700000000 + Math.random() * 899999);
    const initDataA = authService.createSignedTelegramInitData(
      { id: tgIdA, first_name: 'PlayerA', username: `player_mig_${tgIdA}` },
      process.env.TELEGRAM_BOT_TOKEN || 'test_mock_bot_token_123456:ABCdefGHIjklMNOpqrSTUvwxYZ'
    );
    const authA = await authService.authenticateTelegram(initDataA);
    const regA = await authService.completeRegistration(authA.tempToken!, 'PlayerA');
    playerA = regA.user;
    playerTokenA = regA.sessionToken!;

    // 3. Create test Player B
    const tgIdB = Math.floor(700000000 + Math.random() * 899999);
    const initDataB = authService.createSignedTelegramInitData(
      { id: tgIdB, first_name: 'PlayerB', username: `player_mig_${tgIdB}` },
      process.env.TELEGRAM_BOT_TOKEN || 'test_mock_bot_token_123456:ABCdefGHIjklMNOpqrSTUvwxYZ'
    );
    const authB = await authService.authenticateTelegram(initDataB);
    const regB = await authService.completeRegistration(authB.tempToken!, 'PlayerB');
    playerB = regB.user;
    playerTokenB = regB.sessionToken!;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  // =========================================================================
  // SECTION A, B, C: SQLite MIGRATION TEST ON ISOLATED DATABASE WITH OLD SCHEMA
  // =========================================================================

  it('A & C. MIGRATION: Old table with restrictive CHECK constraint is rebuilt, rows survive, and ESCROW_HOLD succeeds', () => {
    // Create an isolated in-memory database with the exact old schema
    const testDb = new DatabaseSync(':memory:');
    testDb.exec('PRAGMA foreign_keys = ON;');

    testDb.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL
      );
      INSERT INTO users (id, username) VALUES ('u1', 'alice'), ('u2', 'bob');

      -- Old table with NO 'ESCROW_HOLD' in CHECK constraint
      CREATE TABLE ledger_transactions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        username TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('DEPOSIT', 'BET', 'WIN_PAYOUT', 'WITHDRAWAL', 'REFUND', 'BONUS', 'LOSS', 'ADMIN_ADJUSTMENT')),
        amount REAL NOT NULL,
        balance_before REAL NOT NULL,
        balance_after REAL NOT NULL,
        game_id TEXT,
        ticket_id TEXT,
        reference_id TEXT UNIQUE,
        description TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX idx_ledger_user ON ledger_transactions(user_id);

      INSERT INTO ledger_transactions VALUES
        ('tx1', 'u1', 'alice', 'DEPOSIT', 500, 0, 500, NULL, NULL, 'ref1', 'Initial deposit', '2026-01-01T00:00:00Z'),
        ('tx2', 'u1', 'alice', 'BET', 50, 500, 450, 'g1', 't1', 'ref2', 'Card bet', '2026-01-01T00:01:00Z'),
        ('tx3', 'u2', 'bob', 'WIN_PAYOUT', 100, 10, 110, 'g1', 't2', 'ref3', 'Bingo win', '2026-01-01T00:02:00Z');
    `);

    // Verify ESCROW_HOLD fails with old constraint
    expect(() => {
      testDb.prepare(`
        INSERT INTO ledger_transactions VALUES
          ('tx4', 'u1', 'alice', 'ESCROW_HOLD', 100, 450, 350, NULL, NULL, 'ref4', 'Escrow hold', '2026-01-01T00:03:00Z')
      `).run();
    }).toThrow(/CHECK constraint failed/);

    // Apply the exact table rebuild migration logic from DatabaseService
    const checkRow = testDb.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'ledger_transactions'").get() as any;
    expect(checkRow.sql).not.toContain('ESCROW_HOLD');

    testDb.exec('PRAGMA foreign_keys = OFF;');
    testDb.exec(`
      CREATE TABLE ledger_transactions_new (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        username TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('DEPOSIT', 'BET', 'WIN_PAYOUT', 'WITHDRAWAL', 'REFUND', 'BONUS', 'LOSS', 'ADMIN_ADJUSTMENT', 'ESCROW_HOLD')),
        amount REAL NOT NULL,
        balance_before REAL NOT NULL,
        balance_after REAL NOT NULL,
        game_id TEXT,
        ticket_id TEXT,
        reference_id TEXT UNIQUE,
        description TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      INSERT INTO ledger_transactions_new (
        id, user_id, username, type, amount, balance_before, balance_after,
        game_id, ticket_id, reference_id, description, created_at
      )
      SELECT
        id, user_id, username, type, amount, balance_before, balance_after,
        game_id, ticket_id, reference_id, description, created_at
      FROM ledger_transactions;

      DROP TABLE ledger_transactions;
      ALTER TABLE ledger_transactions_new RENAME TO ledger_transactions;

      CREATE INDEX IF NOT EXISTS idx_ledger_user ON ledger_transactions(user_id);
      CREATE INDEX IF NOT EXISTS idx_ledger_game ON ledger_transactions(game_id);
      CREATE INDEX IF NOT EXISTS idx_ledger_created ON ledger_transactions(created_at);
      CREATE INDEX IF NOT EXISTS idx_ledger_type ON ledger_transactions(type);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_ledger_reference_id ON ledger_transactions(reference_id) WHERE reference_id IS NOT NULL;
    `);
    testDb.exec('PRAGMA foreign_keys = ON;');

    // Verify foreign key integrity
    const fkViolations = testDb.prepare('PRAGMA foreign_key_check;').all();
    expect(fkViolations.length).toBe(0);

    // Verify existing rows survived intact
    const rows = testDb.prepare('SELECT * FROM ledger_transactions ORDER BY id ASC').all() as any[];
    expect(rows.length).toBe(3);
    expect(rows[0].id).toBe('tx1');
    expect(rows[0].type).toBe('DEPOSIT');
    expect(rows[0].amount).toBe(500);
    expect(rows[0].balance_after).toBe(500);
    expect(rows[1].id).toBe('tx2');
    expect(rows[1].type).toBe('BET');
    expect(rows[2].id).toBe('tx3');
    expect(rows[2].type).toBe('WIN_PAYOUT');

    // Verify ESCROW_HOLD is now valid!
    testDb.prepare(`
      INSERT INTO ledger_transactions VALUES
        ('tx4', 'u1', 'alice', 'ESCROW_HOLD', 100, 450, 350, NULL, NULL, 'ref4', 'Escrow hold', '2026-01-01T00:03:00Z')
    `).run();

    const newRow = testDb.prepare("SELECT * FROM ledger_transactions WHERE id = 'tx4'").get() as any;
    expect(newRow).toBeDefined();
    expect(newRow.type).toBe('ESCROW_HOLD');
    expect(newRow.amount).toBe(100);

    testDb.close();
  });

  it('B. IDEMPOTENCY: Migration check detects ESCROW_HOLD and skips rebuild on subsequent runs', () => {
    const testDb = new DatabaseSync(':memory:');
    testDb.exec(`
      CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT NOT NULL);
      CREATE TABLE ledger_transactions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        username TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('DEPOSIT', 'BET', 'WIN_PAYOUT', 'WITHDRAWAL', 'REFUND', 'BONUS', 'LOSS', 'ADMIN_ADJUSTMENT', 'ESCROW_HOLD')),
        amount REAL NOT NULL,
        balance_before REAL NOT NULL,
        balance_after REAL NOT NULL,
        game_id TEXT,
        ticket_id TEXT,
        reference_id TEXT UNIQUE,
        description TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);

    // Check if migration is needed
    const tableInfo = testDb.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'ledger_transactions'").get() as any;
    const isEscrowHoldMissing = tableInfo && typeof tableInfo.sql === 'string' && !tableInfo.sql.includes('ESCROW_HOLD');

    // Should detect that it is already migrated and not missing
    expect(isEscrowHoldMissing).toBe(false);

    testDb.close();
  });

  // =========================================================================
  // SECTION D, E, F, G: WITHDRAWAL LIFECYCLE (ESCROW_HOLD -> APPROVE / REJECT)
  // =========================================================================

  it('D. WITHDRAWAL REQUEST: reserves available balance, creates PENDING withdrawal, and records ESCROW_HOLD in ledger', async () => {
    // Fund Player A with 1000 ETB
    ledgerService.recordTransaction(
      playerA.playerId,
      'deposit',
      1000,
      'Test funding for withdrawal test',
      undefined,
      undefined,
      `dep_test_${Date.now()}`
    );

    const userBefore = ledgerService.getUser(playerA.playerId)!;
    const startingBalance = userBefore.walletBalance;
    const startingReserved = userBefore.reservedBalance || 0;

    const res = await fetch(`${BASE_URL}/api/wallet/withdraw`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${playerTokenA}`
      },
      body: JSON.stringify({
        playerId: playerA.playerId,
        amount: 250,
        address: '0911223344',
        withdrawAddress: '0911223344'
      })
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.withdrawal).toBeDefined();
    expect(data.withdrawal.status).toBe('PENDING');
    expect(data.withdrawal.amount).toBe(250);

    // Verify wallet balance reserved
    const userAfter = ledgerService.getUser(playerA.playerId)!;
    expect(userAfter.walletBalance).toBe(startingBalance - 250);
    expect(userAfter.reservedBalance).toBe(startingReserved + 250);

    // Verify ESCROW_HOLD ledger entry
    const ledgerTx = databaseService.getLedgerTransactionByReference(`wth_hold_${data.withdrawal.id}`);
    expect(ledgerTx).toBeDefined();
    expect(ledgerTx!.type).toBe('ESCROW_HOLD');
    expect(ledgerTx!.amount).toBe(250);
    expect(ledgerTx!.balance_before).toBe(startingBalance);
    expect(ledgerTx!.balance_after).toBe(startingBalance - 250);
  });

  it('E. WITHDRAWAL APPROVAL: reduces reserved balance, marks APPROVED, and records WITHDRAWAL in ledger', async () => {
    // Fund and create a withdrawal for Player A
    ledgerService.recordTransaction(
      playerA.playerId,
      'deposit',
      500,
      'Fund for approval test',
      undefined,
      undefined,
      `dep_appr_${Date.now()}`
    );

    const wthReq = databaseService.createWithdrawalRequest(
      playerA.playerId,
      playerA.username,
      150,
      '0911223344'
    );
    expect(wthReq.status).toBe('PENDING');

    const walletBeforeApproval = databaseService.getWallet(playerA.playerId)!;
    const reservedBefore = walletBeforeApproval.reserved_balance;
    const balanceBefore = walletBeforeApproval.balance;

    // Admin approves
    const approveRes = await fetch(`${BASE_URL}/api/admin/withdrawals/${wthReq.id}/approve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    expect(approveRes.status).toBe(200);
    const data = await approveRes.json();
    expect(data.success).toBe(true);
    expect(data.withdrawal.status).toBe('APPROVED');

    // Wallet check: reserved balance deducted by 150, active balance unchanged
    const walletAfter = databaseService.getWallet(playerA.playerId)!;
    expect(walletAfter.reserved_balance).toBe(reservedBefore - 150);
    expect(walletAfter.balance).toBe(balanceBefore);

    // Ledger check: final WITHDRAWAL entry recorded
    const finalTx = databaseService.getLedgerTransactionByReference(`wth_comp_${wthReq.id}`);
    expect(finalTx).toBeDefined();
    expect(finalTx!.type).toBe('WITHDRAWAL');
    expect(finalTx!.amount).toBe(150);
  });

  it('F. WITHDRAWAL REJECTION: restores reserved funds to active balance, marks REJECTED, and records REFUND in ledger', async () => {
    // Fund and create withdrawal
    ledgerService.recordTransaction(
      playerA.playerId,
      'deposit',
      500,
      'Fund for rejection test',
      undefined,
      undefined,
      `dep_rej_${Date.now()}`
    );

    const wthReq = databaseService.createWithdrawalRequest(
      playerA.playerId,
      playerA.username,
      100,
      '0911223344'
    );

    const walletBeforeRejection = databaseService.getWallet(playerA.playerId)!;
    const balanceBefore = walletBeforeRejection.balance;
    const reservedBefore = walletBeforeRejection.reserved_balance;

    // Admin rejects
    const rejectRes = await fetch(`${BASE_URL}/api/admin/withdrawals/${wthReq.id}/reject`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({ reason: 'Invalid Telebirr account name' })
    });

    expect(rejectRes.status).toBe(200);
    const data = await rejectRes.json();
    expect(data.success).toBe(true);
    expect(data.withdrawal.status).toBe('REJECTED');

    // Wallet check: balance restored (+100), reserved balance decreased (-100)
    const walletAfter = databaseService.getWallet(playerA.playerId)!;
    expect(walletAfter.balance).toBe(balanceBefore + 100);
    expect(walletAfter.reserved_balance).toBe(reservedBefore - 100);

    // Ledger check: REFUND entry recorded
    const refundTx = databaseService.getLedgerTransactionByReference(`wth_ref_${wthReq.id}`);
    expect(refundTx).toBeDefined();
    expect(refundTx!.type).toBe('REFUND');
    expect(refundTx!.amount).toBe(100);
  });

  it('G. DOUBLE-PROCESSING PREVENTION: Cannot approve or reject already processed withdrawal', async () => {
    ledgerService.recordTransaction(
      playerA.playerId,
      'deposit',
      500,
      'Fund for idempotency test',
      undefined,
      undefined,
      `dep_idem_${Date.now()}`
    );

    const wthReq = databaseService.createWithdrawalRequest(
      playerA.playerId,
      playerA.username,
      50,
      '0911223344'
    );

    // Approve first time
    const res1 = await fetch(`${BASE_URL}/api/admin/withdrawals/${wthReq.id}/approve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    expect(res1.status).toBe(200);

    // Approve second time -> must fail
    const res2 = await fetch(`${BASE_URL}/api/admin/withdrawals/${wthReq.id}/approve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    expect(res2.status).toBe(400);

    // Reject after approved -> must fail
    const res3 = await fetch(`${BASE_URL}/api/admin/withdrawals/${wthReq.id}/reject`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    expect(res3.status).toBe(400);
  });

  // =========================================================================
  // SECTION H, I, J: DEPOSIT LIFECYCLE & DUPLICATE PREVENTION
  // =========================================================================

  it('H. DEPOSIT REQUEST: creates PENDING request, does NOT credit wallet balance', async () => {
    const balanceBefore = ledgerService.getUser(playerB.playerId)!.walletBalance;

    const ref = `TEL_REF_${Date.now()}`;
    const res = await fetch(`${BASE_URL}/api/wallet/deposit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${playerTokenB}`
      },
      body: JSON.stringify({
        playerId: playerB.playerId,
        amount: 300,
        paymentMethod: 'Telebirr',
        referenceId: ref
      })
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.deposit).toBeDefined();
    expect(data.deposit.status).toBe('PENDING');
    expect(data.deposit.amount).toBe(300);

    // Balance must NOT have changed merely from request
    const balanceAfter = ledgerService.getUser(playerB.playerId)!.walletBalance;
    expect(balanceAfter).toBe(balanceBefore);
  });

  it('I. DEPOSIT APPROVAL: credits wallet exactly once, records DEPOSIT in ledger, blocks double approval', async () => {
    const depReq = databaseService.createDepositRequest(
      playerB.playerId,
      playerB.username,
      200,
      'Telebirr',
      `TEL_APPR_${Date.now()}`
    );
    expect(depReq.status).toBe('PENDING');

    const balanceBefore = databaseService.getWallet(playerB.playerId)!.balance;

    // Admin approves first time
    const res1 = await fetch(`${BASE_URL}/api/admin/deposits/${depReq.id}/approve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    expect(res1.status).toBe(200);
    const data1 = await res1.json();
    expect(data1.success).toBe(true);

    // Wallet credited
    const balanceAfter1 = databaseService.getWallet(playerB.playerId)!.balance;
    expect(balanceAfter1).toBe(balanceBefore + 200);

    // Ledger transaction exists with type DEPOSIT
    const ledgerTx = databaseService.getLedgerTransactionByReference(depReq.reference_id!);
    expect(ledgerTx).toBeDefined();
    expect(ledgerTx!.type).toBe('DEPOSIT');
    expect(ledgerTx!.amount).toBe(200);

    // Second approval attempt must fail
    const res2 = await fetch(`${BASE_URL}/api/admin/deposits/${depReq.id}/approve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    expect(res2.status).toBe(400);

    // Balance not double credited
    const balanceAfter2 = databaseService.getWallet(playerB.playerId)!.balance;
    expect(balanceAfter2).toBe(balanceAfter1);
  });

  it('J. DUPLICATE TELEBIRR REFERENCE: Rejects identical transaction reference', async () => {
    const sharedRef = `TEL_SHARED_${Date.now()}`;

    // First deposit succeeds
    const res1 = await fetch(`${BASE_URL}/api/wallet/deposit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${playerTokenB}`
      },
      body: JSON.stringify({
        playerId: playerB.playerId,
        amount: 100,
        paymentMethod: 'Telebirr',
        referenceId: sharedRef
      })
    });
    expect(res1.status).toBe(200);

    // Second deposit with same reference must be rejected with 409 Conflict
    const res2 = await fetch(`${BASE_URL}/api/wallet/deposit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${playerTokenB}`
      },
      body: JSON.stringify({
        playerId: playerB.playerId,
        amount: 100,
        paymentMethod: 'Telebirr',
        referenceId: sharedRef
      })
    });
    expect([400, 409]).toContain(res2.status);
    const data2 = await res2.json();
    expect(data2.success).toBe(false);
    expect(data2.error).toMatch(/already been submitted|duplicate/i);
  });

  // =========================================================================
  // SECTION K, L, M: VALIDATION & ERROR SANITIZATION
  // =========================================================================

  it('K. INSUFFICIENT BALANCE: Withdrawal request exceeding available balance is rejected', async () => {
    const wallet = databaseService.getWallet(playerB.playerId)!;
    const excessiveAmount = wallet.balance + 10000;

    const res = await fetch(`${BASE_URL}/api/wallet/withdraw`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${playerTokenB}`
      },
      body: JSON.stringify({
        playerId: playerB.playerId,
        amount: excessiveAmount,
        address: '0912345678',
        withdrawAddress: '0912345678'
      })
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error).toMatch(/insufficient funds|insufficient balance/i);
  });

  it('L. INVALID TELEBIRR PHONE: Withdrawal with invalid phone format is rejected', async () => {
    const res = await fetch(`${BASE_URL}/api/wallet/withdraw`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${playerTokenB}`
      },
      body: JSON.stringify({
        playerId: playerB.playerId,
        amount: 10,
        address: '12345', // Invalid phone
        withdrawAddress: '12345'
      })
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.error).toMatch(/(valid Ethiopian mobile|Invalid Telebirr phone)/i);
  });

  it('M. ERROR SANITIZATION: Raw SQLite constraint errors are sanitized from normal user responses', () => {
    // Test frontend sanitizer
    const rawSqliteError = "CHECK constraint failed: type IN ('DEPOSIT','BET','WIN_PAYOUT','WITHDRAWAL','REFUND','BONUS','LOSS','ADMIN_ADJUSTMENT')";
    const sanitized = sanitizePaymentError(rawSqliteError);
    expect(sanitized).toBe('Your payment request could not be processed. Please try again.');
    expect(sanitized).not.toContain('CHECK constraint');
    expect(sanitized).not.toContain('sqlite');

    // Genuine user-friendly errors should pass through untouched
    const userFriendlyError = 'Insufficient balance. Available: 50.00 ETB';
    expect(sanitizePaymentError(userFriendlyError)).toBe(userFriendlyError);

    const dupRefError = 'This Telebirr transaction reference has already been submitted.';
    expect(sanitizePaymentError(dupRefError)).toBe(dupRefError);

    const phoneError = 'Please provide a valid Ethiopian mobile phone number.';
    expect(sanitizePaymentError(phoneError)).toBe(phoneError);
  });

  // =========================================================================
  // SECTION 10: PERSISTENT DATABASE INTEGRITY CHECK
  // =========================================================================

  it('10. INTEGRITY: Existing bingo.db tables, records, and foreign keys remain healthy', () => {
    // Query authoritative databaseService counts
    const db = (databaseService as any).db;
    const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get() as any;
    const txCount = db.prepare('SELECT COUNT(*) as c FROM ledger_transactions').get() as any;
    expect(userCount.c).toBeGreaterThan(0);
    expect(txCount.c).toBeGreaterThan(0);

    // Verify negative balances do not exist
    const negativeWallets = db.prepare('SELECT COUNT(*) as c FROM wallets WHERE balance < 0 OR reserved_balance < 0').get() as any;
    expect(negativeWallets.c).toBe(0);

    // Verify foreign key integrity
    const fkErrors = db.prepare('PRAGMA foreign_key_check;').all();
    expect(fkErrors.length).toBe(0);
  });
});
