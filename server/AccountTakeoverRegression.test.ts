import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { httpServer } from './index.js';
import { authService } from './AuthService.js';
import { databaseService } from './DatabaseService.js';
import { telegramBotService } from './TelegramBotService.js';

let BASE: string;
const json = async (method: string, path: string, body?: any, token?: string) => {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  let data: any = null;
  try { data = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, data };
};

/** Simulates the real Telegram bot flow: /start <payload>, then the user shares their own contact. */
const botShare = async (tgId: number, phone: string, payload: string | null, from: Record<string, any> = {}) => {
  const user = { id: tgId, is_bot: false, first_name: 'Tester', ...from };
  if (payload) {
    await telegramBotService.handleUpdate({ update_id: 1, message: { message_id: 1, chat: { id: tgId, type: 'private' }, from: user, date: 0, text: `/start ${payload}` } } as any, true);
  }
  return telegramBotService.handleUpdate({ update_id: 2, message: { message_id: 2, chat: { id: tgId, type: 'private' }, from: user, date: 0, contact: { phone_number: phone, user_id: tgId, first_name: user.first_name } } } as any, true);
};
const startPayload = (botUrl: string) => new URL(botUrl).searchParams.get('start')!;

describe('Account takeover regressions (auth & verification flows)', () => {
  beforeAll(async () => {
    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', () => {
      BASE = `http://127.0.0.1:${(httpServer.address() as any).port}`;
      resolve();
    }));
  });
  afterAll(async () => {
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  it('removed endpoints no longer issue sessions or expose balances by phone number', async () => {
    authService.register('Phone Victim', '0933100001', 'victim_pw_1');
    const verify = await json('POST', '/api/auth/verify', { phone: '0933100001' });
    expect(verify.status).toBe(404);
    expect(verify.data?.token).toBeUndefined();

    const check = await json('GET', '/api/auth/check-verification/0933100001');
    expect(check.status).toBe(404);
    expect(check.data?.user).toBeUndefined();
  });

  it('registration-status never returns a session to someone polling by phone number', async () => {
    authService.register('Completed User', '0933100002', 'completed_pw');
    const byPhone = await json('GET', '/api/auth/registration-status/0933100002');
    expect(byPhone.data.token).toBeUndefined();
    expect(byPhone.data.user).toBeUndefined();
  });

  it('a Telegram sign-up session is released once, and only to the holder of the pendingId', async () => {
    const init = authService.initiateRegistration('Bound Signup', '0933100003', 'bound_pw_1') as any;
    await botShare(771100003, '0933100003', startPayload(init.botUrl));

    const attacker = await json('GET', '/api/auth/registration-status/0933100003');
    expect(attacker.data.status).toBe('verified');
    expect(attacker.data.token).toBeUndefined();

    const owner = await json('GET', `/api/auth/registration-status/${init.pendingId}`);
    expect(owner.data.token).toBeTruthy();
    expect((await json('GET', '/api/auth/me', undefined, owner.data.token)).data.user.username).toBe('Bound Signup');

    const replay = await json('GET', `/api/auth/registration-status/${init.pendingId}`);
    expect(replay.data.token).toBeUndefined();
  });

  it("a later sign-up for the same phone cannot hijack the owner's Telegram confirmation", async () => {
    const victim = authService.initiateRegistration('Real Owner', '0933100004', 'owner_pw_1') as any;
    const attacker = authService.initiateRegistration('Attacker', '0933100004', 'attacker_pw_1') as any;

    // Owner confirms using the link from their own device
    await botShare(771100004, '0933100004', startPayload(victim.botUrl));

    expect(authService.login('0933100004', 'attacker_pw_1').success).toBe(false);
    const attackerPoll = await json('GET', `/api/auth/registration-status/${attacker.pendingId}`);
    expect(attackerPoll.data?.token).toBeUndefined();
  });

  it("a pre-registered (squatted) phone doesn't get the squatter's password when the owner shares contact", async () => {
    const squat = authService.initiateRegistration('Squatter', '0933100005', 'squat_pw_1') as any;
    await botShare(771100005, '0933100005', null); // owner opens the bot and shares contact directly

    expect(authService.login('0933100005', 'squat_pw_1').success).toBe(false);
    const squatPoll = await json('GET', `/api/auth/registration-status/${squat.pendingId}`);
    expect(squatPoll.data?.token).toBeUndefined();
  });

  it('password reset token is only released with the secret requestId', async () => {
    authService.register('Reset Owner', '0933100006', 'reset_pw_1');
    const init = await json('POST', '/api/auth/forgot-password-initiate', { phone: '0933100006' });
    await botShare(771100006, '0933100006', startPayload(init.data.botUrl));

    const attacker = await json('GET', '/api/auth/forgot-password-status/0933100006');
    expect(attacker.data.resetToken).toBeUndefined();

    const owner = await json('GET', `/api/auth/forgot-password-status/0933100006?requestId=${init.data.requestId}`);
    expect(owner.data.resetToken).toBeTruthy();
  });

  it("a reset started by an attacker cannot be authorized by the owner's earlier link", async () => {
    authService.register('Reset Victim', '0933100007', 'reset_victim_pw');
    const victim = await json('POST', '/api/auth/forgot-password-initiate', { phone: '0933100007' });
    const attacker = await json('POST', '/api/auth/forgot-password-initiate', { phone: '0933100007' });

    await botShare(771100007, '0933100007', startPayload(victim.data.botUrl));

    const poll = await json('GET', `/api/auth/forgot-password-status/0933100007?requestId=${attacker.data.requestId}`);
    expect(poll.data.resetToken).toBeUndefined();
  });

  it('a Telegram display name equal to a designated admin username does not grant Super Admin', async () => {
    await botShare(771100008, '0933100008', null, { first_name: 'mxt_mdn' });
    const user = databaseService.getUserByPhone(authService.normalizePhone('0933100008'));
    expect(user).toBeTruthy();
    expect(user!.role).toBe('USER');
    expect(user!.telegram_username || '').not.toBe('mxt_mdn');
  });
});
