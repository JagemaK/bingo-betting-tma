import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'path';
import fs from 'fs';
import { normalizeEthiopianPhone, isValidEthiopianPhone, maskPhone } from './PhoneUtils.js';
import { hashPassword, verifyPassword } from './PasswordUtils.js';
import { DatabaseService } from './DatabaseService.js';
import { AuthService } from './AuthService.js';
import { RateLimiter } from './RateLimiter.js';

describe('Authentication & User Management Hardening Suite', () => {
  const testDbDir = path.resolve(process.cwd(), 'data', 'test_auth_audit');
  const testDbPath = path.resolve(testDbDir, 'auth_audit.db');

  beforeAll(() => {
    if (fs.existsSync(testDbDir)) {
      fs.rmSync(testDbDir, { recursive: true, force: true });
    }
    fs.mkdirSync(testDbDir, { recursive: true });
  });

  afterAll(() => {
    try {
      if (fs.existsSync(testDbDir)) {
        fs.rmSync(testDbDir, { recursive: true, force: true });
      }
    } catch {
      // quiet cleanup
    }
  });

  // =========================================================================
  // 1. CANONICAL ETHIOPIAN PHONE NUMBER NORMALIZATION
  // =========================================================================
  describe('Part 1: Ethiopian Phone Number Normalization', () => {
    it('normalizes all valid Ethiopian telecom formats to canonical E.164 (+2519... / +2517...) and ensures identical output', () => {
      const inputs = [
        '0912345678',
        '+251912345678',
        '251912345678',
        '+251 912 345 678',
        '0912-34-56-78',
        '(0912) 345678',
        '+2510912345678',
        '2510912345678',
        '912345678'
      ];

      for (const input of inputs) {
        const normalized = normalizeEthiopianPhone(input);
        expect(normalized, `Failed for input: ${input}`).toBe('+251912345678');
        expect(isValidEthiopianPhone(input)).toBe(true);
      }
    });

    it('normalizes Safaricom Ethiopia numbers (+2517...) properly', () => {
      expect(normalizeEthiopianPhone('0712345678')).toBe('+251712345678');
      expect(normalizeEthiopianPhone('+251712345678')).toBe('+251712345678');
      expect(normalizeEthiopianPhone('251712345678')).toBe('+251712345678');
      expect(normalizeEthiopianPhone('+251 712 345 678')).toBe('+251712345678');
    });

    it('rejects non-Ethiopian and malformed phone numbers', () => {
      const invalid = [
        '',
        '   ',
        '123456',
        '0812345678', // invalid prefix (not 9 or 7)
        '+14155552671', // US number
        '+447911123456', // UK number
        '09123456789999', // too long
        'abcdefghij',
        '09-abc-def'
      ];

      for (const input of invalid) {
        expect(normalizeEthiopianPhone(input), `Expected null for: ${input}`).toBeNull();
        expect(isValidEthiopianPhone(input)).toBe(false);
      }
    });

    it('safely masks phone numbers for logging without privacy leakage', () => {
      expect(maskPhone('0912345678')).toBe('+25191***5678');
      expect(maskPhone('+251994790906')).toBe('+25199***0906');
      expect(maskPhone(null)).toBe('[NO_PHONE]');
      expect(maskPhone('invalid')).toBe('[INVALID_PHONE]');
    });
  });

  // =========================================================================
  // 2. SCRYPT PASSWORD HASHING & LEGACY MIGRATION
  // =========================================================================
  describe('Part 2: Scrypt Hashing & Constant-Time Verification', () => {
    it('hashes passwords using memory-hard Scrypt with unique salt', () => {
      const pass = 'SuperSecret123!';
      const res1 = hashPassword(pass);
      const res2 = hashPassword(pass);

      expect(res1.hash).toContain('$scrypt$N=16384,r=8,p=1$');
      expect(res2.hash).toContain('$scrypt$N=16384,r=8,p=1$');
      // Unique salts guarantee unique hashes for identical passwords
      expect(res1.hash).not.toBe(res2.hash);
      expect(res1.salt).not.toBe(res2.salt);
    });

    it('verifies Scrypt password correctly with constant-time check', () => {
      const pass = 'HabeshaPass456!';
      const { hash } = hashPassword(pass);

      const validCheck = verifyPassword(pass, hash);
      expect(validCheck.isValid).toBe(true);
      expect(validCheck.needsRehash).toBe(false);

      const invalidCheck = verifyPassword('WrongPassword', hash);
      expect(invalidCheck.isValid).toBe(false);
    });

    it('verifies legacy PBKDF2 hashes and flags them for progressive upgrade', () => {
      // Simulate legacy PBKDF2 hash
      const crypto = require('crypto');
      const pass = 'LegacyPass123';
      const salt = crypto.randomBytes(16).toString('hex');
      const legacyHash = crypto.pbkdf2Sync(pass, salt, 1000, 64, 'sha512').toString('hex');

      const result = verifyPassword(pass, legacyHash, salt);
      expect(result.isValid).toBe(true);
      expect(result.needsRehash).toBe(true);

      const wrongResult = verifyPassword('BadPass', legacyHash, salt);
      expect(wrongResult.isValid).toBe(false);
    });
  });

  // =========================================================================
  // 3. ACTUAL USER BUG REGRESSION: REGISTRATION -> RESTART -> LOGIN
  // =========================================================================
  describe('Part 3: Regression Test - Account Persistence Across Server Restarts', () => {
    it('creates permanent user record in database, survives restart, and logs in with all phone representations', () => {
      // 1. Initialize persistent database on disk
      const db1 = new DatabaseService(testDbPath);
      const auth1 = new AuthService(db1);

      const testPhone = '0994790906';
      const testPassword = 'MySecretPassword123!';
      const testName = 'Elias T';

      // 2. Register new user
      const regRes = auth1.register(testName, testPhone, testPassword);
      expect(regRes.success).toBe(true);
      expect(regRes.user?.username).toBe('Elias T');
      expect(regRes.token).toBeDefined();

      // 3. Confirm directly from database that the user row exists and is NOT just pending
      const canonicalPhone = normalizeEthiopianPhone(testPhone)!;
      expect(canonicalPhone).toBe('+251994790906');

      const dbUser = db1.getUserByPhone(canonicalPhone);
      expect(dbUser).toBeDefined();
      expect(dbUser?.username).toBe('Elias T');
      expect(dbUser?.phone).toBe(canonicalPhone);
      expect(dbUser?.account_status).toBe('ACTIVE');
      expect(dbUser?.password_hash).toContain('$scrypt$');

      // 4. SIMULATE FULL SERVER & DATABASE RESTART:
      // Create brand new DatabaseService instance connected to the SAME SQLite file
      const db2 = new DatabaseService(testDbPath);
      const auth2 = new AuthService(db2);

      // 5. Query user after restart
      const userAfterRestart = db2.getUserByPhone(canonicalPhone);
      expect(userAfterRestart).toBeDefined();
      expect(userAfterRestart?.id).toBe(dbUser?.id);

      // 6. Test login with original phone representation (0994790906)
      const login1 = auth2.login('0994790906', testPassword);
      expect(login1.success).toBe(true);
      expect(login1.user?.playerId).toBe(dbUser?.id);
      expect(login1.token).toBeDefined();

      // 7. Test login with international format (+251994790906)
      const login2 = auth2.login('+251994790906', testPassword);
      expect(login2.success).toBe(true);
      expect(login2.user?.playerId).toBe(dbUser?.id);

      // 8. Test login with country code without plus (251994790906)
      const login3 = auth2.login('251994790906', testPassword);
      expect(login3.success).toBe(true);
      expect(login3.user?.playerId).toBe(dbUser?.id);

      // 9. Test login with spaced format (+251 994 790 906)
      const login4 = auth2.login('+251 994 790 906', testPassword);
      expect(login4.success).toBe(true);
      expect(login4.user?.playerId).toBe(dbUser?.id);

      // 10. Test incorrect password returns generic error
      const badLogin = auth2.login('0994790906', 'WrongPassword999');
      expect(badLogin.success).toBe(false);
      expect(badLogin.error).toBe('Invalid phone number or password.');
    });
  });

  // =========================================================================
  // 4. DATABASE UNIQUENESS CONSTRAINTS
  // =========================================================================
  describe('Part 4: Database Uniqueness Constraints', () => {
    it('prevents duplicate registration of the same phone number across different formats', () => {
      const db = new DatabaseService(testDbPath);
      const auth = new AuthService(db);

      const initialPhone = '0988112233';
      const duplicatePhoneVariant = '+251988112233';

      const firstReg = auth.register('First Player', initialPhone, 'Pass123456!');
      expect(firstReg.success).toBe(true);

      // Attempt second registration with variant format
      const secondReg = auth.register('Second Player', duplicatePhoneVariant, 'Pass654321!');
      expect(secondReg.success).toBe(false);
      expect(secondReg.error).toContain('already exists');

      // Direct SQL attempt to insert duplicate phone should violate unique index
      expect(() => {
        db.createUser({
          id: 'usr_manual_duplicate',
          telegram_id: 'tg_manual_dup',
          username: 'DirectDup',
          phone: initialPhone,
          referral_code: 'DUP123'
        });
      }).toThrow();
    });
  });

  // =========================================================================
  // 5. TRANSPARENT LEGACY PASSWORD MIGRATION
  // =========================================================================
  describe('Part 5: Transparent Legacy Password Migration', () => {
    it('transparently upgrades a legacy PBKDF2 password to Scrypt upon first successful login', () => {
      const db = new DatabaseService(testDbPath);
      const auth = new AuthService(db);

      const crypto = require('crypto');
      const testPhone = '0977334455';
      const canonical = normalizeEthiopianPhone(testPhone)!;
      const rawPassword = 'UpgradeMe123!';

      // Create user manually with legacy PBKDF2 hash
      const legacySalt = crypto.randomBytes(16).toString('hex');
      const legacyHash = crypto.pbkdf2Sync(rawPassword, legacySalt, 1000, 64, 'sha512').toString('hex');

      const legacyUser = db.createUser({
        id: 'usr_legacy_migrate_test',
        telegram_id: 'phone_' + canonical,
        username: 'LegacyTester',
        phone: canonical,
        password_hash: legacyHash,
        password_salt: legacySalt,
        referral_code: 'LEGACY_MIGRATE'
      });

      expect(legacyUser.password_hash).not.toContain('$scrypt$');

      // First login with legacy password
      const loginRes = auth.login(testPhone, rawPassword);
      expect(loginRes.success).toBe(true);

      // Inspect user in DB: Password hash should now be upgraded to modern Scrypt!
      const updatedUser = db.getUserById('usr_legacy_migrate_test')!;
      expect(updatedUser.password_hash).toContain('$scrypt$N=16384,r=8,p=1$');

      // Subsequent login verifies using modern Scrypt
      const secondLogin = auth.login(testPhone, rawPassword);
      expect(secondLogin.success).toBe(true);
    });
  });

  // =========================================================================
  // 6. RATE LIMITING PROTECTION
  // =========================================================================
  describe('Part 6: Rate Limiting Protection', () => {
    it('blocks excessive failed login attempts with progressive backoff', () => {
      const limiter = new RateLimiter(3, 1000, 5000); // 3 attempts, 5s block
      const key = '+251911223344';

      expect(limiter.isRateLimited(key).limited).toBe(false);
      limiter.recordFailure(key); // 1
      expect(limiter.isRateLimited(key).limited).toBe(false);
      limiter.recordFailure(key); // 2
      expect(limiter.isRateLimited(key).limited).toBe(false);
      limiter.recordFailure(key); // 3 -> limit reached!

      const check = limiter.isRateLimited(key);
      expect(check.limited).toBe(true);
      expect(check.retryAfterSeconds).toBeGreaterThan(0);

      // Reset works on success
      limiter.reset(key);
      expect(limiter.isRateLimited(key).limited).toBe(false);
    });
  });

  // =========================================================================
  // 7. ACCOUNT STATUS & ADMIN ACCESS
  // =========================================================================
  describe('Part 7: Account Status & Admin User Management', () => {
    it('rejects login for SUSPENDED and BANNED accounts safely', () => {
      const db = new DatabaseService(testDbPath);
      const auth = new AuthService(db);

      // Ensure admin exists for foreign key constraints on audit_logs
      db.createUser({
        id: 'admin_001',
        telegram_id: 'tg_admin_001',
        username: 'AdminBoss',
        role: 'ADMIN',
        referral_code: 'REFADMIN01'
      });

      const phone = '0944556677';
      const reg = auth.register('Suspended Player', phone, 'pass123456');
      expect(reg.success).toBe(true);

      // Admin suspends player
      auth.updateUserStatus('admin_001', reg.user!.playerId, 'SUSPENDED');

      // Attempt login
      const loginRes = auth.login(phone, 'pass123456');
      expect(loginRes.success).toBe(false);
      expect(loginRes.error).toContain('suspended');
    });

    it('sanitizes password_hash and password_salt from admin user list', () => {
      const db = new DatabaseService(testDbPath);
      const auth = new AuthService(db);

      const users = auth.getAllUsers();
      for (const u of users) {
        expect((u as any).password_hash, `Leaked password_hash on user ${u.id}`).toBeUndefined();
        expect((u as any).password_salt, `Leaked password_salt on user ${u.id}`).toBeUndefined();
      }
    });
  });

  // =========================================================================
  // 8. TELEGRAM ACCOUNT LINKING WITHOUT DUPLICATION
  // =========================================================================
  describe('Part 8: Telegram Account Linking', () => {
    it('links Telegram ID to existing phone/password account without creating a duplicate user', () => {
      const db = new DatabaseService(testDbPath);
      const auth = new AuthService(db);

      const phone = '0966778899';
      const canonical = normalizeEthiopianPhone(phone)!;

      // 1. User registers via phone/password first
      const webReg = auth.register('Web Master', phone, 'MyPass123!');
      expect(webReg.success).toBe(true);
      const originalUserId = webReg.user!.playerId;

      // 2. Later, user interacts with Telegram bot and shares the same phone number
      const tgId = 88997766;
      const verifyRes = auth.completeRegistrationWithMatchedPhone(phone, tgId, 'tg_webmaster');
      expect(verifyRes.success).toBe(true);

      // 3. Must link to the SAME user record (no new user created!)
      expect(verifyRes.user?.playerId).toBe(originalUserId);

      const updatedUser = db.getUserById(originalUserId)!;
      expect(updatedUser.telegram_id).toBe(String(tgId));
      expect(updatedUser.phone).toBe(canonical);
    });
  });
});
