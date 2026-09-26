import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { app, httpServer } from './index.js';
import { authService, clearInitDataReplayCache } from './AuthService.js';
import { databaseService } from './DatabaseService.js';
import { authEndpointRateLimiter } from './RateLimiter.js';

let BASE_URL: string;
let agentToken: string;
let agentUser: any;
let adminToken: string;
let adminUser: any;

const TEST_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'test_mock_bot_token_123456:ABCdefGHIjklMNOpqrSTUvwxYZ';
const TEST_WEBHOOK_SECRET = 'super_secret_webhook_token_987654321';

describe('Phase 1 Security Remediation Verification Suite', () => {
  beforeAll(async () => {
    process.env.TELEGRAM_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;

    await new Promise<void>((resolve) => {
      httpServer.listen(0, '127.0.0.1', () => {
        const addr = httpServer.address() as any;
        BASE_URL = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });

    // 1. Create Admin
    adminUser = databaseService.getUserById('usr_phase1_admin') || databaseService.createUser({
      id: 'usr_phase1_admin',
      telegram_id: '999111222',
      username: 'Phase1Admin',
      referral_code: 'P1ADMIN',
      role: 'ADMIN'
    });
    const adminSession = databaseService.createSession(adminUser.id, adminUser.telegram_id);
    adminToken = adminSession.id;

    // 2. Create Agent
    agentUser = databaseService.getUserById('usr_phase1_agent') || databaseService.createUser({
      id: 'usr_phase1_agent',
      telegram_id: '999333444',
      username: 'Phase1Agent',
      referral_code: 'P1AGENT',
      role: 'AGENT'
    });
    const agentSession = databaseService.createSession(agentUser.id, agentUser.telegram_id);
    agentToken = agentSession.id;
  });

  afterAll(async () => {
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  // ═══════════════════════════════════════════════════════════
  // 1. TELEGRAM INITDATA REPLAY PROTECTION & MOCK TOKEN REJECTION
  // ═══════════════════════════════════════════════════════════
  describe('1. Telegram initData Replay & Token Hardening', () => {
    it('Detects and blocks identical initData replay when replay protection is enabled', async () => {
      clearInitDataReplayCache();
      const tgId = 5550001;
      const initData = authService.createSignedTelegramInitData(
        { id: tgId, first_name: 'ReplayTest', username: `replay_${tgId}` },
        TEST_BOT_TOKEN
      );

      // First verification succeeds
      const check1 = authService.verifyTelegramInitData(initData, TEST_BOT_TOKEN, 900, true);
      expect(check1.isValid).toBe(true);
      expect(check1.user?.id).toBe(tgId);

      // Second verification with identical payload is flagged as replay
      const check2 = authService.verifyTelegramInitData(initData, TEST_BOT_TOKEN, 900, true);
      expect(check2.isValid).toBe(false);
      expect(check2.error).toContain('replay detected');
    });

    it('authenticateTelegram blocks initData replay when preventReplay flag is true', async () => {
      clearInitDataReplayCache();
      const tgId = 5550002;
      const initData = authService.createSignedTelegramInitData(
        { id: tgId, first_name: 'ReplayAuth', username: `replayauth_${tgId}` },
        TEST_BOT_TOKEN
      );

      // First auth succeeds
      const res1 = await authService.authenticateTelegram(initData, TEST_BOT_TOKEN, undefined, true);
      expect(res1.success).toBe(true);

      // Second auth with same initData fails with replay error
      const res2 = await authService.authenticateTelegram(initData, TEST_BOT_TOKEN, undefined, true);
      expect(res2.success).toBe(false);
      expect(res2.error).toContain('replay detected');
    });

    it('Rejects mock bot token in production environment', async () => {
      const origEnv = process.env.NODE_ENV;
      try {
        process.env.NODE_ENV = 'production';
        const initData = authService.createSignedTelegramInitData(
          { id: 99999, first_name: 'ProdHacker' },
          'test_mock_bot_token_123456:ABCdefGHIjklMNOpqrSTUvwxYZ'
        );

        // Verification must be rejected in production
        const result = authService.verifyTelegramInitData(
          initData,
          'test_mock_bot_token_123456:ABCdefGHIjklMNOpqrSTUvwxYZ'
        );
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('Mock bot token is strictly forbidden in production');

        // authenticateTelegram must also reject mock token
        const authRes = await authService.authenticateTelegram(
          initData,
          'test_mock_bot_token_123456:ABCdefGHIjklMNOpqrSTUvwxYZ'
        );
        expect(authRes.success).toBe(false);
        expect(authRes.error).toContain('Mock bot token is strictly forbidden in production');
      } finally {
        process.env.NODE_ENV = origEnv;
      }
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 2. TELEGRAM WEBHOOK SECRET TOKEN VALIDATION
  // ═══════════════════════════════════════════════════════════
  describe('2. Telegram Webhook Secret Token Verification', () => {
    it('Rejects webhook update without secret token header with 401 Unauthorized', async () => {
      const res = await fetch(`${BASE_URL}/api/telegram/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ update_id: 12345 })
      });

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toContain('Missing X-Telegram-Bot-Api-Secret-Token');
    });

    it('Rejects webhook update with invalid secret token with 403 Forbidden', async () => {
      const res = await fetch(`${BASE_URL}/api/telegram/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Telegram-Bot-Api-Secret-Token': 'wrong_secret_token'
        },
        body: JSON.stringify({ update_id: 12345 })
      });

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toContain('Invalid webhook secret token');
    });

    it('Accepts webhook update with valid secret token', async () => {
      const res = await fetch(`${BASE_URL}/api/telegram/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Telegram-Bot-Api-Secret-Token': TEST_WEBHOOK_SECRET
        },
        body: JSON.stringify({
          update_id: 99999,
          message: {
            message_id: 1,
            from: { id: 1234567, is_bot: false, first_name: 'TestWebhook' },
            chat: { id: 1234567, type: 'private' },
            date: Math.floor(Date.now() / 1000),
            text: '/help'
          }
        })
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.method === 'sendMessage' || data.success === true).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 3. AGENT PRIVILEGE ESCALATION PREVENTION ON ADMIN ROUTES
  // ═══════════════════════════════════════════════════════════
  describe('3. Agent Privilege Escalation Prevention', () => {
    it('Blocks AGENT from /api/admin/users (403 Forbidden)', async () => {
      const res = await fetch(`${BASE_URL}/api/admin/users`, {
        headers: { Authorization: `Bearer ${agentToken}` }
      });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toBe('Forbidden: Admin authorization required');
    });

    it('Blocks AGENT from /api/admin/balance-adjustment (403 Forbidden)', async () => {
      const res = await fetch(`${BASE_URL}/api/admin/balance-adjustment`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${agentToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          targetPlayerId: 'usr_phase1_agent',
          amount: 5000,
          reason: 'Unauthorized agent adjustment'
        })
      });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toBe('Forbidden: Admin authorization required');
    });

    it('Blocks AGENT from /api/admin/audit-logs (403 Forbidden)', async () => {
      const res = await fetch(`${BASE_URL}/api/admin/audit-logs`, {
        headers: { Authorization: `Bearer ${agentToken}` }
      });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toBe('Forbidden: Admin authorization required');
    });

    it('Allows ADMIN to access /api/admin/users successfully', async () => {
      const res = await fetch(`${BASE_URL}/api/admin/users`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 4. RATE LIMITING ON AUTHENTICATION ENDPOINTS
  // ═══════════════════════════════════════════════════════════
  describe('4. Authentication Rate Limiting', () => {
    it('Rate limits authentication attempts when threshold is exceeded', async () => {
      const testKey = 'test_rate_limit_ip_123';
      authEndpointRateLimiter.reset(testKey);

      // Make 15 requests (allowed limit)
      for (let i = 0; i < 15; i++) {
        const check = authEndpointRateLimiter.isRateLimited(testKey);
        expect(check.limited).toBe(false);
        authEndpointRateLimiter.recordFailure(testKey);
      }

      // 16th request must be rate limited
      const checkBlocked = authEndpointRateLimiter.isRateLimited(testKey);
      expect(checkBlocked.limited).toBe(true);
      expect(checkBlocked.retryAfterSeconds).toBeGreaterThan(0);

      // Cleanup
      authEndpointRateLimiter.reset(testKey);
    });
  });
});
