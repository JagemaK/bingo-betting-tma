import { describe, it, expect, beforeAll } from 'vitest';
import { authService } from './AuthService.js';
import { databaseService } from './DatabaseService.js';

describe('AuthService Suite', () => {
  beforeAll(() => {
    databaseService.createUser({
      id: 'usr_demo_kaleb',
      telegram_id: '12345678',
      username: 'Kaleb Tadesse',
      phone: '0912345678',
      referral_code: 'KALEB123',
      role: 'USER'
    });
  });
  it('should authenticate the seeded demo user (0912345678 / password123)', () => {
    const res = authService.login('0912345678', 'password123');
    expect(res.success).toBe(true);
    expect(res.user).toBeDefined();
    expect(res.user?.username).toBe('Kaleb Tadesse');
    expect(res.token).toBeDefined();
  });

  it('should reject invalid password for existing account', () => {
    const res = authService.login('0912345678', 'wrongpassword');
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Invalid phone number or password/i);
  });

  it('should register a new Ethiopian phone user with verification requirement', () => {
    const randomSuffix = Math.floor(100000 + Math.random() * 900000);
    const testPhone = `09${randomSuffix}99`;
    const res = authService.initiateRegistration('Abebe Bikila', testPhone, 'securePass123');

    expect(res.success).toBe(true);
    expect(res.requiresVerification).toBe(true);
    expect(res.phone).toBe(authService.normalizePhone(testPhone));
    expect(res.user?.username).toBe('Abebe Bikila');

    // Verify phone
    const verifyRes = authService.verifyPhone(testPhone);
    expect(verifyRes.success).toBe(true);
    expect(verifyRes.requiresVerification).toBe(false);

    // Login after verification
    const loginRes = authService.login(testPhone, 'securePass123');
    expect(loginRes.success).toBe(true);
    expect(loginRes.requiresVerification).toBe(false);
  });

  it('should reject invalid Ethiopian phone format', () => {
    const res = authService.register('Test User', '12345678', 'pass123');
    expect(res.success).toBe(false);
    expect(res.error).toContain('valid Ethiopian phone number');
  });

  it('should perform instant Telegram 1-Tap Login', () => {
    const tgId = 987654321;
    const res = authService.telegramLogin({
      id: tgId,
      first_name: 'Dawit',
      last_name: 'Haile',
      username: 'dawi_tele'
    });

    expect(res.success).toBe(true);
    expect(res.user?.username).toBe('Dawit Haile');
    expect(res.user?.playerId).toBe(`tg_${tgId}`);
    expect(res.token).toBeDefined();

    // Verify session token lookup
    if (res.token) {
      const sessionUser = authService.getUserByToken(res.token);
      expect(sessionUser).toBeDefined();
      expect(sessionUser?.username).toBe('Dawit Haile');
    }
  });
});
