import { describe, it, expect, beforeEach } from 'vitest';
import { DatabaseService } from './DatabaseService.js';
import { LedgerService } from './LedgerService.js';
import { GameRoom } from './GameRoomManager.js';

describe('Phase 2: Financial Integrity, Wallet, Ledger & Settlement Remediation', () => {
  let dbService: DatabaseService;
  let ledgerService: LedgerService;

  beforeEach(() => {
    // Isolated in-memory database for each test run
    dbService = new DatabaseService(':memory:');
    ledgerService = new LedgerService();
    // Swap internal database instance for test isolation
    (ledgerService as any).getUser = (playerId: string) => {
      const userRow = dbService.getUserById(playerId);
      if (!userRow) return undefined;
      const wallet = dbService.getOrCreateWallet(playerId);
      return {
        id: userRow.id,
        playerId: userRow.id,
        username: userRow.username,
        walletBalance: wallet.balance,
        reservedBalance: wallet.reserved_balance,
        bonusBalance: wallet.bonus_balance || 0,
        totalPlayableBalance: Number(((wallet.balance || 0) + (wallet.bonus_balance || 0)).toFixed(2)),
        role: userRow.role,
        account_status: userRow.account_status
      };
    };
  });

  describe('1. SQLite busy_timeout & Pragma Configuration', () => {
    it('sets PRAGMA busy_timeout to 5000ms', () => {
      const result = dbService.getDb().prepare('PRAGMA busy_timeout;').get() as { timeout: number };
      expect(result.timeout).toBe(5000);
    });
  });

  describe('2. Withdrawal Concurrency & Overdraft Prevention', () => {
    it('strictly prevents balance overdraft under concurrent withdrawal attempts', async () => {
      const userId = 'usr_wth_concurr_01';
      dbService.createUser({
        id: userId,
        telegram_id: 'tg_wth_01',
        username: 'ConcurrWithdrawUser',
        referral_code: 'REF_WTH_01',
        role: 'USER',
        account_type: 'REAL',
        is_bot: false
      });

      // Credit wallet with 100 ETB
      dbService.recordLedgerTransaction({
        userId,
        username: 'ConcurrWithdrawUser',
        type: 'DEPOSIT',
        amount: 100.00,
        description: 'Initial funding for test'
      });

      const initialWallet = dbService.getWallet(userId)!;
      expect(initialWallet.balance).toBe(100.00);
      expect(initialWallet.reserved_balance).toBe(0.00);

      // Attempt 5 concurrent withdrawal requests of 60 ETB each (Total 300 ETB requested vs 100 ETB balance)
      const withdrawalAttempts = Array.from({ length: 5 }, (_, i) => {
        return Promise.resolve().then(() => {
          try {
            return {
              success: true,
              res: dbService.createWithdrawalRequest(userId, 'ConcurrWithdrawUser', 60.00, `091122334${i}`)
            };
          } catch (err: any) {
            return {
              success: false,
              error: err.message
            };
          }
        });
      });

      const results = await Promise.all(withdrawalAttempts);
      const successful = results.filter(r => r.success);
      const failed = results.filter(r => !r.success);

      // Exactly ONE request should have succeeded, four should have failed with Insufficient funds
      expect(successful.length).toBe(1);
      expect(failed.length).toBe(4);
      failed.forEach(f => {
        expect(f.error).toMatch(/Insufficient funds/i);
      });

      // Wallet balance must be exactly 40.00, reserved must be exactly 60.00
      const finalWallet = dbService.getWallet(userId)!;
      expect(finalWallet.balance).toBe(40.00);
      expect(finalWallet.reserved_balance).toBe(60.00);
    });
  });

  describe('3. Idempotent Approvals (Preventing Double-Credit & Double-Debit)', () => {
    it('prevents double-crediting when a deposit request is approved multiple times', () => {
      const userId = 'usr_dep_idemp_01';
      dbService.createUser({
        id: userId,
        telegram_id: 'tg_dep_01',
        username: 'DepositIdempUser',
        referral_code: 'REF_DEP_01',
        role: 'USER',
        account_type: 'REAL',
        is_bot: false
      });

      const depReq = dbService.createDepositRequest(userId, 'DepositIdempUser', 200.00, 'Telebirr', 'TB_REF_001');

      // First approval succeeds
      const firstApproval = dbService.approveDeposit('admin_01', depReq.id);
      expect(firstApproval.deposit.status).toBe('APPROVED');
      expect(firstApproval.wallet.balance).toBe(200.00);

      // Second approval attempt MUST throw error and not double credit
      expect(() => {
        dbService.approveDeposit('admin_01', depReq.id);
      }).toThrow(/already APPROVED|no longer in PENDING/i);

      // Third approval attempt with different admin MUST also throw
      expect(() => {
        dbService.approveDeposit('admin_02', depReq.id);
      }).toThrow(/already APPROVED|no longer in PENDING/i);

      // Wallet balance remains strictly 200.00
      const wallet = dbService.getWallet(userId)!;
      expect(wallet.balance).toBe(200.00);
    });

    it('prevents double-debiting when a withdrawal request is approved multiple times', () => {
      const userId = 'usr_wth_idemp_01';
      dbService.createUser({
        id: userId,
        telegram_id: 'tg_wth_idem_01',
        username: 'WithdrawalIdempUser',
        referral_code: 'REF_WTH_IDEM_01',
        role: 'USER',
        account_type: 'REAL',
        is_bot: false
      });

      // Fund user with 300 ETB
      dbService.recordLedgerTransaction({
        userId,
        username: 'WithdrawalIdempUser',
        type: 'DEPOSIT',
        amount: 300.00,
        description: 'Funding'
      });

      // Create withdrawal of 100 ETB (balance becomes 200, reserved becomes 100)
      const wthReq = dbService.createWithdrawalRequest(userId, 'WithdrawalIdempUser', 100.00, '0911000001');
      expect(dbService.getWallet(userId)!.balance).toBe(200.00);
      expect(dbService.getWallet(userId)!.reserved_balance).toBe(100.00);

      // First approval succeeds (reserved becomes 0, balance stays 200)
      const firstApproval = dbService.approveWithdrawal('admin_01', wthReq.id);
      expect(firstApproval.withdrawal.status).toBe('APPROVED');
      expect(dbService.getWallet(userId)!.reserved_balance).toBe(0.00);
      expect(dbService.getWallet(userId)!.balance).toBe(200.00);

      // Second approval attempt MUST fail
      expect(() => {
        dbService.approveWithdrawal('admin_01', wthReq.id);
      }).toThrow(/already APPROVED|no longer in PENDING/i);

      // Balance remains intact
      expect(dbService.getWallet(userId)!.reserved_balance).toBe(0.00);
      expect(dbService.getWallet(userId)!.balance).toBe(200.00);
    });

    it('restores reserved balance safely on rejection without double-refunding', () => {
      const userId = 'usr_wth_reject_01';
      dbService.createUser({
        id: userId,
        telegram_id: 'tg_wth_rej_01',
        username: 'WithdrawalRejUser',
        referral_code: 'REF_WTH_REJ_01',
        role: 'USER',
        account_type: 'REAL',
        is_bot: false
      });

      dbService.recordLedgerTransaction({
        userId,
        username: 'WithdrawalRejUser',
        type: 'DEPOSIT',
        amount: 150.00,
        description: 'Funding'
      });

      const wthReq = dbService.createWithdrawalRequest(userId, 'WithdrawalRejUser', 50.00, '0911000002');
      expect(dbService.getWallet(userId)!.balance).toBe(100.00);
      expect(dbService.getWallet(userId)!.reserved_balance).toBe(50.00);

      // First rejection restores funds to balance
      const rejected = dbService.rejectWithdrawal('admin_01', wthReq.id, 'Wrong account name');
      expect(rejected.status).toBe('REJECTED');
      expect(dbService.getWallet(userId)!.balance).toBe(150.00);
      expect(dbService.getWallet(userId)!.reserved_balance).toBe(0.00);

      // Second rejection attempt MUST fail
      expect(() => {
        dbService.rejectWithdrawal('admin_01', wthReq.id, 'Duplicate reject');
      }).toThrow(/already REJECTED|no longer in PENDING/i);

      // Balance must not be refunded twice!
      expect(dbService.getWallet(userId)!.balance).toBe(150.00);
    });
  });

  describe('4. Telebirr Reference Uniqueness & Duplicate Protection', () => {
    it('prevents reuse of Telebirr transaction reference in deposit requests', () => {
      const userId = 'usr_ref_dup_01';
      dbService.createUser({
        id: userId,
        telegram_id: 'tg_ref_dup_01',
        username: 'TelebirrRefUser',
        referral_code: 'REF_TB_01',
        role: 'USER',
        account_type: 'REAL',
        is_bot: false
      });

      const ref = 'TB987654321';
      dbService.createDepositRequest(userId, 'TelebirrRefUser', 50.00, 'Telebirr', ref);

      // Attempting to submit another deposit with the same reference (case insensitive) must be rejected
      expect(() => {
        dbService.createDepositRequest(userId, 'TelebirrRefUser', 100.00, 'Telebirr', ref.toLowerCase());
      }).toThrow(/already been submitted or credited/i);

      // Different user submitting the same reference must also be rejected
      const userId2 = 'usr_ref_dup_02';
      dbService.createUser({
        id: userId2,
        telegram_id: 'tg_ref_dup_02',
        username: 'TelebirrRefUser2',
        referral_code: 'REF_TB_02',
        role: 'USER',
        account_type: 'REAL',
        is_bot: false
      });

      expect(() => {
        dbService.createDepositRequest(userId2, 'TelebirrRefUser2', 50.00, 'Telebirr', ref);
      }).toThrow(/already been submitted or credited/i);
    });
  });

  describe('5. Input Validation: Negative, Non-Finite, and Zero Amounts', () => {
    const userId = 'usr_amt_val_01';

    beforeEach(() => {
      dbService.createUser({
        id: userId,
        telegram_id: 'tg_amt_val_01',
        username: 'AmtValUser',
        referral_code: 'REF_AMT_01',
        role: 'USER',
        account_type: 'REAL',
        is_bot: false
      });
    });

    it('rejects invalid amounts in createDepositRequest', () => {
      expect(() => dbService.createDepositRequest(userId, 'AmtValUser', -50, 'Telebirr')).toThrow(/greater than zero/i);
      expect(() => dbService.createDepositRequest(userId, 'AmtValUser', 0, 'Telebirr')).toThrow(/greater than zero/i);
      expect(() => dbService.createDepositRequest(userId, 'AmtValUser', NaN, 'Telebirr')).toThrow(/finite number/i);
      expect(() => dbService.createDepositRequest(userId, 'AmtValUser', Infinity, 'Telebirr')).toThrow(/finite number/i);
    });

    it('rejects invalid amounts in createWithdrawalRequest', () => {
      expect(() => dbService.createWithdrawalRequest(userId, 'AmtValUser', -10, '0911000003')).toThrow(/greater than zero/i);
      expect(() => dbService.createWithdrawalRequest(userId, 'AmtValUser', 0, '0911000003')).toThrow(/greater than zero/i);
      expect(() => dbService.createWithdrawalRequest(userId, 'AmtValUser', NaN, '0911000003')).toThrow(/finite number/i);
      expect(() => dbService.createWithdrawalRequest(userId, 'AmtValUser', Infinity, '0911000003')).toThrow(/finite number/i);
    });

    it('rejects invalid amounts in recordLedgerTransaction', () => {
      expect(() => {
        dbService.recordLedgerTransaction({
          userId,
          username: 'AmtValUser',
          type: 'DEPOSIT',
          amount: -100,
          description: 'Negative deposit attempt'
        });
      }).toThrow(/greater than zero/i);

      expect(() => {
        dbService.recordLedgerTransaction({
          userId,
          username: 'AmtValUser',
          type: 'DEPOSIT',
          amount: NaN,
          description: 'NaN deposit attempt'
        });
      }).toThrow(/finite number/i);

      expect(() => {
        dbService.recordLedgerTransaction({
          userId,
          username: 'AmtValUser',
          type: 'ADMIN_ADJUSTMENT',
          amount: 0,
          description: 'Zero adjustment attempt'
        });
      }).toThrow(/cannot be zero/i);
    });
  });

  describe('6. Abandoned / Crashed Game Recovery without Cash Leak', () => {
    it('restores bonus to bonus_balance and cash to cash_balance when recovering interrupted games', async () => {
      const userId = 'usr_refund_split_01';
      dbService.createUser({
        id: userId,
        telegram_id: 'tg_refund_split_01',
        username: 'SplitRefundUser',
        referral_code: 'REF_SPLIT_01',
        role: 'USER',
        account_type: 'REAL',
        is_bot: false
      });

      // Initial funding: 10 ETB cash, 5 ETB bonus
      dbService.updateWalletBalance(userId, 10.00, 0.00, 5.00);

      // Create qualifying deposit request first to satisfy FK constraint
      const dep = dbService.createDepositRequest(userId, 'SplitRefundUser', 50.00, 'Telebirr', 'TB_SPLIT_01');

      // Create dummy active promotional reward
      const rewId = 'rew_split_test_01';
      const nowIso = new Date().toISOString();
      const expiresAt = new Date(Date.now() + 86400000).toISOString();
      dbService.getDb().prepare(`
        INSERT INTO promotional_rewards (
          id, user_id, reward_type, source, qualifying_deposit_id,
          deposit_amount, bonus_percentage, bonus_amount, remaining_amount,
          status, issued_at, expires_at, created_at, updated_at
        ) VALUES (?, ?, 'FIRST_DEPOSIT_BONUS', 'TELEBIRR_DEPOSIT', ?, 50, 10, 5.0, 5.0, 'AWARDED', ?, ?, ?, ?)
      `).run(rewId, userId, dep.id, nowIso, expiresAt, nowIso, nowIso);

      // Simulate buying a 10 ETB card using 5 ETB bonus + 5 ETB cash
      const gameId = 'game_crashed_test_99';
      dbService.createGame({
        id: gameId,
        roomId: 'room_10',
        betPerCard: 10.00,
        serverSecret: 'sec_test_crashed',
        commitmentHash: 'comm_test_crashed'
      });
      dbService.updateGameStatus(gameId, 'active');

      // Deduct from wallet: 5 cash, 5 bonus
      dbService.updateWalletBalance(userId, 5.00, 0.00, 0.00);

      // Record ticket purchase with [Paid: 5.00 Bonus + 5.00 Cash]
      const ticketId = 'tkt_crashed_01';
      dbService.getDb().prepare(`
        INSERT INTO player_tickets (id, game_id, card_number, user_id, username, grid_json, fingerprint_hash, is_bot, purchased_at)
        VALUES (?, ?, 1, ?, 'SplitRefundUser', '[]', 'fp_01', 0, ?)
      `).run(ticketId, gameId, userId, nowIso);

      dbService.getDb().prepare(`
        INSERT INTO ledger_transactions (
          id, user_id, username, type, amount, balance_before, balance_after,
          game_id, ticket_id, reference_id, description, created_at
        ) VALUES ('tx_bet_01', ?, 'SplitRefundUser', 'BET', 10.00, 10.00, 5.00, ?, ?, 'ref_bet_01', ?, ?)
      `).run(userId, gameId, ticketId, 'Purchase Bingo Card #1 [Paid: 5.00 Bonus + 5.00 Cash]', nowIso);

      // Verify wallet state before crash recovery: cash=5, bonus=0
      let walletBefore = dbService.getWallet(userId)!;
      expect(walletBefore.balance).toBe(5.00);
      expect(walletBefore.bonus_balance).toBe(0.00);

      // Instantiate a GameRoom which automatically invokes recoverOrRefundAbandonedGames() upon startup
      const mockIo = { to: () => ({ emit: () => {} }), emit: () => {} } as any;
      const gameRoom = new GameRoom(mockIo, {
        roomId: 'room_10',
        roomName: 'Test Room 10',
        betPerCard: 10,
        etbEquivalent: 10,
        rakePercent: 20,
        lobbyDuration: 15,
        drawIntervalMs: 3000,
        totalCatalogCards: 200
      }, dbService);

      // Verify that calling recoverOrRefundAbandonedGames again returns 0 (strictly idempotent, no double refund)
      const subsequentRefundCount = gameRoom.recoverOrRefundAbandonedGames();
      expect(subsequentRefundCount).toBe(0);

      // Verify wallet state after crash recovery:
      // CASH balance must be 10.00 (NOT 15.00! No bonus converted to withdrawable cash)
      // BONUS balance must be 5.00 (Restored as bonus)
      const walletAfter = dbService.getWallet(userId)!;
      expect(walletAfter.balance).toBe(10.00);
      expect(walletAfter.bonus_balance).toBe(5.00);

      // Verify game status marked as finished
      const gameRow = dbService.getDb().prepare('SELECT status FROM games WHERE id = ?').get(gameId) as any;
      expect(gameRow.status).toBe('finished');
    });
  });
});
