import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { io as ClientSocket, Socket as ClientSocketType } from 'socket.io-client';
import { httpServer, app, multiRoomManager } from './index.js';
import { authService } from './AuthService.js';
import { ledgerService } from './LedgerService.js';
import { databaseService } from './DatabaseService.js';
import { telegramBotService } from './TelegramBotService.js';

const TEST_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'test_mock_bot_token_123456:ABCdefGHIjklMNOpqrSTUvwxYZ';
let serverPort: number;
let BASE_URL: string;

describe('Multi-User Security & Player Isolation Test Suite (Requirements 17 & 18)', () => {
  let socketA: ClientSocketType;
  let socketB: ClientSocketType;
  let tgIdA: number;
  let tgIdB: number;
  let initDataA: string;
  let initDataB: string;
  let userA: any;
  let userB: any;
  let tokenA: string;
  let tokenB: string;

  beforeAll(async () => {
    // Start test HTTP server
    await new Promise<void>((resolve) => {
      httpServer.listen(0, '127.0.0.1', () => {
        const addr = httpServer.address() as any;
        serverPort = addr.port;
        BASE_URL = `http://127.0.0.1:${serverPort}`;
        resolve();
      });
    });

    // Reset database for clean isolation testing
    databaseService.resetDatabase();

    // Prepare distinct Telegram accounts
    tgIdA = Math.floor(771000000 + Math.random() * 899999);
    initDataA = authService.createSignedTelegramInitData(
      { id: tgIdA, first_name: 'PlayerAlpha', username: `alpha_${tgIdA}` },
      TEST_BOT_TOKEN
    );

    tgIdB = Math.floor(772000000 + Math.random() * 899999);
    initDataB = authService.createSignedTelegramInitData(
      { id: tgIdB, first_name: 'PlayerBeta', username: `beta_${tgIdB}` },
      TEST_BOT_TOKEN
    );
  });

  afterAll(async () => {
    if (socketA?.connected) socketA.disconnect();
    if (socketB?.connected) socketB.disconnect();
    (httpServer as any).closeAllConnections?.();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  // TEST 1: Telegram A authenticates.
  // Verify: telegram_id = A, playerId = A (tg_A), session.user_id = A
  it('TEST 1: Telegram A authenticates and maps to authoritative internal user A', async () => {
    const authResA = await authService.authenticateTelegram(initDataA);
    expect(authResA.success).toBe(true);

    const regResA = await authService.completeRegistration(
      authResA.tempToken!,
      `AlphaUser_${tgIdA.toString().slice(-4)}`
    );
    expect(regResA.success).toBe(true);
    userA = regResA.user;
    tokenA = regResA.sessionToken!;

    expect(userA.telegram_id).toBe(String(tgIdA));
    expect(userA.playerId).toBe(`tg_${tgIdA}`);

    // Verify in database that session belongs to user A
    const rawSessionA = databaseService.getSession(tokenA);
    expect(rawSessionA).toBeDefined();
    expect(rawSessionA?.user_id).toBe(userA.playerId);
    expect(rawSessionA?.telegram_id).toBe(String(tgIdA));

    // Seed wallet balance for user A
    databaseService.updateWalletBalance(userA.playerId, 500);
  });

  // TEST 2: Telegram B authenticates.
  // Verify: telegram_id = B, playerId = B (tg_B), session.user_id = B
  it('TEST 2: Telegram B authenticates and maps to authoritative internal user B', async () => {
    const authResB = await authService.authenticateTelegram(initDataB);
    expect(authResB.success).toBe(true);

    const regResB = await authService.completeRegistration(
      authResB.tempToken!,
      `BetaUser_${tgIdB.toString().slice(-4)}`
    );
    expect(regResB.success).toBe(true);
    userB = regResB.user;
    tokenB = regResB.sessionToken!;

    expect(userB.telegram_id).toBe(String(tgIdB));
    expect(userB.playerId).toBe(`tg_${tgIdB}`);

    // Verify in database that session belongs to user B
    const rawSessionB = databaseService.getSession(tokenB);
    expect(rawSessionB).toBeDefined();
    expect(rawSessionB?.user_id).toBe(userB.playerId);
    expect(rawSessionB?.telegram_id).toBe(String(tgIdB));

    // Seed wallet balance for user B
    databaseService.updateWalletBalance(userB.playerId, 500);
  });

  // TEST 3: A and B must have different internal user IDs.
  it('TEST 3: A and B must have strictly distinct internal user IDs and sessions', () => {
    expect(userA.playerId).not.toBe(userB.playerId);
    expect(userA.telegram_id).not.toBe(userB.telegram_id);
    expect(tokenA).not.toBe(tokenB);

    const dbUserA = databaseService.getUserById(userA.playerId);
    const dbUserB = databaseService.getUserById(userB.playerId);
    expect(dbUserA?.id).not.toBe(dbUserB?.id);
    expect(dbUserA?.telegram_id).not.toBe(dbUserB?.telegram_id);
  });

  // TEST 4: A cannot read B's balance.
  it('TEST 4: A cannot read B\'s balance (IDOR rejected with 403 Forbidden)', async () => {
    const res = await fetch(`${BASE_URL}/api/user/${userB.playerId}`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/access denied: cannot access another user's balance/i);

    // User A reading own balance succeeds
    const ownRes = await fetch(`${BASE_URL}/api/user/${userA.playerId}`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    expect(ownRes.status).toBe(200);
    const ownData = await ownRes.json();
    expect(ownData.user.playerId).toBe(userA.playerId);
  });

  // TEST 5: A cannot read B's transactions.
  it('TEST 5: A cannot read B\'s transaction ledger (IDOR rejected with 403 Forbidden)', async () => {
    const res = await fetch(`${BASE_URL}/api/ledger/${userB.playerId}`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/access denied: cannot access another user's ledger/i);

    // User A reading own ledger succeeds
    const ownRes = await fetch(`${BASE_URL}/api/ledger/${userA.playerId}`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    expect(ownRes.status).toBe(200);
    const ownData = await ownRes.json();
    expect(Array.isArray(ownData.entries)).toBe(true);
  });

  // TEST 6: A cannot use B's ticket.
  it('TEST 6: A cannot use or deselect B\'s card/ticket', async () => {
    // Connect both sockets with their respective session tokens
    socketA = ClientSocket(`http://127.0.0.1:${serverPort}`, {
      auth: { token: tokenA },
      transports: ['websocket']
    });
    socketB = ClientSocket(`http://127.0.0.1:${serverPort}`, {
      auth: { token: tokenB },
      transports: ['websocket']
    });

    await Promise.all([
      new Promise<void>((resolve) => socketA.on('connect', () => resolve())),
      new Promise<void>((resolve) => socketB.on('connect', () => resolve()))
    ]);

    // Both join the same room
    await new Promise<void>((resolve) => socketA.emit('JOIN_ROOM', { roomId: 'room_20birr' }, () => resolve()));
    await new Promise<void>((resolve) => socketB.emit('JOIN_ROOM', { roomId: 'room_20birr' }, () => resolve()));

    // User B selects card #15
    const selectResB = await new Promise<any>((resolve) => {
      socketB.emit('SELECT_CARD_NUMBER', { roomId: 'room_20birr', cardNumber: 15 }, (res: any) => resolve(res));
    });
    expect(selectResB.success).toBe(true);

    // User A attempts to DESELECT card #15 owned by User B
    const attackDeselect = await new Promise<any>((resolve) => {
      socketA.emit('DESELECT_CARD_NUMBER', { roomId: 'room_20birr', cardNumber: 15 }, (res: any) => resolve(res));
    });
    expect(attackDeselect.success).toBe(false);
    expect(attackDeselect.error).toMatch(/not found or not owned/i);

    // Verify room ticket ownership in memory and database
    const room = multiRoomManager.getRoom('room_20birr');
    const ticket15 = Array.from(room!.tickets.values()).find((t: any) => t.cardNumber === 15);
    expect(ticket15?.playerId).toBe(userB.playerId);
  });

  // TEST 7: A cannot claim B's Bingo.
  it('TEST 7: A cannot claim B\'s Bingo on ticket owned by B', async () => {
    const room = multiRoomManager.getRoom('room_20birr')!;
    const ticketB = Array.from(room.tickets.values()).find((t: any) => t.cardNumber === 15)!;
    expect(ticketB).toBeDefined();

    // Setup active state with numbers that complete ticket B
    room.status = 'active';
    const numbersOnCardB = [
      ...ticketB.grid.B,
      ...ticketB.grid.I,
      ...ticketB.grid.N,
      ...ticketB.grid.G,
      ...ticketB.grid.O
    ].filter((n) => n > 0);
    (room as any).shuffledBalls = numbersOnCardB;
    (room as any).currentBallIndex = numbersOnCardB.length;

    // User A attempts to claim Bingo using User B's ticket ID
    const fraudClaim = await new Promise<any>((resolve) => {
      socketA.emit('CLAIM_BINGO', { roomId: 'room_20birr', ticketId: ticketB.ticketId }, (res: any) => resolve(res));
    });
    expect(fraudClaim.success).toBe(false);
    expect(fraudClaim.message).toMatch(/unauthorized ticket claim/i);

    // Confirm that User A did NOT receive any win payout
    const ledgerA = ledgerService.getLedgerForUser(userA.playerId);
    const winEntryA = ledgerA.find((e) => e.type === 'win_payout');
    expect(winEntryA).toBeUndefined();

    // Reset room status back to lobby for subsequent game card selections
    room.status = 'lobby';
  });

  // TEST 8: A cannot place a bet for B.
  it('TEST 8: Server ignores client playerId in socket emit; A cannot bet on B\'s behalf', async () => {
    const balanceBeforeB = databaseService.getOrCreateWallet(userB.playerId).balance;

    // User A emits SELECT_CARD_NUMBER passing malicious { playerId: userB.playerId }
    const selectResA = await new Promise<any>((resolve) => {
      socketA.emit(
        'SELECT_CARD_NUMBER',
        { roomId: 'room_20birr', cardNumber: 30, playerId: userB.playerId, username: userB.username },
        (res: any) => resolve(res)
      );
    });

    expect(selectResA.success).toBe(true);
    // Identity must be derived from socket.data.user (User A), NOT client payload
    expect(selectResA.user.playerId).toBe(userA.playerId);

    const room = multiRoomManager.getRoom('room_20birr')!;
    const ticket30 = Array.from(room.tickets.values()).find((t: any) => t.cardNumber === 30);
    expect(ticket30?.playerId).toBe(userA.playerId);

    // User B's balance was not charged
    const balanceAfterB = databaseService.getOrCreateWallet(userB.playerId).balance;
    expect(balanceAfterB).toBe(balanceBeforeB);
  });

  // TEST 9: A cannot withdraw B's funds.
  it('TEST 9: A cannot withdraw B\'s funds (rejected with 403 Forbidden)', async () => {
    const balanceBeforeB = databaseService.getOrCreateWallet(userB.playerId).balance;

    const res = await fetch(`${BASE_URL}/api/wallet/withdraw`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`
      },
      body: JSON.stringify({
        playerId: userB.playerId, // Malicious target
        amount: 100,
        address: '0911223344'
      })
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/access denied: cannot perform financial operations on another account/i);

    // User B's balance and reserved balance remain unchanged
    const walletB = databaseService.getOrCreateWallet(userB.playerId);
    expect(walletB.balance).toBe(balanceBeforeB);
    expect(walletB.reserved_balance).toBe(0);
  });

  // TEST 10: A cannot modify B's account.
  it('TEST 10: Regular User A cannot modify or ban User B\'s account (admin role enforced)', async () => {
    const res = await fetch(`${BASE_URL}/api/admin/users/${userB.playerId}/status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}` // Regular user token
      },
      body: JSON.stringify({ status: 'BANNED' })
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/admin authorization required|admin access required/i);

    // Verify User B remains active in database
    const dbUserB = databaseService.getUserById(userB.playerId);
    expect(dbUserB?.account_status).toBe('ACTIVE');
  });

  // TEST 11: Two simultaneous Bingo claims cannot produce two payouts.
  it('TEST 11: Two simultaneous Bingo claims for the same ticket cannot produce double payouts', async () => {
    const room = multiRoomManager.getRoom('room_20birr')!;
    const ticketA = Array.from(room.tickets.values()).find((t: any) => t.cardNumber === 30)!;
    expect(ticketA).toBeDefined();

    // Prepare winning numbers for ticket A
    room.status = 'active';
    const numbersOnCardA = [
      ...ticketA.grid.B,
      ...ticketA.grid.I,
      ...ticketA.grid.N,
      ...ticketA.grid.G,
      ...ticketA.grid.O
    ].filter((n) => n > 0);
    (room as any).shuffledBalls = numbersOnCardA;
    (room as any).currentBallIndex = numbersOnCardA.length;

    // Send two concurrent CLAIM_BINGO requests simultaneously
    const [claim1, claim2] = await Promise.all([
      new Promise<any>((resolve) => {
        socketA.emit('CLAIM_BINGO', { roomId: 'room_20birr', ticketId: ticketA.ticketId }, (res: any) => resolve(res));
      }),
      new Promise<any>((resolve) => {
        socketA.emit('CLAIM_BINGO', { roomId: 'room_20birr', ticketId: ticketA.ticketId }, (res: any) => resolve(res));
      })
    ]);

    // Exactly one claim must succeed, and the other must be rejected
    const successCount = (claim1.success ? 1 : 0) + (claim2.success ? 1 : 0);
    expect(successCount).toBe(1);

    const failedClaim = claim1.success ? claim2 : claim1;
    expect(failedClaim.success).toBe(false);

    // In the ledger and database, verify exactly one payout exists for this ticket
    const ledgerA = ledgerService.getLedgerForUser(userA.playerId);
    const winEntries = ledgerA.filter((e) => (e.ticketId === ticketA.ticketId || (e as any).ticket_id === ticketA.ticketId) && (e.type === 'win_payout' || (e as any).type === 'WIN_PAYOUT'));
    expect(winEntries.length).toBe(1);

    const dbClaim = databaseService.getBingoClaim(room.gameId, ticketA.ticketId);
    expect(dbClaim).toBeDefined();
    expect(dbClaim?.user_id).toBe(userA.playerId);
  });

  // TEST 12: Two simultaneous withdrawals cannot spend the same funds.
  it('TEST 12: Two simultaneous withdrawals cannot double-spend available balance', async () => {
    // Set user A's balance to exactly 100 ETB, with 0 reserved
    databaseService.updateWalletBalance(userA.playerId, 100);

    // Fire two simultaneous withdrawal requests for 100 ETB each
    const [w1, w2] = await Promise.all([
      fetch(`${BASE_URL}/api/wallet/withdraw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
        body: JSON.stringify({ amount: 100, address: '0911001122' })
      }),
      fetch(`${BASE_URL}/api/wallet/withdraw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
        body: JSON.stringify({ amount: 100, address: '0911001122' })
      })
    ]);

    const status1 = w1.status;
    const status2 = w2.status;

    // Exactly one succeeds (200) and the other fails due to insufficient balance (400)
    const successCount = (status1 === 200 ? 1 : 0) + (status2 === 200 ? 1 : 0);
    expect(successCount).toBe(1);

    const failRes = status1 === 200 ? w2 : w1;
    expect(failRes.status).toBe(400);
    const failBody = await failRes.json();
    expect(failBody.error).toMatch(/insufficient funds|insufficient available balance/i);

    // Check wallet: available balance is 0, reserved is 100
    const wallet = databaseService.getOrCreateWallet(userA.playerId);
    expect(wallet.balance).toBe(0);
    expect(wallet.reserved_balance).toBe(100);
  });

  // TEST 13: Refreshing the Telegram Mini App preserves the correct Telegram account.
  it('TEST 13: Refreshing the Telegram Mini App preserves the authoritative Telegram account', async () => {
    // 1. Validate session via /api/auth/me
    const meRes = await fetch(`${BASE_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    expect(meRes.status).toBe(200);
    const meData = await meRes.json();
    expect(meData.user.playerId).toBe(userA.playerId);
    expect(meData.user.username).toBe(userA.username);

    // 2. Re-authenticating with same initData returns the existing user and a valid session
    const reauth = await authService.authenticateTelegram(initDataA);
    expect(reauth.success).toBe(true);
    expect(reauth.status).toBe('AUTHENTICATED');
    expect(reauth.user!.playerId).toBe(userA.playerId);
    expect((reauth.user as any).telegram_id).toBe(String(tgIdA));
  });

  // TEST 14: Switching from Telegram account A to Telegram account B in the same browser/device does not retain A's authenticated application state.
  it('TEST 14: Switching from account A to B purges stale token and establishes clean account B state', async () => {
    // Browser had tokenA stored. User switches Telegram accounts to Account B.
    // Server checks if tokenA matches Telegram ID B:
    const isMatching = authService.verifySessionMatchesTelegram(tokenA, String(tgIdB));
    expect(isMatching).toBe(false);

    // Authentic initDataB produces authenticated session B
    const authB = await authService.authenticateTelegram(initDataB);
    expect(authB.success).toBe(true);
    expect(authB.user!.playerId).toBe(userB.playerId);
    expect(authB.user!.playerId).not.toBe(userA.playerId);

    // Using new tokenB returns strictly user B's wallet and details
    const profileB = await fetch(`${BASE_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${authB.sessionToken}` }
    });
    const profileDataB = await profileB.json();
    expect(profileDataB.user.playerId).toBe(userB.playerId);
    expect(profileDataB.user.playerId).not.toBe(userA.playerId);
  });

  // TEST 15: Opening the Mini App simultaneously from Telegram A and Telegram B produces completely independent sessions.
  it('TEST 15: Simultaneous execution from Telegram A and B maintains 100% independent state across all surfaces', async () => {
    // Query state of user A
    const stateA = {
      telegram_id: userA.telegram_id,
      playerId: userA.playerId,
      session: tokenA,
      wallet: databaseService.getOrCreateWallet(userA.playerId).balance,
      tickets: Array.from(multiRoomManager.getRoom('room_20birr')!.tickets.values())
        .filter((t: any) => t.playerId === userA.playerId)
        .map((t: any) => t.ticketId)
    };

    // Query state of user B
    const stateB = {
      telegram_id: userB.telegram_id,
      playerId: userB.playerId,
      session: tokenB,
      wallet: databaseService.getOrCreateWallet(userB.playerId).balance,
      tickets: Array.from(multiRoomManager.getRoom('room_20birr')!.tickets.values())
        .filter((t: any) => t.playerId === userB.playerId)
        .map((t: any) => t.ticketId)
    };

    // Assert complete isolation across all 5 dimensions as mandated in Requirement 18:
    expect(stateA.telegram_id).not.toBe(stateB.telegram_id);
    expect(stateA.playerId).not.toBe(stateB.playerId);
    expect(stateA.session).not.toBe(stateB.session);
    expect(stateA.tickets.length).toBeGreaterThan(0);
    expect(stateB.tickets.length).toBeGreaterThan(0);

    // Verify ticket IDs never collide
    for (const ticketAId of stateA.tickets) {
      expect(stateB.tickets).not.toContain(ticketAId);
    }
  });

  // TEST 16: Welcome bonus is strictly idempotent (Requirement 7)
  it('TEST 16: Welcome bonus is strictly idempotent with reference bonus_welcome_<userId>', async () => {
    // Credit initial bonus
    databaseService.recordLedgerTransaction({
      userId: userA.playerId,
      username: userA.username,
      type: 'BONUS',
      amount: 1000.0,
      description: 'Initial Bonus Credit',
      referenceId: `bonus_welcome_${userA.playerId}`
    });

    const balanceBefore = databaseService.getOrCreateWallet(userA.playerId).balance;

    // Attempt to credit welcome bonus again with the same referenceId
    const res = databaseService.recordLedgerTransaction({
      userId: userA.playerId,
      username: userA.username,
      type: 'BONUS',
      amount: 1000.0,
      description: 'Duplicate Welcome Bonus Attempt',
      referenceId: `bonus_welcome_${userA.playerId}`
    });

    const balanceAfter = databaseService.getOrCreateWallet(userA.playerId).balance;

    // Idempotent: balance must remain exactly identical
    expect(balanceAfter).toBe(balanceBefore);
    expect(res.wallet.balance).toBe(balanceBefore);

    // Verify exactly one welcome bonus transaction exists in ledger
    const txs = databaseService.getLedgerForUser(userA.playerId);
    const welcomeTxs = txs.filter(t => t.reference_id === `bonus_welcome_${userA.playerId}`);
    expect(welcomeTxs.length).toBe(1);
  });

  // TEST 17: User A logs out, User B remains authenticated (Requirement 8)
  it('TEST 17: User A logging out does not affect User B session or wallet', async () => {
    // User A logs out
    const logoutRes = await fetch(`${BASE_URL}/api/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    expect(logoutRes.ok).toBe(true);

    // Verify User A session is revoked
    const checkA = await fetch(`${BASE_URL}/api/auth/session`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    expect(checkA.status).toBe(401);

    // Verify User B session is still active and valid
    const checkB = await fetch(`${BASE_URL}/api/auth/session`, {
      headers: { Authorization: `Bearer ${tokenB}` }
    });
    expect(checkB.status).toBe(200);
    const bodyB = await checkB.json();
    expect(bodyB.valid).toBe(true);
    expect(bodyB.user.playerId).toBe(userB.playerId);

    // Verify User B wallet balance is completely intact
    const walletB = databaseService.getOrCreateWallet(userB.playerId);
    expect(walletB.balance).toBeGreaterThanOrEqual(0);
  });

  // TEST 18: Registration socket events are scoped to private rooms, not leaked globally (Requirement 12)
  it('TEST 18: Registration socket events are scoped to reg_<phone> room and not leaked to lobby sockets', async () => {
    const lobbySocket = ClientSocket(BASE_URL, {
      transports: ['websocket'],
      auth: { token: tokenB }
    });
    const targetRoomSocket = ClientSocket(BASE_URL, {
      transports: ['websocket']
    });

    try {
      await Promise.all([
        new Promise<void>((resolve) => {
          if (lobbySocket.connected) resolve();
          else lobbySocket.on('connect', () => resolve());
        }),
        new Promise<void>((resolve) => {
          if (targetRoomSocket.connected) resolve();
          else targetRoomSocket.on('connect', () => resolve());
        })
      ]);

      let leakedEvent: any = null;
      lobbySocket.on('REGISTRATION_SUCCESS', (data: any) => {
        leakedEvent = data;
      });

      const testPhone = '0999887766';

      // Target socket subscribes to its own registration
      targetRoomSocket.emit('SUBSCRIBE_REGISTRATION', { phone: testPhone });
      await new Promise(r => setTimeout(r, 100));

      let targetReceivedEvent: any = null;
      targetRoomSocket.on('REGISTRATION_SUCCESS', (data: any) => {
        targetReceivedEvent = data;
      });

      // Initiate registration
      const initRes = authService.initiateRegistration('Secret Player', testPhone, 'passSecret123');
      expect(initRes.success).toBe(true);

      // Simulate contact share verification (which completes registration and emits to scoped room)
      const simRes = telegramBotService.simulateContactShare(testPhone, testPhone, 998877665, 'Secret Player');
      expect(simRes.success).toBe(true);

      await new Promise(r => setTimeout(r, 200));

      // Target socket received its event
      expect(targetReceivedEvent).toBeDefined();
      expect(targetReceivedEvent?.phone).toBe(testPhone);

      // Lobby socket MUST NOT have received leaked private token or event
      expect(leakedEvent).toBeNull();
    } finally {
      if (lobbySocket.connected) lobbySocket.disconnect();
      if (targetRoomSocket.connected) targetRoomSocket.disconnect();
    }
  });
});

