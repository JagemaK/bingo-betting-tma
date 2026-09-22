import { describe, it, expect } from 'vitest';
import { authService } from './AuthService.js';
import { telegramBotService } from './TelegramBotService.js';

describe('Guest and Auth Flow Robustness Suite', () => {
  it('should handle registration, verification check and login for guest users', () => {
    const rawPhone = '0922334455';
    const normalized = authService.normalizePhone('+251922334455');
    expect(normalized).toBe('+251922334455');

    // 1. Register via Telegram-verified flow
    const regResult = authService.initiateRegistration('Abebe Bikila', rawPhone, 'strongPass123');
    expect(regResult.success).toBe(true);
    expect(regResult.requiresVerification).toBe(true);
    expect(regResult.pendingId).toBeDefined();

    // 2. Check pending verification
    const pendingCheck = authService.checkVerification(rawPhone);
    expect(pendingCheck.isVerified).toBe(false);

    // 3. Complete Telegram verification with matching user contact
    const simResult = telegramBotService.simulateContactShare(rawPhone);
    expect(simResult.success).toBe(true);
    expect(simResult.user?.walletBalance).toBe(0); // Newly registered user with no deposit has 0 balance

    // 4. Check verification status after bot contact share
    const verifiedCheck = authService.checkVerification(rawPhone);
    expect(verifiedCheck.isVerified).toBe(true);
    expect(verifiedCheck.user?.username).toBe('Abebe Bikila');

    // 5. Login with phone and password
    const loginResult = authService.login(rawPhone, 'strongPass123');
    expect(loginResult.success).toBe(true);
    expect(loginResult.token).toBeDefined();

    // 6. Token validation
    const verifiedUser = authService.getUserByToken(loginResult.token!);
    expect(verifiedUser).toBeDefined();
    expect(verifiedUser?.username).toBe('Abebe Bikila');

    // 7. Logout
    authService.logout(loginResult.token!);
    const postLogout = authService.getUserByToken(loginResult.token!);
    expect(postLogout).toBeNull();
  });

  it('should reject login with wrong password', () => {
    const phone = '0933445566';
    authService.register('Tigist Assefa', phone, 'correctPass');
    telegramBotService.simulateContactShare(phone);

    const failLogin = authService.login(phone, 'wrongPass');
    expect(failLogin.success).toBe(false);
    expect(failLogin.error).toMatch(/Invalid phone number or password/i);
  });

  it('should format and handle telegram 1-tap login', () => {
    const tgLogin = authService.loginWithTelegram({
      id: 99887766,
      username: 'habesha_winner',
      first_name: 'Habesha',
      last_name: 'Winner'
    });

    expect(tgLogin.success).toBe(true);
    expect(tgLogin.user).toBeDefined();
    expect(tgLogin.user?.username).toBe('Habesha Winner');
    expect(tgLogin.token).toBeDefined();
  });
});
