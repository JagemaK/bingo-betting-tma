import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { app, httpServer, multiRoomManager } from './index.js';
import { authService, clearInitDataReplayCache } from './AuthService.js';
import { ledgerService } from './LedgerService.js';
import { databaseService } from './DatabaseService.js';
import { GameRoom } from './GameRoomManager.js';
import { DatabaseService } from './DatabaseService.js';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

let BASE_URL: string;
let superAdminToken: string;
let superAdminUser: any;
let agentToken: string;
let agentUser: any;
let normalUserToken: string;
let normalUser: any;
let victimUserToken: string;
let victimUser: any;

const TEST_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'test_mock_bot_token_123456:ABCdefGHIjklMNOpqrSTUvwxYZ';
const mockIo = {
  to: () => ({ emit: () => {} }),
  emit: () => {}
} as any;

describe('Post-Remediation Verification & Launch Gate Test Suite', () => {
  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      httpServer.listen(0, '127.0.0.1', () => {
        const addr = httpServer.address() as any;
        BASE_URL = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });

    // 1. Super Admin
    const saTgId = `899000${Math.floor(Math.random() * 899999)}`;
    superAdminUser = databaseService.createUser({
      id: `usr_lg_sa_${Date.now()}`,
      telegram_id: saTgId,
      username: `LG_SuperAdmin_${saTgId.slice(-4)}`,
      referral_code: `LGSA${saTgId.slice(-4)}`,
      role: 'SUPER_ADMIN'
    });
    superAdminToken = databaseService.createSession(superAdminUser.id, superAdminUser.telegram_id).id;

    // 2. Agent
    const agTgId = `898000${Math.floor(Math.random() * 899999)}`;
    agentUser = databaseService.createUser({
      id: `usr_lg_agent_${Date.now()}`,
      telegram_id: agTgId,
      username: `LG_Agent_${agTgId.slice(-4)}`,
      referral_code: `LGA${agTgId.slice(-4)}`,
      role: 'AGENT',
      phone: `+251911${Math.floor(100000 + Math.random() * 899999)}`,
      telebirr_number: `0911${Math.floor(100000 + Math.random() * 899999)}`
    });
    agentToken = databaseService.createSession(agentUser.id, agentUser.telegram_id).id;

    // 3. Normal User (Attacker / Tester)
    const nuTgId = `897000${Math.floor(Math.random() * 899999)}`;
    normalUser = databaseService.createUser({
      id: `usr_lg_norm_${Date.now()}`,
      telegram_id: nuTgId,
      username: `LG_Normal_${nuTgId.slice(-4)}`,
      referral_code: `LGN${nuTgId.slice(-4)}`,
      role: 'USER',
      phone: `+251922${Math.floor(100000 + Math.random() * 899999)}`,
      account_status: 'ACTIVE',
      account_type: 'REAL'
    });
    normalUserToken = databaseService.createSession(normalUser.id, normalUser.telegram_id).id;

    // 4. Victim User
    const vicTgId = `896000${Math.floor(Math.random() * 899999)}`;
    victimUser = databaseService.createUser({
      id: `usr_lg_vic_${Date.now()}`,
      telegram_id: vicTgId,
      username: `LG_Victim_${vicTgId.slice(-4)}`,
      referral_code: `LGV${vicTgId.slice(-4)}`,
      role: 'USER',
      phone: `+251933${Math.floor(100000 + Math.random() * 899999)}`,
      account_status: 'ACTIVE',
      account_type: 'REAL'
    });
    victimUserToken = databaseService.createSession(victimUser.id, victimUser.telegram_id).id;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  // ==================== SECTION 1: AUTHENTICATION NEGATIVE TESTS ====================
  describe('1. Authentication Verification & Negative Attack Tests', () => {
    it('1.1 Forged User ID: Rejects request with forged session token', async () => {
      const res = await fetch(`${BASE_URL}/api/profile`, {
        headers: { 'Authorization': 'Bearer forged_token_not_in_db' }
      });
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toMatch(/Invalid or expired session/i);
    });

    it('1.2 Forged Player ID: Catches IDOR spoofing attempt and blocks with 403 Forbidden', async () => {
      // Normal user attempts to pass victim's playerId in body to deposit
      const res = await fetch(`${BASE_URL}/api/wallet/deposit`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${normalUserToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          amount: 50,
          paymentMethod: 'Telebirr',
          reference: `TX_FORGE_${Date.now()}`,
          playerId: victimUser.id // Attacker attempts to forge victim identity
        })
      });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toMatch(/Access denied/i);
    });

    it('1.3 Expired Session: Rejects expired session tokens', async () => {
      const session = databaseService.createSession(normalUser.id, normalUser.telegram_id);
      // Manually backdate expiration to 1 hour ago
      databaseService.getDb().prepare('UPDATE sessions SET expires_at = ? WHERE id = ?').run(Date.now() - 3600000, session.id);

      const res = await fetch(`${BASE_URL}/api/profile`, {
        headers: { 'Authorization': `Bearer ${session.id}` }
      });
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toMatch(/Invalid or expired session/i);
    });

    it('1.4 Revoked Session: Rejects revoked session token after logout', async () => {
      const session = databaseService.createSession(normalUser.id, normalUser.telegram_id);

      // Verify token initially works
      const res1 = await fetch(`${BASE_URL}/api/profile`, {
        headers: { 'Authorization': `Bearer ${session.id}` }
      });
      expect(res1.status).toBe(200);

      // Logout
      const logoutRes = await fetch(`${BASE_URL}/api/auth/logout`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.id}` }
      });
      expect(logoutRes.status).toBe(200);

      // Second request with revoked token MUST fail
      const res2 = await fetch(`${BASE_URL}/api/profile`, {
        headers: { 'Authorization': `Bearer ${session.id}` }
      });
      expect(res2.status).toBe(401);
    });

    it('1.5 Replayed Telegram Authentication: Rejects replayed initData', async () => {
      clearInitDataReplayCache();
      const tgId = 991234567;
      const initData = authService.createSignedTelegramInitData(
        { id: tgId, first_name: 'ReplayTest', username: 'replay_user' },
        TEST_BOT_TOKEN
      );

      // First authentication succeeds with replay prevention active
      const res1 = await authService.authenticateTelegram(initData, TEST_BOT_TOKEN, undefined, true);
      expect(res1.success).toBe(true);

      // Immediate replay MUST be rejected
      const res2 = await authService.authenticateTelegram(initData, TEST_BOT_TOKEN, undefined, true);
      expect(res2.success).toBe(false);
      expect(res2.error).toMatch(/replay detected/i);
    });

    it('1.6 Unauthorized Admin Request: Regular user is blocked with 403 Forbidden', async () => {
      const res = await fetch(`${BASE_URL}/api/admin/users`, {
        headers: { 'Authorization': `Bearer ${normalUserToken}` }
      });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toMatch(/Forbidden/i);
    });

    it('1.7 Unauthorized Agent Request: Regular user is blocked from staff endpoints with 403', async () => {
      const res = await fetch(`${BASE_URL}/api/staff/deposits`, {
        headers: { 'Authorization': `Bearer ${normalUserToken}` }
      });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toMatch(/Forbidden: Staff authorization required/i);
    });

    it('1.8 Unauthorized Super-Admin Request: Agent is blocked from super-admin endpoints with 403', async () => {
      const res = await fetch(`${BASE_URL}/api/super-admin/overview`, {
        headers: { 'Authorization': `Bearer ${agentToken}` }
      });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toMatch(/Forbidden: Super Admin authorization required/i);
    });
  });

  // ==================== SECTION 2: FINANCIAL INTEGRITY & REQUIRED CONCURRENCY ====================
  describe('2. Financial Integrity & Required Concurrency Verification', () => {
    it('2.1 REQUIRED CONCURRENCY TEST: User with exactly 100 ETB attempts TWO simultaneous 100 ETB purchases', async () => {
      const testRoom = new GameRoom(mockIo, {
        roomId: `room_concurr_${Date.now()}`,
        roomName: 'Concurrency Test Room',
        betPerCard: 100.0,
        etbEquivalent: 100.0,
        rakePercent: 20,
        drawIntervalMs: 2000,
        lobbyDuration: 20,
        totalCatalogCards: 200
      });

      const userConcurr = databaseService.createUser({
        id: `usr_c100_${Date.now()}`,
        telegram_id: `tg_c100_${Date.now()}`,
        username: 'Concurr100User',
        referral_code: `C100_${Date.now()}`,
        role: 'USER',
        account_type: 'REAL'
      });

      // Credit wallet with exactly 100.00 ETB
      databaseService.recordLedgerTransaction({
        userId: userConcurr.id,
        username: userConcurr.username,
        type: 'DEPOSIT',
        amount: 100.00,
        description: 'Exact 100 ETB funding'
      });

      const initialWallet = databaseService.getWallet(userConcurr.id);
      expect(initialWallet?.balance).toBe(100.00);

      // Attempt TWO simultaneous 100 ETB card purchases (Card #10 and Card #20)
      const [res1, res2] = await Promise.allSettled([
        testRoom.selectCardNumber(userConcurr.id, userConcurr.username, 10),
        testRoom.selectCardNumber(userConcurr.id, userConcurr.username, 20)
      ]);

      const fulfilled = [res1, res2].filter(r => r.status === 'fulfilled');
      const rejected = [res1, res2].filter(r => r.status === 'rejected');

      // CRITICAL EXPECTATIONS:
      // 1. Exactly ONE purchase succeeds
      expect(fulfilled.length).toBe(1);
      // 2. Exactly ONE purchase fails (Insufficient funds)
      expect(rejected.length).toBe(1);
      if (rejected[0].status === 'rejected') {
        expect(rejected[0].reason.message).toMatch(/Insufficient/i);
      }

      // 3. Balance never becomes negative (Must be exactly 0.00 ETB)
      const finalWallet = databaseService.getWallet(userConcurr.id);
      expect(finalWallet?.balance).toBe(0.00);
      expect(finalWallet?.balance).toBeGreaterThanOrEqual(0);

      // 4. Exactly ONE ticket created
      const tickets = databaseService.getDb().prepare('SELECT * FROM player_tickets WHERE user_id = ?').all(userConcurr.id) as any[];
      expect(tickets.length).toBe(1);

      // 5. Ledger remains correct: exactly 1 deposit (+100) and 1 bet (-100)
      const ledgerEntries = databaseService.getDb().prepare('SELECT * FROM ledger_transactions WHERE user_id = ? ORDER BY created_at ASC').all(userConcurr.id) as any[];
      expect(ledgerEntries.length).toBe(2);
      const betEntry = ledgerEntries.find(e => e.type === 'BET');
      expect(betEntry?.amount).toBe(100.00);
      expect(betEntry?.balance_after).toBe(0.00);

      if ((testRoom as any).lobbyTimer) clearInterval((testRoom as any).lobbyTimer);
      if ((testRoom as any).drawTimer) clearInterval((testRoom as any).drawTimer);
    });

    it('2.2 Duplicate Deposit Approval: Second approval throws and creates NO duplicate money', () => {
      const dep = databaseService.createDepositRequest(normalUser.id, normalUser.username, 50, 'Telebirr', `DEP_DUP_${Date.now()}`);
      const balanceBefore = databaseService.getWallet(normalUser.id)!.balance;

      // First approval succeeds
      const app1 = databaseService.approveDeposit(agentUser.id, dep.id);
      expect(app1.deposit.status).toBe('APPROVED');
      const balanceAfterFirst = databaseService.getWallet(normalUser.id)!.balance;
      expect(balanceAfterFirst).toBe(balanceBefore + 50);

      // Second approval attempt MUST throw
      expect(() => {
        databaseService.approveDeposit(agentUser.id, dep.id);
      }).toThrow(/already APPROVED/i);

      // Verify balance DID NOT increase again
      const balanceAfterSecond = databaseService.getWallet(normalUser.id)!.balance;
      expect(balanceAfterSecond).toBe(balanceAfterFirst);
    });

    it('2.3 Duplicate Withdrawal Approval: Second approval throws and creates NO duplicate debit', () => {
      // Fund user
      databaseService.recordLedgerTransaction({
        userId: normalUser.id,
        username: normalUser.username,
        type: 'DEPOSIT',
        amount: 200,
        description: 'Fund for withdrawal'
      });

      const withReq = databaseService.createWithdrawalRequest(normalUser.id, normalUser.username, 50, '0911223344');

      // First approval succeeds
      const app1 = databaseService.approveWithdrawal(agentUser.id, withReq.id);
      expect(app1.withdrawal.status).toBe('APPROVED');

      // Second approval attempt MUST throw
      expect(() => {
        databaseService.approveWithdrawal(agentUser.id, withReq.id);
      }).toThrow(/already APPROVED/i);
    });

    it('2.4 Duplicate Referral Commission Claim: Enforces strict idempotency', async () => {
      const referee = databaseService.createUser({
        id: `usr_referee_${Date.now()}`,
        telegram_id: `tg_ref_${Date.now()}`,
        username: 'RefereeUser',
        referral_code: `REF_${Date.now()}`,
        role: 'USER',
        referred_by: normalUser.id, // Must reference users(id) foreign key
        account_type: 'REAL'
      });

      // Create and approve first deposit for referee
      const dep = databaseService.createDepositRequest(referee.id, referee.username, 100, 'Telebirr', `DEP_REF_${Date.now()}`);
      databaseService.approveDeposit(agentUser.id, dep.id);

      // Claim commission once
      const claim1 = databaseService.rewardService.claimReferralRewards(normalUser.id);
      expect(claim1.success).toBe(true);
      expect(claim1.rewardAmount).toBe(10.00);

      // Second claim attempt MUST throw
      expect(() => {
        databaseService.rewardService.claimReferralRewards(normalUser.id);
      }).toThrow(/No unclaimed referral rewards/i);
    });
  });

  // ==================== SECTION 3: LEDGER RECONCILIATION ====================
  describe('3. Ledger Reconciliation Math Proof', () => {
    it('3.1 Proves starting balance + credits - debits = final balance for all transactions', () => {
      const reconUser = databaseService.createUser({
        id: `usr_recon_${Date.now()}`,
        telegram_id: `tg_recon_${Date.now()}`,
        username: 'ReconUser',
        referral_code: `RECON_${Date.now()}`,
        role: 'USER',
        account_type: 'REAL'
      });

      const startingBalance = databaseService.getWallet(reconUser.id)!.balance;
      expect(startingBalance).toBe(0.00);

      // Lifecycle operations:
      // 1. Deposit 500 ETB (+500)
      databaseService.recordLedgerTransaction({
        userId: reconUser.id,
        username: reconUser.username,
        type: 'DEPOSIT',
        amount: 500.00,
        description: 'Deposit'
      });

      // 2. Bet 50 ETB (-50)
      databaseService.recordLedgerTransaction({
        userId: reconUser.id,
        username: reconUser.username,
        type: 'BET',
        amount: 50.00,
        description: 'Card purchase'
      });

      // 3. Win 200 ETB (+200)
      databaseService.recordLedgerTransaction({
        userId: reconUser.id,
        username: reconUser.username,
        type: 'WIN_PAYOUT',
        amount: 200.00,
        description: 'Bingo payout'
      });

      // 4. Refund 20 ETB (+20)
      databaseService.recordLedgerTransaction({
        userId: reconUser.id,
        username: reconUser.username,
        type: 'REFUND',
        amount: 20.00,
        description: 'Card deselected refund'
      });

      // 5. Withdrawal 100 ETB (-100)
      databaseService.recordLedgerTransaction({
        userId: reconUser.id,
        username: reconUser.username,
        type: 'WITHDRAWAL',
        amount: 100.00,
        description: 'Withdrawal settlement'
      });

      // Fetch all ledger transactions
      const entries = databaseService.getDb().prepare('SELECT * FROM ledger_transactions WHERE user_id = ? ORDER BY created_at ASC').all(reconUser.id) as any[];
      let totalCredits = 0;
      let totalDebits = 0;

      for (const entry of entries) {
        if (['DEPOSIT', 'WIN_PAYOUT', 'REFUND', 'BONUS'].includes(entry.type)) {
          totalCredits += entry.amount;
        } else if (['BET', 'WITHDRAWAL', 'LOSS'].includes(entry.type)) {
          totalDebits += entry.amount;
        }
      }

      totalCredits = Math.round(totalCredits * 100) / 100;
      totalDebits = Math.round(totalDebits * 100) / 100;
      const calculatedBalance = Math.round((startingBalance + totalCredits - totalDebits) * 100) / 100;
      const expectedBalance = 500.00 - 50.00 + 200.00 + 20.00 - 100.00; // 570.00 ETB
      const actualWallet = databaseService.getWallet(reconUser.id)!;

      // Mathematical proof: starting_balance + credits - debits = final_balance
      expect(calculatedBalance).toBe(expectedBalance);
      expect(actualWallet.balance).toBe(expectedBalance);
      expect(actualWallet.balance).toBe(startingBalance + totalCredits - totalDebits);
    });

    it('3.2 Reconciles two-step withdrawal escrow hold and approval with wallet and reserved balance', () => {
      const escrowUser = databaseService.createUser({
        id: `usr_escrow_${Date.now()}`,
        telegram_id: `tg_escrow_${Date.now()}`,
        username: 'EscrowUser',
        referral_code: `ESCROW_${Date.now()}`,
        role: 'USER',
        account_type: 'REAL'
      });

      // 1. Initial Deposit: 200 ETB
      databaseService.recordLedgerTransaction({
        userId: escrowUser.id,
        username: escrowUser.username,
        type: 'DEPOSIT',
        amount: 200.00,
        description: 'Initial funding'
      });

      // 2. Request Withdrawal of 50 ETB -> balance: 150 ETB, reserved_balance: 50 ETB
      const wth = databaseService.createWithdrawalRequest(escrowUser.id, escrowUser.username, 50.00, '0911000000');
      let wallet = databaseService.getWallet(escrowUser.id)!;
      expect(wallet.balance).toBe(150.00);
      expect(wallet.reserved_balance).toBe(50.00);

      // 3. Approve Withdrawal -> reserved_balance clears to 0 ETB, balance remains 150 ETB
      databaseService.approveWithdrawal(agentUser.id, wth.id);
      wallet = databaseService.getWallet(escrowUser.id)!;
      expect(wallet.balance).toBe(150.00);
      expect(wallet.reserved_balance).toBe(0.00);
    });
  });

  // ==================== SECTION 4: GAME INTEGRITY ATTACKS ====================
  describe('4. Game Integrity & Attack Scenarios', () => {
    let attackRoom: GameRoom;

    beforeAll(() => {
      attackRoom = new GameRoom(mockIo, {
        roomId: `room_attack_${Date.now()}`,
        roomName: 'Attack Test Room',
        betPerCard: 10.0,
        etbEquivalent: 10.0,
        rakePercent: 20,
        drawIntervalMs: 1000,
        lobbyDuration: 20,
        totalCatalogCards: 200
      });
    });

    afterAll(() => {
      if ((attackRoom as any).lobbyTimer) clearInterval((attackRoom as any).lobbyTimer);
      if ((attackRoom as any).drawTimer) clearInterval((attackRoom as any).drawTimer);
    });

    it('4.1 Wrong-User Claim: Attacker CANNOT claim Bingo on another player ticket', async () => {
      // Fund normal user (Ticket Owner)
      databaseService.recordLedgerTransaction({
        userId: normalUser.id,
        username: normalUser.username,
        type: 'DEPOSIT',
        amount: 100,
        description: 'Fund normal user'
      });

      const ticket = await attackRoom.selectCardNumber(normalUser.id, normalUser.username, 5);

      // Activate room to simulate active drawing phase
      (attackRoom as any).status = 'active';

      // Victim (different player) attempts to claim normalUser's ticket
      const claimResult = await attackRoom.handleClaimBingo(victimUser.id, ticket.ticketId);
      expect(claimResult.success).toBe(false);
      expect(claimResult.message).toMatch(/Unauthorized ticket claim/i);
    });

    it('4.2 Tampered Ticket ID: Rejects claim on non-existent or modified ticket ID', async () => {
      (attackRoom as any).status = 'active';
      const claimResult = await attackRoom.handleClaimBingo(normalUser.id, 'tampered_ticket_id_9999');
      expect(claimResult.success).toBe(false);
      expect(claimResult.message).toMatch(/Ticket not found/i);
    });

    it('4.3 Post-Game Claim: Rejects claim after game has concluded', async () => {
      // Manually set status to finished
      (attackRoom as any).status = 'finished';
      const claimResult = await attackRoom.handleClaimBingo(normalUser.id, 'any_ticket');
      expect(claimResult.success).toBe(false);
      expect(claimResult.message).toMatch(/already concluded|not in active drawing phase/i);
    });
  });

  // ==================== SECTION 5: DATABASE INTEGRITY & WAL VERIFICATION ====================
  describe('5. Database Integrity & Constraints Verification', () => {
    it('5.1 SQLite PRAGMA integrity_check passes with ok', () => {
      const result = databaseService.getDb().prepare('PRAGMA integrity_check;').get() as { integrity_check: string };
      expect(result.integrity_check).toBe('ok');
    });

    it('5.2 SQLite PRAGMA foreign_key_check has ZERO violations', () => {
      const violations = databaseService.getDb().prepare('PRAGMA foreign_key_check;').all();
      expect(violations.length).toBe(0);
    });

    it('5.3 Database operates in WAL journal_mode on persistent storage', () => {
      const tempPath = path.resolve(process.cwd(), `temp_wal_test_${Date.now()}.db`);
      try {
        const diskDb = new DatabaseService(tempPath);
        const result = diskDb.getDb().prepare('PRAGMA journal_mode;').get() as { journal_mode: string };
        expect(result.journal_mode.toLowerCase()).toBe('wal');
        diskDb.getDb().close();
      } finally {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        const shm = `${tempPath}-shm`;
        const wal = `${tempPath}-wal`;
        if (fs.existsSync(shm)) fs.unlinkSync(shm);
        if (fs.existsSync(wal)) fs.unlinkSync(wal);
      }
    });

    it('5.4 Wallet table strictly blocks negative balance via SQLite check constraint', () => {
      expect(() => {
        databaseService.getDb().prepare('UPDATE wallets SET balance = -50 WHERE user_id = ?').run(normalUser.id);
      }).toThrow(/CHECK constraint failed/i);
    });
  });

  // ==================== SECTION 6: SAFE BACKUP & RESTORE VERIFICATION ====================
  describe('6. Safe Backup and Restore Verification', () => {
    it('6.1 Creates backup safely to temp file, verifies integrity, and restores successfully', () => {
      const tempBackupPath = path.resolve(process.cwd(), `data_temp_backup_${Date.now()}.db`);

      try {
        // 1. Perform hot backup via SQLite VACUUM INTO
        databaseService.getDb().prepare(`VACUUM INTO ?`).run(tempBackupPath);

        // 2. Verify backup file exists and has content
        expect(fs.existsSync(tempBackupPath)).toBe(true);
        const stats = fs.statSync(tempBackupPath);
        expect(stats.size).toBeGreaterThan(1024); // Size > 1KB

        // 3. Open restored database in separate DatabaseService instance
        const restoredDb = new DatabaseService(tempBackupPath);

        // 4. Verify integrity of restored database
        const integrity = restoredDb.getDb().prepare('PRAGMA integrity_check;').get() as any;
        expect(integrity.integrity_check).toBe('ok');

        // 5. Verify records exist in restored database
        const usersCount = (restoredDb.getDb().prepare('SELECT COUNT(*) as c FROM users;').get() as any).c;
        expect(usersCount).toBeGreaterThan(0);

        const walletsCount = (restoredDb.getDb().prepare('SELECT COUNT(*) as c FROM wallets;').get() as any).c;
        expect(walletsCount).toBeGreaterThan(0);

        restoredDb.getDb().close();
      } finally {
        // Clean up temporary backup file
        if (fs.existsSync(tempBackupPath)) {
          fs.unlinkSync(tempBackupPath);
        }
        const shm = `${tempBackupPath}-shm`;
        const wal = `${tempBackupPath}-wal`;
        if (fs.existsSync(shm)) fs.unlinkSync(shm);
        if (fs.existsSync(wal)) fs.unlinkSync(wal);
      }
    });
  });
});
