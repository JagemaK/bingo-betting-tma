import { describe, it, expect } from 'vitest';
import { telegramBotService, TelegramUpdate } from './TelegramBotService.js';
import { authService } from './AuthService.js';

describe('TelegramBot Contact Sharing Verification Suite', () => {
  it('should handle /start verify_<phone> and request contact', async () => {
    const update: TelegramUpdate = {
      update_id: 1001,
      message: {
        message_id: 1,
        from: { id: 778899, is_bot: false, first_name: 'Tariku', username: 'tariku_eth' },
        chat: { id: 778899, type: 'private' },
        date: Math.floor(Date.now() / 1000),
        text: '/start verify_0987654321'
      }
    };

    const res = await telegramBotService.handleWebhookUpdate(update);
    expect(res.success).toBe(true);
    expect(res.action).toBe('sent_contact_request');
  });

  it('should verify user account when authentic contact is shared', async () => {
    const testPhone = '0933445566';
    // Register pending account first
    authService.register('Tariku Regassa', testPhone, 'pass123456');

    // Initiate verify for testPhone
    await telegramBotService.handleWebhookUpdate({
      update_id: 10015,
      message: {
        message_id: 15,
        from: { id: 778899, is_bot: false, first_name: 'Tariku', username: 'tariku_eth' },
        chat: { id: 778899, type: 'private' },
        date: Math.floor(Date.now() / 1000),
        text: `/start verify_${testPhone}`
      }
    });

    const update: TelegramUpdate = {
      update_id: 1002,
      message: {
        message_id: 2,
        from: { id: 778899, is_bot: false, first_name: 'Tariku', username: 'tariku_eth' },
        chat: { id: 778899, type: 'private' },
        date: Math.floor(Date.now() / 1000),
        contact: {
          phone_number: '+251933445566', // Ethiopian format
          first_name: 'Tariku',
          user_id: 778899 // Matches sender ID (Anti-Spoofing PASS)
        }
      }
    };

    const res = await telegramBotService.handleWebhookUpdate(update);
    expect(res.success).toBe(true);
    expect(res.action).toBe('phone_verified');

    // Confirm login works without requiring verification
    const loginRes = authService.login(testPhone, 'pass123456');
    expect(loginRes.success).toBe(true);
    expect(loginRes.requiresVerification).toBe(false);
  });

  it('should REJECT spoofed contact share where user_id does not match sender', async () => {
    const testPhone = '0955667788';
    authService.register('Spoof Attacker', testPhone, 'pass123456');

    const update: TelegramUpdate = {
      update_id: 1003,
      message: {
        message_id: 3,
        from: { id: 111111, is_bot: false, first_name: 'Attacker' },
        chat: { id: 111111, type: 'private' },
        date: Math.floor(Date.now() / 1000),
        contact: {
          phone_number: '+251955667788',
          first_name: 'Victim',
          user_id: 999999 // Different user ID! (Anti-Spoofing FAIL)
        }
      }
    };

    const res = await telegramBotService.handleWebhookUpdate(update);
    expect(res.success).toBe(false);
    expect(res.error).toContain('Anti-spoofing check failed');
  });

  it('should correctly normalize various Ethiopian phone formats', () => {
    expect(telegramBotService.normalizePhone('+251911223344')).toBe('+251911223344');
    expect(telegramBotService.normalizePhone('251911223344')).toBe('+251911223344');
    expect(telegramBotService.normalizePhone('0911223344')).toBe('+251911223344');
    expect(telegramBotService.normalizePhone('0711223344')).toBe('+251711223344');
  });

  it('should seamlessly verify and register user who directly shares contact without prior web form request', async () => {
    const directPhone = '+251 98 934 2413';
    const tgUserId = 55667788;
    const update: TelegramUpdate = {
      update_id: 1004,
      message: {
        message_id: 4,
        from: { id: tgUserId, is_bot: false, first_name: 'Erk', username: 'erk_player' },
        chat: { id: tgUserId, type: 'private' },
        date: Math.floor(Date.now() / 1000),
        contact: {
          phone_number: directPhone,
          first_name: 'Erk',
          user_id: tgUserId
        }
      }
    };

    const res = await telegramBotService.handleWebhookUpdate(update);
    expect(res.success).toBe(true);
    expect(res.action).toBe('phone_verified');

    // Confirm user is created in database with normalized phone
    const user = authService.getUserByTelegramId(String(tgUserId));
    expect(user).toBeDefined();
    expect(user?.phone).toBe('+251989342413');
  });
});

