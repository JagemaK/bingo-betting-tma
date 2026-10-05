import { describe, it, expect, beforeEach } from 'vitest';
import { DatabaseService } from './DatabaseService.js';
import { AuthService, createSignedTelegramInitData } from './AuthService.js';

describe('Super Admin Telegram Accounts Designation & Role Delegation', () => {
  let db: DatabaseService;
  let authService: AuthService;
  const mockBotToken = '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11';

  beforeEach(() => {
    db = new DatabaseService(':memory:');
    authService = new AuthService(db);
  });

  it('correctly identifies designated super admin accounts in isSuperAdminAccount', () => {
    expect(authService.isSuperAdminAccount(undefined, 'mxt_mdn')).toBe(true);
    expect(authService.isSuperAdminAccount(undefined, '@mxt_mdn')).toBe(true);
    expect(authService.isSuperAdminAccount(undefined, 'MXT_MDN')).toBe(true);
    expect(authService.isSuperAdminAccount(undefined, 'sammy_erk')).toBe(true);
    expect(authService.isSuperAdminAccount(undefined, '@SAMMY_ERK')).toBe(true);
    expect(authService.isSuperAdminAccount(undefined, 'jagema_kello')).toBe(true);
    expect(authService.isSuperAdminAccount(undefined, '@jagema_kello')).toBe(true);

    expect(authService.isSuperAdminAccount(undefined, 'regular_player')).toBe(false);
  });

  it('assigns SUPER_ADMIN role when authenticating any designated Telegram account', async () => {
    for (const [id, username] of [
      [99887766, 'mxt_mdn'],
      [99887767, 'SAMMY_ERK'],
      [99887768, 'jagema_kello']
    ] as const) {
      const signedData = createSignedTelegramInitData(
        {
          id,
          first_name: 'Super',
          last_name: 'Admin',
          username
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

  it('elevates existing users with designated usernames during database migration', () => {
    // Create existing users with 'USER' role
    db.createUser({
      id: 'existing_sammy',
      telegram_id: '11223344',
      telegram_username: 'sammy_erk',
      username: 'sammy_erk',
      role: 'USER',
      referral_code: 'REF_SAMMY'
    });
    db.createUser({
      id: 'existing_jagema',
      telegram_id: '11223345',
      telegram_username: 'jagema_kello',
      username: 'jagema_kello',
      role: 'USER',
      referral_code: 'REF_JAGEMA'
    });

    expect(db.getUserById('existing_sammy')?.role).toBe('USER');
    expect(db.getUserById('existing_jagema')?.role).toBe('USER');

    // Trigger runMigrations check
    (db as any).runMigrations();

    expect(db.getUserById('existing_sammy')?.role).toBe('SUPER_ADMIN');
    expect(db.getUserById('existing_jagema')?.role).toBe('SUPER_ADMIN');
  });

  it('blocks unverified 1-tap fallback login for designated super admin usernames', () => {
    const res = authService.telegramLogin({
      id: 55443322,
      username: 'mxt_mdn',
      first_name: 'Attacker'
    });
    expect(res.success).toBe(false);
    expect(res.error).toContain('Admin authorization requires verified Telegram WebApp initData');
  });

  it('assigns SUPER_ADMIN role on direct contact share verification for designated username', async () => {
    const res = await authService.completeVerifiedRegistration(
      '0911002233',
      99112233,
      'sammy_erk'
    );
    expect(res.success).toBe(true);
    expect(res.user?.role).toBe('SUPER_ADMIN');
    const persisted = db.getUserById(res.user!.playerId);
    expect(persisted?.role).toBe('SUPER_ADMIN');
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
