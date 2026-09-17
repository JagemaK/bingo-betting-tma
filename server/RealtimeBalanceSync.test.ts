import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { io as ClientSocket, Socket as ClientSocketType } from 'socket.io-client';
import { app, httpServer } from './index.js';
import { authService } from './AuthService.js';
import { databaseService } from './DatabaseService.js';

let BASE_URL: string;
let adminToken: string;
let adminUser: any;
let userToken: string;
let playerUser: any;
let clientSocket: ClientSocketType;

describe('Real-Time Balance Synchronization via Socket.io Test Suite', () => {
  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      httpServer.listen(0, '127.0.0.1', () => {
        const addr = httpServer.address() as any;
        BASE_URL = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });

    // 1. Create Admin
    adminUser = databaseService.getUserById('usr_admin_sync') || databaseService.createUser({
      id: 'usr_admin_sync',
      telegram_id: '999888777',
      username: 'SyncAdmin',
      referral_code: 'SYNCADMIN1',
      role: 'ADMIN'
    });
    const adminSession = databaseService.createSession(adminUser.id, adminUser.telegram_id);
    adminToken = adminSession.id;

    // 2. Create Customer Player
    const tgId = Math.floor(770000000 + Math.random() * 899999);
    const initData = authService.createSignedTelegramInitData(
      { id: tgId, first_name: 'SyncPlayer', username: `sync_player_${tgId}` },
      process.env.TELEGRAM_BOT_TOKEN || 'test_mock_bot_token_123456:ABCdefGHIjklMNOpqrSTUvwxYZ'
    );
    const authRes = await authService.authenticateTelegram(initData);
    const regRes = await authService.completeRegistration(authRes.tempToken!, `PlayerSync_${tgId}`);
    playerUser = regRes.user;
    userToken = regRes.sessionToken!;

    // 3. Connect client socket authenticated with user token
    clientSocket = ClientSocket(BASE_URL, {
      auth: { token: userToken },
      transports: ['websocket']
    });

    await new Promise<void>((resolve) => {
      clientSocket.on('connect', () => {
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (clientSocket && clientSocket.connected) {
      clientSocket.disconnect();
    }
    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });
  });

  it('1. Customer socket receives instant WALLET_UPDATED when Admin approves a deposit', async () => {
    // 1. Customer creates a deposit
    const depRes = await fetch(`${BASE_URL}/api/wallet/deposit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userToken}`
      },
      body: JSON.stringify({
        playerId: playerUser.playerId,
        amount: 250,
        paymentMethod: 'Telebirr',
        referenceId: `REF_SYNC_${Date.now()}`
      })
    });
    const depData = await depRes.json();
    expect(depRes.status).toBe(200);
    expect(depData.success).toBe(true);
    const depositId = depData.deposit.id;

    // 2. Set up socket listener for WALLET_UPDATED
    const walletUpdatePromise = new Promise<any>((resolve) => {
      clientSocket.once('WALLET_UPDATED', (payload: any) => {
        resolve(payload);
      });
    });

    // 3. Admin approves deposit
    const approveRes = await fetch(`${BASE_URL}/api/admin/deposits/${depositId}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      }
    });
    const approveData = await approveRes.json();
    expect(approveRes.status).toBe(200);
    expect(approveData.success).toBe(true);

    // 4. Customer's socket receives event with updated balance
    const walletPayload = await walletUpdatePromise;
    expect(walletPayload).toBeDefined();
    expect(walletPayload.playerId).toBe(playerUser.playerId);
    expect(walletPayload.type).toBe('DEPOSIT');
    expect(walletPayload.amount).toBe(250);
    expect(walletPayload.status).toBe('APPROVED');
    expect(walletPayload.balance).toBeGreaterThanOrEqual(250);
  });

  it('2. Customer socket receives DEPOSIT_REJECTED when Admin rejects a deposit', async () => {
    // 1. Customer creates another deposit
    const depRes = await fetch(`${BASE_URL}/api/wallet/deposit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userToken}`
      },
      body: JSON.stringify({
        playerId: playerUser.playerId,
        amount: 100,
        paymentMethod: 'Telebirr',
        referenceId: `REF_REJ_${Date.now()}`
      })
    });
    const depData = await depRes.json();
    expect(depRes.status).toBe(200);
    const depositId = depData.deposit.id;

    // 2. Set up socket listener for DEPOSIT_REJECTED
    const rejectPromise = new Promise<any>((resolve) => {
      clientSocket.once('DEPOSIT_REJECTED', (payload: any) => {
        resolve(payload);
      });
    });

    // 3. Admin rejects deposit
    const rejectRes = await fetch(`${BASE_URL}/api/admin/deposits/${depositId}/reject`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        reason: 'Invalid Telebirr reference ID'
      })
    });
    const rejectData = await rejectRes.json();
    expect(rejectRes.status).toBe(200);
    expect(rejectData.success).toBe(true);

    // 4. Customer's socket receives rejection notification
    const rejectPayload = await rejectPromise;
    expect(rejectPayload).toBeDefined();
    expect(rejectPayload.playerId).toBe(playerUser.playerId);
    expect(rejectPayload.depositId).toBe(depositId);
    expect(rejectPayload.reason).toBe('Invalid Telebirr reference ID');
  });

  it('3. Customer socket receives WALLET_UPDATED on manual admin balance adjustment', async () => {
    const adjustPromise = new Promise<any>((resolve) => {
      clientSocket.once('WALLET_UPDATED', (payload: any) => {
        resolve(payload);
      });
    });

    const adjRes = await fetch(`${BASE_URL}/api/admin/balance-adjustment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        targetPlayerId: playerUser.playerId,
        amount: 50,
        reason: 'VIP Promotion Bonus'
      })
    });
    const adjData = await adjRes.json();
    expect(adjRes.status).toBe(200);
    expect(adjData.success).toBe(true);

    const adjPayload = await adjustPromise;
    expect(adjPayload.playerId).toBe(playerUser.playerId);
    expect(adjPayload.type).toBe('ADMIN_ADJUSTMENT');
    expect(adjPayload.amount).toBe(50);
  });
});
