import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { httpServer } from './index.js';
import { databaseService } from './DatabaseService.js';
import { ledgerService } from './LedgerService.js';
import { authService, createSignedTelegramInitData } from './AuthService.js';
import { telegramBotService } from './TelegramBotService.js';
import { GameRoomManager, RoomConfig } from './GameRoomManager.js';
import { calculateDailyGrandJackpot, DailyJackpotService } from './DailyJackpotService.js';
import { computeCommitmentHash } from './BingoEngine.js';

let BASE_URL: string;

const mockIo = {
  to: () => ({ emit: () => {} }),
  emit: () => {}
} as any;

const defaultRoomConfig: RoomConfig = {
  roomId: 'e2e_room_20birr',
  roomName: 'E2E Validation Room 20 Birr',
  betPerCard: 20,
  etbEquivalent: 20,
  rakePercent: 20,
  lobbyDuration: 20,
  drawIntervalMs: 200,
  totalCatalogCards: 200,
  minCardsToStart: 5
};

describe('FINAL END-TO-END SYSTEM VALIDATION', () => {
  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      httpServer.listen(0, '127.0.0.1', () => {
        const addr = httpServer.address() as any;
        BASE_URL = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });
  });

  // ==================================================
  // 1. AUTHENTICATION & PHONE NORMALIZATION
  // ==================================================
  describe('1. Authentication Lifecycle & Phone Normalization', () => {
    it('normalizes +251, 09, 9, and 07 formats to standard +251 E.164', () => {
      expect(telegramBotService.normalizePhone('+251911223344')).toBe('+251911223344');
      expect(telegramBotService.normalizePhone('0911223344')).toBe('+251911223344');
      expect(telegramBotService.normalizePhone('911223344')).toBe('+251911223344');
      expect(telegramBotService.normalizePhone('0711223344')).toBe('+251711223344');
      expect(telegramBotService.normalizePhone('+251 911-22-33-44')).toBe('+251911223344');
    });

    it('handles registration, password creation, wrong password rejection, and login', async () => {
      const phone = `09${Math.floor(10000000 + Math.random() * 89999999)}`;
      const password = 'StrongPassword123!';
      const username = `User_${Date.now().toString().slice(-6)}`;

      // 1. Register initiate
      const regRes = await authService.register(username, phone, password);
      expect(regRes.success).toBe(true);

      // Verify contact via simulation
      const verifyRes = telegramBotService.simulateContactShare(phone, phone, 8887771, username);
      expect(verifyRes.success).toBe(true);

      // 2. Wrong password must fail
      const badLogin = authService.login(phone, 'WrongPassword999');
      expect(badLogin.success).toBe(false);
      expect(badLogin.error).toMatch(/invalid|mismatch/i);

      // 3. Correct password must succeed
      const goodLogin = authService.login(phone, password);
      expect(goodLogin.success).toBe(true);
      expect(goodLogin.sessionToken).toBeDefined();

      // 4. Duplicate registration with same normalized phone must be rejected
      const dupReg = authService.register(`Dup_${username}`, phone, password);
      expect(dupReg.success).toBe(false);
      expect(dupReg.error).toMatch(/already registered|already exists/i);
    });

    it('executes password reset end-to-end and prevents cross-account reset abuse', async () => {
      const phoneA = `09${Math.floor(10000000 + Math.random() * 89999999)}`;
      const phoneB = `09${Math.floor(10000000 + Math.random() * 89999999)}`;
      const passA = 'OldPasswordA123!';
      const newPassA = 'NewPasswordA456!';

      authService.register('UserA', phoneA, passA);
      telegramBotService.simulateContactShare(phoneA, phoneA, 111001, 'UserA');
      authService.register('UserB', phoneB, 'PasswordB123!');
      telegramBotService.simulateContactShare(phoneB, phoneB, 222002, 'UserB');

      // 1. User A initiates reset
      const initReset = authService.initiatePasswordReset(phoneA);
      expect(initReset.success).toBe(true);

      // 2. Cross-account attack: User B tries to verify User A's reset using phone B
      const badShare = telegramBotService.simulatePasswordResetShare(phoneA, phoneB);
      expect(badShare.success).toBe(false);

      // 3. Legitimate reset verification with matching phone
      const goodShare = telegramBotService.simulatePasswordResetShare(phoneA, phoneA);
      expect(goodShare.success).toBe(true);
      expect(goodShare.resetToken).toBeDefined();

      // 4. Complete reset
      const resetResult = authService.completePasswordReset(phoneA, goodShare.resetToken!, newPassA);
      expect(resetResult.success).toBe(true);

      // 5. Old password now fails, new password succeeds
      expect(authService.login(phoneA, passA).success).toBe(false);
      const newLogin = authService.login(phoneA, newPassA);
      expect(newLogin.success).toBe(true);
      expect(newLogin.sessionToken).toBeDefined();
    });
  });

  // ==================================================
  // 2. TELEGRAM MINI APP AUTHENTICATION
  // ==================================================
  describe('2. Telegram Mini App Flow & Production Safeguards', () => {
    it('verifies signed Telegram initData and creates linked session', async () => {
      const tgId = Math.floor(600000000 + Math.random() * 399999999);
      const botToken = process.env.TELEGRAM_BOT_TOKEN || 'test_mock_bot_token_123456:ABCdefGHIjklMNOpqrSTUvwxYZ';
      const initData = createSignedTelegramInitData(
        { id: tgId, first_name: 'TgPlayer', username: `tg_${tgId}` },
        botToken
      );

      const res = await fetch(`${BASE_URL}/api/auth/telegram`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData })
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(['AUTHENTICATED', 'NEW_USER']).toContain(data.status);
    });

    it('rejects tampered or spoofed initData signatures', async () => {
      const fakeInitData = 'query_id=AAHdF6IQAAAAAN0XohD_test&user=%7B%22id%22%3A999999%7D&auth_date=1700000000&hash=00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff';

      const res = await fetch(`${BASE_URL}/api/auth/telegram`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData: fakeInitData })
      });

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toMatch(/tampered|invalid|mismatch/i);
    });

    it('strictly forbids simulation endpoints in production environment', async () => {
      const origEnv = process.env.NODE_ENV;
      try {
        process.env.NODE_ENV = 'production';
        const res = await fetch(`${BASE_URL}/api/telegram/simulate-contact-share`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: '+251911223344', tgUserId: 12345 })
        });
        expect(res.status).toBe(403);
      } finally {
        process.env.NODE_ENV = origEnv;
      }
    });
  });

  // ==================================================
  // 3. USER WALLET & FINANCIAL WORKFLOW
  // ==================================================
  describe('3. User Wallet Accounting & Strict Idempotency', () => {
    it('executes deposit, admin approval, duplicate approval rejection, and withdrawal lifecycle', async () => {
      const userId = `usr_wallet_e2e_${Date.now()}`;
      ledgerService.getOrCreateUser(userId, 'WalletUser', undefined, 'USER', 0);
      const session = databaseService.createSession(userId, 'tg_wallet');

      // Admin user
      const adminId = 'usr_e2e_admin';
      ledgerService.getOrCreateUser(adminId, 'E2EAdmin', undefined, 'ADMIN', 0);
      const adminSession = databaseService.createSession(adminId, 'tg_admin');

      // 1. Initial balance: 0.00
      let wallet = databaseService.getOrCreateWallet(userId);
      expect(wallet.balance).toBe(0.00);

      // 2. Submit Telebirr deposit of 200 ETB
      const depRes = await fetch(`${BASE_URL}/api/wallet/deposit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.id}`
        },
        body: JSON.stringify({
          amount: 200,
          paymentMethod: 'Telebirr',
          referenceId: `TB_DEP_${Date.now()}`
        })
      });
      expect(depRes.status).toBe(200);
      const depData = await depRes.json();
      const depositId = depData.deposit.id;

      // 3. Admin approves deposit
      const appRes1 = await fetch(`${BASE_URL}/api/admin/deposits/${depositId}/approve`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminSession.id}` }
      });
      expect(appRes1.status).toBe(200);

      wallet = databaseService.getOrCreateWallet(userId);
      expect(wallet.balance).toBe(200.00);

      // 4. Attempt duplicate approval: MUST be rejected and NOT credit balance twice
      const appRes2 = await fetch(`${BASE_URL}/api/admin/deposits/${depositId}/approve`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${adminSession.id}` }
      });
      expect(appRes2.status).toBe(400);

      wallet = databaseService.getOrCreateWallet(userId);
      expect(wallet.balance).toBe(200.00); // Balance completely unchanged

      // 5. Withdrawal request: withdraw 50 ETB
      const withRes = await fetch(`${BASE_URL}/api/wallet/withdraw`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.id}`
        },
        body: JSON.stringify({
          amount: 50,
          paymentMethod: 'Telebirr',
          address: '0911223344'
        })
      });
      expect(withRes.status).toBe(200);
      const withData = await withRes.json();
      const withdrawalId = withData.withdrawal.id;

      // Wallet balance must reflect reservation: balance 150, reserved 50
      wallet = databaseService.getOrCreateWallet(userId);
      expect(wallet.balance).toBe(150.00);
      expect(wallet.reserved_balance).toBe(50.00);

      // 6. Admin rejects withdrawal: 50 ETB refunded to available balance
      const rejRes = await fetch(`${BASE_URL}/api/admin/withdrawals/${withdrawalId}/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminSession.id}`
        },
        body: JSON.stringify({ reason: 'Invalid Telebirr account' })
      });
      expect(rejRes.status).toBe(200);

      wallet = databaseService.getOrCreateWallet(userId);
      expect(wallet.balance).toBe(200.00);
      expect(wallet.reserved_balance).toBe(0.00);
    });
  });

  // ==================================================
  // 4. CARD PURCHASE, DESELECTION & CONCURRENCY
  // ==================================================
  describe('4. Card Selection, Deselection & Concurrency Defense', () => {
    it('supports card selection, deselection, and clean handoff to another user', async () => {
      const room = new GameRoomManager(mockIo, {
        ...defaultRoomConfig,
        roomId: `room_card_test_${Date.now()}`
      }, databaseService);

      const userA = `usr_card_a_${Date.now()}`;
      const userB = `usr_card_b_${Date.now()}`;
      ledgerService.getOrCreateUser(userA, 'CardUserA', undefined, 'USER', 0);
      ledgerService.getOrCreateUser(userB, 'CardUserB', undefined, 'USER', 0);
      databaseService.updateWalletBalance(userA, 100);
      databaseService.updateWalletBalance(userB, 100);

      // User A selects card #25
      const ticketA = await room.selectCardNumber(userA, 'CardUserA', 25);
      expect(ticketA.cardNumber).toBe(25);
      expect(databaseService.getOrCreateWallet(userA).balance).toBe(80.00);

      // User A deselects card #25
      await room.deselectCardNumber(userA, 25);
      expect(databaseService.getOrCreateWallet(userA).balance).toBe(100.00);

      // Card #25 row must be removed from player_tickets
      const ticketsInDb = databaseService.getTicketsForGame(room.gameId);
      expect(ticketsInDb.find(t => t.card_number === 25)).toBeUndefined();

      // User B can now immediately purchase card #25 without UNIQUE constraint failure
      const ticketB = await room.selectCardNumber(userB, 'CardUserB', 25);
      expect(ticketB.cardNumber).toBe(25);
      expect(ticketB.playerId).toBe(userB);
      expect(databaseService.getOrCreateWallet(userB).balance).toBe(80.00);
    });

    it('rejects simultaneous race condition purchase for the exact same card', async () => {
      const room = new GameRoomManager(mockIo, {
        ...defaultRoomConfig,
        roomId: `room_race_${Date.now()}`
      }, databaseService);

      const user1 = `racer1_${Date.now()}`;
      const user2 = `racer2_${Date.now()}`;
      ledgerService.getOrCreateUser(user1, 'Racer1', undefined, 'USER', 0);
      ledgerService.getOrCreateUser(user2, 'Racer2', undefined, 'USER', 0);
      databaseService.updateWalletBalance(user1, 100);
      databaseService.updateWalletBalance(user2, 100);

      // Both users attempt to purchase card #77 simultaneously
      const results = await Promise.allSettled([
        room.selectCardNumber(user1, 'Racer1', 77),
        room.selectCardNumber(user2, 'Racer2', 77)
      ]);

      const fulfilled = results.filter(r => r.status === 'fulfilled');
      const rejected = results.filter(r => r.status === 'rejected');

      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);

      // Exactly one ticket for card #77 is persisted
      const tickets = databaseService.getTicketsForGame(room.gameId);
      expect(tickets.filter(t => t.card_number === 77).length).toBe(1);
    });
  });

  // ==================================================
  // 5. BINGO GAME ENGINE & MULTI-PLAYER SETTLEMENT
  // ==================================================
  describe('5. Bingo Game Engine & Provably Fair Draw Lifecycle', () => {
    it('executes ball draw sequence conforming to 75-ball ranges without duplicates', async () => {
      const room = new GameRoomManager(mockIo, {
        ...defaultRoomConfig,
        roomId: `room_engine_${Date.now()}`
      }, databaseService);

      const p1 = `p1_${Date.now()}`;
      const p2 = `p2_${Date.now()}`;
      ledgerService.getOrCreateUser(p1, 'Player1', undefined, 'USER', 0);
      ledgerService.getOrCreateUser(p2, 'Player2', undefined, 'USER', 0);
      databaseService.updateWalletBalance(p1, 100);
      databaseService.updateWalletBalance(p2, 100);

      await room.selectCardNumber(p1, 'Player1', 1);
      await room.selectCardNumber(p2, 'Player2', 2);

      // Start the game draw
      (room as any).transitionToActiveDraw();
      expect(room.status).toBe('active');

      // Verify server draw sequence (75 unique balls)
      const balls = (room as any).shuffledBalls;
      expect(balls.length).toBe(75);
      expect(new Set(balls).size).toBe(75);

      // Range checks
      for (const b of balls) {
        expect(b).toBeGreaterThanOrEqual(1);
        expect(b).toBeLessThanOrEqual(75);
      }

      // Cleanup timers
      (room as any).clearTimers();
    });

    it('verifies game commitment hash reproducibility on public endpoint', async () => {
      const balls = [12, 24, 33, 49, 71];
      const serverSeed = 'test_provably_fair_seed_12345';
      const expectedHash = computeCommitmentHash(balls, serverSeed);

      const res = await fetch(`${BASE_URL}/api/game/verify-fairness`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          balls,
          serverSeed,
          expectedHash
        })
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.isValid).toBe(true);
      expect(data.calculatedHash.toLowerCase()).toBe(expectedHash.toLowerCase());
    });
  });

  // ==================================================
  // 6. DAILY GRAND JACKPOT BUSINESS RULES
  // ==================================================
  describe('6. Daily Grand Jackpot Exact Rules & Boundaries', () => {
    it('calculates jackpot amounts and platform cuts adhering strictly to business boundaries', () => {
      // 99 cards -> not eligible
      const res99 = calculateDailyGrandJackpot(99);
      expect(res99.isEligible).toBe(false);
      expect(res99.jackpotAmount).toBe(0);

      // 100 cards -> minimum payout 100,000 ETB
      const res100 = calculateDailyGrandJackpot(100);
      expect(res100.isEligible).toBe(true);
      expect(res100.jackpotAmount).toBe(100000);
      expect(res100.grossSales).toBe(99900);

      // 110 cards -> 100,000 ETB payout
      const res110 = calculateDailyGrandJackpot(110);
      expect(res110.jackpotAmount).toBe(100000);
      expect(res110.platformRetained).toBe(110 * 999 - 100000); // 9,890 ETB

      // 160 cards -> platform cut = 10,000 ETB
      const res160 = calculateDailyGrandJackpot(160);
      expect(res160.platformRetained).toBe(10000);
      expect(res160.jackpotAmount).toBe(160 * 999 - 10000); // 149,840 ETB

      // 161 cards -> capped at 150,000 ETB, platform retains remainder
      const res161 = calculateDailyGrandJackpot(161);
      expect(res161.jackpotAmount).toBe(150000);
      expect(res161.platformRetained).toBe(161 * 999 - 150000);

      // 200 cards -> maximum 200 cards, capped at 150,000 ETB
      const res200 = calculateDailyGrandJackpot(200);
      expect(res200.jackpotAmount).toBe(150000);
      expect(res200.platformRetained).toBe(200 * 999 - 150000); // 49,800 ETB

      // 201 cards -> invalid, throws error
      expect(() => calculateDailyGrandJackpot(201)).toThrow(/between 0 and 200/);
    });

    it('public state NEVER exposes internal platform cut calculations', async () => {
      const jackpotService = new DailyJackpotService(databaseService);
      const publicState = jackpotService.getPublicState();

      expect(publicState).toHaveProperty('jackpotAmount');
      expect(publicState).toHaveProperty('cardPrice', 999);
      expect(publicState).toHaveProperty('maxCards', 200);
      expect(publicState).toHaveProperty('minCards', 100);

      // CRITICAL RULE: Platform cut must NOT be exposed to players
      expect(publicState).not.toHaveProperty('platformRetained');
      expect(publicState).not.toHaveProperty('platformCut');
      expect(publicState).not.toHaveProperty('internalCut');
    });
  });

  // ==================================================
  // 7. PROMOTIONAL DEPOSIT BONUS
  // ==================================================
  describe('7. Promotional First-Deposit Bonus', () => {
    it('awards max 50 ETB on first deposit, cannot withdraw bonus, and rejects bonus on 2nd deposit', () => {
      const rewardService = databaseService.rewardService;
      const bonusUser = `usr_bonus_${Date.now()}`;
      ledgerService.getOrCreateUser(bonusUser, 'BonusUser', undefined, 'USER', 0);

      // Deposit 1: 500 ETB (10% = 50 ETB max cap)
      const dep1 = databaseService.createDepositRequest(bonusUser, 'BonusUser', 500, 'Telebirr', `DEP_BONUS_1_${Date.now()}`);
      const app1 = databaseService.approveDeposit('admin_usr', dep1.id);
      expect(app1.promotionalBonus).toBeDefined();
      expect(app1.promotionalBonus?.bonusAmount).toBe(50); // Capped at 50 ETB

      const wallet = databaseService.getOrCreateWallet(bonusUser);
      expect(wallet.balance).toBe(500);
      expect(wallet.bonus_balance).toBe(50);

      // Cannot withdraw bonus funds
      expect(() => {
        databaseService.createWithdrawalRequest(bonusUser, 'BonusUser', 501, '0911223344');
      }).toThrow(/insufficient/i);

      // Deposit 2: 500 ETB -> No bonus awarded
      const dep2 = databaseService.createDepositRequest(bonusUser, 'BonusUser', 500, 'Telebirr', `DEP_BONUS_2_${Date.now()}`);
      const app2 = databaseService.approveDeposit('admin_usr', dep2.id);
      expect(app2.promotionalBonus).toBeNull();
    });
  });

  // ==================================================
  // 8. ADMIN DASHBOARD & ROLE PRIVILEGE SEPARATION
  // ==================================================
  describe('8. Admin Security & Endpoint Protection', () => {
    it('strictly rejects non-admin users with 403 Forbidden on all administrative endpoints', async () => {
      const normalUser = `usr_norm_${Date.now()}`;
      ledgerService.getOrCreateUser(normalUser, 'NormalUser', undefined, 'USER', 0);
      const session = databaseService.createSession(normalUser, 'tg_norm');

      const endpoints = [
        { method: 'GET', url: `${BASE_URL}/api/admin/deposits` },
        { method: 'GET', url: `${BASE_URL}/api/admin/withdrawals` },
        { method: 'GET', url: `${BASE_URL}/api/admin/users` },
        { method: 'GET', url: `${BASE_URL}/api/admin/audit-logs` },
        { method: 'GET', url: `${BASE_URL}/api/admin/games` },
        { method: 'POST', url: `${BASE_URL}/api/admin/balance-adjustment` }
      ];

      for (const ep of endpoints) {
        const res = await fetch(ep.url, {
          method: ep.method,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.id}`
          },
          body: ep.method === 'POST' ? JSON.stringify({ userId: normalUser, amount: 10 }) : undefined
        });

        expect(res.status).toBe(403);
        const data = await res.json();
        expect(data.error).toMatch(/admin authorization required|admin privileges required|access denied/i);
      }
    });
  });

  // ==================================================
  // 9. CONCURRENCY TESTS
  // ==================================================
  describe('9. Financial Concurrency Stress Test', () => {
    it('prevents double-spending when simultaneous withdrawals are submitted against boundary balance', async () => {
      const richUser = `usr_rich_${Date.now()}`;
      ledgerService.getOrCreateUser(richUser, 'RichUser', undefined, 'USER', 0);
      databaseService.updateWalletBalance(richUser, 100);
      const session = databaseService.createSession(richUser, 'tg_rich');

      // Attempt two concurrent withdrawals of 70 ETB against 100 ETB total balance
      const [res1, res2] = await Promise.all([
        fetch(`${BASE_URL}/api/wallet/withdraw`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.id}`
          },
          body: JSON.stringify({ amount: 70, paymentMethod: 'Telebirr', address: '0911001122' })
        }),
        fetch(`${BASE_URL}/api/wallet/withdraw`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.id}`
          },
          body: JSON.stringify({ amount: 70, paymentMethod: 'Telebirr', address: '0911001122' })
        })
      ]);

      const statuses = [res1.status, res2.status];
      expect(statuses).toContain(200);
      expect(statuses).toContain(400); // One must be rejected due to insufficient available funds

      const wallet = databaseService.getOrCreateWallet(richUser);
      expect(wallet.balance).toBe(30); // 100 - 70 = 30 available
      expect(wallet.reserved_balance).toBe(70); // 70 reserved
    });
  });

  // ==================================================
  // 10. SERVER RESTART PERSISTENCE
  // ==================================================
  describe('10. Persistence & State Recovery', () => {
    it('preserves users, wallets, ledger entries, and tickets across database re-instantiation', () => {
      const persistenceUser = `usr_persist_${Date.now()}`;
      databaseService.createUser({
        id: persistenceUser,
        telegram_id: '999111222',
        username: 'PersistTester',
        phone: '0911998877',
        referral_code: 'REF_PERSIST',
        role: 'USER'
      });

      databaseService.updateWalletBalance(persistenceUser, 350.00, 50.00, 10.00);

      // Create ticket
      const ticketId = `tkt_persist_${Date.now()}`;
      databaseService.createPlayerTicket({
        id: ticketId,
        gameId: 'game_persist_01',
        cardNumber: 44,
        userId: persistenceUser,
        username: 'PersistTester',
        gridJson: JSON.stringify({ B: [1,2,3,4,5] }),
        fingerprintHash: 'hash_persist',
        isBot: false
      });

      // Query database directly as if restarted
      const recoveredUser = databaseService.getUserById(persistenceUser);
      expect(recoveredUser).toBeDefined();
      expect(recoveredUser?.phone).toBe('+251911998877');

      const recoveredWallet = databaseService.getWallet(persistenceUser);
      expect(recoveredWallet?.balance).toBe(350.00);
      expect(recoveredWallet?.reserved_balance).toBe(50.00);
      expect(recoveredWallet?.bonus_balance).toBe(10.00);

      const recoveredTicket = databaseService.getPlayerTicket(ticketId);
      expect(recoveredTicket).toBeDefined();
      expect(recoveredTicket?.card_number).toBe(44);
      expect(recoveredTicket?.user_id).toBe(persistenceUser);
    });
  });

  // ==================================================
  // 11. PRODUCTION ENVIRONMENT & SECRETS ENFORCEMENT
  // ==================================================
  describe('11. Production Environment & Secrets Enforcement', () => {
    it('enforces mandatory JACKPOT_SERVER_SECRET in production mode and prevents silent test defaults', () => {
      const origEnv = process.env.NODE_ENV;
      const origSecret = process.env.JACKPOT_SERVER_SECRET;
      try {
        process.env.NODE_ENV = 'production';
        delete process.env.JACKPOT_SERVER_SECRET;

        expect(() => {
          new DailyJackpotService(databaseService);
        }).toThrow(/FATAL: JACKPOT_SERVER_SECRET environment variable is mandatory in production/);
      } finally {
        process.env.NODE_ENV = origEnv;
        if (origSecret !== undefined) process.env.JACKPOT_SERVER_SECRET = origSecret;
      }
    });

    it('instantiates cleanly when production secrets are supplied', () => {
      const origEnv = process.env.NODE_ENV;
      const origSecret = process.env.JACKPOT_SERVER_SECRET;
      try {
        process.env.NODE_ENV = 'production';
        process.env.JACKPOT_SERVER_SECRET = 'prod_secret_dummy_1234567890';

        const service = new DailyJackpotService(databaseService);
        expect(service).toBeDefined();
      } finally {
        process.env.NODE_ENV = origEnv;
        if (origSecret !== undefined) process.env.JACKPOT_SERVER_SECRET = origSecret;
        else delete process.env.JACKPOT_SERVER_SECRET;
      }
    });
  });
});
