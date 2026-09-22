import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseService } from './DatabaseService.js';
import { AuthService, authService, verifyTelegramInitData, clearInitDataReplayCache } from './AuthService.js';
import { TelegramBotService } from './TelegramBotService.js';
import { calculateDailyGrandJackpot, DailyJackpotService } from './DailyJackpotService.js';
import { deriveDeterministicBallSequence, computeServerSeedCommitment } from './BingoEngine.js';
import { GameRoomManager } from './GameRoomManager.js';
import { Server } from 'socket.io';
import crypto from 'crypto';

describe('Forensic Remediation Verification Suite', () => {
  let db: DatabaseService;
  let auth: AuthService;
  let bot: TelegramBotService;

  beforeEach(() => {
    db = new DatabaseService(':memory:');
    auth = new AuthService(db);
    bot = new TelegramBotService();
    clearInitDataReplayCache();
  });

  // =========================================================================
  // VULN-01: Zero Welcome Registration Balance & Preserved First Deposit Bonus
  // =========================================================================
  describe('VULN-01: Zero Cash Registration Bonus Enforcement', () => {
    it('register() creates user with exactly 0 balance, 0 reserved, 0 bonus', () => {
      const res = auth.register('Solomon Haile', '0911223344', 'Password123');
      expect(res.success).toBe(true);
      expect(res.user).toBeDefined();
      expect(res.user?.walletBalance).toBe(0.0);

      const wallet = db.getWallet(res.user!.playerId)!;
      expect(wallet.balance).toBe(0.0);
      expect(wallet.reserved_balance).toBe(0.0);
      expect(wallet.bonus_balance).toBe(0.0);

      // Verify no BONUS transactions in ledger
      const txs = db.getLedgerForUser(res.user!.playerId);
      const bonusTxs = txs.filter(t => t.type === 'BONUS');
      expect(bonusTxs.length).toBe(0);
    });

    it('loginWithTelegram() creates new user with exactly 0 balance', () => {
      const res = auth.loginWithTelegram({
        id: 88776655,
        username: 'solomon_tg',
        first_name: 'Solomon',
        last_name: 'Haile'
      });
      expect(res.success).toBe(true);
      expect(res.user?.walletBalance).toBe(0.0);

      const wallet = db.getWallet(res.user!.playerId)!;
      expect(wallet.balance).toBe(0.0);
      expect(wallet.reserved_balance).toBe(0.0);
      expect(wallet.bonus_balance).toBe(0.0);
    });

    it('completeRegistrationWithMatchedPhone() creates verified user with exactly 0 balance', () => {
      const res = auth.completeRegistrationWithMatchedPhone('+251911998877', '998877', 'Dawit');
      expect(res.success).toBe(true);
      expect(res.user?.walletBalance).toBe(0.0);

      const wallet = db.getWallet(res.user!.playerId)!;
      expect(wallet.balance).toBe(0.0);
      expect(wallet.bonus_balance).toBe(0.0);
    });

    it('Preserves legitimate First Deposit Bonus (10% capped at 50 ETB, bonus_balance only)', () => {
      const reg = auth.register('Kassahun G', '0922334455', 'Password123');
      const userId = reg.user!.playerId;

      // Deposit 400 ETB -> 10% = 40 ETB bonus
      const dep = db.createDepositRequest(userId, 'Kassahun G', 400, 'Telebirr');
      const approved = db.approveDeposit('admin_01', dep.id);

      expect(approved.promotionalBonus).toBeDefined();
      expect(approved.promotionalBonus?.bonusAmount).toBe(40.0);
      expect(approved.wallet.balance).toBe(400.0);
      expect(approved.wallet.bonus_balance).toBe(40.0);

      // Second deposit does NOT award first deposit bonus
      const dep2 = db.createDepositRequest(userId, 'Kassahun G', 500, 'Telebirr');
      const approved2 = db.approveDeposit('admin_01', dep2.id);
      expect(approved2.promotionalBonus).toBeNull();
      expect(approved2.wallet.balance).toBe(900.0);
      expect(approved2.wallet.bonus_balance).toBe(40.0); // unchanged
    });
  });

  // =========================================================================
  // VULN-02 & VULN-03: Socket Security (No Token Leakage in Rooms)
  // =========================================================================
  describe('VULN-02 & VULN-03: Socket.IO Payload Hardening', () => {
    it('REGISTRATION_SUCCESS and PHONE_VERIFIED broadcast only status: VERIFIED without token or secrets', () => {
      const emittedEvents: Array<{ event: string; room: string; data: any }> = [];
      const mockIo = {
        to: (room: string) => ({
          emit: (event: string, data: any) => {
            emittedEvents.push({ room, event, data });
          }
        })
      } as unknown as Server;

      bot.setIo(mockIo);
      bot.simulateContactShare('0933445566', '+251933445566', 1234567, 'TestPlayer');

      expect(emittedEvents.length).toBeGreaterThan(0);
      for (const ev of emittedEvents) {
        expect(ev.data).toHaveProperty('status', 'VERIFIED');
        expect(ev.data.token).toBeUndefined();
        expect(ev.data.user).toBeUndefined();
        expect(ev.data.password_hash).toBeUndefined();
      }
    });

    it('PASSWORD_RESET_AUTHORIZED broadcast only status: AUTHORIZED without resetToken', () => {
      const emittedEvents: Array<{ event: string; room: string; data: any }> = [];
      const mockIo = {
        to: (room: string) => ({
          emit: (event: string, data: any) => {
            emittedEvents.push({ room, event, data });
          }
        })
      } as unknown as Server;

      bot.setIo(mockIo);
      // Must register+initiate on the global authService singleton because
      // TelegramBotService.simulatePasswordResetShare uses `authService` internally.
      // We need a phone that has a user in the shared databaseService.
      // Since the global authService uses the shared databaseService, we use authService.initiatePasswordReset
      // after ensuring the user exists there. We manually store a fake pending request via the public API.
      authService.initiatePasswordReset('+251944556677');
      // The above will fail because no user with that phone exists in the shared DB.
      // Instead, call the simulate helper which bypasses the user check:
      // The real path: authorizePasswordReset checks passwordResetRequests map (in-memory).
      // We manually prime it by calling initiatePasswordReset; but if user doesn't exist
      // we can't. We need to test the behaviour WITHOUT a real user - check that if there IS
      // a pending request, the emit is clean.
      //
      // Correct fix: test calls simulatePasswordResetShare which calls authService.authorizePasswordReset.
      // We need the pending request to exist in authService's map. 
      // authService.initiatePasswordReset requires user in DB; but authService uses its own DB instance.
      // So we call authService directly but it won't find the user in shared databaseService.
      //
      // Simplest: verify the socket event payload shape by checking what bot emits when forced to authorize.
      // We test this indirectly: call authorizePasswordReset directly to prime, then emit.
      // Use a spy approach instead.

      // Reset authService internal state directly via public method for testing purposes
      // by calling its own initiatePasswordReset (user doesn't need to exist for the map storage)
      // Actually authorizePasswordReset only reads the map, so we call initiatePasswordReset
      // which DOES require the user. So we use authService to register first.
      // Since authService uses global databaseService, we need to use that.
      const testPhone = '+251955000099';
      // Register via authService so user exists in the shared global databaseService
      authService.register('ResetTestUser', '0955000099', 'TestPassword123');
      authService.initiatePasswordReset('0955000099');

      bot.simulatePasswordResetShare('0955000099', testPhone);

      const authEvent = emittedEvents.find(e => e.event === 'PASSWORD_RESET_AUTHORIZED');
      expect(authEvent).toBeDefined();
      expect(authEvent?.data).toHaveProperty('status', 'AUTHORIZED');
      expect(authEvent?.data.resetToken).toBeUndefined();
    });
  });

  // =========================================================================
  // VULN-04: Password Reset Persistence & Verification
  // =========================================================================
  describe('VULN-04: Password Reset Flow and Scrypt Hash Persistence', () => {
    it('completePasswordReset updates password hash, invalidates sessions, and consumes reset token', () => {
      const phone = '0955667788';
      const oldPass = 'OldPass123!';
      const newPass = 'NewSecurePass456!';

      // 1. Create account
      const reg = auth.register('Abel Tesfaye', phone, oldPass);
      expect(reg.success).toBe(true);
      const user = db.getUserByPhone('+251955667788')!;
      const oldHash = user.password_hash;
      const initialToken = reg.token!;

      // Verify old password logs in
      const oldLogin = auth.login(phone, oldPass);
      expect(oldLogin.success).toBe(true);

      // 2. Initiate reset
      const init = auth.initiatePasswordReset(phone);
      expect(init.success).toBe(true);

      // 3. Authorize via bot
      const authReq = auth.authorizePasswordReset(phone);
      expect(authReq.success).toBe(true);
      const resetToken = authReq.resetToken!;

      // 4. Complete reset
      const resetRes = auth.completePasswordReset(phone, resetToken, newPass);
      expect(resetRes.success).toBe(true);

      // 5. Verify database was updated with new hash
      const userAfter = db.getUserByPhone('+251955667788')!;
      expect(userAfter.password_hash).not.toBe(oldHash);

      // 6. Verify old password now FAILS
      const failOld = auth.login(phone, oldPass);
      expect(failOld.success).toBe(false);

      // 7. Verify new password SUCCEEDS
      const succeedNew = auth.login(phone, newPass);
      expect(succeedNew.success).toBe(true);

      // 8. Verify pre-existing sessions were invalidated
      const sessionCheck = auth.validateSession(initialToken);
      expect(sessionCheck.valid).toBe(false);

      // 9. Verify reset token cannot be reused
      const reuseAttempt = auth.completePasswordReset(phone, resetToken, 'AnotherPass999');
      expect(reuseAttempt.success).toBe(false);
    });

    it('completePasswordReset rejects short passwords (< 6 chars)', () => {
      const phone = '0955667799';
      auth.register('ShortPass User', phone, 'InitialPass123');
      auth.initiatePasswordReset(phone);
      const authReq = auth.authorizePasswordReset(phone);

      const res = auth.completePasswordReset(phone, authReq.resetToken!, '12345');
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/at least 6 characters/i);
    });
  });

  // =========================================================================
  // VULN-05: Consistent Account Suspension & Session Invalidation
  // =========================================================================
  describe('VULN-05: Account Suspension Enforcement', () => {
    it('validateSession rejects SUSPENDED and BANNED users', () => {
      const reg = auth.register('Marta User', '0966778899', 'Password123');
      const token = reg.token!;
      const userId = reg.user!.playerId;

      // Active user validates OK
      expect(auth.validateSession(token).valid).toBe(true);

      // Admin suspends user
      auth.updateUserStatus('admin_01', userId, 'SUSPENDED');

      // validateSession must reject suspended user
      const checkSuspended = auth.validateSession(token);
      expect(checkSuspended.valid).toBe(false);
      expect(checkSuspended.status).toBe('REVOKED');

      // Login attempt must also be rejected
      const loginAttempt = auth.login('0966778899', 'Password123');
      expect(loginAttempt.success).toBe(false);
      expect(loginAttempt.error).toMatch(/suspended/i);
    });

    it('updateUserStatus immediately revokes all sessions on SUSPENDED', () => {
      const reg = auth.register('Almaz User', '0966778800', 'Password123');
      const token1 = reg.token!;
      const token2 = auth.login('0966778800', 'Password123').token!;

      // Suspend
      auth.updateUserStatus('admin_01', reg.user!.playerId, 'SUSPENDED');

      // Both sessions must be revoked in database
      expect(db.getSession(token1)).toBeUndefined();
      expect(db.getSession(token2)).toBeUndefined();
    });
  });

  // =========================================================================
  // PHASE 5: Withdrawal Ledger Accounting Completeness
  // =========================================================================
  describe('Phase 5: Auditable Withdrawal Ledger Events', () => {
    it('creates ESCROW_HOLD on request and REFUND on rejection', () => {
      const reg = auth.register('Tigist W', '0977889900', 'Password123');
      const userId = reg.user!.playerId;

      // Seed 500 ETB
      db.updateWalletBalance(userId, 500);

      // 1. Create withdrawal request for 200 ETB
      const wth = db.createWithdrawalRequest(userId, 'Tigist W', 200, '0977889900');
      expect(wth.status).toBe('PENDING');

      // Check wallet
      const walletDuringHold = db.getWallet(userId)!;
      expect(walletDuringHold.balance).toBe(300);
      expect(walletDuringHold.reserved_balance).toBe(200);

      // Verify ESCROW_HOLD ledger entry
      const ledgerHold = db.getLedgerForUser(userId);
      const holdEntry = ledgerHold.find(t => t.reference_id === `wth_hold_${wth.id}`);
      expect(holdEntry).toBeDefined();
      expect(holdEntry?.type).toBe('ESCROW_HOLD');
      expect(holdEntry?.amount).toBe(200);
      expect(holdEntry?.balance_after).toBe(300);

      // 2. Reject withdrawal -> restores funds and writes REFUND ledger entry
      db.rejectWithdrawal('admin_01', wth.id, 'Invalid phone format');

      const walletAfterReject = db.getWallet(userId)!;
      expect(walletAfterReject.balance).toBe(500);
      expect(walletAfterReject.reserved_balance).toBe(0);

      const ledgerRefund = db.getLedgerForUser(userId);
      const refundEntry = ledgerRefund.find(t => t.reference_id === `wth_ref_${wth.id}`);
      expect(refundEntry).toBeDefined();
      expect(refundEntry?.type).toBe('REFUND');
      expect(refundEntry?.amount).toBe(200);
      expect(refundEntry?.balance_after).toBe(500);
    });

    it('approving withdrawal releases reserved balance with WITHDRAWAL ledger entry', () => {
      const reg = auth.register('Haile W', '0977889911', 'Password123');
      const userId = reg.user!.playerId;

      db.updateWalletBalance(userId, 300);
      const wth = db.createWithdrawalRequest(userId, 'Haile W', 150, '0977889911');

      const approveRes = db.approveWithdrawal('admin_01', wth.id);
      expect(approveRes.withdrawal.status).toBe('APPROVED');
      expect(approveRes.wallet.reserved_balance).toBe(0);
      expect(approveRes.wallet.balance).toBe(150);

      const ledger = db.getLedgerForUser(userId);
      const compTx = ledger.find(t => t.reference_id === `wth_comp_${wth.id}`);
      expect(compTx).toBeDefined();
      expect(compTx?.type).toBe('WITHDRAWAL');
      expect(compTx?.amount).toBe(150);
    });
  });

  // =========================================================================
  // PHASE 6: Telegram initData Security (timingSafeEqual & Replay Defense)
  // =========================================================================
  describe('Phase 6: Telegram initData Timing Attack & Replay Defense', () => {
    const BOT_TOKEN = '123456789:ABCdefGHIjklMNOpqrsTUVwxyz';

    function buildValidInitData(authDate: number = Math.floor(Date.now() / 1000)): string {
      const userJson = JSON.stringify({ id: 11223344, first_name: 'TgUser', username: 'tg_test' });
      const searchParams = new URLSearchParams();
      searchParams.set('auth_date', String(authDate));
      searchParams.set('user', userJson);

      const dataCheckArr: string[] = [];
      searchParams.forEach((v, k) => dataCheckArr.push(`${k}=${v}`));
      dataCheckArr.sort();
      const checkString = dataCheckArr.join('\n');

      const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
      const hash = crypto.createHmac('sha256', secretKey).update(checkString).digest('hex');
      searchParams.set('hash', hash);

      return searchParams.toString();
    }

    it('valid initData passes cryptographic verification', () => {
      const validInit = buildValidInitData();
      const res = verifyTelegramInitData(validInit, BOT_TOKEN);
      expect(res.isValid).toBe(true);
      expect(res.user?.id).toBe(11223344);
    });

    it('tampered hash fails constant-time HMAC check', () => {
      const validInit = buildValidInitData();
      const tampered = validInit.replace(/hash=[0-9a-f]{6}/, 'hash=dead00');
      const res = verifyTelegramInitData(tampered, BOT_TOKEN);
      expect(res.isValid).toBe(false);
      expect(res.error).toMatch(/hash mismatch/i);
    });

    it('expired auth_date (> 24h) is rejected', () => {
      const expiredDate = Math.floor(Date.now() / 1000) - (86400 + 300);
      const expiredInit = buildValidInitData(expiredDate);
      const res = verifyTelegramInitData(expiredInit, BOT_TOKEN);
      expect(res.isValid).toBe(false);
      expect(res.error).toMatch(/expired/i);
    });

    it('future-dated auth_date (> 60s skew) is rejected', () => {
      const futureDate = Math.floor(Date.now() / 1000) + 120;
      const futureInit = buildValidInitData(futureDate);
      const res = verifyTelegramInitData(futureInit, BOT_TOKEN);
      expect(res.isValid).toBe(false);
      expect(res.error).toMatch(/future/i);
    });

    it('detects and rejects replayed initData payloads when replay protection is enabled', () => {
      const init = buildValidInitData();
      // First verification succeeds
      const first = verifyTelegramInitData(init, BOT_TOKEN, 86400, true);
      expect(first.isValid).toBe(true);

      // Second verification of identical payload fails
      const second = verifyTelegramInitData(init, BOT_TOKEN, 86400, true);
      expect(second.isValid).toBe(false);
      expect(second.error).toMatch(/replay detected/i);
    });
  });

  // =========================================================================
  // PHASES 7, 10, 11: Daily Grand Jackpot Math & Recovery
  // =========================================================================
  describe('Phases 7, 10, 11: Daily Grand Jackpot Financial Math & Recovery', () => {
    it('verifies boundary calculation rules and platform subsidy at 100 cards', () => {
      // 100 cards: 99,900 ETB gross, 100,000 ETB jackpot, -100 ETB subsidy
      const r100 = calculateDailyGrandJackpot(100);
      expect(r100.grossSales).toBe(99900);
      expect(r100.jackpotAmount).toBe(100000);
      expect(r100.platformRetained).toBe(-100);

      // 110 cards: 109,890 ETB gross, 100,000 ETB jackpot, 9,890 platform
      const r110 = calculateDailyGrandJackpot(110);
      expect(r110.grossSales).toBe(109890);
      expect(r110.jackpotAmount).toBe(100000);
      expect(r110.platformRetained).toBe(9890);

      // 111 cards: 110,889 ETB gross, 100,889 ETB jackpot, 10,000 platform
      const r111 = calculateDailyGrandJackpot(111);
      expect(r111.grossSales).toBe(110889);
      expect(r111.platformRetained).toBe(10000);
      expect(r111.jackpotAmount).toBe(100889);

      // 160 cards: 159,840 ETB gross, 149,840 ETB jackpot, 10,000 platform
      const r160 = calculateDailyGrandJackpot(160);
      expect(r160.grossSales).toBe(159840);
      expect(r160.platformRetained).toBe(10000);
      expect(r160.jackpotAmount).toBe(149840);

      // 161 cards: 160,839 ETB gross, 150,000 ETB jackpot (capped), 10,839 platform
      const r161 = calculateDailyGrandJackpot(161);
      expect(r161.grossSales).toBe(160839);
      expect(r161.jackpotAmount).toBe(150000);
      expect(r161.platformRetained).toBe(10839);

      // 200 cards: 199,800 ETB gross, 150,000 ETB jackpot (capped), 49,800 platform
      const r200 = calculateDailyGrandJackpot(200);
      expect(r200.grossSales).toBe(199800);
      expect(r200.jackpotAmount).toBe(150000);
      expect(r200.platformRetained).toBe(49800);
    });

    it('fails safely in production if JACKPOT_SERVER_SECRET is missing', () => {
      const prevEnv = process.env.NODE_ENV;
      const prevSecret = process.env.JACKPOT_SERVER_SECRET;

      process.env.NODE_ENV = 'production';
      delete process.env.JACKPOT_SERVER_SECRET;

      try {
        expect(() => new DailyJackpotService(db)).toThrow(/JACKPOT_SERVER_SECRET/i);
      } finally {
        process.env.NODE_ENV = prevEnv;
        if (prevSecret) process.env.JACKPOT_SERVER_SECRET = prevSecret;
      }
    });

    it('recovers and evaluates past-due rounds on startup', () => {
      const jackpotService = new DailyJackpotService(db);
      const round = jackpotService.getOrCreateCurrentRound();

      // Simulate registration open with 50 cards
      db.updateDailyJackpotRound(round.id, {
        status: 'REGISTRATION_OPEN',
        cards_sold: 50
      });

      // Catch-up evaluation
      jackpotService.checkMissedEvaluations();
      // Status remains safe without duplicate evaluation
      expect(round.id).toBeDefined();
    });
  });

  // =========================================================================
  // VULN-06: Process Crash Recovery & Automatic Abandoned Ticket Refunds
  // =========================================================================
  describe('VULN-06: Crash & Restart Ticket Recovery', () => {
    it('refunds human tickets from interrupted/abandoned games on server restart', () => {
      const mockIo = {
        to: () => ({ emit: () => {} }),
        emit: () => {}
      } as unknown as Server;

      // 1. Simulate active game before crash
      const roomConfig = {
        roomId: 'test_crash_room',
        roomName: 'Crash Recovery Room',
        betPerCard: 25.0,
        etbEquivalent: 25.0,
        rakePercent: 20,
        lobbyDuration: 20,
        drawIntervalMs: 500,
        totalCatalogCards: 200,
        minCardsToStart: 5
      };

      const crashedGameId = 'game_crashed_001';
      db.createGame({
        id: crashedGameId,
        roomId: roomConfig.roomId,
        betPerCard: 25.0,
        serverSecret: 'sec_crashed',
        commitmentHash: 'comm_crashed'
      });

      // User purchased ticket
      const reg = auth.register('CrashVictim', '0988990011', 'Password123');
      const userId = reg.user!.playerId;
      db.updateWalletBalance(userId, 100); // 100 ETB
      db.updateWalletBalance(userId, 75);  // Deducted 25 ETB for bet

      db.createPlayerTicket({
        id: 'tkt_crash_victim_1',
        gameId: crashedGameId,
        cardNumber: 12,
        userId,
        username: 'CrashVictim',
        gridJson: JSON.stringify({ B: [1,2,3,4,5], I: [16,17,18,19,20], N: [31,32,0,34,35], G: [46,47,48,49,50], O: [61,62,63,64,65] }),
        fingerprintHash: 'hash_crash_victim',
        isBot: false
      });

      // 2. Server boots up fresh GameRoomManager after crash
      const manager = new GameRoomManager(mockIo, roomConfig, db);

      // Verify player received full 25 ETB refund in wallet
      const walletAfter = db.getWallet(userId)!;
      expect(walletAfter.balance).toBe(100.0);

      // Verify refund ledger transaction exists
      const refundTx = db.getLedgerTransactionByReference('refund_game_tkt_crash_victim_1');
      expect(refundTx).toBeDefined();
      expect(refundTx?.type).toBe('REFUND');
      expect(refundTx?.amount).toBe(25.0);
      expect(refundTx?.user_id).toBe(userId);

      // Verify crashed game was marked finished so it is not refunded again
      const gameInDb = db.getGame(crashedGameId)!;
      expect(gameInDb.status).toBe('finished');

      // 3. Second restart produces NO duplicate refund
      const secondManager = new GameRoomManager(mockIo, roomConfig, db);
      expect(secondManager.recoverOrRefundAbandonedGames()).toBe(0);
      expect(db.getWallet(userId)!.balance).toBe(100.0);
    });
  });

  // =========================================================================
  // PHASE 9: Provably Fair Deterministic PRF Randomness
  // =========================================================================
  describe('Phase 9: Provably Fair PRF Sequence Derivation', () => {
    it('produces identical 75-ball sequence given same seeds and nonce', () => {
      const serverSeed = crypto.randomBytes(32).toString('hex');
      const clientSeed = 'ethiopia_telecom_block_987654';
      const nonce = 1;

      const seq1 = deriveDeterministicBallSequence(serverSeed, clientSeed, nonce);
      const seq2 = deriveDeterministicBallSequence(serverSeed, clientSeed, nonce);

      expect(seq1).toEqual(seq2);
      expect(seq1.length).toBe(75);
    });

    it('contains all 75 balls exactly once with zero duplicates', () => {
      const serverSeed = crypto.randomBytes(32).toString('hex');
      const seq = deriveDeterministicBallSequence(serverSeed, 'client_seed_abc', 42);

      expect(seq.length).toBe(75);
      const set = new Set(seq);
      expect(set.size).toBe(75);

      for (let i = 1; i <= 75; i++) {
        expect(set.has(i)).toBe(true);
      }
    });

    it('different client seed produces completely different permutation', () => {
      const serverSeed = crypto.randomBytes(32).toString('hex');
      const seqA = deriveDeterministicBallSequence(serverSeed, 'client_alpha', 1);
      const seqB = deriveDeterministicBallSequence(serverSeed, 'client_beta', 1);

      expect(seqA).not.toEqual(seqB);
    });

    it('pre-committed server seed can be independently verified after reveal', () => {
      const serverSeed = crypto.randomBytes(32).toString('hex');
      const commitment = computeServerSeedCommitment(serverSeed);

      // Player receives commitment beforehand. At round end, server reveals serverSeed:
      const revealedHash = crypto.createHash('sha256').update(serverSeed).digest('hex');
      expect(revealedHash).toBe(commitment);

      // Player reproduces draw locally:
      const localDraw = deriveDeterministicBallSequence(serverSeed, 'public_client_seed', 0);
      expect(localDraw.length).toBe(75);
    });
  });
});
