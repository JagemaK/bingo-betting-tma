import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { httpServer, app } from './index.js';
import { authService } from './AuthService.js';
import { databaseService } from './DatabaseService.js';

const TEST_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'test_mock_bot_token_123456:ABCdefGHIjklMNOpqrSTUvwxYZ';
let BASE_URL: string;

describe('Cross-User Player Profile Isolation & Security Test Suite', () => {
  let tgIdA: number;
  let tgIdB: number;
  let initDataA: string;
  let initDataB: string;
  let userA: any;
  let userB: any;
  let tokenA: string;
  let tokenB: string;

  beforeAll(async () => {
    // Start HTTP server on dynamic port
    await new Promise<void>((resolve) => {
      httpServer.listen(0, '127.0.0.1', () => {
        const addr = httpServer.address() as any;
        BASE_URL = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });

    // Reset database to ensure clean, isolated testing
    databaseService.resetDatabase();

    // Account A: Telegram registration
    tgIdA = Math.floor(991000000 + Math.random() * 899999);
    initDataA = authService.createSignedTelegramInitData(
      { id: tgIdA, first_name: 'PlayerAlpha', username: `alpha_user_${tgIdA}` },
      TEST_BOT_TOKEN
    );

    const authResA = await authService.authenticateTelegram(initDataA);
    const regResA = await authService.completeRegistration(
      authResA.tempToken!,
      `AlphaUser_${tgIdA.toString().slice(-4)}`
    );
    userA = regResA.user;
    tokenA = regResA.sessionToken!;

    // Account B: Different Telegram account
    tgIdB = Math.floor(992000000 + Math.random() * 899999);
    initDataB = authService.createSignedTelegramInitData(
      { id: tgIdB, first_name: 'PlayerBeta', username: `beta_user_${tgIdB}` },
      TEST_BOT_TOKEN
    );

    const authResB = await authService.authenticateTelegram(initDataB);
    const regResB = await authService.completeRegistration(
      authResB.tempToken!,
      `BetaUser_${tgIdB.toString().slice(-4)}`
    );
    userB = regResB.user;
    tokenB = regResB.sessionToken!;
  });

  afterAll(async () => {
    (httpServer as any).closeAllConnections?.();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  it('1. GET /api/profile returns strictly the authenticated user A profile', async () => {
    const res = await fetch(`${BASE_URL}/api/profile`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.profile).toBeDefined();
    expect(data.profile.playerId).toBe(userA.playerId);
    expect(data.profile.username).toBe(userA.username);
    expect(data.profile.telegram_username).toBe(`alpha_user_${tgIdA}`);

    // Phone MUST NOT be hardcoded or fake (e.g. NOT '0912345678')
    expect(data.profile.phone).toBeNull();
    expect(data.profile.phone).not.toBe('0912345678');

    // Default clean stats for fresh account
    expect(data.profile.totalGamesPlayed).toBe(0);
    expect(data.profile.totalWonETB).toBe(0);
    expect(data.profile.currentStreak).toBe(0);
    expect(data.profile.xp).toBe(0);
    expect(data.profile.level).toBe(1);
    expect(data.profile.vipTier).toBe('BRONZE VIP');
  });

  it('2. GET /api/profile returns strictly the authenticated user B profile', async () => {
    const res = await fetch(`${BASE_URL}/api/profile`, {
      headers: { Authorization: `Bearer ${tokenB}` }
    });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.profile).toBeDefined();
    expect(data.profile.playerId).toBe(userB.playerId);
    expect(data.profile.username).toBe(userB.username);
    expect(data.profile.telegram_username).toBe(`beta_user_${tgIdB}`);
    expect(data.profile.phone).toBeNull();
    expect(data.profile.phone).not.toBe('0912345678');
  });

  it('3. User A gameplay and winnings do not leak into User B profile', async () => {
    // Record User A game participation in player_tickets
    const gameId1 = `game_iso_${Date.now()}_1`;
    const gameId2 = `game_iso_${Date.now()}_2`;
    const gameId3 = `game_iso_${Date.now()}_3`;

    databaseService.createGame({
      id: gameId1,
      roomId: 'room_iso',
      betPerCard: 20,
      serverSecret: 'sec_1',
      commitmentHash: 'hash_1'
    });
    databaseService.createGame({
      id: gameId2,
      roomId: 'room_iso',
      betPerCard: 20,
      serverSecret: 'sec_2',
      commitmentHash: 'hash_2'
    });
    databaseService.createGame({
      id: gameId3,
      roomId: 'room_iso',
      betPerCard: 20,
      serverSecret: 'sec_3',
      commitmentHash: 'hash_3'
    });

    databaseService.createPlayerTicket({
      id: `tkt_a1_${Date.now()}`,
      gameId: gameId1,
      cardNumber: 1,
      userId: userA.playerId,
      username: userA.username,
      gridJson: '{}',
      fingerprintHash: 'hash_a1'
    });
    const tktA2 = `tkt_a2_${Date.now()}`;
    databaseService.createPlayerTicket({
      id: tktA2,
      gameId: gameId2,
      cardNumber: 1,
      userId: userA.playerId,
      username: userA.username,
      gridJson: '{}',
      fingerprintHash: 'hash_a2'
    });
    const tktA3 = `tkt_a3_${Date.now()}`;
    databaseService.createPlayerTicket({
      id: tktA3,
      gameId: gameId3,
      cardNumber: 1,
      userId: userA.playerId,
      username: userA.username,
      gridJson: '{}',
      fingerprintHash: 'hash_a3'
    });

    // Record User A winning payouts in ledger
    databaseService.recordLedgerTransaction({
      userId: userA.playerId,
      username: userA.username,
      type: 'WIN_PAYOUT',
      amount: 450,
      description: 'Game 2 Bingo win',
      gameId: gameId2
    });
    databaseService.recordLedgerTransaction({
      userId: userA.playerId,
      username: userA.username,
      type: 'WIN_PAYOUT',
      amount: 350,
      description: 'Game 3 Bingo win',
      gameId: gameId3
    });

    // Record verified claims for consecutive win streak in games 3 and 2
    databaseService.recordBingoClaim({
      gameId: gameId2,
      ticketId: tktA2,
      userId: userA.playerId,
      payoutAmount: 450,
      patternType: 'LINE'
    });
    databaseService.recordBingoClaim({
      gameId: gameId3,
      ticketId: tktA3,
      userId: userA.playerId,
      payoutAmount: 350,
      patternType: 'LINE'
    });

    // Verify User A profile now displays dynamic stats
    const resA = await fetch(`${BASE_URL}/api/profile`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    const profileA = (await resA.json()).profile;

    expect(profileA.totalGamesPlayed).toBe(3);
    expect(profileA.totalWonETB).toBe(800); // 450 + 350
    expect(profileA.currentStreak).toBe(2); // won game 3 and game 2 consecutively
    expect(profileA.xp).toBeGreaterThan(0);

    // CRITICAL ISOLATION CHECK: Verify User B still has strictly ZERO games, ZERO winnings, ZERO streak
    const resB = await fetch(`${BASE_URL}/api/profile`, {
      headers: { Authorization: `Bearer ${tokenB}` }
    });
    const profileB = (await resB.json()).profile;

    expect(profileB.playerId).toBe(userB.playerId);
    expect(profileB.totalGamesPlayed).toBe(0);
    expect(profileB.totalWonETB).toBe(0);
    expect(profileB.currentStreak).toBe(0);
    expect(profileB.xp).toBe(0);
    expect(profileB.level).toBe(1);
    expect(profileB.vipTier).toBe('BRONZE VIP');
  });

  it('4. IDOR Protection: User A CANNOT access User B profile via playerId parameter', async () => {
    // User A passes User B's playerId in /api/user/profile/:playerId
    const res = await fetch(`${BASE_URL}/api/user/profile/${userB.playerId}`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toContain('Access denied');
  });

  it('5. IDOR Protection: User B CANNOT access User A profile via playerId parameter', async () => {
    const res = await fetch(`${BASE_URL}/api/user/profile/${userA.playerId}`, {
      headers: { Authorization: `Bearer ${tokenB}` }
    });
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toContain('Access denied');
  });

  it('6. Unauthenticated requests to /api/profile and /api/user/profile are rejected', async () => {
    const res1 = await fetch(`${BASE_URL}/api/profile`);
    expect(res1.status).toBe(401);

    const res2 = await fetch(`${BASE_URL}/api/user/profile/${userA.playerId}`);
    expect(res2.status).toBe(401);
  });

  it('7. GET /api/profile completely ignores client-provided playerId query params', async () => {
    // Attempting to pass ?playerId=...
    const res = await fetch(`${BASE_URL}/api/profile?playerId=${userB.playerId}`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    expect(res.status).toBe(200);

    const data = await res.json();
    // Must return User A, NOT User B
    expect(data.profile.playerId).toBe(userA.playerId);
    expect(data.profile.username).toBe(userA.username);
  });

  it('8. Actual phone number is preserved if registered with phone, but NEVER faked', async () => {
    // Seed a user with an actual registered phone number
    const realPhoneUser = databaseService.createUser({
      id: `usr_phone_${Date.now()}`,
      telegram_id: `tg_phone_${Date.now()}`,
      username: 'RealPhoneUser',
      phone: '0987654321',
      referral_code: 'REFPHONE',
      role: 'USER',
      account_status: 'ACTIVE',
      registration_status: 'COMPLETED'
    });

    const session = databaseService.createSession(realPhoneUser.id, realPhoneUser.telegram_id, 3600);
    const res = await fetch(`${BASE_URL}/api/profile`, {
      headers: { Authorization: `Bearer ${session.id}` }
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.profile.phone).toBe('+251987654321');
  });
});
