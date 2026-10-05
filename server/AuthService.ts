import crypto from 'crypto';
import { ledgerService, UserRole, AccountStatus } from './LedgerService.js';
import { databaseService, DatabaseService, UserRow, SessionRow } from './DatabaseService.js';
import { normalizeEthiopianPhone, isValidEthiopianPhone, maskPhone } from './PhoneUtils.js';
import { hashPassword, verifyPassword } from './PasswordUtils.js';
import { authRateLimiter } from './RateLimiter.js';

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

// Bounded in-memory replay cache (hash -> expiresAtMs) with automatic expiry eviction
const initDataReplayCache = new Map<string, number>();
const MAX_REPLAY_CACHE_SIZE = 10000;

export function checkAndRecordInitDataReplay(hashHex: string, ttlMs: number = 86400 * 1000): boolean {
  const now = Date.now();
  // Evict expired entries if cache exceeds threshold
  if (initDataReplayCache.size > MAX_REPLAY_CACHE_SIZE) {
    for (const [k, exp] of initDataReplayCache.entries()) {
      if (now > exp) initDataReplayCache.delete(k);
    }
  }
  const exp = initDataReplayCache.get(hashHex);
  if (exp && now <= exp) {
    return true; // Replay detected!
  }
  initDataReplayCache.set(hashHex, now + ttlMs);
  return false;
}

export function clearInitDataReplayCache(): void {
  initDataReplayCache.clear();
}

export function verifyTelegramInitData(
  initData: string,
  botToken: string,
  maxAgeSeconds: number = 86400,
  preventReplay: boolean = false
): { isValid: boolean; user?: TelegramUserData; error?: string; startParam?: string } {
  if (!initData) {
    return { isValid: false, error: 'Missing initData string' };
  }
  if (!botToken) {
    return { isValid: false, error: 'Server configuration error: TELEGRAM_BOT_TOKEN missing' };
  }
  if (process.env.NODE_ENV === 'production' && botToken.includes('test_mock_bot_token')) {
    return { isValid: false, error: 'Server configuration error: Mock bot token is strictly forbidden in production' };
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

    // Constant-time HMAC verification preventing timing side-channel attacks
    const calcBuf = Buffer.from(calculatedHash, 'hex');
    const hashBuf = Buffer.from(hash, 'hex');
    if (calcBuf.length !== 32 || hashBuf.length !== 32 || !crypto.timingSafeEqual(calcBuf, hashBuf)) {
      return { isValid: false, error: 'Invalid HMAC-SHA256 signature: hash mismatch (tampered or spoofed initData)' };
    }

    // Replay defense: prevent reuse of the identical signed payload
    if (preventReplay && checkAndRecordInitDataReplay(hash)) {
      return { isValid: false, error: 'Telegram initData replay detected: payload has already been used' };
    }

    const authDateStr = searchParams.get('auth_date');
    if (!authDateStr) {
      return { isValid: false, error: 'Missing auth_date in Telegram initData' };
    }
    const authDate = parseInt(authDateStr, 10);
    if (isNaN(authDate)) {
      return { isValid: false, error: 'Invalid auth_date format in Telegram initData' };
    }
    const currentTime = Math.floor(Date.now() / 1000);
    if (currentTime - authDate > maxAgeSeconds) {
      return { isValid: false, error: 'Telegram initData is expired (older than 24 hours)' };
    }
    // Prevent future-dated timestamps with 60-second clock skew tolerance
    if (authDate > currentTime + 60) {
      return { isValid: false, error: 'Telegram initData auth_date is in the future' };
    }

    const userRaw = searchParams.get('user');
    let user: TelegramUserData | undefined = undefined;
    if (userRaw) {
      try {
        user = JSON.parse(userRaw);
      } catch {
        return { isValid: false, error: 'Malformed user JSON in Telegram initData' };
      }
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
  public databaseService: DatabaseService;
  private botToken: string = process.env.TELEGRAM_BOT_TOKEN || (process.env.NODE_ENV === 'production' ? '' : 'test_mock_bot_token_123456:ABCdefGHIjklMNOpqrSTUvwxYZ');

  // In-flight temporary registration data
  private tempRegistrations: Map<string, { telegramUser: TelegramUserData; referralCode?: string; createdAt: number }> = new Map();
  private completedTempRegistrations: Map<string, { user: any; sessionToken: string }> = new Map();

  // Legacy Phone verification mappings
  private pendingRegistrations: Map<string, PendingRegistration> = new Map();
  private pendingById: Map<string, string> = new Map();
  private passwordResetRequests: Map<string, any> = new Map();

  constructor(customDb?: DatabaseService) {
    this.databaseService = customDb || databaseService;
    // SECURITY: Bots must NEVER be automatically seeded into the real production customer database.
    // Development/Production: Bots OFF by default unless explicitly opted-in via ENABLE_BOT_SEEDS=true.
    if (process.env.NODE_ENV !== 'production' && process.env.ENABLE_BOT_SEEDS === 'true') {
      this.seedBots();
    }
  }

  private hashPassword(password: string, salt?: string): string {
    return hashPassword(password).hash;
  }

  private generateSalt(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  private generateUniqueReferralCode(base: string): string {
    let clean = base.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 6);
    if (!clean) clean = 'BINGO';
    let code = `BINGO_${clean}`;
    let counter = 1;
    while (this.databaseService.getUserByReferralCode(code)) {
      code = `BINGO_${clean}_${counter++}`;
    }
    return code;
  }

  public normalizePhone(phone: string): string {
    return normalizeEthiopianPhone(phone) || '';
  }

  public seedBots() {
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
      if (!this.databaseService.getUserById(b.id)) {
        this.databaseService.createUser({
          id: b.id,
          telegram_id: `bot_${b.id}`,
          username: b.username,
          referral_code: `REF_${b.id.toUpperCase()}`,
          is_bot: true,
          account_type: 'BOT',
          role: 'USER'
        });
        this.databaseService.getOrCreateWallet(b.id, b.balance);
      }
    }
  }

  public verifyTelegramInitData(initData: string, botToken?: string, maxAgeSeconds?: number, preventReplay: boolean = false) {
    const token = botToken || this.botToken || process.env.TELEGRAM_BOT_TOKEN || '';
    return verifyTelegramInitData(initData, token, maxAgeSeconds, preventReplay);
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
    botToken?: string,
    optionalReferralCode?: string,
    preventReplay: boolean = (process.env.NODE_ENV === 'production' || process.env.ENABLE_REPLAY_PROTECTION === 'true'),
    maxAgeSeconds: number = 86400
  ): Promise<TelegramAuthResult> {
    const effectiveBotToken = botToken || process.env.TELEGRAM_BOT_TOKEN || this.botToken || '';
    let tgUser: TelegramUserData | undefined;
    let referralCode: string | undefined = optionalReferralCode;

    if (!effectiveBotToken) {
      console.warn('[AuthService] WARNING: TELEGRAM_BOT_TOKEN is not configured. Falling back to parsing Telegram user payload from initData.');
      try {
        const searchParams = new URLSearchParams(initData.startsWith('?') ? initData.substring(1) : initData);
        const userRaw = searchParams.get('user');
        if (userRaw) {
          tgUser = JSON.parse(userRaw);
          if (!referralCode) referralCode = searchParams.get('start_param') || tgUser?.start_param;
        }
      } catch (err) {
        console.warn('[AuthService] Failed to parse initData user payload:', err);
      }

      if (!tgUser || !tgUser.id) {
        return {
          success: false,
          status: 'AUTH_ERROR',
          error: 'Telegram authentication failed: No valid user data found in initData. Please open the game via Telegram.'
        };
      }
    } else {
      if (process.env.NODE_ENV === 'production' && effectiveBotToken.includes('test_mock_bot_token')) {
        return {
          success: false,
          status: 'AUTH_ERROR',
          error: 'Server configuration error: Mock bot token is strictly forbidden in production'
        };
      }

      const verification = verifyTelegramInitData(initData, effectiveBotToken, maxAgeSeconds, preventReplay);
      if (!verification.isValid || !verification.user) {
        return {
          success: false,
          status: 'AUTH_ERROR',
          error: verification.error || 'Telegram verification failed'
        };
      }
      tgUser = verification.user;
      referralCode = optionalReferralCode || verification.startParam || tgUser.start_param;
    }

    const telegramId = String(tgUser.id);

    const existingUser = this.databaseService.getUserByTelegramId(telegramId);

    if (existingUser) {
      if (existingUser.account_status === 'DELETED' || existingUser.account_status === 'DEACTIVATED' || existingUser.account_status === 'SUSPENDED' || existingUser.account_status === 'BANNED') {
        return {
          success: false,
          status: 'AUTH_ERROR',
          error: `Your account is ${existingUser.account_status?.toLowerCase() || 'inactive'}. Please contact support.`
        };
      }
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

        const updated = this.databaseService.updateUser(existingUser.id, updates);
        const wallet = this.databaseService.getOrCreateWallet(updated.id);

        // Issue fresh persistent session for this specific Telegram ID
        const session = this.databaseService.createSession(updated.id, telegramId);

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
      return this.databaseService.transaction(() => {
        // 1. Check if user with this telegram_id already completed registration
        const existingTgUser = this.databaseService.getUserByTelegramId(telegramId);
        if (existingTgUser && existingTgUser.registration_status === 'COMPLETED') {
          const session = this.databaseService.createSession(existingTgUser.id, telegramId);
          const wallet = this.databaseService.getOrCreateWallet(existingTgUser.id);
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
        const existingNameOwner = this.databaseService.getUserByUsername(cleanUsername);
        if (existingNameOwner && existingNameOwner.telegram_id !== telegramId) {
          return {
            success: false,
            error: `The username "${cleanUsername}" is already taken. Please choose another.`
          };
        }

        // 3. Validate referral code if supplied
        let referrerUserId: string | undefined = undefined;
        if (rawReferral) {
          const referrer = this.databaseService.getUserByReferralCode(rawReferral);
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
          userRow = this.databaseService.updateUser(existingTgUser.id, {
            username: cleanUsername,
            referral_code: userReferralCode,
            referred_by: referrerUserId,
            registration_status: 'COMPLETED',
            role,
            avatar_url: telegramUser.photo_url || existingTgUser.avatar_url
          });
        } else {
          userRow = this.databaseService.createUser({
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
        }

        const wallet = this.databaseService.getOrCreateWallet(userRow.id);
        const session = this.databaseService.createSession(userRow.id, telegramId);

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

    const session = this.databaseService.getRawSession(token);
    if (!session) {
      return { valid: false, status: 'UNAUTHENTICATED', error: 'Invalid or missing session' };
    }

    if (session.revoked_at) {
      return { valid: false, status: 'REVOKED', error: 'Session has been revoked or logged out' };
    }

    if (Date.now() > session.expires_at) {
      return { valid: false, status: 'EXPIRED', error: 'Session has expired. Please log in again.' };
    }

    const user = this.databaseService.getUserById(session.user_id);
    if (!user || user.account_status === 'BANNED' || user.account_status === 'SUSPENDED' || user.account_status === 'DELETED' || user.account_status === 'DEACTIVATED') {
      return { valid: false, status: 'REVOKED', error: `User account is ${user?.account_status?.toLowerCase() || 'inactive'}` };
    }

    this.databaseService.touchSession(token);
    const wallet = this.databaseService.getOrCreateWallet(user.id);

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
        bonusBalance: wallet.bonus_balance || 0.0,
        totalPlayableBalance: Number(((wallet.balance || 0) + (wallet.bonus_balance || 0)).toFixed(2)),
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
    const u = this.databaseService.getUserByTelegramId(String(telegramId));
    if (!u) return undefined;
    const w = this.databaseService.getOrCreateWallet(u.id);
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
        const raw = this.databaseService.getRawSession(token);
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
    // Use getRawSession to bypass revocation checks — this method is for admin/test verification of DB state
    const session = this.databaseService.getRawSession(token);
    if (!session) return null;
    const u = this.databaseService.getUserById(session.user_id);
    if (!u) return null;
    const w = this.databaseService.getOrCreateWallet(u.id);
    return {
      ...u,
      playerId: u.id,
      walletBalance: w.balance,
      isBot: Boolean(u.is_bot)
    };
  }

  public verifySessionMatchesTelegram(token: string, telegramId: string): boolean {
    if (!token || !telegramId) return false;
    const session = this.databaseService.getSession(token);
    if (!session) return false;
    return String(session.telegram_id) === String(telegramId);
  }

  public getUserById(playerId: string): UserRecord | undefined {
    const u = this.databaseService.getUserById(playerId);
    if (!u) return undefined;
    const w = this.databaseService.getOrCreateWallet(u.id);
    return {
      ...u,
      playerId: u.id,
      walletBalance: w.balance,
      isBot: Boolean(u.is_bot)
    };
  }

  public getAllUsers(filter?: string): any[] {
    const users = this.databaseService.getAllUsers(filter);
    return users.map(u => {
      const w = this.databaseService.getOrCreateWallet(u.id);
      return {
        id: u.id,
        playerId: u.id,
        telegram_id: u.telegram_id,
        telegram_username: u.telegram_username,
        first_name: u.first_name,
        last_name: u.last_name,
        username: u.username,
        phone: u.phone,
        role: u.role,
        account_type: u.account_type || (u.is_bot ? 'BOT' : (u.role === 'ADMIN' ? 'ADMIN' : 'REAL')),
        account_status: u.account_status,
        accountStatus: u.account_status,
        registration_status: u.registration_status,
        referral_code: u.referral_code,
        referred_by: u.referred_by,
        avatar_url: u.avatar_url,
        is_bot: Boolean(u.is_bot),
        walletBalance: w.balance,
        reservedBalance: w.reserved_balance,
        bonusBalance: w.bonus_balance || 0.0,
        totalPlayableBalance: Number(((w.balance || 0) + (w.bonus_balance || 0)).toFixed(2)),
        created_at: u.created_at,
        registrationDate: u.created_at,
        updated_at: u.updated_at,
        last_login_at: u.last_login_at,
        lastActivityDate: u.last_login_at || u.updated_at
      };
    });
  }

  public updateUserStatus(
    adminId: string,
    targetPlayerId: string,
    status: 'ACTIVE' | 'SUSPENDED' | 'BANNED' | 'DEACTIVATED' | 'DELETION_REQUESTED' | 'DELETED',
    reason?: string
  ): any {
    const user = this.databaseService.getUserById(targetPlayerId);
    if (!user) throw new Error('Target user not found');
    if ((user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') && status !== 'ACTIVE') {
      throw new Error('Cannot change administrator account status.');
    }
    if (adminId && targetPlayerId && String(adminId).trim() === String(targetPlayerId).trim() && status !== 'ACTIVE') {
      throw new Error('Self-suspension forbidden: Cannot suspend, ban, or deactivate your own account.');
    }

    const updated = this.databaseService.updateUser(targetPlayerId, { account_status: status });

    if (status !== 'ACTIVE') {
      this.databaseService.revokeAllUserSessions(targetPlayerId);
    }

    ledgerService.recordAuditLog(
      adminId,
      status === 'BANNED' ? 'BAN_USER' : status === 'SUSPENDED' ? 'SUSPEND_USER' : `USER_STATUS_${status}`,
      targetPlayerId,
      targetPlayerId,
      { previousStatus: user.account_status, newStatus: status, reason }
    );

    try {
      this.databaseService.logAgentActivity({
        actor_id: adminId,
        actor_role: 'ADMIN',
        action: `USER_STATUS_${status}`,
        target_id: targetPlayerId,
        target_user_id: targetPlayerId,
        metadata: { old_status: user.account_status, new_status: status, reason }
      });
    } catch (e) {}

    const w = this.databaseService.getOrCreateWallet(updated.id);
    return {
      ...updated,
      playerId: updated.id,
      walletBalance: w.balance
    };
  }

  public logout(token: string): boolean {
    if (!token) return false;
    this.databaseService.revokeSession(token);
    return true;
  }

  // ==================== PHONE & BOT REGISTRATION HELPERS ====================

  public initiateRegistration(name: string, phone: string, password: string) {
    const normalizedPhone = this.normalizePhone(phone);
    if (!name || name.trim().length < 2) return { success: false, error: 'Please enter a valid full name' };
    if (!isValidEthiopianPhone(normalizedPhone)) return { success: false, error: 'Please enter a valid Ethiopian phone number (e.g. 0912345678 or +251912345678)' };
    if (!password || password.length < 6) return { success: false, error: 'Password must be at least 6 characters' };

    const existing = this.databaseService.getUserByPhone(normalizedPhone);
    if (existing) return { success: false, error: 'An account with this phone number already exists. Please log in.' };

    const pendingId = `reg_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
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
    this.databaseService.createPendingRegistration({
      id: pendingId,
      phone: normalizedPhone,
      name: name.trim(),
      passwordHash,
      salt,
      expiresInMinutes: 60
    });

    return {
      success: true,
      requiresVerification: true,
      pendingId,
      phone: normalizedPhone,
      botUsername: process.env.TELEGRAM_BOT_USERNAME || 'BINGOBEET_BOT',
      botUrl: `https://t.me/${process.env.TELEGRAM_BOT_USERNAME || 'BINGOBEET_BOT'}?start=reg_${normalizedPhone}`,
      user: {
        playerId: `pending_${pendingId}`,
        username: name.trim(),
        walletBalance: 0
      }
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
    const dbPending = this.databaseService.getPendingRegistrationByPhone(phone) || this.databaseService.getPendingRegistrationById(identifier);
    if (dbPending) {
      if (dbPending.status === 'VERIFIED') {
        const user = this.databaseService.getUserByPhone(dbPending.phone);
        if (user) {
          const session = this.databaseService.createSession(user.id, String(user.telegram_id || ''));
          const wallet = this.databaseService.getOrCreateWallet(user.id);
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
    const user = this.databaseService.getUserByPhone(phone);
    if (user && user.registration_status === 'COMPLETED') {
      const session = this.databaseService.createSession(user.id, String(user.telegram_id || ''));
      const wallet = this.databaseService.getOrCreateWallet(user.id);
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
      // 0. Check if user already exists (by playerId, Telegram ID, or registered phone)
      const userByPhone = this.databaseService.getUserByPhone(normalizedPhone);
      const userByTg = this.databaseService.getUserByTelegramId(String(telegramId)) || this.databaseService.getUserById(playerId);

      // Account collision / hijacking checks:
      if (userByPhone && userByTg && userByPhone.id !== userByTg.id) {
        return {
          success: false,
          error: 'This phone number is already registered to a different account.'
        };
      }

      if (userByPhone && userByPhone.telegram_id &&
          !userByPhone.telegram_id.startsWith('phone_') &&
          !userByPhone.telegram_id.startsWith('web_') &&
          !userByPhone.telegram_id.startsWith('guest_') &&
          userByPhone.telegram_id !== String(telegramId)) {
        return {
          success: false,
          error: 'This phone number is already linked to another Telegram account.'
        };
      }

      const existingUserCandidate = userByTg || userByPhone;
      if (existingUserCandidate) {
        if (existingUserCandidate.account_status === 'BANNED' ||
            existingUserCandidate.account_status === 'SUSPENDED' ||
            existingUserCandidate.account_status === 'DELETED') {
          return {
            success: false,
            error: `Your account is ${existingUserCandidate.account_status.toLowerCase()}. Access denied.`
          };
        }

        let existingUser = existingUserCandidate;
        // Link Telegram ID to existing account if not yet linked
        if (existingUser.telegram_id !== String(telegramId)) {
          existingUser = this.databaseService.updateUser(existingUser.id, {
            telegram_id: String(telegramId),
            telegram_username: telegramUsername || existingUser.telegram_username,
            registration_status: 'COMPLETED'
          });
        }
        if (!existingUser.phone && normalizedPhone) {
          existingUser = this.databaseService.updateUser(existingUser.id, {
            phone: normalizedPhone,
            registration_status: 'COMPLETED'
          });
        }
        const session = this.databaseService.createSession(existingUser.id, String(telegramId));
        const wallet = this.databaseService.getOrCreateWallet(existingUser.id);
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
        const created = this.databaseService.createUser({
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

        const session = this.databaseService.createSession(created.id, String(telegramId));
        const wallet = this.databaseService.getOrCreateWallet(created.id);

        const dbPending = this.databaseService.getPendingRegistrationByPhone(normalizedPhone);
        if (dbPending) {
          this.databaseService.updatePendingRegistration(dbPending.id, {
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
      const dbPending = this.databaseService.getPendingRegistrationByPhone(normalizedPhone);
      if (dbPending && dbPending.status !== 'EXPIRED' && dbPending.status !== 'DENIED') {
        const referralCode = this.generateUniqueReferralCode(dbPending.name);
        const created = this.databaseService.createUser({
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

        const session = this.databaseService.createSession(created.id, String(telegramId));
        const wallet = this.databaseService.getOrCreateWallet(created.id);

        this.databaseService.updatePendingRegistration(dbPending.id, {
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
      let user = this.databaseService.getUserByPhone(normalizedPhone) || this.databaseService.getUserByTelegramId(String(telegramId));
      if (user) {
        // User already in database: ensure phone & status are updated
        if (!user.phone || user.registration_status !== 'COMPLETED') {
          user = this.databaseService.updateUser(user.id, {
            phone: normalizedPhone,
            registration_status: 'COMPLETED'
          });
        }
        const session = this.databaseService.createSession(user.id, String(telegramId));
        const wallet = this.databaseService.getOrCreateWallet(user.id);
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
      while (this.databaseService.getUserByUsername(cleanUsername)) {
        cleanUsername = `${baseName}_${suffix++}`;
      }
      const referralCode = this.generateUniqueReferralCode(cleanUsername);

      const created = this.databaseService.createUser({
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

      const session = this.databaseService.createSession(created.id, String(telegramId));
      const wallet = this.databaseService.getOrCreateWallet(created.id);

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
    let user = this.databaseService.getUserByPhone(normalized);

    if (!user) {
      const pending = this.pendingRegistrations.get(normalized) || this.databaseService.getPendingRegistrationByPhone(normalized);
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

    const wallet = this.databaseService.getOrCreateWallet(user.id);
    const session = this.databaseService.createSession(user.id, user.telegram_id);

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
    const user = this.databaseService.getUserByPhone(normalized);
    return {
      isVerified: Boolean(user && user.registration_status === 'COMPLETED'),
      user: user ? {
        playerId: user.id,
        username: user.username,
        walletBalance: this.databaseService.getOrCreateWallet(user.id).balance
      } : null
    };
  }

  public initiatePasswordReset(phone: string) {
    const normalized = this.normalizePhone(phone);
    const user = this.databaseService.getUserByPhone(normalized);
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
    if (!normalized) {
      return { success: false, error: 'Invalid phone number.' };
    }

    const req = this.passwordResetRequests.get(normalized);
    if (!req) {
      return { success: false, error: 'Password reset request not found.' };
    }

    // Expiration check (15 minutes TTL)
    if (req.createdAt && (Date.now() - req.createdAt > 15 * 60 * 1000)) {
      this.passwordResetRequests.delete(normalized);
      return { success: false, error: 'Password reset request has expired. Please initiate again.' };
    }

    // Must be verified via Telegram contact share
    if (req.status !== 'verified') {
      return { success: false, error: 'Password reset has not been verified via Telegram.' };
    }

    // Safe constant-time token comparison
    const tokenBuf = Buffer.from(resetToken || '');
    const reqBuf = Buffer.from(req.resetToken || '');
    if (!resetToken || tokenBuf.length !== reqBuf.length || !crypto.timingSafeEqual(tokenBuf, reqBuf)) {
      return { success: false, error: 'Invalid or unverified reset token.' };
    }

    // Enforce password policy: minimum 6 characters
    if (!newPass || newPass.length < 6) {
      return { success: false, error: 'Password must be at least 6 characters.' };
    }

    const user = this.databaseService.getUserByPhone(normalized);
    if (!user) {
      return { success: false, error: 'No user account found for this phone number.' };
    }

    // Hash the new password using Scrypt + CSPRNG salt
    const { hash, salt } = hashPassword(newPass);
    this.databaseService.updateUser(user.id, {
      password_hash: hash,
      password_salt: salt
    });

    // Revoke all existing sessions for this user across all devices
    this.databaseService.revokeAllUserSessions(user.id);

    // Consume the reset request so token cannot be reused
    this.passwordResetRequests.delete(normalized);

    return { success: true, message: 'Password updated successfully' };
  }

  public login(phone: string, pass: string): AuthResponse {
    const normalized = normalizeEthiopianPhone(phone);
    if (!normalized) {
      console.warn(`[Auth] AUTH_LOGIN_FAILED reason=INVALID_PHONE_FORMAT input=${maskPhone(phone)}`);
      return { success: false, error: 'Invalid phone number or password.' };
    }

    const rateCheck = authRateLimiter.isRateLimited(normalized);
    if (rateCheck.limited) {
      return {
        success: false,
        error: `Too many login attempts. Please wait ${rateCheck.retryAfterSeconds || 60} seconds and try again.`
      };
    }

    const user = this.databaseService.getUserByPhone(normalized);
    if (!user) {
      authRateLimiter.recordFailure(normalized);
      console.warn(`[Auth] AUTH_LOGIN_FAILED reason=USER_NOT_FOUND phone=${maskPhone(normalized)}`);
      return { success: false, error: 'Invalid phone number or password.' };
    }

    if (user.account_status === 'SUSPENDED' || user.account_status === 'BANNED' || user.account_status === 'DELETED' || user.account_status === 'DEACTIVATED') {
      console.warn(`[Auth] AUTH_LOGIN_FAILED reason=ACCOUNT_${user.account_status} userId=${user.id}`);
      return { success: false, error: `Account is ${user.account_status.toLowerCase()}. Please contact support.` };
    }

    const verifyResult = verifyPassword(pass, user.password_hash, user.password_salt);
    if (!verifyResult.isValid) {
      authRateLimiter.recordFailure(normalized);
      console.warn(`[Auth] AUTH_LOGIN_FAILED reason=PASSWORD_MISMATCH phone=${maskPhone(normalized)}`);
      return { success: false, error: 'Invalid phone number or password.' };
    }

    // Reset rate limiter on successful login
    authRateLimiter.reset(normalized);

    // Transparent progressive upgrade: re-hash legacy password using Scrypt
    if (verifyResult.needsRehash) {
      try {
        const { hash, salt } = hashPassword(pass);
        this.databaseService.updateUser(user.id, {
          password_hash: hash,
          password_salt: salt
        });
        console.log(`[Auth] Transparently upgraded password hash to Scrypt for user ${user.id}`);
      } catch (err) {
        console.warn('[Auth] Warning upgrading password hash:', err);
      }
    }

    this.databaseService.updateUser(user.id, {
      last_login_at: new Date().toISOString()
    });

    const session = this.databaseService.createSession(user.id, user.telegram_id);
    const wallet = this.databaseService.getOrCreateWallet(user.id);

    return {
      success: true,
      user: {
        playerId: user.id,
        username: user.username,
        walletBalance: wallet.balance,
        avatarUrl: user.avatar_url,
        isBot: Boolean(user.is_bot),
        role: user.role,
        account_status: user.account_status
      },
      token: session.id,
      sessionToken: session.id,
      requiresVerification: false
    };
  }

  public telegramLogin(telegramData: { id: string | number; username?: string; first_name?: string; last_name?: string; photo_url?: string }): AuthResponse {
    const telegramId = String(telegramData.id);
    const playerId = `tg_${telegramId}`;
    let user = this.databaseService.getUserByTelegramId(telegramId);

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

    if (user) {
      if (user.account_status === 'DELETED' || user.account_status === 'DEACTIVATED' || user.account_status === 'SUSPENDED' || user.account_status === 'BANNED') {
        return {
          success: false,
          error: `Your account is ${user.account_status.toLowerCase()}. Please contact support.`
        };
      }
    } else {
      user = this.databaseService.createUser({
        id: playerId,
        telegram_id: telegramId,
        telegram_username: telegramData.username,
        first_name: telegramData.first_name || '',
        username: displayName,
        referral_code: this.generateUniqueReferralCode(displayName),
        role: 'USER',
        avatar_url: telegramData.photo_url || ''
      });
    }

    const session = this.databaseService.createSession(user.id, telegramId);
    const wallet = this.databaseService.getOrCreateWallet(user.id);

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
    if (!name || name.trim().length < 2) {
      return { success: false, error: 'Please enter a valid full name (minimum 2 characters).' };
    }
    const normalizedPhone = normalizeEthiopianPhone(phone);
    if (!normalizedPhone) {
      return { success: false, error: 'Please enter a valid Ethiopian phone number (e.g. 0912345678 or +251912345678).' };
    }
    if (!pass || pass.length < 6) {
      return { success: false, error: 'Password must be at least 6 characters.' };
    }

    const existing = this.databaseService.getUserByPhone(normalizedPhone);
    if (existing) {
      return { success: false, error: 'An account with this phone number already exists. Please log in.' };
    }

    const cleanName = name.trim();
    const userId = `usr_${crypto.randomUUID().replace(/-/g, '')}`;
    const referralCode = this.generateUniqueReferralCode(cleanName);
    const { hash, salt } = hashPassword(pass);

    const created = this.databaseService.createUser({
      id: userId,
      telegram_id: `phone_${normalizedPhone}`,
      username: cleanName,
      phone: normalizedPhone,
      password_hash: hash,
      password_salt: salt,
      referral_code: referralCode,
      role: 'USER',
      account_status: 'ACTIVE',
      registration_status: 'COMPLETED'
    });

    const session = this.databaseService.createSession(created.id, created.telegram_id);
    const wallet = this.databaseService.getOrCreateWallet(created.id);

    return {
      success: true,
      user: {
        playerId: created.id,
        username: created.username,
        walletBalance: wallet.balance,
        avatarUrl: created.avatar_url,
        isBot: false,
        role: created.role,
        account_status: created.account_status
      },
      token: session.id,
      sessionToken: session.id,
      requiresVerification: false
    };
  }

  public upgradeGuestAccount(
    guestPlayerId: string,
    phone: string,
    pass: string,
    name?: string
  ): AuthResponse {
    if (!guestPlayerId) {
      return { success: false, error: 'Guest player ID is required.' };
    }
    const guestUser = this.databaseService.getUserById(guestPlayerId);
    if (!guestUser) {
      return { success: false, error: 'Guest account not found.' };
    }
    if (guestUser.account_type !== 'GUEST') {
      return { success: false, error: 'Account is already a registered account.' };
    }

    const normalizedPhone = normalizeEthiopianPhone(phone);
    if (!normalizedPhone) {
      return { success: false, error: 'Please enter a valid Ethiopian phone number (e.g. 0912345678 or +251912345678).' };
    }
    if (!pass || pass.length < 6) {
      return { success: false, error: 'Password must be at least 6 characters.' };
    }

    const existingPhoneUser = this.databaseService.getUserByPhone(normalizedPhone);
    if (existingPhoneUser && existingPhoneUser.id !== guestPlayerId) {
      return { success: false, error: 'An account with this phone number already exists. Please log in.' };
    }

    const cleanName = (name || guestUser.username || `Player_${normalizedPhone.slice(-4)}`).trim();
    const { hash, salt } = hashPassword(pass);

    const updated = this.databaseService.updateUser(guestUser.id, {
      username: cleanName,
      phone: normalizedPhone,
      password_hash: hash,
      password_salt: salt,
      account_type: 'REAL',
      registration_status: 'COMPLETED'
    });

    const wallet = this.databaseService.getOrCreateWallet(updated.id);
    const session = this.databaseService.createSession(updated.id, updated.telegram_id);

    return {
      success: true,
      user: {
        playerId: updated.id,
        username: updated.username,
        walletBalance: wallet.balance,
        avatarUrl: updated.avatar_url,
        isBot: false,
        role: updated.role,
        account_status: updated.account_status
      },
      token: session.id,
      sessionToken: session.id,
      requiresVerification: false,
      message: 'Guest account successfully upgraded to real account.'
    };
  }

  public getFullProfile(playerId: string) {
    const user = this.getUserById(playerId);
    if (!user) return null;
    const wallet = this.databaseService.getOrCreateWallet(user.id);
    const stats = this.databaseService.getUserStats(user.id);

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
      bonusBalance: wallet.bonus_balance || 0,
      totalPlayableBalance: Math.round(((wallet.balance || 0) + (wallet.bonus_balance || 0)) * 100) / 100,
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

  public createAgent(
    superAdminId: string,
    agentData: {
      username: string;
      phone: string;
      password?: string;
      telebirr_number?: string;
      assigned_agent_name?: string;
    }
  ) {
    const { username, phone, password, telebirr_number, assigned_agent_name } = agentData;
    if (!username || username.trim().length < 2) {
      throw new Error('Agent name must be at least 2 characters.');
    }
    const normalizedPhone = normalizeEthiopianPhone(phone);
    if (!normalizedPhone) {
      throw new Error('Please enter a valid Ethiopian phone number for the agent (e.g. 09XXXXXXXX).');
    }
    const existing = this.databaseService.getUserByPhone(normalizedPhone);
    if (existing) {
      throw new Error('A user or agent with this phone number already exists.');
    }

    const pass = password && password.length >= 6 ? password : 'AgentPassword123!';
    const { hash, salt } = hashPassword(pass);
    const agentId = `agt_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const referralCode = this.generateUniqueReferralCode(username.trim());

    const formatTelebirrNumber = (num?: string): string | undefined => {
      if (!num) return undefined;
      const cleaned = num.trim().replace(/\s+/g, '');
      if (cleaned.startsWith('+251')) return '0' + cleaned.slice(4);
      if (cleaned.startsWith('251')) return '0' + cleaned.slice(3);
      return cleaned;
    };

    const created = this.databaseService.createUser({
      id: agentId,
      telegram_id: `agent_${normalizedPhone}`,
      username: username.trim(),
      phone: normalizedPhone,
      telebirr_number: telebirr_number ? formatTelebirrNumber(telebirr_number) : formatTelebirrNumber(normalizedPhone),
      assigned_agent_name: assigned_agent_name?.trim() || username.trim(),
      password_hash: hash,
      password_salt: salt,
      referral_code: referralCode,
      role: 'AGENT',
      account_status: 'ACTIVE',
      registration_status: 'COMPLETED',
      account_type: 'AGENT'
    });

    this.databaseService.logAgentActivity({
      actor_id: superAdminId,
      actor_role: 'SUPER_ADMIN',
      action: 'AGENT_CREATED',
      target_id: created.id,
      metadata: { username: created.username, phone: created.phone, telebirr_number: created.telebirr_number }
    });

    return created;
  }

  public updateAgent(
    superAdminId: string,
    agentId: string,
    data: {
      username?: string;
      phone?: string;
      telebirr_number?: string;
      assigned_agent_name?: string;
      status?: 'ACTIVE' | 'SUSPENDED' | 'BANNED' | 'DEACTIVATED' | 'DELETED';
      account_status?: 'ACTIVE' | 'SUSPENDED' | 'BANNED' | 'DEACTIVATED' | 'DELETED';
    }
  ) {
    const agent = this.databaseService.getUserById(agentId);
    if (!agent || agent.role !== 'AGENT') {
      throw new Error('Agent not found.');
    }

    const updatePayload: any = {};
    if (data.username) updatePayload.username = data.username.trim();
    if (data.phone) {
      const norm = normalizeEthiopianPhone(data.phone);
      if (!norm) throw new Error('Invalid phone number format');
      updatePayload.phone = norm;
    }
    if (data.telebirr_number !== undefined) {
      const cleaned = data.telebirr_number ? data.telebirr_number.trim().replace(/\s+/g, '') : null;
      updatePayload.telebirr_number = cleaned ? (cleaned.startsWith('+251') ? '0' + cleaned.slice(4) : (cleaned.startsWith('251') ? '0' + cleaned.slice(3) : cleaned)) : null;
    }
    if (data.assigned_agent_name !== undefined) {
      updatePayload.assigned_agent_name = data.assigned_agent_name?.trim() || null;
    }
    const targetStatus = data.status || data.account_status;
    if (targetStatus) {
      updatePayload.account_status = targetStatus;
      if (targetStatus !== 'ACTIVE') {
        this.databaseService.revokeAllUserSessions(agentId);
      }
    }

    const updated = this.databaseService.updateUser(agentId, updatePayload);

    this.databaseService.logAgentActivity({
      actor_id: superAdminId,
      actor_role: 'SUPER_ADMIN',
      action: targetStatus ? (targetStatus === 'SUSPENDED' ? 'AGENT_SUSPENDED' : targetStatus === 'ACTIVE' ? 'AGENT_ACTIVATED' : targetStatus === 'DELETED' ? 'AGENT_DELETED' : 'AGENT_UPDATED') : 'AGENT_UPDATED',
      target_id: agentId,
      metadata: { changes: data }
    });

    return updated;
  }

  public deleteAgent(
    superAdminId: string,
    agentId: string,
    reason?: string
  ): {
    success: boolean;
    action: 'ARCHIVED' | 'HARD_DELETED';
    archived: boolean;
    deleted: boolean;
    historicalTransactionsCount: number;
    message: string;
  } {
    const agent = this.databaseService.getUserById(agentId);
    if (!agent || agent.role !== 'AGENT') {
      throw new Error('Agent not found.');
    }
    if (superAdminId && agentId && String(superAdminId).trim() === String(agentId).trim()) {
      throw new Error('Self-deletion forbidden: Cannot delete your own account.');
    }

    const processedDeposits = (this.databaseService.getDb().prepare(
      'SELECT COUNT(*) as c FROM deposit_requests WHERE processed_by = ? OR assigned_agent_id = ?'
    ).get(agentId, agentId) as any)?.c || 0;

    const processedWithdrawals = (this.databaseService.getDb().prepare(
      'SELECT COUNT(*) as c FROM withdrawal_requests WHERE processed_by = ? OR assigned_agent_id = ?'
    ).get(agentId, agentId) as any)?.c || 0;

    const totalOps = processedDeposits + processedWithdrawals;

    // Revoke all sessions and unassign from payment accounts
    this.databaseService.revokeAllUserSessions(agentId);
    this.databaseService.getDb().prepare(
      'UPDATE payment_accounts SET assigned_agent_id = NULL WHERE assigned_agent_id = ?'
    ).run(agentId);

    if (totalOps > 0) {
      this.databaseService.updateUser(agentId, {
        account_status: 'DELETED'
      });

      this.databaseService.logAgentActivity({
        actor_id: superAdminId,
        actor_role: 'SUPER_ADMIN',
        action: 'AGENT_ARCHIVED',
        target_id: agentId,
        metadata: { reason: reason || 'Safely archived agent to preserve financial transaction history', totalOps }
      });

      return {
        success: true,
        action: 'ARCHIVED',
        archived: true,
        deleted: false,
        historicalTransactionsCount: totalOps,
        message: `Agent ${agent.username} processed or was assigned to ${totalOps} financial transactions. The account has been deactivated and safely archived to preserve financial records.`
      };
    } else {
      this.databaseService.getDb().prepare('DELETE FROM agent_activity_logs WHERE actor_id = ?').run(agentId);
      this.databaseService.getDb().prepare('DELETE FROM wallets WHERE user_id = ?').run(agentId);
      this.databaseService.getDb().prepare('DELETE FROM users WHERE id = ?').run(agentId);

      this.databaseService.logAgentActivity({
        actor_id: superAdminId,
        actor_role: 'SUPER_ADMIN',
        action: 'AGENT_DELETED',
        target_id: agentId,
        metadata: { reason: reason || 'Permanently deleted agent with 0 transactions' }
      });

      return {
        success: true,
        action: 'HARD_DELETED',
        archived: false,
        deleted: true,
        historicalTransactionsCount: 0,
        message: `Agent ${agent.username} had no transaction dependencies and was permanently deleted.`
      };
    }
  }

  public restoreAgent(superAdminId: string, agentId: string) {
    const agent = this.databaseService.getUserById(agentId);
    if (!agent || agent.role !== 'AGENT') {
      throw new Error('Agent not found.');
    }

    const updated = this.databaseService.updateUser(agentId, {
      account_status: 'ACTIVE'
    });

    this.databaseService.logAgentActivity({
      actor_id: superAdminId,
      actor_role: 'SUPER_ADMIN',
      action: 'AGENT_ACTIVATED',
      target_id: agentId,
      metadata: { note: 'Agent restored/reactivated by Super Admin' }
    });

    return updated;
  }

  public deleteUser(
    superAdminId: string,
    userId: string,
    reason?: string
  ): { success: boolean; action: 'ARCHIVED' | 'HARD_DELETED'; archived: boolean; deleted: boolean; historicalRecordsCount: number; message: string } {
    const user = this.databaseService.getUserById(userId);
    if (!user) {
      throw new Error('User not found.');
    }
    if (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN' || user.id === 'system') {
      throw new Error('Cannot delete system administrator account.');
    }
    if (superAdminId && userId && String(superAdminId).trim() === String(userId).trim()) {
      throw new Error('Self-deletion forbidden: Cannot delete your own account.');
    }

    const depCount = (this.databaseService.getDb().prepare(
      'SELECT COUNT(*) as c FROM deposit_requests WHERE user_id = ?'
    ).get(userId) as any)?.c || 0;

    const withCount = (this.databaseService.getDb().prepare(
      'SELECT COUNT(*) as c FROM withdrawal_requests WHERE user_id = ?'
    ).get(userId) as any)?.c || 0;

    const ledgerCount = (this.databaseService.getDb().prepare(
      'SELECT COUNT(*) as c FROM ledger_transactions WHERE user_id = ?'
    ).get(userId) as any)?.c || 0;

    const jackpotCount = (this.databaseService.getDb().prepare(
      'SELECT COUNT(*) as c FROM daily_jackpot_tickets WHERE user_id = ?'
    ).get(userId) as any)?.c || 0;

    const bingoCount = (this.databaseService.getDb().prepare(
      'SELECT COUNT(*) as c FROM player_tickets WHERE user_id = ?'
    ).get(userId) as any)?.c || 0;

    const totalFinancial = depCount + withCount + ledgerCount + jackpotCount + bingoCount;

    // Revoke user sessions
    this.databaseService.revokeAllUserSessions(userId);

    if (totalFinancial > 0) {
      this.databaseService.updateUser(userId, {
        account_status: 'DELETED'
      });

      this.databaseService.logAgentActivity({
        actor_id: superAdminId,
        actor_role: 'SUPER_ADMIN',
        action: 'USER_ACCOUNT_ARCHIVED',
        target_id: userId,
        target_user_id: userId,
        metadata: { reason: reason || 'Account archived to preserve financial records', totalFinancial }
      });

      return {
        success: true,
        action: 'ARCHIVED',
        archived: true,
        deleted: false,
        historicalRecordsCount: totalFinancial,
        message: `User ${user.username} has ${totalFinancial} financial and gaming records. Account access has been disabled and status marked as DELETED. All transaction and audit records are preserved.`
      };
    } else {
      this.databaseService.getDb().prepare('DELETE FROM reward_claims WHERE user_id = ?').run(userId);
      this.databaseService.getDb().prepare('DELETE FROM wallets WHERE user_id = ?').run(userId);
      this.databaseService.getDb().prepare('DELETE FROM users WHERE id = ?').run(userId);

      this.databaseService.logAgentActivity({
        actor_id: superAdminId,
        actor_role: 'SUPER_ADMIN',
        action: 'USER_HARD_DELETED',
        target_id: userId,
        target_user_id: userId,
        metadata: { reason: reason || 'Permanently deleted user with 0 records' }
      });

      return {
        success: true,
        action: 'HARD_DELETED',
        archived: false,
        deleted: true,
        historicalRecordsCount: 0,
        message: `User ${user.username} had no financial records and was permanently removed.`
      };
    }
  }

  public resetAgentPassword(superAdminId: string, agentId: string, newPass: string) {
    const agent = this.databaseService.getUserById(agentId);
    if (!agent || agent.role !== 'AGENT') {
      throw new Error('Agent not found.');
    }
    if (!newPass || newPass.length < 6) {
      throw new Error('New password must be at least 6 characters.');
    }

    const { hash, salt } = hashPassword(newPass);
    this.databaseService.updateUser(agentId, {
      password_hash: hash,
      password_salt: salt
    });

    this.databaseService.revokeAllUserSessions(agentId);

    this.databaseService.logAgentActivity({
      actor_id: superAdminId,
      actor_role: 'SUPER_ADMIN',
      action: 'AGENT_PASSWORD_RESET',
      target_id: agentId
    });

    return { success: true, message: `Password reset successfully for agent ${agent.username}.` };
  }
}

export const authService = new AuthService();
