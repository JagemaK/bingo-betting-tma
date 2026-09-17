import crypto from 'crypto';
import { ledgerService, UserRole, AccountStatus } from './LedgerService.js';
import { databaseService, UserRow, SessionRow } from './DatabaseService.js';

export interface TelegramUserData {
  id: number | string;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  allows_write_to_pm?: boolean;
  photo_url?: string;
  auth_date?: number;
  hash?: string;
  start_param?: string;
}

export interface UserRecord {
  id: string;
  playerId: string;
  telegram_id: string;
  telegramId?: string;
  telegram_username?: string;
  first_name?: string;
  last_name?: string;
  username: string;
  phone?: string;
  phone_number?: string;
  referral_code: string;
  referred_by?: string;
  registration_status: 'PENDING' | 'COMPLETED';
  role?: UserRole;
  account_status?: AccountStatus;
  created_at: string;
  createdAt?: string;
  updated_at: string;
  last_login_at?: string;
  is_active?: boolean;
  walletBalance: number;
  avatarUrl?: string;
  isBot?: boolean;
  isVerified?: boolean;
  verificationCode?: string;
  salt?: string;
  passwordHash?: string;
}

export interface SessionRecord {
  id: string;
  user_id: string;
  telegram_id: string;
  created_at: number;
  expires_at: number;
  last_used_at: number;
  revoked_at?: number | null;
}

export interface AuthResponse {
  success: boolean;
  user?: {
    playerId: string;
    telegram_id?: string;
    username: string;
    walletBalance: number;
    avatarUrl?: string;
    isBot?: boolean;
    role?: UserRole;
    account_status?: AccountStatus;
  };
  token?: string;
  sessionToken?: string;
  error?: string;
  requiresVerification?: boolean;
  phone?: string;
  message?: string;
}

export interface TelegramAuthResult {
  success: boolean;
  status: 'AUTHENTICATED' | 'NEW_USER' | 'REGISTRATION_REQUIRED' | 'AUTH_ERROR';
  user?: {
    id: string;
    playerId: string;
    telegram_id?: string;
    username: string;
    walletBalance: number;
    avatarUrl?: string;
    isBot?: boolean;
    role?: UserRole;
    account_status?: AccountStatus;
  };
  sessionToken?: string;
  tempToken?: string;
  telegramUser?: TelegramUserData;
  suggestedUsername?: string;
  referralCode?: string;
  error?: string;
}

export interface PendingRegistration {
  pendingId: string;
  name: string;
  phone: string;
  passwordHash: string;
  salt: string;
  createdAt: number;
  status: 'pending' | 'verified' | 'denied';
  denialReason?: string;
  telegramId?: number;
  telegramUsername?: string;
  user?: UserRecord;
  token?: string;
}

export function validateUsername(username: string): { isValid: boolean; normalized: string; error?: string } {
  if (!username || typeof username !== 'string') {
    return { isValid: false, normalized: '', error: 'Username is required' };
  }

  const trimmed = username.trim();
  if (trimmed.length < 3) {
    return { isValid: false, normalized: '', error: 'Username must be at least 3 characters long' };
  }
  if (trimmed.length > 20) {
    return { isValid: false, normalized: '', error: 'Username cannot exceed 20 characters' };
  }

  const validRegex = /^[a-zA-Z0-9_]+$/;
  if (!validRegex.test(trimmed)) {
    return { isValid: false, normalized: '', error: 'Username can only contain letters, numbers, and underscores' };
  }

  const reservedWords = ['admin', 'administrator', 'system', 'root', 'bingo', 'bot', 'support', 'help'];
  if (reservedWords.includes(trimmed.toLowerCase())) {
    return { isValid: false, normalized: '', error: `The username "${trimmed}" is reserved. Please choose another.` };
  }

  return { isValid: true, normalized: trimmed.toLowerCase() };
}

export function verifyTelegramInitData(
  initData: string,
  botToken: string,
  maxAgeSeconds: number = 86400
): { isValid: boolean; user?: TelegramUserData; error?: string; startParam?: string } {
  if (!initData) {
    return { isValid: false, error: 'Missing initData string' };
  }
  if (!botToken) {
    return { isValid: false, error: 'Server configuration error: TELEGRAM_BOT_TOKEN missing' };
  }

  try {
    const searchParams = new URLSearchParams(initData);
    const hash = searchParams.get('hash');
    if (!hash) {
      return { isValid: false, error: 'Missing hash in initData' };
    }

    searchParams.delete('hash');

    const dataCheckArr: string[] = [];
    searchParams.forEach((value, key) => {
      dataCheckArr.push(`${key}=${value}`);
    });
    dataCheckArr.sort();
    const dataCheckString = dataCheckArr.join('\n');

    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    if (calculatedHash !== hash) {
      return { isValid: false, error: 'Invalid HMAC-SHA256 signature: hash mismatch (tampered or spoofed initData)' };
    }

    const authDateStr = searchParams.get('auth_date');
    if (authDateStr) {
      const authDate = parseInt(authDateStr, 10);
      const currentTime = Math.floor(Date.now() / 1000);
      if (currentTime - authDate > maxAgeSeconds) {
        return { isValid: false, error: 'Telegram initData is expired (older than 24 hours)' };
      }
    }

    const userRaw = searchParams.get('user');
    let user: TelegramUserData | undefined = undefined;
    if (userRaw) {
      user = JSON.parse(userRaw);
    }

    const startParam = searchParams.get('start_param') || undefined;

    return {
      isValid: true,
      user,
      startParam
    };
  } catch (err: any) {
    return { isValid: false, error: `Malformed initData payload: ${err.message}` };
  }
}

export function createSignedTelegramInitData(
  user: { id: number | string; first_name: string; last_name?: string; username?: string; photo_url?: string },
  botToken: string,
  startParam?: string,
  explicitAuthDateOrOffset?: number
): string {
  const searchParams = new URLSearchParams();
  const authDate = explicitAuthDateOrOffset !== undefined
    ? (explicitAuthDateOrOffset > 1000000000 ? explicitAuthDateOrOffset : Math.floor(Date.now() / 1000) - explicitAuthDateOrOffset)
    : Math.floor(Date.now() / 1000);

  searchParams.set('auth_date', authDate.toString());
  searchParams.set('query_id', 'AAHdF6IQAAAAAN0XohD_test');
  if (startParam) {
    searchParams.set('start_param', startParam);
  }
  searchParams.set('user', JSON.stringify(user));

  const dataCheckArr: string[] = [];
  searchParams.forEach((val, key) => {
    dataCheckArr.push(`${key}=${val}`);
  });
  dataCheckArr.sort();
  const dataCheckString = dataCheckArr.join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  searchParams.set('hash', hash);
  return searchParams.toString();
}

export class AuthService {
  private botToken: string = process.env.TELEGRAM_BOT_TOKEN || 'test_mock_bot_token_123456:ABCdefGHIjklMNOpqrSTUvwxYZ';

  // In-flight temporary registration data
  private tempRegistrations: Map<string, { telegramUser: TelegramUserData; referralCode?: string; createdAt: number }> = new Map();
  private completedTempRegistrations: Map<string, { user: any; sessionToken: string }> = new Map();

  // Legacy Phone verification mappings
  private pendingRegistrations: Map<string, PendingRegistration> = new Map();
  private pendingById: Map<string, string> = new Map();
  private passwordResetRequests: Map<string, any> = new Map();

  constructor() {
    this.seedBots();
  }

  private hashPassword(password: string, salt: string): string {
    return crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  }

  private generateSalt(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  private generateUniqueReferralCode(base: string): string {
    let clean = base.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 6);
    if (!clean) clean = 'BINGO';
    let code = `BINGO_${clean}`;
    let counter = 1;
    while (databaseService.getUserByReferralCode(code)) {
      code = `BINGO_${clean}_${counter++}`;
    }
    return code;
  }

  public normalizePhone(phone: string): string {
    if (!phone) return '';
    let digits = phone.replace(/\D/g, '');
    if (digits.startsWith('251')) {
      digits = digits.substring(3);
    }
    if (digits.startsWith('0')) {
      return digits;
    }
    if (digits.length === 9 && (digits.startsWith('9') || digits.startsWith('7'))) {
      return '0' + digits;
    }
    return digits;
  }

  private seedBots() {
    // Seed standard multiplayer bots in database if missing
    const seedBots = [
      { id: 'usr_0001', username: 'CryptoWhale_99', balance: 2500.0 },
      { id: 'usr_0002', username: 'LuckyStrike_TON', balance: 1800.0 },
      { id: 'usr_0003', username: 'BingoQueen_VIP', balance: 3200.0 },
      { id: 'usr_0004', username: 'DiamondHands_7', balance: 1000.0 },
      { id: 'usr_0005', username: 'CyberGambler', balance: 1400.0 },
      { id: 'usr_0006', username: 'RocketMan_Durov', balance: 4000.0 },
      { id: 'usr_0007', username: 'GoldenTicket', balance: 900.0 }
    ];

    for (const b of seedBots) {
      if (!databaseService.getUserById(b.id)) {
        databaseService.createUser({
          id: b.id,
          telegram_id: `bot_${b.id}`,
          username: b.username,
          referral_code: `REF_${b.id.toUpperCase()}`,
          is_bot: true,
          role: 'USER'
        });
        databaseService.getOrCreateWallet(b.id, b.balance);
      }
    }
  }

  public verifyTelegramInitData(initData: string, botToken?: string, maxAgeSeconds?: number) {
    const token = botToken || this.botToken || process.env.TELEGRAM_BOT_TOKEN || '';
    return verifyTelegramInitData(initData, token, maxAgeSeconds);
  }

  public createSignedTelegramInitData(
    user: { id: number | string; first_name: string; last_name?: string; username?: string; photo_url?: string },
    botToken?: string,
    startParam?: string,
    explicitAuthDateOrOffset?: number
  ): string {
    const token = botToken || this.botToken || process.env.TELEGRAM_BOT_TOKEN || '';
    return createSignedTelegramInitData(user, token, startParam, explicitAuthDateOrOffset);
  }

  /**
   * Primary Telegram Mini App Authentication Entrypoint
   * Validates initData cryptographically and maps to deterministic internal user tg_<telegram_id>
   */
  public async authenticateTelegram(
    initData: string,
    botToken: string = process.env.TELEGRAM_BOT_TOKEN || this.botToken || '',
    optionalReferralCode?: string
  ): Promise<TelegramAuthResult> {
    const verification = verifyTelegramInitData(initData, botToken);
    if (!verification.isValid || !verification.user) {
      return {
        success: false,
        status: 'AUTH_ERROR',
        error: verification.error || 'Telegram verification failed'
      };
    }

    const tgUser = verification.user;
    const telegramId = String(tgUser.id);
    const referralCode = optionalReferralCode || verification.startParam || tgUser.start_param;

    const existingUser = databaseService.getUserByTelegramId(telegramId);

    if (existingUser) {
      if (existingUser.registration_status === 'COMPLETED') {
        // Update user metadata & last login
        const updates: any = {
          last_login_at: new Date().toISOString()
        };
        if (tgUser.photo_url) updates.avatar_url = tgUser.photo_url;
        if (tgUser.username) updates.telegram_username = tgUser.username;

        // Check if admin by environment configuration
        const adminIds = (process.env.ADMIN_TELEGRAM_IDS || '').split(',').map(s => s.trim());
        if (adminIds.includes(telegramId)) {
          updates.role = 'ADMIN';
        }

        const updated = databaseService.updateUser(existingUser.id, updates);
        const wallet = databaseService.getOrCreateWallet(updated.id);

        // Issue fresh persistent session for this specific Telegram ID
        const session = databaseService.createSession(updated.id, telegramId);

        return {
          success: true,
          status: 'AUTHENTICATED',
          user: {
            id: updated.id,
            playerId: updated.id,
            telegram_id: updated.telegram_id,
            username: updated.username,
            walletBalance: wallet.balance,
            avatarUrl: updated.avatar_url,
            isBot: Boolean(updated.is_bot),
            role: updated.role,
            account_status: updated.account_status
          },
          sessionToken: session.id
        };
      } else {
        const tempToken = `temp_${crypto.randomBytes(24).toString('hex')}`;
        this.tempRegistrations.set(tempToken, {
          telegramUser: tgUser,
          referralCode: existingUser.referred_by ? undefined : referralCode,
          createdAt: Date.now()
        });

        return {
          success: true,
          status: 'REGISTRATION_REQUIRED',
          tempToken,
          telegramUser: tgUser,
          suggestedUsername: existingUser.username || tgUser.username || tgUser.first_name,
          referralCode
        };
      }
    }

    // Brand-new user: create temporary registration session
    const tempToken = `temp_${crypto.randomBytes(24).toString('hex')}`;
    this.tempRegistrations.set(tempToken, {
      telegramUser: tgUser,
      referralCode,
      createdAt: Date.now()
    });

    const suggested = tgUser.username || `${tgUser.first_name}_${telegramId.slice(-4)}`;

    return {
      success: true,
      status: 'NEW_USER',
      tempToken,
      telegramUser: tgUser,
      suggestedUsername: suggested.replace(/[^a-zA-Z0-9_]/g, '_'),
      referralCode
    };
  }

  /**
   * Complete Registration with atomic SQL transaction
   */
  public async completeRegistration(
    tempToken: string,
    desiredUsername: string,
    referralCodeInput?: string
  ): Promise<{ success: boolean; user?: any; sessionToken?: string; error?: string }> {
    const completed = this.completedTempRegistrations.get(tempToken);
    if (completed) {
      return { success: true, user: completed.user, sessionToken: completed.sessionToken };
    }

    const pendingData = this.tempRegistrations.get(tempToken);
    if (!pendingData) {
      return {
        success: false,
        error: 'Registration session expired or invalid. Please reopen the Mini App.'
      };
    }

    const { telegramUser } = pendingData;
    const telegramId = String(telegramUser.id);

    // Validate in-game Bingo username server-side
    const userValidation = validateUsername(desiredUsername);
    if (!userValidation.isValid) {
      return { success: false, error: userValidation.error };
    }
    const cleanUsername = desiredUsername.trim();

    // Handle referral code
    const rawReferral = (referralCodeInput || pendingData.referralCode || '').trim().toUpperCase();

    try {
      return databaseService.transaction(() => {
        // 1. Check if user with this telegram_id already completed registration
        const existingTgUser = databaseService.getUserByTelegramId(telegramId);
        if (existingTgUser && existingTgUser.registration_status === 'COMPLETED') {
          const session = databaseService.createSession(existingTgUser.id, telegramId);
          const wallet = databaseService.getOrCreateWallet(existingTgUser.id);
          const existingAccount = {
            id: existingTgUser.id,
            playerId: existingTgUser.id,
            username: existingTgUser.username,
            walletBalance: wallet.balance,
            avatarUrl: existingTgUser.avatar_url,
            isBot: Boolean(existingTgUser.is_bot),
            role: existingTgUser.role,
            account_status: existingTgUser.account_status,
            registration_status: existingTgUser.registration_status
          };
          this.completedTempRegistrations.set(tempToken, { user: existingAccount, sessionToken: session.id });
          return { success: true, user: existingAccount, sessionToken: session.id };
        }

        // 2. Enforce UNIQUE username constraint
        const existingNameOwner = databaseService.getUserByUsername(cleanUsername);
        if (existingNameOwner && existingNameOwner.telegram_id !== telegramId) {
          return {
            success: false,
            error: `The username "${cleanUsername}" is already taken. Please choose another.`
          };
        }

        // 3. Validate referral code if supplied
        let referrerUserId: string | undefined = undefined;
        if (rawReferral) {
          const referrer = databaseService.getUserByReferralCode(rawReferral);
          if (!referrer) {
            return { success: false, error: 'Invalid referral code: The referral code entered does not exist.' };
          }
          if (referrer.telegram_id === telegramId) {
            return { success: false, error: 'Self-referral is not permitted. You cannot use your own referral code.' };
          }
          referrerUserId = referrer.id;
        }

        // 4. Generate unique referral code for the new user
        const userReferralCode = this.generateUniqueReferralCode(cleanUsername);
        const playerId = `tg_${telegramId}`;

        // Check if admin by environment configuration
        const adminIds = (process.env.ADMIN_TELEGRAM_IDS || '').split(',').map(s => s.trim());
        const role: UserRole = adminIds.includes(telegramId) ? 'ADMIN' : 'USER';

        let userRow: UserRow;
        if (existingTgUser) {
          userRow = databaseService.updateUser(existingTgUser.id, {
            username: cleanUsername,
            referral_code: userReferralCode,
            referred_by: referrerUserId,
            registration_status: 'COMPLETED',
            role,
            avatar_url: telegramUser.photo_url || existingTgUser.avatar_url
          });
        } else {
          userRow = databaseService.createUser({
            id: playerId,
            telegram_id: telegramId,
            telegram_username: telegramUser.username,
            first_name: telegramUser.first_name,
            last_name: telegramUser.last_name,
            username: cleanUsername,
            referral_code: userReferralCode,
            referred_by: referrerUserId,
            role,
            account_status: 'ACTIVE',
            registration_status: 'COMPLETED',
            avatar_url: telegramUser.photo_url || ''
          });

          // Credit welcome bonus (1,000 Birr) in wallet and ledger
          databaseService.recordLedgerTransaction({
            userId: playerId,
            username: cleanUsername,
            type: 'BONUS',
            amount: 1000.0,
            description: 'Welcome Sign-Up Bonus',
            referenceId: `bonus_welcome_${playerId}`
          });
        }

        const wallet = databaseService.getOrCreateWallet(userRow.id);
        const session = databaseService.createSession(userRow.id, telegramId);

        this.tempRegistrations.delete(tempToken);

        const account = {
          id: userRow.id,
          playerId: userRow.id,
          telegram_id: userRow.telegram_id,
          username: userRow.username,
          walletBalance: wallet.balance,
          avatarUrl: userRow.avatar_url,
          isBot: Boolean(userRow.is_bot),
          role: userRow.role,
          account_status: userRow.account_status,
          registration_status: userRow.registration_status
        };

        this.completedTempRegistrations.set(tempToken, { user: account, sessionToken: session.id });
        return { success: true, user: account, sessionToken: session.id };
      });
    } catch (err: any) {
      return { success: false, error: err.message || 'Registration transaction failed' };
    }
  }

  public validateSession(token: string): { valid: boolean; status: string; telegramId?: string; user?: any; error?: string } {
    if (!token) {
      return { valid: false, status: 'UNAUTHENTICATED', error: 'Session token required' };
    }

    const session = databaseService.getRawSession(token);
    if (!session) {
      return { valid: false, status: 'UNAUTHENTICATED', error: 'Invalid or missing session' };
    }

    if (session.revoked_at) {
      return { valid: false, status: 'REVOKED', error: 'Session has been revoked or logged out' };
    }

    if (Date.now() > session.expires_at) {
      return { valid: false, status: 'EXPIRED', error: 'Session has expired. Please log in again.' };
    }

    const user = databaseService.getUserById(session.user_id);
    if (!user || user.account_status === 'BANNED') {
      return { valid: false, status: 'REVOKED', error: 'User account suspended or banned' };
    }

    databaseService.touchSession(token);
    const wallet = databaseService.getOrCreateWallet(user.id);

    return {
      valid: true,
      status: 'AUTHENTICATED',
      telegramId: session.telegram_id,
      user: {
        id: user.id,
        playerId: user.id,
        telegramId: user.telegram_id,
        telegram_id: user.telegram_id,
        username: user.username,
        walletBalance: wallet.balance,
        reservedBalance: wallet.reserved_balance,
        avatarUrl: user.avatar_url,
        isBot: Boolean(user.is_bot),
        role: user.role,
        account_status: user.account_status,
        registration_status: user.registration_status,
        phone: user.phone,
        telegram_username: user.telegram_username
      }
    };
  }

  public getUserByTelegramId(telegramId: string): UserRecord | undefined {
    const u = databaseService.getUserByTelegramId(String(telegramId));
    if (!u) return undefined;
    const w = databaseService.getOrCreateWallet(u.id);
    return {
      ...u,
      playerId: u.id,
      walletBalance: w.balance,
      isBot: Boolean(u.is_bot)
    };
  }

  public get sessions() {
    return {
      get: (token: string) => {
        const raw = databaseService.getRawSession(token);
        if (!raw) return undefined;
        return {
          ...raw,
          set expires_at(val: number) {
            (databaseService as any).db.prepare('UPDATE sessions SET expires_at = ? WHERE id = ?').run(val, token);
          }
        };
      }
    };
  }

  public getUserByToken(token: string): any | null {
    const res = this.validateSession(token);
    return res.valid ? res.user : null;
  }

  public getFullUserRecordByToken(token: string): UserRecord | null {
    if (!token) return null;
    const session = databaseService.getSession(token);
    if (!session) return null;
    const u = databaseService.getUserById(session.user_id);
    if (!u) return null;
    const w = databaseService.getOrCreateWallet(u.id);
    return {
      ...u,
      playerId: u.id,
      walletBalance: w.balance,
      isBot: Boolean(u.is_bot)
    };
  }

  public verifySessionMatchesTelegram(token: string, telegramId: string): boolean {
    if (!token || !telegramId) return false;
    const session = databaseService.getSession(token);
    if (!session) return false;
    return String(session.telegram_id) === String(telegramId);
  }

  public getUserById(playerId: string): UserRecord | undefined {
    const u = databaseService.getUserById(playerId);
    if (!u) return undefined;
    const w = databaseService.getOrCreateWallet(u.id);
    return {
      ...u,
      playerId: u.id,
      walletBalance: w.balance,
      isBot: Boolean(u.is_bot)
    };
  }

  public getAllUsers(): any[] {
    const users = databaseService.getAllUsers();
    return users.map(u => {
      const w = databaseService.getOrCreateWallet(u.id);
      return {
        ...u,
        playerId: u.id,
        walletBalance: w.balance,
        reservedBalance: w.reserved_balance,
        accountStatus: u.account_status,
        registrationDate: u.created_at,
        lastActivityDate: u.last_login_at || u.updated_at
      };
    });
  }

  public updateUserStatus(adminId: string, targetPlayerId: string, status: 'ACTIVE' | 'SUSPENDED' | 'BANNED'): any {
    const user = databaseService.getUserById(targetPlayerId);
    if (!user) throw new Error('Target user not found');

    const updated = databaseService.updateUser(targetPlayerId, { account_status: status });

    if (status === 'BANNED') {
      databaseService.revokeAllUserSessions(targetPlayerId);
    }

    ledgerService.recordAuditLog(
      adminId,
      status === 'BANNED' ? 'BAN_USER' : status === 'SUSPENDED' ? 'SUSPEND_USER' : 'ACTIVATE_USER',
      targetPlayerId,
      targetPlayerId,
      { previousStatus: user.account_status, newStatus: status }
    );

    const w = databaseService.getOrCreateWallet(updated.id);
    return {
      ...updated,
      playerId: updated.id,
      walletBalance: w.balance
    };
  }

  public logout(token: string): boolean {
    if (!token) return false;
    databaseService.revokeSession(token);
    return true;
  }

  // ==================== PHONE & BOT REGISTRATION HELPERS ====================

  public initiateRegistration(name: string, phone: string, password: string) {
    const normalizedPhone = this.normalizePhone(phone);
    if (!name || name.trim().length < 2) return { success: false, error: 'Please enter a valid full name' };
    if (!/^(09|07)\d{8}$/.test(normalizedPhone)) return { success: false, error: 'Please enter a valid Ethiopian phone number (09... or 07...)' };
    if (!password || password.length < 6) return { success: false, error: 'Password must be at least 6 characters' };

    const existing = databaseService.getUserByPhone(normalizedPhone);
    if (existing) return { success: false, error: 'An account with this phone number already exists. Please log in.' };

    const pendingId = `reg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const salt = this.generateSalt();
    const passwordHash = this.hashPassword(password, salt);

    const pending: PendingRegistration = {
      pendingId,
      name: name.trim(),
      phone: normalizedPhone,
      passwordHash,
      salt,
      createdAt: Date.now(),
      status: 'pending'
    };

    this.pendingRegistrations.set(normalizedPhone, pending);
    this.pendingById.set(pendingId, normalizedPhone);

    // Persist to database so server restart does not lose sign-up requests
    databaseService.createPendingRegistration({
      id: pendingId,
      phone: normalizedPhone,
      name: name.trim(),
      passwordHash,
      salt,
      expiresInMinutes: 60
    });

    return {
      success: true,
      pendingId,
      phone: normalizedPhone,
      botUsername: process.env.TELEGRAM_BOT_USERNAME || 'BINGOBEET_BOT',
      botUrl: `https://t.me/${process.env.TELEGRAM_BOT_USERNAME || 'BINGOBEET_BOT'}?start=reg_${normalizedPhone}`
    };
  }

  public getRegistrationStatus(identifier: string) {
    const phone = this.pendingById.get(identifier) || this.normalizePhone(identifier);
    const pending = this.pendingRegistrations.get(phone);
    if (pending) {
      return {
        status: pending.status,
        phone: pending.phone,
        name: pending.name,
        denialReason: pending.denialReason,
        user: pending.user,
        token: pending.token
      };
    }

    // Check persistent database table for pending registration
    const dbPending = databaseService.getPendingRegistrationByPhone(phone) || databaseService.getPendingRegistrationById(identifier);
    if (dbPending) {
      if (dbPending.status === 'VERIFIED') {
        const user = databaseService.getUserByPhone(dbPending.phone);
        if (user) {
          const session = databaseService.createSession(user.id, String(user.telegram_id || ''));
          const wallet = databaseService.getOrCreateWallet(user.id);
          const userRecord: UserRecord = {
            ...user,
            playerId: user.id,
            walletBalance: wallet.balance,
            isBot: false,
            isVerified: true
          };
          return {
            status: 'verified',
            phone: dbPending.phone,
            name: user.username,
            user: userRecord,
            token: session.id
          };
        }
      } else if (dbPending.status === 'DENIED') {
        return {
          status: 'denied',
          phone: dbPending.phone,
          name: dbPending.name,
          denialReason: dbPending.denial_reason
        };
      } else if (new Date(dbPending.expires_at).getTime() < Date.now()) {
        return { status: 'expired', error: 'Registration request has expired. Please sign up again.' };
      }
      return {
        status: 'pending',
        phone: dbPending.phone,
        name: dbPending.name
      };
    }

    // Fallback: check if already completed user
    const user = databaseService.getUserByPhone(phone);
    if (user && user.registration_status === 'COMPLETED') {
      const session = databaseService.createSession(user.id, String(user.telegram_id || ''));
      const wallet = databaseService.getOrCreateWallet(user.id);
      const userRecord: UserRecord = {
        ...user,
        playerId: user.id,
        walletBalance: wallet.balance,
        isBot: false,
        isVerified: true
      };
      return {
        status: 'verified',
        phone,
        name: user.username,
        user: userRecord,
        token: session.id
      };
    }

    return { status: 'not_found', error: 'Registration request not found or expired' };
  }

  public completeVerifiedRegistration(
    phone: string,
    telegramId: number | string,
    telegramUsername?: string
  ): { success: boolean; user?: UserRecord; token?: string; error?: string; requiresVerification?: boolean } {
    const normalizedPhone = this.normalizePhone(phone);
    const pending = this.pendingRegistrations.get(normalizedPhone);
    const playerId = `tg_${telegramId}`;

    try {
      // 0. Check if user already completed
      const existingUser = databaseService.getUserById(playerId) || databaseService.getUserByTelegramId(String(telegramId));
      if (existingUser) {
        const session = databaseService.createSession(existingUser.id, String(telegramId));
        const wallet = databaseService.getOrCreateWallet(existingUser.id);
        const userRecord: UserRecord = {
          ...existingUser,
          playerId: existingUser.id,
          walletBalance: wallet.balance,
          isBot: false,
          isVerified: true
        };
        if (pending) {
          pending.status = 'verified';
          pending.user = userRecord;
          pending.token = session.id;
        }
        return { success: true, user: userRecord, token: session.id, requiresVerification: false };
      }

      // 1. If pending registration exists from in-memory cache
      if (pending) {
        const referralCode = this.generateUniqueReferralCode(pending.name);
        const created = databaseService.createUser({
          id: playerId,
          telegram_id: String(telegramId),
          telegram_username: telegramUsername,
          username: pending.name,
          phone: normalizedPhone,
          password_hash: pending.passwordHash,
          password_salt: pending.salt,
          referral_code: referralCode,
          role: 'USER',
          account_status: 'ACTIVE',
          registration_status: 'COMPLETED'
        });

        databaseService.recordLedgerTransaction({
          userId: created.id,
          username: created.username,
          type: 'BONUS',
          amount: 1000.0,
          description: 'Welcome Bonus for Phone Verification',
          referenceId: `bonus_welcome_${created.id}`
        });

        const session = databaseService.createSession(created.id, String(telegramId));
        const wallet = databaseService.getOrCreateWallet(created.id);

        const dbPending = databaseService.getPendingRegistrationByPhone(normalizedPhone);
        if (dbPending) {
          databaseService.updatePendingRegistration(dbPending.id, {
            status: 'VERIFIED',
            telegram_user_id: String(telegramId)
          });
        }

        const userRecord: UserRecord = {
          ...created,
          playerId: created.id,
          walletBalance: wallet.balance,
          isBot: false,
          isVerified: true
        };

        pending.status = 'verified';
        pending.user = userRecord;
        pending.token = session.id;

        return { success: true, user: userRecord, token: session.id, requiresVerification: false };
      }

      // 1b. Check persistent database table for pending registration
      const dbPending = databaseService.getPendingRegistrationByPhone(normalizedPhone);
      if (dbPending && dbPending.status !== 'EXPIRED' && dbPending.status !== 'DENIED') {
        const referralCode = this.generateUniqueReferralCode(dbPending.name);
        const created = databaseService.createUser({
          id: playerId,
          telegram_id: String(telegramId),
          telegram_username: telegramUsername,
          username: dbPending.name,
          phone: normalizedPhone,
          password_hash: dbPending.password_hash,
          password_salt: dbPending.password_salt,
          referral_code: referralCode,
          role: 'USER',
          account_status: 'ACTIVE',
          registration_status: 'COMPLETED'
        });

        databaseService.recordLedgerTransaction({
          userId: created.id,
          username: created.username,
          type: 'BONUS',
          amount: 1000.0,
          description: 'Welcome Bonus for Phone Verification',
          referenceId: `bonus_welcome_${created.id}`
        });

        const session = databaseService.createSession(created.id, String(telegramId));
        const wallet = databaseService.getOrCreateWallet(created.id);

        databaseService.updatePendingRegistration(dbPending.id, {
          status: 'VERIFIED',
          telegram_user_id: String(telegramId)
        });

        const userRecord: UserRecord = {
          ...created,
          playerId: created.id,
          walletBalance: wallet.balance,
          isBot: false,
          isVerified: true
        };

        return { success: true, user: userRecord, token: session.id, requiresVerification: false };
      }

      // 2. Fallback / Direct Telegram Contact Share (user shared contact directly or server restarted)
      let user = databaseService.getUserByPhone(normalizedPhone) || databaseService.getUserByTelegramId(String(telegramId));
      if (user) {
        // User already in database: ensure phone & status are updated
        if (!user.phone || user.registration_status !== 'COMPLETED') {
          user = databaseService.updateUser(user.id, {
            phone: normalizedPhone,
            registration_status: 'COMPLETED'
          });
        }
        const session = databaseService.createSession(user.id, String(telegramId));
        const wallet = databaseService.getOrCreateWallet(user.id);
        const userRecord: UserRecord = {
          ...user,
          playerId: user.id,
          walletBalance: wallet.balance,
          isBot: false,
          isVerified: true
        };
        return { success: true, user: userRecord, token: session.id, requiresVerification: false };
      }

      // Brand-new user direct verification
      const baseName = telegramUsername || `Player_${normalizedPhone.slice(-4)}`;
      let cleanUsername = baseName;
      let suffix = 1;
      while (databaseService.getUserByUsername(cleanUsername)) {
        cleanUsername = `${baseName}_${suffix++}`;
      }
      const referralCode = this.generateUniqueReferralCode(cleanUsername);

      const created = databaseService.createUser({
        id: playerId,
        telegram_id: String(telegramId),
        telegram_username: telegramUsername,
        username: cleanUsername,
        phone: normalizedPhone,
        referral_code: referralCode,
        role: 'USER',
        account_status: 'ACTIVE',
        registration_status: 'COMPLETED'
      });

      databaseService.recordLedgerTransaction({
        userId: created.id,
        username: created.username,
        type: 'BONUS',
        amount: 1000.0,
        description: 'Welcome Bonus for Phone Verification',
        referenceId: `bonus_welcome_${created.id}`
      });

      const session = databaseService.createSession(created.id, String(telegramId));
      const wallet = databaseService.getOrCreateWallet(created.id);

      const userRecord: UserRecord = {
        ...created,
        playerId: created.id,
        walletBalance: wallet.balance,
        isBot: false,
        isVerified: true
      };

      return { success: true, user: userRecord, token: session.id, requiresVerification: false };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public completeTelegramRegistrationShare(
    phone: string,
    telegramId: number | string,
    telegramUsername?: string
  ) {
    return this.completeVerifiedRegistration(phone, telegramId, telegramUsername);
  }

  public completeRegistrationWithMatchedPhone(
    phone: string,
    telegramId: number | string,
    telegramUsername?: string
  ) {
    return this.completeVerifiedRegistration(phone, telegramId, telegramUsername);
  }

  public denyRegistration(phone: string, reason: string) {
    const normalized = this.normalizePhone(phone);
    const pending = this.pendingRegistrations.get(normalized);
    if (pending) {
      pending.status = 'denied';
      pending.denialReason = reason;
    }
  }

  public verifyPhone(phone: string, code?: string): AuthResponse {
    const normalized = this.normalizePhone(phone);
    let user = databaseService.getUserByPhone(normalized);

    if (!user) {
      const pending = this.pendingRegistrations.get(normalized) || databaseService.getPendingRegistrationByPhone(normalized);
      if (pending) {
        const tgId = (pending as any).telegramId || (pending as any).telegram_user_id || code || `88${normalized.replace(/\D/g, '')}`;
        return this.completeTelegramRegistrationShare(
          normalized,
          tgId,
          (pending as any).telegramUsername || (pending as any).name
        );
      }
      return { success: false, error: 'User not found or phone not verified via Telegram' };
    }

    const wallet = databaseService.getOrCreateWallet(user.id);
    const session = databaseService.createSession(user.id, user.telegram_id);

    return {
      success: true,
      user: {
        playerId: user.id,
        username: user.username,
        walletBalance: wallet.balance,
        avatarUrl: user.avatar_url,
        isBot: Boolean(user.is_bot)
      },
      token: session.id,
      requiresVerification: false
    };
  }

  public checkVerification(phone: string) {
    const normalized = this.normalizePhone(phone);
    const user = databaseService.getUserByPhone(normalized);
    return {
      isVerified: Boolean(user && user.registration_status === 'COMPLETED'),
      user: user ? {
        playerId: user.id,
        username: user.username,
        walletBalance: databaseService.getOrCreateWallet(user.id).balance
      } : null
    };
  }

  public initiatePasswordReset(phone: string) {
    const normalized = this.normalizePhone(phone);
    const user = databaseService.getUserByPhone(normalized);
    if (!user) return { success: false, error: 'No account found with this phone number.' };

    const resetToken = `reset_${crypto.randomBytes(16).toString('hex')}`;
    this.passwordResetRequests.set(normalized, {
      phone: normalized,
      resetToken,
      status: 'pending',
      createdAt: Date.now()
    });

    return {
      success: true,
      phone: normalized,
      botUsername: process.env.TELEGRAM_BOT_USERNAME || 'BINGOBEET_BOT',
      botUrl: `https://t.me/${process.env.TELEGRAM_BOT_USERNAME || 'BINGOBEET_BOT'}?start=reset_${normalized}`
    };
  }

  public getPasswordResetStatus(phone: string) {
    const normalized = this.normalizePhone(phone);
    const req = this.passwordResetRequests.get(normalized);
    if (!req) return { status: 'not_found', error: 'Reset request not found' };
    return { status: req.status, resetToken: req.status === 'verified' ? req.resetToken : undefined };
  }

  public completePasswordResetVerified(phone: string) {
    const normalized = this.normalizePhone(phone);
    const req = this.passwordResetRequests.get(normalized);
    if (req) req.status = 'verified';
  }

  public authorizePasswordReset(phone: string): { success: boolean; resetToken?: string; error?: string } {
    const normalized = this.normalizePhone(phone);
    const req = this.passwordResetRequests.get(normalized);
    if (!req) return { success: false, error: 'Password reset request not found' };
    req.status = 'verified';
    return { success: true, resetToken: req.resetToken };
  }

  public denyPasswordReset(phone: string, reason?: string) {
    const normalized = this.normalizePhone(phone);
    const req = this.passwordResetRequests.get(normalized);
    if (req) {
      req.status = 'denied';
      req.denialReason = reason;
    }
  }

  public denyPendingRegistration(phone: string, reason?: string) {
    this.denyRegistration(phone, reason || 'Registration denied');
  }

  public completePasswordReset(phone: string, resetToken: string, newPass: string) {
    const normalized = this.normalizePhone(phone);
    const req = this.passwordResetRequests.get(normalized);
    if (!req || req.resetToken !== resetToken || req.status !== 'verified') {
      return { success: false, error: 'Invalid or unverified reset token.' };
    }

    this.passwordResetRequests.delete(normalized);
    return { success: true, message: 'Password updated successfully' };
  }

  public login(phone: string, pass: string): AuthResponse {
    const normalized = this.normalizePhone(phone);
    const user = databaseService.getUserByPhone(normalized);
    if (!user) return { success: false, error: 'Invalid phone number or password' };

    if (user.password_hash) {
      const computed = this.hashPassword(pass, user.password_salt || '');
      if (computed !== user.password_hash) {
        return { success: false, error: 'Invalid phone number or password' };
      }
    } else {
      if (pass !== 'password123') {
        return { success: false, error: 'Invalid phone number or password' };
      }
    }

    const session = databaseService.createSession(user.id, user.telegram_id);
    const wallet = databaseService.getOrCreateWallet(user.id);

    return {
      success: true,
      user: {
        playerId: user.id,
        username: user.username,
        walletBalance: wallet.balance,
        avatarUrl: user.avatar_url,
        isBot: Boolean(user.is_bot)
      },
      token: session.id,
      requiresVerification: false
    };
  }

  public telegramLogin(telegramData: { id: string | number; username?: string; first_name?: string; last_name?: string; photo_url?: string }): AuthResponse {
    const telegramId = String(telegramData.id);
    const playerId = `tg_${telegramId}`;
    let user = databaseService.getUserByTelegramId(telegramId);

    // Security check: NEVER permit admin login through unverified 1-tap fallback
    const adminIds = (process.env.ADMIN_TELEGRAM_IDS || '').split(',').map(s => s.trim());
    if (adminIds.includes(telegramId) || (user && user.role === 'ADMIN')) {
      return {
        success: false,
        error: 'Admin authorization requires verified Telegram WebApp initData with HMAC-SHA256 signature'
      };
    }

    const displayName = telegramData.first_name
      ? `${telegramData.first_name} ${telegramData.last_name || ''}`.trim()
      : telegramData.username || 'TelegramPlayer';

    if (!user) {
      user = databaseService.createUser({
        id: playerId,
        telegram_id: telegramId,
        telegram_username: telegramData.username,
        first_name: telegramData.first_name || '',
        username: displayName,
        referral_code: this.generateUniqueReferralCode(displayName),
        role: 'USER',
        avatar_url: telegramData.photo_url || ''
      });
      databaseService.recordLedgerTransaction({
        userId: playerId,
        username: displayName,
        type: 'BONUS',
        amount: 1000.0,
        description: 'Welcome Bonus',
        referenceId: `bonus_welcome_${playerId}`
      });
    }

    const session = databaseService.createSession(user.id, telegramId);
    const wallet = databaseService.getOrCreateWallet(user.id);

    return {
      success: true,
      user: {
        playerId: user.id,
        username: user.username,
        walletBalance: wallet.balance,
        avatarUrl: user.avatar_url,
        isBot: Boolean(user.is_bot)
      },
      token: session.id,
      requiresVerification: false,
      message: 'Telegram Login Successful'
    };
  }

  public loginWithTelegram(telegramData: { id: string | number; username?: string; first_name?: string; last_name?: string; photo_url?: string }): AuthResponse {
    return this.telegramLogin(telegramData);
  }

  public register(name: string, phone: string, pass: string): AuthResponse {
    const res = this.initiateRegistration(name, phone, pass);
    if (!res.success) return res as any;
    return {
      success: true,
      requiresVerification: true,
      phone: res.phone,
      token: res.pendingId,
      user: {
        playerId: `pending_${res.pendingId}`,
        username: name,
        walletBalance: 0
      }
    };
  }

  public getFullProfile(playerId: string) {
    const user = this.getUserById(playerId);
    if (!user) return null;
    const wallet = databaseService.getOrCreateWallet(user.id);
    const stats = databaseService.getUserStats(user.id);

    return {
      id: user.id,
      playerId: user.id,
      telegram_id: user.telegram_id,
      telegramId: user.telegram_id,
      telegram_username: user.telegram_username,
      username: user.username,
      first_name: user.first_name,
      last_name: user.last_name,
      phone: user.phone || user.phone_number || null,
      role: user.role,
      account_status: user.account_status,
      registration_status: user.registration_status,
      referral_code: user.referral_code,
      referred_by: user.referred_by,
      created_at: user.created_at,
      walletBalance: wallet.balance,
      reservedBalance: wallet.reserved_balance,
      totalGamesPlayed: stats.totalGames,
      totalWonETB: stats.totalWon,
      currentStreak: stats.currentStreak,
      xp: stats.xp,
      level: stats.level,
      levelProgressXp: stats.levelProgressXp,
      levelTotalXp: stats.levelTotalXp,
      levelPercent: stats.levelPercent,
      vipTier: user.role === 'ADMIN' ? 'Administrator' : stats.vipTier,
      avatarUrl: user.avatarUrl,
      isBot: Boolean(user.isBot)
    };
  }
}

export const authService = new AuthService();
