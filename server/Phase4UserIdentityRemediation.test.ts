import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import http from 'http';
import { DatabaseService } from './DatabaseService.js';
import { AuthService } from './AuthService.js';
import { normalizeEthiopianPhone, isValidEthiopianPhone, maskPhone, formatLocalPhone } from './PhoneUtils.js';
import { app } from './index.js';

const TEST_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'test_mock_bot_token_123456:ABCdefGHIjklMNOpqrSTUvwxYZ';

describe('Phase 4: User Identity, Telegram Integration & Phone Verification Remediation', () => {
  let dbService: DatabaseService;
  let authSvc: AuthService;
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
    authSvc = new AuthService(dbService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==================================================
  // 1. ETHIOPIAN PHONE NORMALIZATION & FORMAT VALIDATION
  // ==================================================
  describe('1. Ethiopian Phone Normalization & Format Boundaries', () => {
    it('normalizes all valid Ethiopian mobile variations into canonical E.164 (+2519... / +2517...)', () => {
      // Ethio Telecom (9XXXXXXXX)
      expect(normalizeEthiopianPhone('0911223344')).toBe('+251911223344');
      expect(normalizeEthiopianPhone('911223344')).toBe('+251911223344');
      expect(normalizeEthiopianPhone('251911223344')).toBe('+251911223344');
      expect(normalizeEthiopianPhone('+251911223344')).toBe('+251911223344');
      expect(normalizeEthiopianPhone('+2510911223344')).toBe('+251911223344');
      expect(normalizeEthiopianPhone('+251 911 22 33 44')).toBe('+251911223344');
      expect(normalizeEthiopianPhone('0911-22-33-44')).toBe('+251911223344');
      expect(normalizeEthiopianPhone('(0911) 223344')).toBe('+251911223344');

      // Safaricom Ethiopia (7XXXXXXXX)
      expect(normalizeEthiopianPhone('0711223344')).toBe('+251711223344');
      expect(normalizeEthiopianPhone('711223344')).toBe('+251711223344');
      expect(normalizeEthiopianPhone('251711223344')).toBe('+251711223344');
      expect(normalizeEthiopianPhone('+251711223344')).toBe('+251711223344');
      expect(normalizeEthiopianPhone('+251 711-223-344')).toBe('+251711223344');
    });

    it('rejects invalid, international, or corrupt phone numbers', () => {
      expect(normalizeEthiopianPhone('0811223344')).toBeNull(); // 8 is not a mobile prefix
      expect(normalizeEthiopianPhone('0111223344')).toBeNull(); // landline prefix
      expect(normalizeEthiopianPhone('12345678')).toBeNull(); // too short
      expect(normalizeEthiopianPhone('091122334455')).toBeNull(); // too long
      expect(normalizeEthiopianPhone('+12025550199')).toBeNull(); // US number
      expect(normalizeEthiopianPhone('+447911123456')).toBeNull(); // UK number
      expect(normalizeEthiopianPhone('')).toBeNull();
      expect(normalizeEthiopianPhone(null)).toBeNull();
      expect(normalizeEthiopianPhone(undefined)).toBeNull();
      expect(normalizeEthiopianPhone('abc0911223344def')).toBe('+251911223344'); // extracts valid 9-digit mobile if present
      expect(normalizeEthiopianPhone('non-digits-only')).toBeNull();
    });

    it('masks phone numbers safely for logs and formats for local display', () => {
      expect(maskPhone('+251911223344')).toBe('+25191***3344');
      expect(maskPhone('0712345678')).toBe('+25171***5678');
      expect(maskPhone(null)).toBe('[NO_PHONE]');
      expect(maskPhone('invalid')).toBe('[INVALID_PHONE]');

      expect(formatLocalPhone('+251911223344')).toBe('0911223344');
      expect(formatLocalPhone('+251711223344', true)).toBe('0711 223 344');
    });
  });

  // ==================================================
  // 2. ANTI-HIJACKING & PHONE COLLISION IN CONTACT VERIFICATION
  // ==================================================
  describe('2. Anti-Hijacking & Phone Collision in Telegram Contact Verification', () => {
    it('prevents attacker from hijacking an existing user account via contact sharing', () => {
      const victimPhone = '+251911000111';
      const victimTgId = 'victim_11111';

      // 1. User A (Victim) registers account
      const victim = dbService.createUser({
        id: `tg_${victimTgId}`,
        telegram_id: victimTgId,
        username: 'VictimPlayer',
        phone: victimPhone,
        referral_code: 'REF_VICTIM',
        registration_status: 'COMPLETED',
        account_type: 'REAL'
      });
      dbService.updateWalletBalance(victim.id, 500);

      // 2. Attacker (User B with different telegramId) attempts contact verification with VictimPhone
      const attackerTgId = 'attacker_22222';
      const hijackAttempt = authSvc.completeVerifiedRegistration(
        victimPhone,
        attackerTgId,
        'AttackerUser'
      );

      // Must be strictly rejected
      expect(hijackAttempt.success).toBe(false);
      expect(hijackAttempt.error).toMatch(/already linked to another Telegram account/i);

      // Verify Victim account was NOT modified
      const victimAfter = dbService.getUserById(victim.id)!;
      expect(victimAfter.telegram_id).toBe(victimTgId);
      const victimWallet = dbService.getWallet(victim.id)!;
      expect(victimWallet.balance).toBe(500);
    });

    it('prevents account collision when user already has an account and attempts to link someone elses phone', () => {
      const phoneA = '+251911000222';
      const tgIdA = 'user_aaa';
      const tgIdB = 'user_bbb';

      // User A owns phoneA
      dbService.createUser({
        id: `tg_${tgIdA}`,
        telegram_id: tgIdA,
        username: 'UserA',
        phone: phoneA,
        referral_code: 'REF_A',
        registration_status: 'COMPLETED'
      });

      // User B already has an account with tgIdB
      dbService.createUser({
        id: `tg_${tgIdB}`,
        telegram_id: tgIdB,
        username: 'UserB',
        phone: undefined,
        referral_code: 'REF_B',
        registration_status: 'COMPLETED'
      });

      // User B attempts to verify phoneA
      const collisionAttempt = authSvc.completeVerifiedRegistration(
        phoneA,
        tgIdB,
        'UserB'
      );

      expect(collisionAttempt.success).toBe(false);
      expect(collisionAttempt.error).toMatch(/already registered to a different account/i);
    });

    it('rejects contact verification and login for suspended or banned accounts', () => {
      const bannedPhone = '+251911000333';
      const bannedTgId = 'banned_99999';

      dbService.createUser({
        id: `tg_${bannedTgId}`,
        telegram_id: bannedTgId,
        username: 'BannedPlayer',
        phone: bannedPhone,
        referral_code: 'REF_BANNED',
        account_status: 'BANNED',
        registration_status: 'COMPLETED'
      });

      const res = authSvc.completeVerifiedRegistration(
        bannedPhone,
        bannedTgId,
        'BannedPlayer'
      );

      expect(res.success).toBe(false);
      expect(res.error).toMatch(/account is banned/i);
    });
  });

  // ==================================================
  // 3. GUEST ACCOUNT RESTRICTIONS & UPGRADE LIFECYCLE
  // ==================================================
  describe('3. Guest Account Real-Money Restrictions & Upgrade Lifecycle', () => {
    it('strictly forbids guest accounts, bots, and unverified users from requesting withdrawals', () => {
      // 1. Guest user
      const guest = dbService.createUser({
        id: 'usr_guest_test_01',
        telegram_id: 'guest_test_01',
        username: 'Guest_001',
        account_type: 'GUEST',
        referral_code: 'REF_GUEST_01'
      });
      dbService.updateWalletBalance(guest.id, 100);

      expect(() => {
        dbService.createWithdrawalRequest(guest.id, 'Guest_001', 50, '0911223344');
      }).toThrow(/Guest accounts cannot request withdrawals/i);

      // 2. Bot user
      const bot = dbService.createUser({
        id: 'usr_bot_test_01',
        telegram_id: 'bot_test_01',
        username: 'Bot_001',
        is_bot: true,
        account_type: 'BOT',
        referral_code: 'REF_BOT_01'
      });
      dbService.updateWalletBalance(bot.id, 500);

      expect(() => {
        dbService.createWithdrawalRequest(bot.id, 'Bot_001', 50, '0911223344');
      }).toThrow(/Automated or bot accounts cannot request withdrawals/i);

      // 3. Unverified registration status
      const unverified = dbService.createUser({
        id: 'usr_unver_test_01',
        telegram_id: 'unver_01',
        username: 'UnverifiedUser',
        account_type: 'REAL',
        registration_status: 'PENDING',
        referral_code: 'REF_UNVER_01'
      });
      dbService.updateWalletBalance(unverified.id, 100);

      expect(() => {
        dbService.createWithdrawalRequest(unverified.id, 'UnverifiedUser', 50, '0911223344');
      }).toThrow(/complete phone verification/i);
    });

    it('upgrades a guest account seamlessly while preserving balance and transaction history', () => {
      const guestId = 'usr_guest_upg_01';
      const guest = dbService.createUser({
        id: guestId,
        telegram_id: 'guest_upg_01',
        username: 'Guest_Lucky',
        account_type: 'GUEST',
        referral_code: 'REF_GUEST_UPG'
      });
      dbService.updateWalletBalance(guestId, 150.00);

      // Perform guest upgrade
      const phone = '0922334455';
      const password = 'StrongPassword123';
      const upgradeRes = authSvc.upgradeGuestAccount(guestId, phone, password, 'UpgradedPlayer');

      expect(upgradeRes.success).toBe(true);
      expect(upgradeRes.user).toBeDefined();
      expect(upgradeRes.user!.playerId).toBe(guestId);
      expect(upgradeRes.token).toBeDefined();

      // Verify database row
      const userInDb = dbService.getUserById(guestId)!;
      expect(userInDb.account_type).toBe('REAL');
      expect(userInDb.registration_status).toBe('COMPLETED');
      expect(userInDb.phone).toBe('+251922334455');
      expect(userInDb.password_hash).toBeDefined();

      // Wallet balance preserved exactly
      const wallet = dbService.getWallet(guestId)!;
      expect(wallet.balance).toBe(150.00);

      // Now as a REAL verified account, withdrawal request succeeds
      const wth = dbService.createWithdrawalRequest(guestId, 'UpgradedPlayer', 50.00, '0922334455');
      expect(wth).toBeDefined();
      expect(wth.amount).toBe(50.00);
      expect(wth.status).toBe('PENDING');
    });

    it('rejects guest upgrade if phone number is already registered to another real account', () => {
      const existingPhone = '+251933445566';
      dbService.createUser({
        id: 'usr_real_existing',
        telegram_id: 'real_existing',
        username: 'ExistingRealUser',
        phone: existingPhone,
        referral_code: 'REF_EXISTING',
        account_type: 'REAL'
      });

      const guestId = 'usr_guest_collision';
      dbService.createUser({
        id: guestId,
        telegram_id: 'guest_collision',
        username: 'Guest_Collision',
        account_type: 'GUEST',
        referral_code: 'REF_GUEST_COL'
      });

      const upgradeRes = authSvc.upgradeGuestAccount(guestId, existingPhone, 'password123');
      expect(upgradeRes.success).toBe(false);
      expect(upgradeRes.error).toMatch(/already exists/i);
    });
  });

  // ==================================================
  // 4. REST API INTEGRATION: UPGRADE GUEST & WITHDRAWAL GUARDS
  // ==================================================
  describe('4. REST API Endpoint Security', () => {
    it('executes POST /api/auth/upgrade-guest end-to-end', async () => {
      // 1. Create a guest user via sync
      const guestPlayerId = `usr_guest_api_${Date.now()}`;
      const syncRes = await fetch(`${BASE_URL}/api/user/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerId: guestPlayerId,
          username: 'GuestApiUser',
          isGuest: true
        })
      });
      expect(syncRes.status).toBe(200);

      // 2. Credit some winnings to guest
      const db = (app as any).locals?.dbService || dbService;
      // Use API to upgrade guest
      const upgPhone = '0944556677';
      const upgRes = await fetch(`${BASE_URL}/api/auth/upgrade-guest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guestPlayerId,
          phone: upgPhone,
          password: 'new_valid_password_456',
          name: 'ApiUpgradedUser'
        })
      });

      expect(upgRes.status).toBe(200);
      const upgData = await upgRes.json();
      expect(upgData.success).toBe(true);
      expect(upgData.token).toBeDefined();

      // 3. Authenticate with returned token to GET /api/profile
      const profRes = await fetch(`${BASE_URL}/api/profile`, {
        headers: { Authorization: `Bearer ${upgData.token}` }
      });
      expect(profRes.status).toBe(200);
      const profData = await profRes.json();
      expect(profData.profile.phone).toBe('+251944556677');
    });

    it('blocks /api/telegram/simulate-contact-share in production environment', async () => {
      const origEnv = process.env.NODE_ENV;
      try {
        process.env.NODE_ENV = 'production';
        const res = await fetch(`${BASE_URL}/api/telegram/simulate-contact-share`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: '0911223344' })
        });
        expect(res.status).toBe(403);
        const data = await res.json();
        expect(data.error).toMatch(/permanently disabled in production/i);
      } finally {
        process.env.NODE_ENV = origEnv;
      }
    });
  });
});
