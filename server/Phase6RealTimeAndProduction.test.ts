import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { io as ClientSocket, Socket as ClientSocketType } from 'socket.io-client';
import { app, httpServer, multiRoomManager } from './index.js';
import { authService } from './AuthService.js';
import { databaseService } from './DatabaseService.js';
import crypto from 'crypto';

let BASE_URL: string;
let verifiedUserToken: string;
let verifiedUser: any;

describe('Phase 6: Real-Time Socket Architecture, Error Handling, Monitoring & Production Readiness', () => {
  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      httpServer.listen(0, '127.0.0.1', () => {
        const addr = httpServer.address() as any;
        BASE_URL = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });

    // Create a verified player account for socket testing
    const tgId = `995000${Math.floor(Math.random() * 899999)}`;
    verifiedUser = databaseService.createUser({
      id: `usr_phase6_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      telegram_id: tgId,
      username: `Phase6Player_${tgId.slice(-4)}`,
      referral_code: `P6_${tgId.slice(-4)}`,
      role: 'USER',
      phone: `+251915${Math.floor(100000 + Math.random() * 899999)}`,
      account_status: 'ACTIVE',
      account_type: 'REAL'
    });
    const session = databaseService.createSession(verifiedUser.id, verifiedUser.telegram_id);
    verifiedUserToken = session.id;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  // TEST 1: Health check endpoint with system metrics
  it('1. GET /api/health: Returns production status, WAL database mode, and metrics', async () => {
    const res = await fetch(`${BASE_URL}/api/health`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('ok');
    expect(data.database.status).toBe('connected');
    expect(data.database.mode).toBe('WAL');
    expect(typeof data.uptime).toBe('number');
    expect(typeof data.system.heapUsedMb).toBe('number');
    expect(data.rooms.total).toBeGreaterThanOrEqual(1);
    expect(typeof data.sockets.connectedClients).toBe('number');
  });

  // TEST 2: Liveness probe endpoint
  it('2. GET /api/health/liveness: Returns 200 OK with live status', async () => {
    const res = await fetch(`${BASE_URL}/api/health/liveness`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('live');
    expect(data.timestamp).toBeDefined();
  });

  // TEST 3: Readiness probe endpoint
  it('3. GET /api/health/readiness: Returns 200 OK and database connectivity', async () => {
    const res = await fetch(`${BASE_URL}/api/health/readiness`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('ready');
    expect(data.database).toBe('connected');
  });

  // TEST 4: Global Express Error Handling Middleware formats unhandled errors cleanly
  it('4. Global Error Handler: Responds with clean JSON and prevents stack trace leakage', async () => {
    const res = await fetch(`${BASE_URL}/api/test-error-handling`);
    expect(res.status).toBe(418);
    const data = await res.json();
    expect(data.error).toBe('Test controlled server error');
    expect(data.status).toBe(418);
    // Ensure stack trace is not included in API response
    expect(data.stack).toBeUndefined();
  });

  // TEST 5: Socket.io Handshake Authentication
  it('5. Socket.io: Connects and authenticates via handshake auth token', async () => {
    const socket: ClientSocketType = ClientSocket(BASE_URL, {
      auth: { token: verifiedUserToken },
      transports: ['websocket']
    });

    await new Promise<void>((resolve) => {
      socket.on('connect', () => resolve());
    });

    expect(socket.connected).toBe(true);

    // Verify socket received initial LOBBY_OVERVIEW
    const lobbyOverview = await new Promise<any[]>((resolve) => {
      socket.on('LOBBY_OVERVIEW', (rooms) => resolve(rooms));
    });

    expect(Array.isArray(lobbyOverview)).toBe(true);
    expect(lobbyOverview.length).toBeGreaterThanOrEqual(1);

    socket.disconnect();
  });

  // TEST 6: Socket.io Dynamic Authentication via AUTHENTICATE_SOCKET
  it('6. Socket.io: Dynamically authenticates anonymous socket via AUTHENTICATE_SOCKET', async () => {
    const socket: ClientSocketType = ClientSocket(BASE_URL, {
      transports: ['websocket']
    });

    await new Promise<void>((resolve) => {
      socket.on('connect', () => resolve());
    });

    // Authenticate with valid token via callback
    const authResult = await new Promise<any>((resolve) => {
      socket.emit('AUTHENTICATE_SOCKET', { token: verifiedUserToken }, (res: any) => {
        resolve(res);
      });
    });

    expect(authResult.success).toBe(true);
    expect(authResult.playerId).toBe(verifiedUser.id);
    expect(authResult.role).toBe('USER');

    socket.disconnect();
  });

  // TEST 7: Socket.io Dynamic Authentication Rejection on Invalid Token
  it('7. Socket.io: Rejects invalid session token with error on AUTHENTICATE_SOCKET', async () => {
    const socket: ClientSocketType = ClientSocket(BASE_URL, {
      transports: ['websocket']
    });

    await new Promise<void>((resolve) => {
      socket.on('connect', () => resolve());
    });

    const authResult = await new Promise<any>((resolve) => {
      socket.emit('AUTHENTICATE_SOCKET', { token: 'invalid_expired_token_12345' }, (res: any) => {
        resolve(res);
      });
    });

    expect(authResult.success).toBe(false);
    expect(authResult.error).toMatch(/Invalid or expired session token/i);

    socket.disconnect();
  });

  // TEST 8: Socket.io De-Authentication (Logout cleanup)
  it('8. Socket.io: Cleans up rooms and session on DEAUTHENTICATE_SOCKET', async () => {
    const socket: ClientSocketType = ClientSocket(BASE_URL, {
      auth: { token: verifiedUserToken },
      transports: ['websocket']
    });

    await new Promise<void>((resolve) => {
      socket.on('connect', () => resolve());
    });

    const deauthRes = await new Promise<any>((resolve) => {
      socket.emit('DEAUTHENTICATE_SOCKET', (res: any) => {
        resolve(res);
      });
    });

    expect(deauthRes.success).toBe(true);

    // After de-auth, balance-affecting actions are blocked
    const selectRes = await new Promise<any>((resolve) => {
      socket.emit('SELECT_CARD_NUMBER', { roomId: 'room_10birr', cardNumber: 1 }, (res: any) => {
        resolve(res);
      });
    });

    expect(selectRes.success).toBe(false);
    expect(selectRes.error).toMatch(/Authentication required/i);

    socket.disconnect();
  });

  // TEST 9: Socket.io Room State Reconnection Resync (RESYNC_ROOM_STATE)
  it('9. Socket.io: Resyncs active room state and user tickets on RESYNC_ROOM_STATE', async () => {
    const socket: ClientSocketType = ClientSocket(BASE_URL, {
      auth: { token: verifiedUserToken },
      transports: ['websocket']
    });

    await new Promise<void>((resolve) => {
      socket.on('connect', () => resolve());
    });

    // Request room resync
    const resyncRes = await new Promise<any>((resolve) => {
      socket.emit('RESYNC_ROOM_STATE', { roomId: 'room_10birr' }, (res: any) => {
        resolve(res);
      });
    });

    expect(resyncRes.success).toBe(true);
    expect(resyncRes.state).toBeDefined();
    expect(resyncRes.state.roomId).toBe('room_10birr');
    expect(Array.isArray(resyncRes.myTickets)).toBe(true);

    socket.disconnect();
  });

  // TEST 10: Strict Socket Security: Unauthenticated sockets cannot perform game actions
  it('10. Socket.io: Anonymous sockets are strictly blocked from betting and claiming', async () => {
    const socket: ClientSocketType = ClientSocket(BASE_URL, {
      transports: ['websocket']
    });

    await new Promise<void>((resolve) => {
      socket.on('connect', () => resolve());
    });

    // 1. Cannot select card
    const selectRes = await new Promise<any>((resolve) => {
      socket.emit('SELECT_CARD_NUMBER', { roomId: 'room_10birr', cardNumber: 5 }, (res: any) => {
        resolve(res);
      });
    });
    expect(selectRes.success).toBe(false);
    expect(selectRes.error).toMatch(/Authentication required/i);

    // 2. Cannot lock multiple cards
    const lockRes = await new Promise<any>((resolve) => {
      socket.emit('LOCK_MULTIPLE_CARDS', { roomId: 'room_10birr', cardNumbers: [1, 2] }, (res: any) => {
        resolve(res);
      });
    });
    expect(lockRes.success).toBe(false);
    expect(lockRes.error).toMatch(/Authentication required/i);

    // 3. Cannot claim bingo
    const claimRes = await new Promise<any>((resolve) => {
      socket.emit('CLAIM_BINGO', { roomId: 'room_10birr', ticketId: 'fake_ticket_id' }, (res: any) => {
        resolve(res);
      });
    });
    expect(claimRes.success).toBe(false);
    expect(claimRes.message).toMatch(/Authentication required/i);

    socket.disconnect();
  });

  // TEST 11: Socket disconnect handling
  it('11. Socket.io: Disconnects cleanly without unhandled server exceptions', async () => {
    const socket: ClientSocketType = ClientSocket(BASE_URL, {
      auth: { token: verifiedUserToken },
      transports: ['websocket']
    });

    await new Promise<void>((resolve) => {
      socket.on('connect', () => resolve());
    });

    expect(socket.connected).toBe(true);
    socket.disconnect();
    expect(socket.connected).toBe(false);

    // Verify server remains healthy and responsive
    const health = await fetch(`${BASE_URL}/api/health/liveness`);
    expect(health.status).toBe(200);
  });
});
