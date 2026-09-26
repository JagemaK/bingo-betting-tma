import { describe, it, expect, beforeEach } from 'vitest';
import path from 'path';
import { DatabaseService } from './DatabaseService.js';
import { LeaderboardService } from './LeaderboardService.js';
import { AuthService } from './AuthService.js';
import { verifyPassword } from './PasswordUtils.js';

describe('Authoritative Leaderboard, Hall of Fame & Account Integrity Regression Suite', () => {
  let db: DatabaseService;
  let lb: LeaderboardService;
  let auth: AuthService;

  beforeEach(() => {
    // Explicitly isolated in-memory test database instance
    db = new DatabaseService(':memory:');
    lb = new LeaderboardService(db);
    auth = new AuthService(db);
  });

  // TEST 1: Real winner appears with exact verified winnings and win count
  it('Test 1 — Real winner appears with correct payout and win count', () => {
    // Create real user
    const user = db.createUser({
      id: 'usr_real_winner_1',
      telegram_id: 'tg_real_1',
      username: 'LegitWinner1',
      role: 'USER',
      account_type: 'REAL'
    });

    // Create completed game
    db.createGame({
      id: 'game_001',
      roomId: 'room_10birr',
      betPerCard: 10,
      serverSecret: 'sec1',
      commitmentHash: 'hash1'
    });
    db.updateGameStatus('game_001', 'finished');

    // Create ticket & verified claim
    db.createPlayerTicket({
      id: 'tkt_001',
      gameId: 'game_001',
      cardNumber: 1,
      userId: user.id,
      username: user.username,
      gridJson: '{}',
      fingerprintHash: 'fp1'
    });

    db.createBingoClaim({
      gameId: 'game_001',
      ticketId: 'tkt_001',
      userId: user.id,
      payoutAmount: 250,
      patternType: 'Line'
    });

    const data = lb.getLeaderboardData(user.id);
    expect(data.topWinners.length).toBe(1);
    expect(data.topWinners[0].userId).toBe('usr_real_winner_1');
    expect(data.topWinners[0].name).toBe('LegitWinner1');
    expect(data.topWinners[0].totalWon).toBe(250);
    expect(data.topWinners[0].wins).toBe(1);
    expect(data.topWinners[0].gamesPlayed).toBe(1);
  });

  // TEST 2: Old fake leaderboard fictional users do NOT appear
  it('Test 2 — Fake leaderboard fictional users do not appear', () => {
    const data = lb.getLeaderboardData();
    const fictionalNames = [
      'HabeshaKing_777',
      'BingoQueen_VIP',
      'EthioStar_99',
      'AddisWinner_251',
      'ShegerLucky_7',
      'BoleMaster_21',
      'DiamondHands_7'
    ];

    for (const fake of fictionalNames) {
      const foundInWinners = data.topWinners.some((w) => w.name === fake);
      const foundInJackpots = data.recentJackpots.some((j) => j.username === fake);
      expect(foundInWinners, `Fictional user ${fake} was found in topWinners`).toBe(false);
      expect(foundInJackpots, `Fictional user ${fake} was found in recentJackpots`).toBe(false);
    }
  });

  // TEST 3: Bots do not rank even with balance or claims
  it('Test 3 — Bots do not appear in public rankings', () => {
    const bot = db.createUser({
      id: 'usr_bot_99',
      telegram_id: 'bot_99',
      username: 'SuperRichBot',
      role: 'USER',
      is_bot: true,
      account_type: 'BOT'
    });
    db.getOrCreateWallet(bot.id, 999999);

    db.createGame({
      id: 'game_bot_1',
      roomId: 'room_100birr',
      betPerCard: 100,
      serverSecret: 'sec_b',
      commitmentHash: 'hash_b'
    });
    db.updateGameStatus('game_bot_1', 'finished');

    db.createPlayerTicket({
      id: 'tkt_bot_1',
      gameId: 'game_bot_1',
      cardNumber: 1,
      userId: bot.id,
      username: bot.username,
      gridJson: '{}',
      fingerprintHash: 'fp_b'
    });

    db.createBingoClaim({
      gameId: 'game_bot_1',
      ticketId: 'tkt_bot_1',
      userId: bot.id,
      payoutAmount: 5000,
      patternType: 'Full House'
    });

    const data = lb.getLeaderboardData();
    expect(data.topWinners.some((w) => w.userId === bot.id)).toBe(false);
    expect(data.recentJackpots.some((j) => j.userId === bot.id)).toBe(false);

    const botStats = lb.getUserRankAndStats(bot.id);
    expect(botStats?.isRanked).toBe(false);
    expect(botStats?.rank).toBeNull();
  });

  // TEST 4: Test users and fixtures do not rank
  it('Test 4 — Test users do not rank in public rankings', () => {
    const testUser = db.createUser({
      id: 'usr_e2e_fixture',
      telegram_id: 'tg_test_1',
      username: 'E2E_Tester',
      role: 'USER',
      account_type: 'TEST'
    });

    db.createGame({
      id: 'game_test_1',
      roomId: 'room_10birr',
      betPerCard: 10,
      serverSecret: 'sec_t',
      commitmentHash: 'hash_t'
    });
    db.updateGameStatus('game_test_1', 'finished');

    db.createPlayerTicket({
      id: 'tkt_test_1',
      gameId: 'game_test_1',
      cardNumber: 1,
      userId: testUser.id,
      username: testUser.username,
      gridJson: '{}',
      fingerprintHash: 'fp_t'
    });

    db.createBingoClaim({
      gameId: 'game_test_1',
      ticketId: 'tkt_test_1',
      userId: testUser.id,
      payoutAmount: 300,
      patternType: 'Line'
    });

    const data = lb.getLeaderboardData();
    expect(data.topWinners.some((w) => w.userId === testUser.id)).toBe(false);
  });

  // TEST 5: Current user rank is dynamic and deterministic (including ties)
  it('Test 5 — Current user rank is dynamic with deterministic tie breaking', () => {
    const userA = db.createUser({ id: 'usr_dyn_a', username: 'PlayerA', account_type: 'REAL', created_at: '2026-01-01T00:00:00Z' });
    const userB = db.createUser({ id: 'usr_dyn_b', username: 'PlayerB', account_type: 'REAL', created_at: '2026-01-02T00:00:00Z' });
    const userC = db.createUser({ id: 'usr_dyn_c', username: 'PlayerC', account_type: 'REAL', created_at: '2026-01-03T00:00:00Z' });

    // Setup finished games
    for (let i = 1; i <= 3; i++) {
      db.createGame({ id: `game_dyn_${i}`, roomId: 'room_10birr', betPerCard: 10, serverSecret: `sec_${i}`, commitmentHash: `h_${i}` });
      db.updateGameStatus(`game_dyn_${i}`, 'finished');
    }

    // userA: 500 ETB
    db.createPlayerTicket({ id: 't_a', gameId: 'game_dyn_1', cardNumber: 1, userId: userA.id, username: userA.username, gridJson: '{}', fingerprintHash: 'fa' });
    db.createBingoClaim({ gameId: 'game_dyn_1', ticketId: 't_a', userId: userA.id, payoutAmount: 500, patternType: 'Line' });

    // userB: 1000 ETB
    db.createPlayerTicket({ id: 't_b', gameId: 'game_dyn_2', cardNumber: 1, userId: userB.id, username: userB.username, gridJson: '{}', fingerprintHash: 'fb' });
    db.createBingoClaim({ gameId: 'game_dyn_2', ticketId: 't_b', userId: userB.id, payoutAmount: 1000, patternType: 'Line' });

    // userC: 500 ETB (Tie with userA on total won, userA created earlier)
    db.createPlayerTicket({ id: 't_c', gameId: 'game_dyn_3', cardNumber: 1, userId: userC.id, username: userC.username, gridJson: '{}', fingerprintHash: 'fc' });
    db.createBingoClaim({ gameId: 'game_dyn_3', ticketId: 't_c', userId: userC.id, payoutAmount: 500, patternType: 'Line' });

    const rankA = lb.getUserRankAndStats(userA.id);
    const rankB = lb.getUserRankAndStats(userB.id);
    const rankC = lb.getUserRankAndStats(userC.id);

    expect(rankB?.rank).toBe(1); // 1000 ETB
    expect(rankA?.rank).toBe(2); // 500 ETB, created Jan 1
    expect(rankC?.rank).toBe(3); // 500 ETB, created Jan 3
  });

  // TEST 6: Zero-win user receives UNRANKED
  it('Test 6 — Zero-win user receives 0 winnings, 0 wins, and UNRANKED', () => {
    const userZero = db.createUser({ id: 'usr_zero_wins', username: 'UnluckyPlayer', account_type: 'REAL' });

    // Plays 3 games without winning
    for (let i = 1; i <= 3; i++) {
      db.createGame({ id: `game_z_${i}`, roomId: 'room_10birr', betPerCard: 10, serverSecret: `s_${i}`, commitmentHash: `h_${i}` });
      db.updateGameStatus(`game_z_${i}`, 'finished');
      db.createPlayerTicket({ id: `t_z_${i}`, gameId: `game_z_${i}`, cardNumber: 1, userId: userZero.id, username: userZero.username, gridJson: '{}', fingerprintHash: `fz_${i}` });
    }

    const stats = lb.getUserRankAndStats(userZero.id);
    expect(stats?.rank).toBeNull();
    expect(stats?.isRanked).toBe(false);
    expect(stats?.totalWonETB).toBe(0);
    expect(stats?.totalWins).toBe(0);
    expect(stats?.gamesPlayed).toBe(3);
  });

  // TEST 7: Multiple tickets do not inflate win count
  it('Test 7 — Multiple tickets do not inflate win count', () => {
    const userMulti = db.createUser({ id: 'usr_multi_tkt', username: 'MultiTicketGuy', account_type: 'REAL' });

    db.createGame({ id: 'game_multi', roomId: 'room_10birr', betPerCard: 10, serverSecret: 'sm', commitmentHash: 'hm' });
    db.updateGameStatus('game_multi', 'finished');

    // 4 tickets purchased for 1 game
    for (let i = 1; i <= 4; i++) {
      db.createPlayerTicket({ id: `t_m_${i}`, gameId: 'game_multi', cardNumber: i, userId: userMulti.id, username: userMulti.username, gridJson: '{}', fingerprintHash: `fm_${i}` });
    }

    // 1 verified winning claim
    db.createBingoClaim({ gameId: 'game_multi', ticketId: 't_m_1', userId: userMulti.id, payoutAmount: 160, patternType: 'Line' });

    const stats = lb.getUserRankAndStats(userMulti.id);
    expect(stats?.totalWins).toBe(1); // MUST BE 1, NOT 4!
    expect(stats?.gamesPlayed).toBe(1);
    expect(stats?.totalWonETB).toBe(160);
  });

  // TEST 8: Refunded / cancelled / active non-final games do not count
  it('Test 8 — Cancelled/refunded or active non-final games do not count in ranking', () => {
    const user = db.createUser({ id: 'usr_cancel_test', username: 'RefundPlayer', account_type: 'REAL' });

    // Active game (not finished)
    db.createGame({ id: 'game_active', roomId: 'room_10birr', betPerCard: 10, serverSecret: 'sa', commitmentHash: 'ha' });
    db.updateGameStatus('game_active', 'active');
    db.createPlayerTicket({ id: 't_act', gameId: 'game_active', cardNumber: 1, userId: user.id, username: user.username, gridJson: '{}', fingerprintHash: 'fa' });
    db.createBingoClaim({ gameId: 'game_active', ticketId: 't_act', userId: user.id, payoutAmount: 200, patternType: 'Line' });

    // Finished game with REFUNDED / CANCELLED claim
    db.createGame({ id: 'game_refunded', roomId: 'room_10birr', betPerCard: 10, serverSecret: 'sc', commitmentHash: 'hc' });
    db.updateGameStatus('game_refunded', 'finished');
    db.createPlayerTicket({ id: 't_can', gameId: 'game_refunded', cardNumber: 1, userId: user.id, username: user.username, gridJson: '{}', fingerprintHash: 'fc' });
    db.createBingoClaim({ gameId: 'game_refunded', ticketId: 't_can', userId: user.id, payoutAmount: 200, patternType: 'Line' });
    db.getDb().prepare("UPDATE bingo_claims SET status = 'REFUNDED' WHERE game_id = 'game_refunded'").run();

    const stats = lb.getUserRankAndStats(user.id);
    expect(stats?.totalWins).toBe(0);
    expect(stats?.totalWonETB).toBe(0);
    expect(stats?.isRanked).toBe(false);
  });

  // TEST 9: Daily Grand Jackpot completed and paid appears; pending/cancelled does not
  it('Test 9 — Daily Grand Jackpot: completed & paid appears; cancelled/pending does not', () => {
    const winnerA = db.createUser({ id: 'usr_dj_winner', username: 'JackpotHero', account_type: 'REAL' });
    const pendingB = db.createUser({ id: 'usr_dj_pending', username: 'UnpaidGuy', account_type: 'REAL' });

    // Completed & PAID round
    db.getDb().prepare(`
      INSERT INTO daily_jackpot_rounds (
        id, date_str, status, payout_status, jackpot_amount, winner_user_id, winner_username, paid_at, cutoff_at, created_at, updated_at
      ) VALUES ('round_paid', '2026-09-20', 'COMPLETED', 'PAID', 15000, ?, ?, datetime('now'), datetime('now'), datetime('now'), datetime('now'))
    `).run(winnerA.id, winnerA.username);

    // Cancelled / postponed / unpaid round
    db.getDb().prepare(`
      INSERT INTO daily_jackpot_rounds (
        id, date_str, status, payout_status, jackpot_amount, winner_user_id, winner_username, paid_at, cutoff_at, created_at, updated_at
      ) VALUES ('round_unpaid', '2026-09-21', 'POSTPONED', 'PENDING', 20000, ?, ?, NULL, datetime('now'), datetime('now'), datetime('now'))
    `).run(pendingB.id, pendingB.username);

    const jackpots = lb.getRecentJackpots();
    expect(jackpots.some((j) => j.userId === winnerA.id && j.amountETB === 15000)).toBe(true);
    expect(jackpots.some((j) => j.userId === pendingB.id)).toBe(false);

    const winnerStats = lb.getUserRankAndStats(winnerA.id);
    expect(winnerStats?.totalWonETB).toBe(15000);
    expect(winnerStats?.totalWins).toBe(1);
  });

  // TEST 10: Admin dashboard can view legitimate users without bot/test pollution
  it('Test 10 & 11 — Admin dashboard categorizes users and filters bots/test accounts', () => {
    db.createUser({ id: 'usr_real_cust', username: 'RealCustomer', account_type: 'REAL', role: 'USER' });
    db.createUser({ id: 'admin_super', username: 'AdminSuper', account_type: 'ADMIN', role: 'ADMIN' });
    db.createUser({ id: 'usr_bot_x', username: 'BotPlayer', account_type: 'BOT', is_bot: true });
    db.createUser({ id: 'usr_e2e_y', username: 'TestAccount', account_type: 'TEST' });
    db.createUser({ id: 'usr_guest_z', username: 'Guest_1234', account_type: 'GUEST' });

    // REAL filter: only Real customer
    const realUsers = auth.getAllUsers('REAL');
    expect(realUsers.some((u) => u.username === 'RealCustomer')).toBe(true);
    expect(realUsers.some((u) => u.username === 'BotPlayer')).toBe(false);
    expect(realUsers.some((u) => u.username === 'TestAccount')).toBe(false);
    expect(realUsers.some((u) => u.username === 'AdminSuper')).toBe(false);

    // BOTS filter: only bots
    const botUsers = auth.getAllUsers('BOT');
    expect(botUsers.some((u) => u.username === 'BotPlayer')).toBe(true);
    expect(botUsers.some((u) => u.username === 'RealCustomer')).toBe(false);

    // ADMIN filter: only admin
    const adminUsers = auth.getAllUsers('ADMIN');
    expect(adminUsers.some((u) => u.username === 'AdminSuper')).toBe(true);
    expect(adminUsers.some((u) => u.username === 'RealCustomer')).toBe(false);
  });

  // TEST 12: Test database safety guard prevents connection to production DB
  it('Test 12 — Test database guard prevents connecting to production DB in test runner', () => {
    const prodDbPath = path.resolve(process.cwd(), 'data', 'bingo.db');
    // Vitest runs in NODE_ENV=test
    expect(() => {
      new DatabaseService(prodDbPath);
    }).toThrow(/SECURITY CRITICAL: Test execution attempted to connect to persistent production database/i);
  });

  // TEST 13: Universal password fallback is completely disabled in production
  it('Test 13 — Universal password123 fallback is strictly rejected for unhashed accounts in production', () => {
    const originalEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';

      // Test verifyPassword with unhashed account (storedHash = null)
      const res = verifyPassword('password123', null, null);
      expect(res.isValid).toBe(false);

      // Even if storedHash is undefined
      const res2 = verifyPassword('password123', undefined, undefined);
      expect(res2.isValid).toBe(false);
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });
});
