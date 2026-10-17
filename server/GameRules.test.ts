import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DatabaseService } from './DatabaseService.js';
import { GameRoom, RoomConfig, PurchasedTicket } from './GameRoomManager.js';
import { getCartelaCatalog, splitPrize, verifyWinningPatterns, BingoGrid } from './BingoEngine.js';

// Ethiopian-style rules: fixed cartelas, 2 players to start, shared BINGO, false BINGO knock-out,
// auto-BINGO and a full refund when nobody can win.
describe('Game rules (Ethiopian Telegram bingo)', () => {
  let db: DatabaseService;
  let mockIo: any;
  let emitted: Array<{ event: string; payload: any }>;
  let rooms: GameRoom[];

  const row1 = (grid: BingoGrid) => [grid.B[0], grid.I[0], grid.N[0], grid.G[0], grid.O[0]];
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const makeRoom = (overrides: Partial<RoomConfig> = {}) => {
    const room = new GameRoom(mockIo, {
      roomId: `room_rules_${rooms.length}`,
      roomName: 'Rules Room',
      betPerCard: 10,
      etbEquivalent: 10,
      rakePercent: 20,
      lobbyDuration: 30,
      drawIntervalMs: 1_000_000,
      totalCatalogCards: 200,
      ...overrides
    }, db);
    rooms.push(room);
    return room;
  };

  const makePlayer = (id: string, balance = 100) => {
    db.createUser({ id, telegram_id: `tg_${id}`, username: id, referral_code: `REF_${id}` });
    db.updateWalletBalance(id, balance);
    return id;
  };

  // Put the given numbers first in the draw order and mark them as drawn
  const setDrawn = (room: GameRoom, numbers: number[]) => {
    const unique = Array.from(new Set(numbers.filter((n) => n > 0)));
    const rest = Array.from({ length: 75 }, (_, i) => i + 1).filter((n) => !unique.includes(n));
    (room as any).shuffledBalls = [...unique, ...rest];
    (room as any).currentBallIndex = unique.length;
  };

  beforeEach(() => {
    db = new DatabaseService(':memory:');
    emitted = [];
    rooms = [];
    mockIo = {
      to: vi.fn().mockReturnValue({ emit: (event: string, payload: any) => emitted.push({ event, payload }) }),
      emit: vi.fn()
    };
  });

  afterEach(() => {
    for (const room of rooms) (room as any).clearTimers();
  });

  describe('Cartelas', () => {
    it('card numbers always map to the same unique, valid cartela', () => {
      const a = makeRoom();
      const b = makeRoom({ roomId: 'room_other' });
      expect(a.getCardPreview(77)).toEqual(b.getCardPreview(77));

      a.initNewGame();
      expect(a.getCardPreview(77)).toEqual(b.getCardPreview(77));

      const catalog = getCartelaCatalog(200);
      expect(catalog.size).toBe(200);
      expect(new Set(Array.from(catalog.values()).map((g) => JSON.stringify(g))).size).toBe(200);
      const ranges: Record<string, [number, number]> = { B: [1, 15], I: [16, 30], N: [31, 45], G: [46, 60], O: [61, 75] };
      for (const grid of catalog.values()) {
        for (const [col, [min, max]] of Object.entries(ranges)) {
          const nums = (grid as any)[col] as number[];
          expect(nums).toHaveLength(5);
          const real = col === 'N' ? nums.filter((_, i) => i !== 2) : nums;
          expect(new Set(real).size).toBe(col === 'N' ? 4 : 5);
          for (const n of real) {
            expect(n).toBeGreaterThanOrEqual(min);
            expect(n).toBeLessThanOrEqual(max);
          }
        }
        expect(grid.N[2]).toBe(0);
      }
    });

    it('rejects card numbers outside the deck', async () => {
      const room = makeRoom();
      const p = makePlayer('usr_badnum');
      for (const bad of [0, 201, 1.5, NaN, -3]) {
        await expect(room.selectCardNumber(p, p, bad)).rejects.toThrow(/Invalid cartela number/);
      }
      await expect(room.lockMultipleCards(p, p, [5, 999])).rejects.toThrow(/Invalid cartela number/);
      expect(room.tickets.size).toBe(0);
      expect(db.getWallet(p)!.balance).toBe(100);
    });

    it('limits each player to the maximum cartelas per round', async () => {
      const room = makeRoom({ maxCardsPerPlayer: 5 });
      const p = makePlayer('usr_max');
      await room.lockMultipleCards(p, p, [1, 2, 3]);

      // A batch that would go over the limit buys nothing
      await expect(room.lockMultipleCards(p, p, [4, 5, 6])).rejects.toThrow(/at most 5 cartelas/);
      expect(room.getPlayerCardCount(p)).toBe(3);

      await room.lockMultipleCards(p, p, [4, 5]);
      await expect(room.selectCardNumber(p, p, 6)).rejects.toThrow(/at most 5 cartelas/);
      expect(db.getWallet(p)!.balance).toBe(50);
    });
  });

  describe('Starting a round', () => {
    it('counts players, not cards, before starting the countdown', async () => {
      const room = makeRoom({ minPlayersToStart: 2 });
      const p1 = makePlayer('usr_start_1');
      const p2 = makePlayer('usr_start_2');

      await room.lockMultipleCards(p1, p1, [1, 2, 3]);
      expect(room.isCountdownActive).toBe(false);
      expect(room.getPublicState().activePlayersCount).toBe(1);

      await room.selectCardNumber(p2, p2, 10);
      expect(room.isCountdownActive).toBe(true);
      expect(room.lobbyTimeRemaining).toBe(30);

      await room.deselectCardNumber(p2, 10);
      expect(room.isCountdownActive).toBe(false);
    });
  });

  describe('Claiming BINGO', () => {
    it('splits the prize between everyone who calls BINGO on the same ball', async () => {
      const room = makeRoom({ claimWindowMs: 150 });
      const p1 = makePlayer('usr_split_1');
      const p2 = makePlayer('usr_split_2');
      const t1 = await room.selectCardNumber(p1, p1, 11);
      const t2 = await room.selectCardNumber(p2, p2, 12);
      room.status = 'active';
      setDrawn(room, [...row1(t1.grid), ...row1(t2.grid)]);

      const first = await room.handleClaimBingo(p1, t1.ticketId);
      expect(first.success).toBe(true);
      expect(first.pending).toBe(true);
      expect(room.getPublicState().claimWindowEndsAt).not.toBeNull();

      const dup = await room.handleClaimBingo(p1, t1.ticketId);
      expect(dup.success).toBe(false);

      const second = await room.handleClaimBingo(p2, t2.ticketId);
      expect(second.success).toBe(true);

      await sleep(300);
      expect(room.status).toBe('finished');
      expect(room.winners.map((w) => w.payoutAmount)).toEqual([10, 10]); // 20 Birr pot, no commission at 5 cards or fewer
      expect(room.winners.every((w) => w.sharedWith === 2)).toBe(true);
      expect(db.getWallet(p1)!.balance).toBe(100);
      expect(db.getWallet(p2)!.balance).toBe(100);

      const announced = emitted.find((e) => e.event === 'BINGO_WINNER_ANNOUNCED')!.payload;
      expect(announced.winnerCount).toBe(2);
      expect(announced.totalPrize).toBe(20);

      const late = await room.handleClaimBingo(p2, t2.ticketId);
      expect(late.success).toBe(false);
    });

    it('splits in whole cents with the leftover cent to the first caller', () => {
      expect(splitPrize(100, 3)).toEqual([33.34, 33.33, 33.33]);
      expect(splitPrize(160, 2)).toEqual([80, 80]);
      expect(splitPrize(50, 0)).toEqual([]);
    });

    it('knocks a cartela out for the round after a false BINGO', async () => {
      const room = makeRoom({ claimWindowMs: 0 });
      const p1 = makePlayer('usr_false_1');
      const p2 = makePlayer('usr_false_2');
      const t1 = await room.selectCardNumber(p1, p1, 21);
      const t2 = await room.selectCardNumber(p2, p2, 22);
      room.status = 'active';
      setDrawn(room, []);

      const falseClaim = await room.handleClaimBingo(p1, t1.ticketId);
      expect(falseClaim.success).toBe(false);
      expect(falseClaim.disqualified).toBe(true);
      expect(room.getPublicState().disqualifiedCardNumbers).toEqual([21]);
      expect(emitted.some((e) => e.event === 'BINGO_FALSE_CLAIM' && e.payload.cardNumber === 21)).toBe(true);

      // Even with a real BINGO later, the knocked-out cartela cannot win this round
      setDrawn(room, [...row1(t1.grid), ...row1(t2.grid)]);
      const retry = await room.handleClaimBingo(p1, t1.ticketId);
      expect(retry.success).toBe(false);
      expect(retry.message).toMatch(/out for this round/);

      const win = await room.handleClaimBingo(p2, t2.ticketId);
      expect(win.success).toBe(true);
      expect(room.winners).toHaveLength(1);
      expect(room.winners[0].playerId).toBe(p2);
      expect(db.getWallet(p2)!.balance).toBe(110);
    });

    it('calls BINGO automatically when a completed cartela is not claimed', async () => {
      const room = makeRoom({ claimWindowMs: 0, autoBingoAfterCalls: 3 });
      const p1 = makePlayer('usr_auto_1');
      const p2 = makePlayer('usr_auto_2');
      const t1 = await room.selectCardNumber(p1, p1, 31);
      const t2 = await room.selectCardNumber(p2, p2, 32);
      room.status = 'active';

      // Draw cartela 31's first row, then balls that are on neither cartela
      const onCards = new Set([...Object.values(t1.grid).flat(), ...Object.values(t2.grid).flat()]);
      const filler = Array.from({ length: 75 }, (_, i) => i + 1).filter((n) => !onCards.has(n));
      setDrawn(room, [...row1(t1.grid), ...filler]);
      (room as any).currentBallIndex = 0;

      for (let i = 0; i < 7; i++) (room as any).drawNextBall();
      expect(room.status).toBe('active');
      expect(room.winners).toHaveLength(0);

      (room as any).drawNextBall(); // 3rd ball after the cartela completed
      await sleep(20);
      expect(room.status).toBe('finished');
      expect(room.winners).toHaveLength(1);
      expect(room.winners[0].cardNumber).toBe(31);
      expect(room.winners[0].autoClaimed).toBe(true);
      expect(db.getWallet(p1)!.balance).toBe(110);
    });

    it('refunds everyone when no cartela can win', async () => {
      const room = makeRoom({ claimWindowMs: 0 });
      const p1 = makePlayer('usr_refund_1');
      const p2 = makePlayer('usr_refund_2');
      const t1 = await room.selectCardNumber(p1, p1, 41);
      const t2 = await room.selectCardNumber(p2, p2, 42);
      expect(db.getWallet(p1)!.balance).toBe(90);
      room.status = 'active';
      setDrawn(room, []);

      await room.handleClaimBingo(p1, t1.ticketId);
      await room.handleClaimBingo(p2, t2.ticketId);
      expect(room.disqualifiedTickets.size).toBe(2);

      (room as any).currentBallIndex = 75;
      (room as any).drawNextBall();
      expect(room.status).toBe('finished');
      expect(room.winners).toHaveLength(0);
      expect(room.getPublicState().roundRefunded).toBe(true);
      expect(db.getWallet(p1)!.balance).toBe(100);
      expect(db.getWallet(p2)!.balance).toBe(100);
      expect(emitted.some((e) => e.event === 'ROUND_REFUNDED')).toBe(true);
    });

    it('only ever counts a completed pattern as BINGO', () => {
      const grid = getCartelaCatalog(200).get(1)!;
      expect(verifyWinningPatterns(grid, row1(grid).slice(0, 4)).hasWon).toBe(false);
      expect(verifyWinningPatterns(grid, row1(grid)).hasWon).toBe(true);
      const corners = [grid.B[0], grid.O[0], grid.B[4], grid.O[4]];
      expect(verifyWinningPatterns(grid, corners).patterns['Four Corners']).toBeDefined();
    });
  });
});
