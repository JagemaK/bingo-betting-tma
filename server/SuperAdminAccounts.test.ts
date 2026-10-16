import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseService } from './DatabaseService.js';
import { AuthService, createSignedTelegramInitData } from './AuthService.js';

describe('Super Admin Telegram Accounts Designation & Role Delegation', () => {
  let db: DatabaseService;
  let authService: AuthService;
  const mockBotToken = '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11';
  const SUPER_ADMIN_IDS = ['99887766', '99887767', '99887768', '11223344', '99112233'];
  let savedIds: string | undefined;
  let savedUsernames: string | undefined;

  beforeEach(() => {
    savedIds = process.env.SUPER_ADMIN_TELEGRAM_IDS;
    savedUsernames = process.env.SUPER_ADMIN_TELEGRAM_USERNAMES;
    process.env.SUPER_ADMIN_TELEGRAM_IDS = SUPER_ADMIN_IDS.join(',');
    db = new DatabaseService(':memory:');
    authService = new AuthService(db);
  });

  afterEach(() => {
    if (savedIds === undefined) delete process.env.SUPER_ADMIN_TELEGRAM_IDS;
    else process.env.SUPER_ADMIN_TELEGRAM_IDS = savedIds;
    if (savedUsernames === undefined) delete process.env.SUPER_ADMIN_TELEGRAM_USERNAMES;
    else process.env.SUPER_ADMIN_TELEGRAM_USERNAMES = savedUsernames;
  });

  it('identifies super admins only by numeric Telegram ID', () => {
    expect(authService.isSuperAdminAccount('99887766')).toBe(true);
    expect(authService.isSuperAdminAccount(99887767)).toBe(true);
    expect(authService.isSuperAdminAccount(' 99887768 ')).toBe(true);

    expect(authService.isSuperAdminAccount('12345')).toBe(false);
    expect(authService.isSuperAdminAccount(undefined)).toBe(false);
    expect(authService.isSuperAdminAccount('phone_+251911223344')).toBe(false);
    // Usernames never confer super admin status, even formerly designated ones
    expect(authService.isSuperAdminAccount('mxt_mdn')).toBe(false);
  });

  it('ignores the legacy SUPER_ADMIN_TELEGRAM_USERNAMES env var', () => {
    process.env.SUPER_ADMIN_TELEGRAM_USERNAMES = 'some_admin';
    expect(authService.isSuperAdminAccount('some_admin')).toBe(false);
    expect(authService.determineRole('55555')).toBe('USER');
  });

  it('assigns SUPER_ADMIN role when authenticating any configured Telegram ID', async () => {
    for (const [id, username] of [
      [99887766, 'admin_one'],
      [99887767, undefined],
      [99887768, 'ADMIN_THREE']
    ] as const) {
      const signedData = createSignedTelegramInitData(
        {
          id,
          first_name: 'Super',
          last_name: 'Admin',
          ...(username ? { username } : {})
        },
        mockBotToken
      );

      const result = await authService.authenticateTelegram(signedData, mockBotToken);
      expect(result.success).toBe(true);
      expect(result.user).toBeDefined();
      expect(result.user?.role).toBe('SUPER_ADMIN');

      const persisted = db.getUserById(result.user!.id);
      expect(persisted?.role).toBe('SUPER_ADMIN');
    }
  });

  it('does not elevate a verified Telegram user whose username matches a formerly designated name', async () => {
    process.env.AUTO_ACTIVATE_TELEGRAM = 'true';
    try {
      const signedData = createSignedTelegramInitData(
        { id: 44556677, first_name: 'Not', last_name: 'Admin', username: 'mxt_mdn' },
        mockBotToken
      );
      const result = await authService.authenticateTelegram(signedData, mockBotToken);
      expect(result.success).toBe(true);
      expect(result.user?.role).toBe('USER');
    } finally {
      delete process.env.AUTO_ACTIVATE_TELEGRAM;
    }
  });

  it('elevates existing users by Telegram ID (not username) during database migration', () => {
    db.createUser({
      id: 'existing_admin',
      telegram_id: '11223344',
      telegram_username: 'whatever_name',
      username: 'whatever_name',
      role: 'USER',
      referral_code: 'REF_ADMIN'
    });
    db.createUser({
      id: 'existing_squatter',
      telegram_id: '11223399',
      telegram_username: 'jagema_kello',
      username: 'jagema_kello',
      role: 'USER',
      referral_code: 'REF_SQUAT'
    });

    expect(db.getUserById('existing_admin')?.role).toBe('USER');
    expect(db.getUserById('existing_squatter')?.role).toBe('USER');

    // Trigger runMigrations check
    (db as any).runMigrations();

    expect(db.getUserById('existing_admin')?.role).toBe('SUPER_ADMIN');
    expect(db.getUserById('existing_squatter')?.role).toBe('USER');
  });

  it('blocks unverified 1-tap fallback login for configured super admin IDs', () => {
    const res = authService.telegramLogin({
      id: 99887766,
      username: 'anything',
      first_name: 'Attacker'
    });
    expect(res.success).toBe(false);
    expect(res.error).toContain('Admin authorization requires verified Telegram WebApp initData');
  });

  it('assigns SUPER_ADMIN role on direct contact share verification for a configured Telegram ID', async () => {
    const res = await authService.completeVerifiedRegistration(
      '0911002233',
      99112233,
      'any_username'
    );
    expect(res.success).toBe(true);
    expect(res.user?.role).toBe('SUPER_ADMIN');
    const persisted = db.getUserById(res.user!.playerId);
    expect(persisted?.role).toBe('SUPER_ADMIN');
  });

  it('does not assign SUPER_ADMIN on contact share for an unconfigured ID with a formerly designated username', async () => {
    const res = await authService.completeVerifiedRegistration(
      '0911002244',
      77001122,
      'sammy_erk'
    );
    expect(res.success).toBe(true);
    expect(res.user?.role).toBe('USER');
  });

  it('allows super admin to change another user role to AGENT', () => {
    const targetUser = db.createUser({
      id: 'usr_player1',
      telegram_id: '12345',
      username: 'PlayerOne',
      referral_code: 'REF_P1',
      role: 'USER'
    });

    expect(targetUser.role).toBe('USER');

    const updated = authService.updateUserRole('super_admin_1', 'usr_player1', 'AGENT', 'Promoted to agent');
    expect(updated.role).toBe('AGENT');
    expect(updated.account_type).toBe('AGENT');

    const persisted = db.getUserById('usr_player1');
    expect(persisted?.role).toBe('AGENT');
    expect(persisted?.account_type).toBe('AGENT');

    // Verify user now shows up in getAgentPerformance
    const agents = db.getAgentPerformance('usr_player1');
    expect(agents.length).toBe(1);
    expect(agents[0].username).toBe('PlayerOne');
  });

  it('allows super admin to change another user role to SUPER_ADMIN', () => {
    db.createUser({
      id: 'usr_player2',
      telegram_id: '67890',
      username: 'PlayerTwo',
      referral_code: 'REF_P2',
      role: 'USER'
    });

    const updated = authService.updateUserRole('super_admin_1', 'usr_player2', 'SUPER_ADMIN', 'Promoted to super admin');
    expect(updated.role).toBe('SUPER_ADMIN');
    expect(updated.account_type).toBe('ADMIN');

    const persisted = db.getUserById('usr_player2');
    expect(persisted?.role).toBe('SUPER_ADMIN');
  });

  it('allows super admin to revert an agent or super admin back to USER', () => {
    db.createUser({
      id: 'usr_agent_temp',
      telegram_id: '111222',
      username: 'TempAgent',
      referral_code: 'REF_TA',
      role: 'AGENT',
      account_type: 'AGENT'
    });

    const updated = authService.updateUserRole('super_admin_1', 'usr_agent_temp', 'USER', 'Role revoked');
    expect(updated.role).toBe('USER');
    expect(updated.account_type).toBe('REAL');

    const persisted = db.getUserById('usr_agent_temp');
    expect(persisted?.role).toBe('USER');
    expect(persisted?.account_type).toBe('REAL');
  });

  it('rejects self-role modification and invalid roles', () => {
    db.createUser({
      id: 'admin_self',
      telegram_id: '999999',
      username: 'AdminSelf',
      referral_code: 'REF_AS',
      role: 'SUPER_ADMIN'
    });

    // Self-modification forbidden
    expect(() => {
      authService.updateUserRole('admin_self', 'admin_self', 'USER');
    }).toThrow('Self-role modification forbidden');

    // Invalid role rejected
    expect(() => {
      authService.updateUserRole('admin_self', 'some_target', 'INVALID_ROLE' as any);
    }).toThrow('Invalid role');

    // Target not found
    expect(() => {
      authService.updateUserRole('admin_self', 'non_existent_id', 'AGENT');
    }).toThrow('Target user not found');
  });
});
