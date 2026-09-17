import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { databaseService } from './DatabaseService.js';
import {
  calculateDailyGrandJackpot,
  dailyJackpotService,
  getAddisAbabaDateString,
  getAddisAbabaCutoff,
  getAddisAbabaTimeParts
} from './DailyJackpotService.js';

describe('Daily Grand Jackpot Authoritative Formula & Business Rules', () => {
  it('correctly calculates jackpot across all mandated card sales thresholds', () => {
    // 99 cards: Postponed / Not eligible
    const r99 = calculateDailyGrandJackpot(99);
    expect(r99.isEligible).toBe(false);
    expect(r99.jackpotAmount).toBe(0);
    expect(r99.cardsSold).toBe(99);

    // 100 cards: 100,000 ETB
    const r100 = calculateDailyGrandJackpot(100);
    expect(r100.isEligible).toBe(true);
    expect(r100.jackpotAmount).toBe(100000);
    expect(r100.grossSales).toBe(99900);
    expect(r100.platformRetained).toBe(-100); // Platform subsidizes 100 ETB

    // 101 cards: 100,000 ETB
    const r101 = calculateDailyGrandJackpot(101);
    expect(r101.jackpotAmount).toBe(100000);

    // 109 cards: 100,000 ETB
    const r109 = calculateDailyGrandJackpot(109);
    expect(r109.jackpotAmount).toBe(100000);

    // 110 cards: 100,000 ETB
    const r110 = calculateDailyGrandJackpot(110);
    expect(r110.jackpotAmount).toBe(100000);
    expect(r110.grossSales).toBe(109890);
    expect(r110.platformRetained).toBe(9890);

    // 111 cards: 100,889 ETB (Platform retains exactly 10,000 ETB)
    const r111 = calculateDailyGrandJackpot(111);
    expect(r111.grossSales).toBe(110889);
    expect(r111.platformRetained).toBe(10000);
    expect(r111.jackpotAmount).toBe(100889);

    // 120 cards: 109,880 ETB
    const r120 = calculateDailyGrandJackpot(120);
    expect(r120.grossSales).toBe(119880);
    expect(r120.platformRetained).toBe(10000);
    expect(r120.jackpotAmount).toBe(109880);

    // 159 cards: 148,841 ETB
    const r159 = calculateDailyGrandJackpot(159);
    expect(r159.grossSales).toBe(158841);
    expect(r159.platformRetained).toBe(10000);
    expect(r159.jackpotAmount).toBe(148841);

    // 160 cards: 149,840 ETB
    const r160 = calculateDailyGrandJackpot(160);
    expect(r160.grossSales).toBe(159840);
    expect(r160.platformRetained).toBe(10000);
    expect(r160.jackpotAmount).toBe(149840);

    // 161 cards: capped at 150,000 ETB
    const r161 = calculateDailyGrandJackpot(161);
    expect(r161.grossSales).toBe(160839);
    expect(r161.jackpotAmount).toBe(150000);
    expect(r161.platformRetained).toBe(10839);

    // 170 cards: capped at 150,000 ETB
    const r170 = calculateDailyGrandJackpot(170);
    expect(r170.jackpotAmount).toBe(150000);

    // 200 cards: capped at 150,000 ETB
    const r200 = calculateDailyGrandJackpot(200);
    expect(r200.grossSales).toBe(199800);
    expect(r200.jackpotAmount).toBe(150000);
    expect(r200.platformRetained).toBe(49800);
  });

  it('rejects invalid card counts below 0 or above 200', () => {
    expect(() => calculateDailyGrandJackpot(-1)).toThrow(/Invalid cardsSold count/);
    expect(() => calculateDailyGrandJackpot(201)).toThrow(/Invalid cardsSold count/);
  });
});

describe('Timezone & Addis Ababa Cutoff Verification', () => {
  it('produces valid Addis Ababa date and 12:00 PM cutoff', () => {
    const todayStr = getAddisAbabaDateString();
    expect(todayStr).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const cutoff = getAddisAbabaCutoff(todayStr);
    expect(cutoff).toContain('T12:00:00+03:00');

    const parts = getAddisAbabaTimeParts();
    expect(parts.year).toBeGreaterThanOrEqual(2025);
    expect(parts.month).toBeGreaterThanOrEqual(1);
    expect(parts.month).toBeLessThanOrEqual(12);
    expect(parts.day).toBeGreaterThanOrEqual(1);
    expect(parts.day).toBeLessThanOrEqual(31);
  });
});

describe('Database Integrity & Atomic Card Purchases', () => {
  let testUser1: any;
  let testUser2: any;
  const testDate = '2099-01-01';
  let testRound: any;

  beforeAll(() => {
    // Create test players with wallets
    testUser1 = databaseService.getUserById('usr_djt_1') || databaseService.createUser({
      id: 'usr_djt_1',
      telegram_id: '811111111',
      username: 'JackpotPlayerOne',
      referral_code: 'JPONE1',
      role: 'USER'
    });

    testUser2 = databaseService.getUserById('usr_djt_2') || databaseService.createUser({
      id: 'usr_djt_2',
      telegram_id: '822222222',
      username: 'JackpotPlayerTwo',
      referral_code: 'JPTWO2',
      role: 'USER'
    });

    // Credit sufficient funds
    databaseService.updateWalletBalance(testUser1.id, 50000);
    databaseService.updateWalletBalance(testUser2.id, 50000);

    // Create a deterministic test round
    const cutoff = getAddisAbabaCutoff(testDate);
    testRound = databaseService.getOrCreateDailyJackpotRound(testDate, cutoff);
  });

  it('guarantees deterministic single round creation per date', () => {
    const roundAgain = databaseService.getOrCreateDailyJackpotRound(testDate, testRound.cutoff_at);
    expect(roundAgain.id).toBe(testRound.id);
    expect(roundAgain.date_str).toBe(testDate);
  });

  it('atomically purchases cards, debits wallet balance, and creates ledger entry', () => {
    const balanceBefore = databaseService.getWallet(testUser1.id)!.balance;
    const cardsToBuy = [1, 2, 3];
    const cost = cardsToBuy.length * 999;

    const res = databaseService.purchaseDailyJackpotTickets({
      roundId: testRound.id,
      userId: testUser1.id,
      username: testUser1.username,
      cardNumbers: cardsToBuy,
      fingerprintSecret: 'secret_key_test'
    });

    expect(res.success).toBe(true);
    expect(res.tickets).toHaveLength(3);
    expect(res.newBalance).toBe(balanceBefore - cost);

    // Verify wallet updated
    const balanceAfter = databaseService.getWallet(testUser1.id)!.balance;
    expect(balanceAfter).toBe(balanceBefore - cost);

    // Verify ledger has BET entry
    const ledger = databaseService.getLedgerForUser(testUser1.id);
    const betTx = ledger.find(l => l.game_id === testRound.id && l.type === 'BET');
    expect(betTx).toBeDefined();
    expect(betTx!.amount).toBe(cost);
  });

  it('prevents purchasing already-taken cards (Concurrency & Duplicate Card Protection)', () => {
    // Attempt to purchase Card #2 which was already purchased by User 1
    expect(() => {
      databaseService.purchaseDailyJackpotTickets({
        roundId: testRound.id,
        userId: testUser2.id,
        username: testUser2.username,
        cardNumbers: [2, 5],
        fingerprintSecret: 'secret_key_test'
      });
    }).toThrow(/already taken.*#2/);

    // Verify User 2's wallet was NOT debited
    const wallet = databaseService.getWallet(testUser2.id)!;
    expect(wallet.balance).toBe(50000);
  });

  it('rejects purchases exceeding 200 card limit or invalid card numbers', () => {
    expect(() => {
      databaseService.purchaseDailyJackpotTickets({
        roundId: testRound.id,
        userId: testUser2.id,
        username: testUser2.username,
        cardNumbers: [0], // < 1
        fingerprintSecret: 'secret_key_test'
      });
    }).toThrow(/Invalid card number/);

    expect(() => {
      databaseService.purchaseDailyJackpotTickets({
        roundId: testRound.id,
        userId: testUser2.id,
        username: testUser2.username,
        cardNumbers: [201], // > 200
        fingerprintSecret: 'secret_key_test'
      });
    }).toThrow(/Invalid card number/);
  });

  it('rejects purchase if wallet balance is insufficient', () => {
    databaseService.updateWalletBalance(testUser2.id, 500); // Less than 999 ETB

    expect(() => {
      databaseService.purchaseDailyJackpotTickets({
        roundId: testRound.id,
        userId: testUser2.id,
        username: testUser2.username,
        cardNumbers: [10],
        fingerprintSecret: 'secret_key_test'
      });
    }).toThrow(/Insufficient wallet balance/);
  });
});

describe('Postponement & Rollover Behavior (< 100 Cards)', () => {
  let postponeRound: any;
  const postDate = '2099-02-02';

  beforeAll(() => {
    const cutoff = getAddisAbabaCutoff(postDate);
    postponeRound = databaseService.getOrCreateDailyJackpotRound(postDate, cutoff);

    // Only sell 5 cards (5 < 100)
    databaseService.updateWalletBalance('usr_djt_1', 10000);
    databaseService.purchaseDailyJackpotTickets({
      roundId: postponeRound.id,
      userId: 'usr_djt_1',
      username: 'JackpotPlayerOne',
      cardNumbers: [10, 11, 12, 13, 14],
      fingerprintSecret: 'secret_key_test'
    });
  });

  it('marks round as POSTPONED when cards < 100, without selecting a winner or issuing payout', () => {
    const evalRes = dailyJackpotService.evaluateDailyJackpot(postponeRound.id);
    expect(evalRes.status).toBe('POSTPONED');
    expect(evalRes.message).toContain('postponed');

    const updated = databaseService.getDailyJackpotRound(postponeRound.id)!;
    expect(updated.status).toBe('POSTPONED');
    expect(updated.winner_user_id).toBeFalsy();
    expect(updated.payout_status).toBe('PENDING');

    // Verify tickets remain intact (no loss of player funds)
    const tickets = databaseService.getDailyJackpotTickets(postponeRound.id);
    expect(tickets).toHaveLength(5);
  });
});

describe('Eligible Round Execution, Winner Selection & Payout (>= 100 Cards)', () => {
  let eligibleRound: any;
  const eligDate = '2099-03-03';

  beforeAll(() => {
    const cutoff = getAddisAbabaCutoff(eligDate);
    eligibleRound = databaseService.getOrCreateDailyJackpotRound(eligDate, cutoff);

    databaseService.updateWalletBalance('usr_djt_1', 200000);

    // Buy 100 cards to reach minimum required
    const cards = Array.from({ length: 100 }, (_, i) => i + 1);
    databaseService.purchaseDailyJackpotTickets({
      roundId: eligibleRound.id,
      userId: 'usr_djt_1',
      username: 'JackpotPlayerOne',
      cardNumbers: cards,
      fingerprintSecret: 'secret_key_test'
    });
  });

  it('selects a winner, executes atomic 100,000 ETB payout, and marks round COMPLETED', () => {
    const balanceBefore = databaseService.getWallet('usr_djt_1')!.balance;

    const evalRes = dailyJackpotService.evaluateDailyJackpot(eligibleRound.id);
    expect(evalRes.status).toBe('COMPLETED');
    expect(evalRes.winner).toBeDefined();
    expect(evalRes.winner?.jackpotAmount).toBe(100000);

    // Verify round in DB
    const roundInDb = databaseService.getDailyJackpotRound(eligibleRound.id)!;
    expect(roundInDb.status).toBe('COMPLETED');
    expect(roundInDb.payout_status).toBe('PAID');
    expect(roundInDb.jackpot_amount).toBe(100000);
    expect(roundInDb.winner_user_id).toBe('usr_djt_1');

    // Verify winner wallet credited
    const balanceAfter = databaseService.getWallet('usr_djt_1')!.balance;
    expect(balanceAfter).toBe(balanceBefore + 100000);

    // Verify ledger WIN_PAYOUT transaction
    const ledger = databaseService.getLedgerForUser('usr_djt_1');
    const winTx = ledger.find(l => l.game_id === eligibleRound.id && l.type === 'WIN_PAYOUT');
    expect(winTx).toBeDefined();
    expect(winTx!.amount).toBe(100000);
  });

  it('prevents double payout under duplicate execution or retry (Single Payout Idempotency)', () => {
    // Attempting to evaluate an already completed round must throw or reject
    expect(() => {
      dailyJackpotService.evaluateDailyJackpot(eligibleRound.id);
    }).toThrow(/already COMPLETED/);
  });
});

describe('Data Isolation & Security (Platform Cut Concealment)', () => {
  it('public state hides platform cut, while admin state exposes full internal accounting', () => {
    const publicState = dailyJackpotService.getPublicState();
    // Verify public state does NOT contain platform cut fields
    expect((publicState as any).platformCut).toBeUndefined();
    expect((publicState as any).platformRetained).toBeUndefined();
    expect((publicState as any).platform_retained_amount).toBeUndefined();

    // Verify admin state DOES expose internal accounting
    const adminState = dailyJackpotService.getAdminState();
    expect(adminState.currentRound.platform_retained_amount).toBeDefined();
    expect(adminState.currentRound.gross_sales).toBeDefined();
  });
});
