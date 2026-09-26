import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import http from 'http';
import { DatabaseService } from './DatabaseService.js';
import { GameRoom } from './GameRoomManager.js';
import {
  generate75BallCard,
  verifyWinningPatterns,
  calculatePariMutuelPool,
  computeCommitmentHash,
  computeTicketFingerprint
} from './BingoEngine.js';
import { app } from './index.js';

describe('Phase 3: Game Engine, Provable Fairness & Real-Time Integrity Remediation', () => {
  let dbService: DatabaseService;
  let mockIo: any;
  let server: http.Server;
  let BASE_URL: string;

  beforeAll(async () => {
    server = http.createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as any;
        BASE_URL = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    (server as any)?.closeAllConnections?.();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => {
    dbService = new DatabaseService(':memory:');
    mockIo = {
      to: vi.fn().mockReturnValue({ emit: vi.fn() }),
      emit: vi.fn()
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Game Lifecycle & Database Synchronization', () => {
    it('synchronizes game status (lobby -> active -> finished) directly into the database', () => {
      const room = new GameRoom(mockIo, {
        roomId: 'room_lifecycle_01',
        roomName: 'Lifecycle Test Room',
        betPerCard: 10,
        etbEquivalent: 10,
        rakePercent: 20,
        lobbyDuration: 20,
        drawIntervalMs: 100,
        totalCatalogCards: 200
      }, dbService);

      const gameId = room.gameId;

      // 1. Initial state: lobby
      let gameRow = dbService.getGame(gameId)!;
      expect(gameRow).toBeDefined();
      expect(gameRow.status).toBe('lobby');
      expect(gameRow.total_cards_sold).toBe(0);

      // 2. Add 5 cards to trigger active draw transition
      for (let i = 1; i <= 5; i++) {
        const uId = `usr_life_${i}`;
        dbService.createUser({
          id: uId,
          telegram_id: `tg_life_${i}`,
          username: `Player_${i}`,
          referral_code: `REF_LIFE_${i}`,
          role: 'USER',
          account_type: 'REAL',
          is_bot: false
        });
        dbService.updateWalletBalance(uId, 100);
      }

      // Transition to active
      (room as any).transitionToActiveDraw();
      expect(room.status).toBe('active');

      gameRow = dbService.getGame(gameId)!;
      expect(gameRow.status).toBe('active');

      // 3. Transition to finished
      (room as any).transitionToFinished();
      expect(room.status).toBe('finished');

      gameRow = dbService.getGame(gameId)!;
      expect(gameRow.status).toBe('finished');
      expect(gameRow.finished_at).toBeDefined();

      // 4. Verify recoverOrRefundAbandonedGames does NOT mistake finished game as abandoned
      const recoveredCount = room.recoverOrRefundAbandonedGames();
      expect(recoveredCount).toBe(0);
    });

    it('records drawn balls into game_rounds table', () => {
      const gameId = 'game_balls_persist_01';
      dbService.createGame({
        id: gameId,
        roomId: 'room_10',
        betPerCard: 10,
        serverSecret: 'sec_test',
        commitmentHash: 'comm_test'
      });

      dbService.recordDrawnBall(gameId, 1, 7, 'B');
      dbService.recordDrawnBall(gameId, 2, 22, 'I');
      dbService.recordDrawnBall(gameId, 3, 38, 'N');

      const drawnRounds = dbService.getDrawnBallsForGame(gameId);
      expect(drawnRounds.length).toBe(3);
      expect(drawnRounds[0]).toMatchObject({ ball_index: 1, ball_number: 7, ball_letter: 'B' });
      expect(drawnRounds[1]).toMatchObject({ ball_index: 2, ball_number: 22, ball_letter: 'I' });
      expect(drawnRounds[2]).toMatchObject({ ball_index: 3, ball_number: 38, ball_letter: 'N' });
    });
  });

  describe('2. Concurrent Card Selection & Deselection Atomicity', () => {
    it('prevents double-booking when two players concurrently select the same card number', async () => {
      const room = new GameRoom(mockIo, {
        roomId: 'room_concurr_cards',
        roomName: 'Concurrent Cards Room',
        betPerCard: 20,
        etbEquivalent: 20,
        rakePercent: 20,
        lobbyDuration: 20,
        drawIntervalMs: 100,
        totalCatalogCards: 200
      }, dbService);

      // Create two players
      const p1 = 'usr_card_p1';
      const p2 = 'usr_card_p2';
      dbService.createUser({ id: p1, telegram_id: 'tg_p1', username: 'P1', referral_code: 'REF_P1' });
      dbService.createUser({ id: p2, telegram_id: 'tg_p2', username: 'P2', referral_code: 'REF_P2' });
      dbService.updateWalletBalance(p1, 100);
      dbService.updateWalletBalance(p2, 100);

      // Both attempt to select card #42 simultaneously
      const results = await Promise.allSettled([
        room.selectCardNumber(p1, 'P1', 42, false),
        room.selectCardNumber(p2, 'P2', 42, false)
      ]);

      const fulfilled = results.filter(r => r.status === 'fulfilled');
      const rejected = results.filter(r => r.status === 'rejected');

      // Exactly ONE succeeds and one fails
      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);

      const err = (rejected[0] as PromiseRejectedResult).reason;
      expect(err.message).toMatch(/already taken by another player/i);

      // Exactly 1 ticket exists for card #42
      expect(room.cardToTicketMap.has(42)).toBe(true);
      expect(room.tickets.size).toBe(1);
    });

    it('pauses countdown and refunds properly on card deselection', async () => {
      const room = new GameRoom(mockIo, {
        roomId: 'room_desel_test',
        roomName: 'Deselect Test Room',
        betPerCard: 10,
        etbEquivalent: 10,
        rakePercent: 20,
        lobbyDuration: 20,
        drawIntervalMs: 100,
        totalCatalogCards: 200
      }, dbService);

      // Add 5 cards to start countdown
      for (let i = 1; i <= 5; i++) {
        const uId = `usr_desel_${i}`;
        dbService.createUser({ id: uId, telegram_id: `tg_d_${i}`, username: `DUser_${i}`, referral_code: `REF_D_${i}` });
        dbService.updateWalletBalance(uId, 50);
        await room.selectCardNumber(uId, `DUser_${i}`, i, false);
      }

      expect(room.tickets.size).toBe(5);
      expect(room.isCountdownActive).toBe(true);

      // Deselect 1 card -> tickets drop to 4 -> countdown stops
      await room.deselectCardNumber('usr_desel_5', 5);
      expect(room.tickets.size).toBe(4);
      expect(room.isCountdownActive).toBe(false);
      expect(room.lobbyTimeRemaining).toBe(20);

      // Verify wallet was refunded 10 ETB
      const wallet = dbService.getWallet('usr_desel_5')!;
      expect(wallet.balance).toBe(50.00);
    });
  });

  describe('3. Provable Fairness & Cryptographic Commitments', () => {
    it('conceals server seed and shuffled balls until the game finishes', () => {
      const room = new GameRoom(mockIo, {
        roomId: 'room_fairness_01',
        roomName: 'Fairness Room',
        betPerCard: 10,
        etbEquivalent: 10,
        rakePercent: 20,
        lobbyDuration: 20,
        drawIntervalMs: 100,
        totalCatalogCards: 200
      }, dbService);

      // In lobby: commitmentHash is present, seed and full balls are strictly undefined
      let publicState = room.getPublicState();
      expect(publicState.commitmentHash).toBeDefined();
      expect(publicState.commitmentHash.length).toBe(64); // SHA-256
      expect(publicState.serverSeedRevealed).toBeUndefined();
      expect(publicState.fullShuffledBallsRevealed).toBeUndefined();

      // Transition to finished: seed and full balls are revealed
      (room as any).transitionToFinished();
      publicState = room.getPublicState();
      expect(publicState.serverSeedRevealed).toBeDefined();
      expect(publicState.fullShuffledBallsRevealed).toBeDefined();
      expect(publicState.fullShuffledBallsRevealed!.length).toBe(75);

      // Verify commitment hash matches SHA-256(balls:seed)
      const expectedHash = computeCommitmentHash(
        publicState.fullShuffledBallsRevealed!,
        publicState.serverSeedRevealed!
      );
      expect(publicState.commitmentHash).toBe(expectedHash);
    });

    it('verifies valid commitments and catches tampered inputs via /api/game/verify-fairness', async () => {
      const balls = Array.from({ length: 75 }, (_, i) => i + 1);
      const serverSeed = 'test_seed_secret_1234567890abcdef1234567890abcdef';
      const validHash = computeCommitmentHash(balls, serverSeed);

      // Valid verification
      const validRes = await fetch(`${BASE_URL}/api/game/verify-fairness`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ balls, serverSeed, expectedHash: validHash })
      });
      const validBody = await validRes.json();
      expect(validRes.status).toBe(200);
      expect(validBody.isValid).toBe(true);
      expect(validBody.message).toMatch(/Cryptographic commitment verified/i);

      // Tampered ball array (hash mismatch)
      const tamperedRes = await fetch(`${BASE_URL}/api/game/verify-fairness`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ balls, serverSeed, expectedHash: 'wrong_hash_000000000000000000000000000000000000000000000000000000000000' })
      });
      const tamperedBody = await tamperedRes.json();
      expect(tamperedRes.status).toBe(200);
      expect(tamperedBody.isValid).toBe(false);
      expect(tamperedBody.message).toMatch(/Hash mismatch/i);

      // Invalid input (duplicate ball numbers or out-of-range)
      const badInputRes = await fetch(`${BASE_URL}/api/game/verify-fairness`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ balls: [1, 1, 76], serverSeed })
      });
      const badInputBody = await badInputRes.json();
      expect(badInputRes.status).toBe(400);
      expect(badInputBody.error).toMatch(/Invalid ball sequence/i);
    });
  });

  describe('4. Pari-Mutuel Pool & Rake Calculation Rules', () => {
    it('awards 100% of the pot to winner if 5 cards/players (0% house rake)', () => {
      const pool = calculatePariMutuelPool({
        betPerCard: 20,
        totalCardsSold: 5,
        houseRakePercent: 20
      });

      expect(pool.totalPot).toBe(100.00);
      expect(pool.isFivePlayerBonus).toBe(true);
      expect(pool.houseRakePercent).toBe(0);
      expect(pool.houseRakeAmount).toBe(0.00);
      expect(pool.winnerPayoutAmount).toBe(100.00);
      expect(pool.winnerPayoutPercent).toBe(100);
    });

    it('awards 80% to winner and 20% to owner if more than 5 cards/players', () => {
      const pool = calculatePariMutuelPool({
        betPerCard: 20,
        totalCardsSold: 10,
        houseRakePercent: 20
      });

      expect(pool.totalPot).toBe(200.00);
      expect(pool.isFivePlayerBonus).toBe(false);
      expect(pool.houseRakePercent).toBe(20);
      expect(pool.houseRakeAmount).toBe(40.00);
      expect(pool.winnerPayoutAmount).toBe(160.00);
      expect(pool.winnerPayoutPercent).toBe(80);
    });
  });

  describe('5. Authoritative Server-Side Win Claim Verification', () => {
    it('verifies a legitimate Bingo line and rejects uncalled numbers', async () => {
      const room = new GameRoom(mockIo, {
        roomId: 'room_win_verify_01',
        roomName: 'Win Verify Room',
        betPerCard: 10,
        etbEquivalent: 10,
        rakePercent: 20,
        lobbyDuration: 20,
        drawIntervalMs: 100,
        totalCatalogCards: 200
      }, dbService);

      const userId = 'usr_winner_01';
      dbService.createUser({ id: userId, telegram_id: 'tg_win_01', username: 'WinnerPlayer', referral_code: 'REF_WIN_01' });
      dbService.updateWalletBalance(userId, 100);

      const ticket = await room.selectCardNumber(userId, 'WinnerPlayer', 1, false);

      // Force game to active status
      room.status = 'active';

      // Attempt claim before balls are drawn -> MUST be rejected
      const earlyClaim = await room.handleClaimBingo(userId, ticket.ticketId);
      expect(earlyClaim.success).toBe(false);
      expect(earlyClaim.message).toMatch(/Invalid Bingo claim/i);

      // Now draw balls that complete Row 1 of the ticket's grid
      const grid = ticket.grid;
      const row1Numbers = [grid.B[0], grid.I[0], grid.N[0], grid.G[0], grid.O[0]];

      // Set room's shuffled balls with row 1 numbers at the start
      (room as any).shuffledBalls = [...row1Numbers, ...Array.from({ length: 70 }, (_, i) => i + 1).filter(n => !row1Numbers.includes(n))];
      (room as any).currentBallIndex = 5;

      // Legitimate claim succeeds
      const validClaim = await room.handleClaimBingo(userId, ticket.ticketId);
      expect(validClaim.success).toBe(true);
      expect(validClaim.winnerRecord).toBeDefined();
      expect(validClaim.winnerRecord!.patternsWon).toContain('Row 1');

      // Duplicate claim attempt fails immediately
      const dupClaim = await room.handleClaimBingo(userId, ticket.ticketId);
      expect(dupClaim.success).toBe(false);
      expect(dupClaim.message).toMatch(/already concluded|already been claimed/i);
    });

    it('rejects claims with tampered ticket fingerprints', async () => {
      const room = new GameRoom(mockIo, {
        roomId: 'room_tamper_01',
        roomName: 'Tamper Room',
        betPerCard: 10,
        etbEquivalent: 10,
        rakePercent: 20,
        lobbyDuration: 20,
        drawIntervalMs: 100,
        totalCatalogCards: 200
      }, dbService);

      const userId = 'usr_tamper_01';
      dbService.createUser({ id: userId, telegram_id: 'tg_tamp_01', username: 'TamperUser', referral_code: 'REF_TAMP_01' });
      dbService.updateWalletBalance(userId, 100);

      const ticket = await room.selectCardNumber(userId, 'TamperUser', 5, false);
      room.status = 'active';

      // Tamper with ticket fingerprint in memory
      ticket.fingerprintHash = 'tampered_hash_12345';

      const claimRes = await room.handleClaimBingo(userId, ticket.ticketId);
      expect(claimRes.success).toBe(false);
      expect(claimRes.message).toMatch(/fingerprint mismatch/i);
    });
  });
});
