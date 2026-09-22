import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { normalizeEthiopianPhone } from './PhoneUtils.js';
import { RewardService, PromotionalReward } from './RewardService.js';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

export interface UserRow {
  id: string;
  telegram_id: string;
  telegram_username?: string;
  first_name?: string;
  last_name?: string;
  username: string;
  phone?: string;
  password_hash?: string;
  password_salt?: string;
  referral_code: string;
  referred_by?: string;
  role: 'USER' | 'ADMIN';
  account_status: 'ACTIVE' | 'SUSPENDED' | 'BANNED';
  registration_status: 'PENDING' | 'COMPLETED';
  avatar_url?: string;
  is_bot: number;
  created_at: string;
  updated_at: string;
  last_login_at?: string;
}

export interface SessionRow {
  id: string;
  user_id: string;
  telegram_id: string;
  created_at: number;
  expires_at: number;
  last_used_at: number;
  revoked_at?: number | null;
}

export interface WalletRow {
  user_id: string;
  balance: number;
  reserved_balance: number;
  bonus_balance: number;
  created_at: string;
  updated_at: string;
}

export interface PromotionalRewardRow {
  id: string;
  user_id: string;
  reward_type: 'FIRST_DEPOSIT_BONUS';
  source: string;
  qualifying_deposit_id: string;
  deposit_amount: number;
  bonus_percentage: number;
  bonus_amount: number;
  remaining_amount: number;
  status: 'AWARDED' | 'PARTIALLY_CONSUMED' | 'CONSUMED' | 'EXPIRED';
  issued_at: string;
  expires_at: string;
  consumed_at?: string;
  expired_at?: string;
  created_at: string;
  updated_at: string;
}

export interface LedgerRow {
  id: string;
  user_id: string;
  username: string;
  type: 'DEPOSIT' | 'BET' | 'WIN_PAYOUT' | 'WITHDRAWAL' | 'REFUND' | 'BONUS' | 'LOSS' | 'ADMIN_ADJUSTMENT' | 'ESCROW_HOLD';
  amount: number;
  balance_before: number;
  balance_after: number;
  game_id?: string;
  ticket_id?: string;
  reference_id?: string;
  description: string;
  created_at: string;
}

export interface DepositRow {
  id: string;
  user_id: string;
  username: string;
  amount: number;
  payment_method: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reference_id?: string;
  created_at: string;
  processed_at?: string;
  processed_by?: string;
  rejection_reason?: string;
}

export interface WithdrawalRow {
  id: string;
  user_id: string;
  username: string;
  amount: number;
  address: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  reference_id?: string;
  created_at: string;
  processed_at?: string;
  processed_by?: string;
  rejection_reason?: string;
}

export interface GameRow {
  id: string;
  room_id: string;
  status: 'lobby' | 'active' | 'finished';
  bet_per_card: number;
  server_secret: string;
  commitment_hash: string;
  total_cards_sold: number;
  prize_pool: number;
  created_at: string;
  finished_at?: string;
}

export interface TicketRow {
  id: string;
  game_id: string;
  card_number: number;
  user_id: string;
  username: string;
  grid_json: string;
  fingerprint_hash: string;
  is_bot: number;
  purchased_at: string;
}

export interface ClaimRow {
  id: string;
  game_id: string;
  ticket_id: string;
  user_id: string;
  payout_amount: number;
  pattern_type: string;
  status: string;
  claimed_at: string;
}

export interface AuditRow {
  id: string;
  admin_user_id: string;
  action: string;
  target_user_id?: string;
  target_record_id?: string;
  metadata_json?: string;
  timestamp: string;
}

export interface PendingRegistrationRow {
  id: string;
  phone: string;
  name: string;
  password_hash: string;
  password_salt: string;
  telegram_user_id?: string;
  status: 'PENDING' | 'VERIFIED' | 'DENIED' | 'EXPIRED';
  denial_reason?: string;
  created_at: string;
  expires_at: string;
}

export interface DailyJackpotRoundRow {
  id: string;
  date_str: string;
  status: 'SCHEDULED' | 'REGISTRATION_OPEN' | 'REGISTRATION_CLOSED' | 'CHECKING_ELIGIBILITY' | 'POSTPONED' | 'JACKPOT_READY' | 'GAME_RUNNING' | 'WINNER_FOUND' | 'JACKPOT_PAID' | 'COMPLETED';
  cards_sold: number;
  gross_sales: number;
  jackpot_amount: number;
  platform_retained_amount: number;
  cutoff_at: string;
  checked_at?: string;
  postponement_reason?: string;
  winner_user_id?: string;
  winner_ticket_id?: string;
  winner_card_number?: number;
  winner_username?: string;
  payout_status: 'PENDING' | 'PAID' | 'NOT_APPLICABLE';
  paid_at?: string;
  created_at: string;
  updated_at: string;
}

export interface DailyJackpotTicketRow {
  id: string;
  round_id: string;
  card_number: number;
  user_id: string;
  username: string;
  price: number;
  grid_json: string;
  fingerprint_hash: string;
  purchased_at: string;
}

export class DatabaseService {
  private db: any;
  private isMemory: boolean;
  public readonly dbPath: string;
  public readonly rewardService: RewardService;

  constructor(customPath?: string) {
    const isTest = (process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST)) && !customPath && !process.env.TEST_PERSISTENT_DB;
    const defaultDbPath = path.resolve(projectRoot, 'data', 'bingo.db');
    const dbPath = customPath || (isTest ? ':memory:' : defaultDbPath);

    this.dbPath = dbPath;
    this.isMemory = dbPath === ':memory:';

    if (!this.isMemory) {
      const dir = path.dirname(dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      console.log(`[DatabaseService] Authoritative database initialized: ${dbPath}`);
    }

    this.db = new DatabaseSync(dbPath);
    this.initSchema();
    this.rewardService = new RewardService(this.db);
  }

  private initSchema() {
    this.db.exec('PRAGMA foreign_keys = ON;');
    if (!this.isMemory) {
      this.db.exec('PRAGMA journal_mode = WAL;');
    }

    const schemaPath = path.resolve(projectRoot, 'db', 'schema.sql');
    if (fs.existsSync(schemaPath)) {
      const schemaSql = fs.readFileSync(schemaPath, 'utf8');
      this.db.exec(schemaSql);
    }

    this.runMigrations();
  }

  /**
   * Idempotent migrations for existing production and local databases
   */
  private runMigrations() {
    try {
      const userCols = this.db.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>;
      const colNames = new Set(userCols.map((c: any) => c.name));

      if (!colNames.has('password_hash')) {
        console.log('[DatabaseService] Running migration: adding password_hash to users table');
        this.db.exec('ALTER TABLE users ADD COLUMN password_hash TEXT DEFAULT NULL;');
      }

      if (!colNames.has('password_salt')) {
        console.log('[DatabaseService] Running migration: adding password_salt to users table');
        this.db.exec('ALTER TABLE users ADD COLUMN password_salt TEXT DEFAULT NULL;');
      }

      // Canonical E.164 Phone Normalization Migration
      try {
        const usersWithPhone = this.db.prepare('SELECT id, phone FROM users WHERE phone IS NOT NULL').all() as Array<{ id: string; phone: string }>;
        const updatePhoneStmt = this.db.prepare('UPDATE users SET phone = ? WHERE id = ?');
        for (const u of usersWithPhone) {
          const norm = normalizeEthiopianPhone(u.phone);
          if (norm && norm !== u.phone) {
            updatePhoneStmt.run(norm, u.id);
          }
        }

        // Migrate pending_registrations if any exist
        const pendingWithPhone = this.db.prepare('SELECT id, phone FROM pending_registrations WHERE phone IS NOT NULL').all() as Array<{ id: string; phone: string }>;
        const updatePendingStmt = this.db.prepare('UPDATE pending_registrations SET phone = ? WHERE id = ?');
        for (const p of pendingWithPhone) {
          const norm = normalizeEthiopianPhone(p.phone);
          if (norm && norm !== p.phone) {
            updatePendingStmt.run(norm, p.id);
          }
        }
      } catch (phoneMigErr) {
        console.warn('[DatabaseService] Phone migration check warning:', phoneMigErr);
      }

      // Unique index on normalized phone numbers
      this.db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone_unique ON users(phone) WHERE phone IS NOT NULL;');

      // Telebirr reference uniqueness database-level constraint
      this.db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_deposits_reference_unique ON deposit_requests(reference_id) WHERE reference_id IS NOT NULL;');

      // Daily Grand Jackpot tables
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS daily_jackpot_rounds (
          id TEXT PRIMARY KEY,
          date_str TEXT NOT NULL UNIQUE,
          status TEXT NOT NULL DEFAULT 'REGISTRATION_OPEN' CHECK(status IN ('SCHEDULED', 'REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'CHECKING_ELIGIBILITY', 'POSTPONED', 'JACKPOT_READY', 'GAME_RUNNING', 'WINNER_FOUND', 'JACKPOT_PAID', 'COMPLETED')),
          cards_sold INTEGER NOT NULL DEFAULT 0 CHECK(cards_sold >= 0 AND cards_sold <= 200),
          gross_sales REAL NOT NULL DEFAULT 0.0 CHECK(gross_sales >= 0.0),
          jackpot_amount REAL NOT NULL DEFAULT 0.0 CHECK(jackpot_amount >= 0.0),
          platform_retained_amount REAL NOT NULL DEFAULT 0.0,
          cutoff_at TEXT NOT NULL,
          checked_at TEXT,
          postponement_reason TEXT,
          winner_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
          winner_ticket_id TEXT,
          winner_card_number INTEGER,
          winner_username TEXT,
          payout_status TEXT NOT NULL DEFAULT 'PENDING' CHECK(payout_status IN ('PENDING', 'PAID', 'NOT_APPLICABLE')),
          paid_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_daily_jackpot_date ON daily_jackpot_rounds(date_str);
        CREATE INDEX IF NOT EXISTS idx_daily_jackpot_status ON daily_jackpot_rounds(status);

        CREATE TABLE IF NOT EXISTS daily_jackpot_tickets (
          id TEXT PRIMARY KEY,
          round_id TEXT NOT NULL REFERENCES daily_jackpot_rounds(id) ON DELETE CASCADE,
          card_number INTEGER NOT NULL CHECK(card_number >= 1 AND card_number <= 200),
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          username TEXT NOT NULL,
          price REAL NOT NULL DEFAULT 999.0,
          grid_json TEXT NOT NULL,
          fingerprint_hash TEXT NOT NULL,
          purchased_at TEXT NOT NULL,
          UNIQUE(round_id, card_number)
        );
        CREATE INDEX IF NOT EXISTS idx_daily_jackpot_tickets_round ON daily_jackpot_tickets(round_id);
        CREATE INDEX IF NOT EXISTS idx_daily_jackpot_tickets_user ON daily_jackpot_tickets(user_id);
      `);

      // Migration: bonus_balance on wallets
      try {
        const walletCols = this.db.prepare('PRAGMA table_info(wallets)').all() as Array<{ name: string }>;
        const walletColNames = new Set(walletCols.map((c: any) => c.name));
        if (!walletColNames.has('bonus_balance')) {
          console.log('[DatabaseService] Running migration: adding bonus_balance to wallets table');
          this.db.exec('ALTER TABLE wallets ADD COLUMN bonus_balance REAL NOT NULL DEFAULT 0.0 CHECK(bonus_balance >= 0.0);');
        }
      } catch (walletMigErr) {
        console.warn('[DatabaseService] Wallet migration check warning:', walletMigErr);
      }

      // Migration: promotional_rewards table
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS promotional_rewards (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          reward_type TEXT NOT NULL DEFAULT 'FIRST_DEPOSIT_BONUS',
          source TEXT NOT NULL DEFAULT 'TELEBIRR_DEPOSIT',
          qualifying_deposit_id TEXT NOT NULL UNIQUE REFERENCES deposit_requests(id),
          deposit_amount REAL NOT NULL CHECK(deposit_amount > 0),
          bonus_percentage REAL NOT NULL DEFAULT 10.0,
          bonus_amount REAL NOT NULL CHECK(bonus_amount > 0 AND bonus_amount <= 50.0),
          remaining_amount REAL NOT NULL CHECK(remaining_amount >= 0.0 AND remaining_amount <= bonus_amount),
          status TEXT NOT NULL CHECK(status IN ('AWARDED', 'PARTIALLY_CONSUMED', 'CONSUMED', 'EXPIRED')),
          issued_at TEXT NOT NULL,
          expires_at TEXT NOT NULL,
          consumed_at TEXT,
          expired_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_rewards_user ON promotional_rewards(user_id);
        CREATE INDEX IF NOT EXISTS idx_rewards_status_expires ON promotional_rewards(status, expires_at);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_rewards_user_first_deposit ON promotional_rewards(user_id) WHERE reward_type = 'FIRST_DEPOSIT_BONUS';
      `);
    } catch (err) {
      console.error('[DatabaseService] Migration check warning:', err);
    }
  }

  private transactionDepth: number = 0;

  /**
   * Run operations inside an ACID transaction (supports re-entrant nested transactions)
   */
  public transaction<T>(fn: () => T): T {
    if (this.transactionDepth > 0) {
      this.transactionDepth++;
      try {
        return fn();
      } finally {
        this.transactionDepth--;
      }
    }

    this.transactionDepth = 1;
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    } finally {
      this.transactionDepth = 0;
    }
  }

  // ==================== USER OPERATIONS ====================

  public createUser(user: {
    id: string;
    telegram_id: string;
    telegram_username?: string;
    first_name?: string;
    last_name?: string;
    username: string;
    phone?: string;
    password_hash?: string;
    password_salt?: string;
    referral_code: string;
    referred_by?: string;
    role?: 'USER' | 'ADMIN';
    account_status?: 'ACTIVE' | 'SUSPENDED' | 'BANNED';
    registration_status?: 'PENDING' | 'COMPLETED';
    avatar_url?: string;
    is_bot?: boolean;
    created_at?: string;
  }): UserRow {
    const now = new Date().toISOString();
    const normalizedPhone = user.phone ? (normalizeEthiopianPhone(user.phone) || user.phone) : null;
    const effectiveTgId = user.telegram_id || (normalizedPhone ? `phone_${normalizedPhone}` : `web_${user.id}`);

    const stmt = this.db.prepare(`
      INSERT INTO users (
        id, telegram_id, telegram_username, first_name, last_name,
        username, phone, password_hash, password_salt, referral_code, referred_by, role,
        account_status, registration_status, avatar_url, is_bot,
        created_at, updated_at, last_login_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      user.id,
      effectiveTgId,
      user.telegram_username || null,
      user.first_name || null,
      user.last_name || null,
      user.username,
      normalizedPhone,
      user.password_hash || null,
      user.password_salt || null,
      user.referral_code,
      user.referred_by || null,
      user.role || 'USER',
      user.account_status || 'ACTIVE',
      user.registration_status || 'COMPLETED',
      user.avatar_url || null,
      user.is_bot ? 1 : 0,
      user.created_at || now,
      now,
      now
    );

    // Automatically create empty wallet
    this.getOrCreateWallet(user.id);

    return this.getUserById(user.id)!;
  }

  public getUserById(id: string): UserRow | undefined {
    const stmt = this.db.prepare('SELECT * FROM users WHERE id = ?');
    return stmt.get(id) as UserRow | undefined;
  }

  public getUserByTelegramId(telegramId: string): UserRow | undefined {
    const stmt = this.db.prepare('SELECT * FROM users WHERE telegram_id = ?');
    return stmt.get(String(telegramId)) as UserRow | undefined;
  }

  public getUserByUsername(username: string): UserRow | undefined {
    const stmt = this.db.prepare('SELECT * FROM users WHERE LOWER(username) = LOWER(?)');
    return stmt.get(username) as UserRow | undefined;
  }

  public getUserByReferralCode(code: string): UserRow | undefined {
    const stmt = this.db.prepare('SELECT * FROM users WHERE UPPER(referral_code) = UPPER(?)');
    return stmt.get(code) as UserRow | undefined;
  }

  public getUserByPhone(phone: string): UserRow | undefined {
    if (!phone) return undefined;
    const normalized = normalizeEthiopianPhone(phone);
    if (normalized) {
      const stmt = this.db.prepare('SELECT * FROM users WHERE phone = ?');
      const user = stmt.get(normalized) as UserRow | undefined;
      if (user) return user;
    }

    // Fallback lookup: check raw input or local 09... format if unmigrated
    const fallbackStmt = this.db.prepare('SELECT * FROM users WHERE phone = ?');
    let fallback = fallbackStmt.get(phone) as UserRow | undefined;
    if (!fallback && phone.startsWith('+251')) {
      fallback = fallbackStmt.get('0' + phone.substring(4)) as UserRow | undefined;
    }
    return fallback;
  }

  public updateUser(
    id: string,
    updates: Partial<Omit<UserRow, 'id' | 'created_at'>>
  ): UserRow {
    const allowed = [
      'telegram_id', 'telegram_username', 'first_name', 'last_name', 'username',
      'phone', 'password_hash', 'password_salt', 'referral_code', 'referred_by', 'role',
      'account_status', 'registration_status', 'avatar_url',
      'is_bot', 'last_login_at'
    ];

    const fields: string[] = [];
    const values: any[] = [];

    for (let [key, val] of Object.entries(updates)) {
      if (allowed.includes(key)) {
        if (key === 'phone' && typeof val === 'string') {
          val = normalizeEthiopianPhone(val) || val;
        }
        fields.push(`${key} = ?`);
        values.push(key === 'is_bot' ? (val ? 1 : 0) : val);
      }
    }

    fields.push('updated_at = ?');
    values.push(new Date().toISOString());

    values.push(id);

    const sql = `UPDATE users SET ${fields.join(', ')} WHERE id = ?`;
    this.db.prepare(sql).run(...values);

    return this.getUserById(id)!;
  }

  public getAllUsers(): UserRow[] {
    const stmt = this.db.prepare('SELECT * FROM users ORDER BY created_at DESC');
    return stmt.all() as UserRow[];
  }

  // ==================== SESSION OPERATIONS ====================

  public createSession(userId: string, telegramId: string, ttlMs: number = 30 * 24 * 60 * 60 * 1000): SessionRow {
    const token = `tok_${crypto.randomUUID().replace(/-/g, '')}${crypto.randomUUID().replace(/-/g, '').substring(0, 16)}`;
    const now = Date.now();
    const expiresAt = now + ttlMs;

    const stmt = this.db.prepare(`
      INSERT INTO sessions (id, user_id, telegram_id, created_at, expires_at, last_used_at, revoked_at)
      VALUES (?, ?, ?, ?, ?, ?, NULL)
    `);

    stmt.run(token, userId, String(telegramId), now, expiresAt, now);

    return {
      id: token,
      user_id: userId,
      telegram_id: String(telegramId),
      created_at: now,
      expires_at: expiresAt,
      last_used_at: now,
      revoked_at: null
    };
  }

  public getSession(token: string): SessionRow | undefined {
    if (!token) return undefined;
    const stmt = this.db.prepare('SELECT * FROM sessions WHERE id = ?');
    const session = stmt.get(token) as SessionRow | undefined;

    if (!session) return undefined;
    if (session.revoked_at || Date.now() > session.expires_at) return undefined;

    return session;
  }

  public getRawSession(token: string): SessionRow | undefined {
    if (!token) return undefined;
    const stmt = this.db.prepare('SELECT * FROM sessions WHERE id = ?');
    return stmt.get(token) as SessionRow | undefined;
  }

  public touchSession(token: string): void {
    const stmt = this.db.prepare('UPDATE sessions SET last_used_at = ? WHERE id = ?');
    stmt.run(Date.now(), token);
  }

  public revokeSession(token: string): void {
    const stmt = this.db.prepare('UPDATE sessions SET revoked_at = ? WHERE id = ?');
    stmt.run(Date.now(), token);
  }

  public revokeAllUserSessions(userId: string): void {
    const stmt = this.db.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL');
    stmt.run(Date.now(), userId);
  }

  // ==================== WALLET & LEDGER OPERATIONS ====================

  public getOrCreateWallet(userId: string, initialBalance: number = 0.0): WalletRow {
    const existing = this.getWallet(userId);
    if (existing) return existing;

    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO wallets (user_id, balance, reserved_balance, bonus_balance, created_at, updated_at)
      VALUES (?, ?, 0.0, 0.0, ?, ?)
    `);
    stmt.run(userId, initialBalance, now, now);

    return {
      user_id: userId,
      balance: initialBalance,
      reserved_balance: 0.0,
      bonus_balance: 0.0,
      created_at: now,
      updated_at: now
    };
  }

  public getWallet(userId: string): WalletRow | undefined {
    const stmt = this.db.prepare('SELECT * FROM wallets WHERE user_id = ?');
    const row = stmt.get(userId) as any;
    if (!row) return undefined;
    if (row.bonus_balance === undefined || row.bonus_balance === null) {
      row.bonus_balance = 0.0;
    }
    return row as WalletRow;
  }

  public updateWalletBalance(userId: string, balance: number, reserved: number = 0, bonus: number = 0): void {
    this.getOrCreateWallet(userId);
    const cleanBalance = Math.round(balance * 100) / 100;
    const cleanReserved = Math.round(reserved * 100) / 100;
    const cleanBonus = Math.max(0, Math.round(bonus * 100) / 100);
    this.db.prepare(`UPDATE wallets SET balance = ?, reserved_balance = ?, bonus_balance = ?, updated_at = ? WHERE user_id = ?`)
      .run(cleanBalance, cleanReserved, cleanBonus, new Date().toISOString(), userId);
  }

  public recordLedgerTransaction(data: {
    userId: string;
    username: string;
    type: LedgerRow['type'];
    amount: number;
    description: string;
    gameId?: string;
    ticketId?: string;
    referenceId?: string;
  }): { entry: LedgerRow; wallet: WalletRow } {
    return this.transaction(() => {
      // Idempotency check: if referenceId was already processed, return existing record
      if (data.referenceId) {
        const existingTx = this.db.prepare('SELECT * FROM ledger_transactions WHERE reference_id = ?').get(data.referenceId) as LedgerRow | undefined;
        if (existingTx) {
          return { entry: existingTx, wallet: this.getOrCreateWallet(data.userId) };
        }
      }

      const wallet = this.getOrCreateWallet(data.userId);
      const balanceBefore = wallet.balance;
      let balanceAfter = balanceBefore;

      const cleanAmount = Math.round(data.amount * 100) / 100;
      if (['DEPOSIT', 'WIN_PAYOUT', 'REFUND', 'BONUS', 'ADMIN_ADJUSTMENT'].includes(data.type)) {
        balanceAfter = Math.round((balanceBefore + cleanAmount) * 100) / 100;
      } else if (['BET', 'WITHDRAWAL', 'LOSS'].includes(data.type)) {
        if (balanceBefore < cleanAmount) {
          throw new Error(`Insufficient wallet balance: required ${cleanAmount.toFixed(2)}, available ${balanceBefore.toFixed(2)}`);
        }
        balanceAfter = Math.round((balanceBefore - cleanAmount) * 100) / 100;
      }

      if (balanceAfter < 0) {
        throw new Error(`Transaction would cause negative balance (${balanceAfter.toFixed(2)})`);
      }

      const entryId = `tx_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      const now = new Date().toISOString();

      // Insert transaction record
      const txStmt = this.db.prepare(`
        INSERT INTO ledger_transactions (
          id, user_id, username, type, amount, balance_before, balance_after,
          game_id, ticket_id, reference_id, description, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      txStmt.run(
        entryId,
        data.userId,
        data.username,
        data.type,
        data.amount,
        balanceBefore,
        balanceAfter,
        data.gameId || null,
        data.ticketId || null,
        data.referenceId || null,
        data.description,
        now
      );

      // Update wallet balance
      const updateWalletStmt = this.db.prepare(`
        UPDATE wallets SET balance = ?, updated_at = ? WHERE user_id = ?
      `);
      updateWalletStmt.run(balanceAfter, now, data.userId);

      const updatedWallet = this.getWallet(data.userId)!;
      const entry: LedgerRow = {
        id: entryId,
        user_id: data.userId,
        username: data.username,
        type: data.type,
        amount: data.amount,
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        game_id: data.gameId,
        ticket_id: data.ticketId,
        reference_id: data.referenceId,
        description: data.description,
        created_at: now
      };

      return { entry, wallet: updatedWallet };
    });
  }

  public getLedgerForUser(userId: string): LedgerRow[] {
    const stmt = this.db.prepare('SELECT * FROM ledger_transactions WHERE user_id = ? ORDER BY created_at DESC');
    return stmt.all(userId) as LedgerRow[];
  }

  public getAllLedgerTransactions(): LedgerRow[] {
    const stmt = this.db.prepare('SELECT * FROM ledger_transactions ORDER BY created_at DESC');
    return stmt.all() as LedgerRow[];
  }

  // ==================== DEPOSITS ====================

  public createDepositRequest(
    userId: string,
    username: string,
    amount: number,
    paymentMethod: string = 'Telebirr',
    referenceId?: string
  ): DepositRow {
    return this.transaction(() => {
      const id = `dep_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const now = new Date().toISOString();
      const normalizedPaymentMethod = 'Telebirr'; // Strictly enforce Telebirr
      const cleanRef = referenceId?.trim() ? referenceId.trim().toUpperCase() : null;

      // Telebirr reference uniqueness & duplicate check
      if (cleanRef) {
        const existingDeposit = this.db.prepare(
          "SELECT id FROM deposit_requests WHERE UPPER(reference_id) = ? AND status IN ('PENDING', 'APPROVED')"
        ).get(cleanRef);
        if (existingDeposit) {
          throw new Error(`This Telebirr transaction reference (${cleanRef}) has already been submitted or credited.`);
        }

        const existingTx = this.db.prepare(
          "SELECT id FROM ledger_transactions WHERE UPPER(reference_id) = ?"
        ).get(cleanRef);
        if (existingTx) {
          throw new Error(`This Telebirr transaction reference (${cleanRef}) has already been credited in the ledger.`);
        }
      }

      const cleanAmount = Math.round(amount * 100) / 100;
      if (cleanAmount <= 0) {
        throw new Error('Deposit amount must be greater than zero');
      }

      try {
        const stmt = this.db.prepare(`
          INSERT INTO deposit_requests (
            id, user_id, username, amount, payment_method, status, reference_id, created_at
          ) VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?)
        `);
        stmt.run(id, userId, username, cleanAmount, normalizedPaymentMethod, cleanRef, now);
      } catch (err: any) {
        if (err.message && err.message.includes('UNIQUE constraint failed')) {
          throw new Error(`This Telebirr transaction reference (${cleanRef}) has already been submitted or credited.`);
        }
        throw err;
      }

      return this.getDepositRequest(id)!;
    });
  }

  public getDepositRequest(id: string): DepositRow | undefined {
    const stmt = this.db.prepare('SELECT * FROM deposit_requests WHERE id = ?');
    return stmt.get(id) as DepositRow | undefined;
  }

  public getDepositRequests(status?: string): DepositRow[] {
    if (status) {
      const stmt = this.db.prepare('SELECT * FROM deposit_requests WHERE status = ? ORDER BY created_at DESC');
      return stmt.all(status) as DepositRow[];
    }
    const stmt = this.db.prepare('SELECT * FROM deposit_requests ORDER BY created_at DESC');
    return stmt.all() as DepositRow[];
  }

  public approveDeposit(adminId: string, depositId: string): { deposit: DepositRow; entry: LedgerRow; wallet: WalletRow; promotionalBonus?: PromotionalReward | null } {
    return this.transaction(() => {
      const deposit = this.getDepositRequest(depositId);
      if (!deposit) throw new Error('Deposit request not found');
      if (deposit.status !== 'PENDING') throw new Error(`Deposit is already ${deposit.status}`);

      const now = new Date().toISOString();
      // Atomic conditional update guaranteeing exactly 1 approval under concurrency
      const updateStmt = this.db.prepare(`
        UPDATE deposit_requests
        SET status = 'APPROVED', processed_at = ?, processed_by = ?
        WHERE id = ? AND status = 'PENDING'
      `);
      const updateRes = updateStmt.run(now, adminId, depositId);
      if (updateRes.changes === 0) {
        throw new Error(`Deposit request is no longer in PENDING status or was already processed`);
      }

      // Credit wallet and record ledger entry
      const { entry } = this.recordLedgerTransaction({
        userId: deposit.user_id,
        username: deposit.username,
        type: 'DEPOSIT',
        amount: deposit.amount,
        description: `Deposit via ${deposit.payment_method} approved by ${adminId}`,
        referenceId: deposit.reference_id || `dep_appr_${depositId}`
      });

      // Promotional Rewards V2: First Deposit Bonus evaluation and issuance
      let promotionalBonus: PromotionalReward | null = null;
      try {
        promotionalBonus = this.rewardService.issueFirstDepositBonus(
          deposit.user_id,
          deposit.username,
          deposit.id,
          deposit.amount
        );
      } catch (rewardErr) {
        console.warn(`[DatabaseService] Promotional bonus issuance warning for deposit ${depositId}:`, rewardErr);
      }

      this.recordAuditLog({
        adminUserId: adminId,
        action: 'APPROVE_DEPOSIT',
        targetUserId: deposit.user_id,
        targetRecordId: depositId,
        metadata: {
          amount: deposit.amount,
          paymentMethod: deposit.payment_method,
          referenceId: deposit.reference_id,
          promotionalBonusAwarded: Boolean(promotionalBonus),
          promotionalBonusAmount: promotionalBonus?.bonusAmount || 0
        }
      });

      const updatedWallet = this.getWallet(deposit.user_id)!;
      return { deposit: this.getDepositRequest(depositId)!, entry, wallet: updatedWallet, promotionalBonus };
    });
  }

  public rejectDeposit(adminId: string, depositId: string, reason?: string): DepositRow {
    return this.transaction(() => {
      const deposit = this.getDepositRequest(depositId);
      if (!deposit) throw new Error('Deposit request not found');
      if (deposit.status !== 'PENDING') throw new Error(`Deposit is already ${deposit.status}`);

      const now = new Date().toISOString();
      // Atomic conditional update
      const updateStmt = this.db.prepare(`
        UPDATE deposit_requests
        SET status = 'REJECTED', processed_at = ?, processed_by = ?, rejection_reason = ?
        WHERE id = ? AND status = 'PENDING'
      `);
      const updateRes = updateStmt.run(now, adminId, reason || 'Rejected by administrator', depositId);
      if (updateRes.changes === 0) {
        throw new Error(`Deposit request is no longer in PENDING status or was already processed`);
      }

      this.recordAuditLog({
        adminUserId: adminId,
        action: 'REJECT_DEPOSIT',
        targetUserId: deposit.user_id,
        targetRecordId: depositId,
        metadata: { reason, referenceId: deposit.reference_id }
      });

      return this.getDepositRequest(depositId)!;
    });
  }

  // ==================== WITHDRAWALS ====================

  public createWithdrawalRequest(userId: string, username: string, amount: number, address: string): WithdrawalRow {
    return this.transaction(() => {
      const cleanAmount = Math.round(amount * 100) / 100;
      if (cleanAmount <= 0) {
        throw new Error('Withdrawal amount must be greater than zero');
      }

      const now = new Date().toISOString();
      // Atomic balance reservation: only deduct if available balance is >= amount
      const updateRes = this.db.prepare(`
        UPDATE wallets
        SET balance = balance - ?, reserved_balance = reserved_balance + ?, updated_at = ?
        WHERE user_id = ? AND balance >= ?
      `).run(cleanAmount, cleanAmount, now, userId, cleanAmount);

      if (updateRes.changes === 0) {
        const wallet = this.getOrCreateWallet(userId);
        throw new Error(`Insufficient funds: balance is ${wallet.balance.toFixed(2)}, cannot withdraw ${cleanAmount.toFixed(2)}`);
      }

      const id = `wth_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const stmt = this.db.prepare(`
        INSERT INTO withdrawal_requests (
          id, user_id, username, amount, address, status, created_at
        ) VALUES (?, ?, ?, ?, ?, 'PENDING', ?)
      `);
      stmt.run(id, userId, username, cleanAmount, address, now);

      const wallet = this.getWallet(userId)!;
      const entryId = `tx_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      this.db.prepare(`
        INSERT INTO ledger_transactions (
          id, user_id, username, type, amount, balance_before, balance_after,
          reference_id, description, created_at
        ) VALUES (?, ?, ?, 'ESCROW_HOLD', ?, ?, ?, ?, ?, ?)
      `).run(
        entryId,
        userId,
        username,
        cleanAmount,
        wallet.balance + cleanAmount,
        wallet.balance,
        `wth_hold_${id}`,
        `Withdrawal escrow hold of ${cleanAmount.toFixed(2)} ETB to ${address} pending approval`,
        now
      );

      return this.getWithdrawalRequest(id)!;
    });
  }

  public getWithdrawalRequest(id: string): WithdrawalRow | undefined {
    const stmt = this.db.prepare('SELECT * FROM withdrawal_requests WHERE id = ?');
    return stmt.get(id) as WithdrawalRow | undefined;
  }

  public getWithdrawalRequests(status?: string): WithdrawalRow[] {
    if (status) {
      const stmt = this.db.prepare('SELECT * FROM withdrawal_requests WHERE status = ? ORDER BY created_at DESC');
      return stmt.all(status) as WithdrawalRow[];
    }
    const stmt = this.db.prepare('SELECT * FROM withdrawal_requests ORDER BY created_at DESC');
    return stmt.all() as WithdrawalRow[];
  }

  public approveWithdrawal(adminId: string, withdrawalId: string): { withdrawal: WithdrawalRow; entry: LedgerRow; wallet: WalletRow } {
    return this.transaction(() => {
      const withdrawal = this.getWithdrawalRequest(withdrawalId);
      if (!withdrawal) throw new Error('Withdrawal request not found');
      if (withdrawal.status !== 'PENDING' && withdrawal.status !== 'PROCESSING') {
        throw new Error(`Withdrawal is already ${withdrawal.status}`);
      }

      const now = new Date().toISOString();

      // Atomic update of withdrawal request
      const updateRes = this.db.prepare(`
        UPDATE withdrawal_requests
        SET status = 'APPROVED', processed_at = ?, processed_by = ?
        WHERE id = ? AND status IN ('PENDING', 'PROCESSING')
      `).run(now, adminId, withdrawalId);

      if (updateRes.changes === 0) {
        throw new Error(`Withdrawal request is no longer in PENDING status or was already processed`);
      }

      // Deduct from reserved balance atomically
      const cleanAmount = Math.round(withdrawal.amount * 100) / 100;
      const deductRes = this.db.prepare(`
        UPDATE wallets
        SET reserved_balance = reserved_balance - ?, updated_at = ?
        WHERE user_id = ? AND reserved_balance >= ?
      `).run(cleanAmount, now, withdrawal.user_id, cleanAmount);

      if (deductRes.changes === 0) {
        throw new Error('Integrity error: reserved balance mismatch');
      }

      const wallet = this.getWallet(withdrawal.user_id)!;
      const entryId = `tx_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      this.db.prepare(`
        INSERT INTO ledger_transactions (
          id, user_id, username, type, amount, balance_before, balance_after,
          reference_id, description, created_at
        ) VALUES (?, ?, ?, 'WITHDRAWAL', ?, ?, ?, ?, ?, ?)
      `).run(
        entryId,
        withdrawal.user_id,
        withdrawal.username,
        withdrawal.amount,
        wallet.balance + withdrawal.amount,
        wallet.balance,
        `wth_comp_${withdrawalId}`,
        `Withdrawal via Telebirr to ${withdrawal.address} approved by ${adminId}`,
        now
      );

      this.recordAuditLog({
        adminUserId: adminId,
        action: 'APPROVE_WITHDRAWAL',
        targetUserId: withdrawal.user_id,
        targetRecordId: withdrawalId,
        metadata: { amount: withdrawal.amount, address: withdrawal.address }
      });

      const entry: LedgerRow = {
        id: entryId,
        user_id: withdrawal.user_id,
        username: withdrawal.username,
        type: 'WITHDRAWAL',
        amount: withdrawal.amount,
        balance_before: wallet.balance + withdrawal.amount,
        balance_after: wallet.balance,
        reference_id: `wth_comp_${withdrawalId}`,
        description: `Withdrawal via Telebirr to ${withdrawal.address} approved by ${adminId}`,
        created_at: now
      };

      return {
        withdrawal: this.getWithdrawalRequest(withdrawalId)!,
        entry,
        wallet
      };
    });
  }

  public rejectWithdrawal(adminId: string, withdrawalId: string, reason?: string): WithdrawalRow {
    return this.transaction(() => {
      const withdrawal = this.getWithdrawalRequest(withdrawalId);
      if (!withdrawal) throw new Error('Withdrawal request not found');
      if (withdrawal.status !== 'PENDING' && withdrawal.status !== 'PROCESSING') {
        throw new Error(`Withdrawal is already ${withdrawal.status}`);
      }

      const now = new Date().toISOString();

      // Atomic update of withdrawal request
      const updateRes = this.db.prepare(`
        UPDATE withdrawal_requests
        SET status = 'REJECTED', processed_at = ?, processed_by = ?, rejection_reason = ?
        WHERE id = ? AND status IN ('PENDING', 'PROCESSING')
      `).run(now, adminId, reason || 'Rejected by administrator', withdrawalId);

      if (updateRes.changes === 0) {
        throw new Error(`Withdrawal request is no longer in PENDING status or was already processed`);
      }

      // Restore funds: transfer from reserved_balance back to balance atomically
      const cleanAmount = Math.round(withdrawal.amount * 100) / 100;
      const restoreRes = this.db.prepare(`
        UPDATE wallets
        SET balance = balance + ?, reserved_balance = reserved_balance - ?, updated_at = ?
        WHERE user_id = ? AND reserved_balance >= ?
      `).run(cleanAmount, cleanAmount, now, withdrawal.user_id, cleanAmount);

      if (restoreRes.changes === 0) {
        throw new Error('Integrity error: reserved balance mismatch');
      }

      const wallet = this.getWallet(withdrawal.user_id)!;
      const entryId = `tx_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      this.db.prepare(`
        INSERT INTO ledger_transactions (
          id, user_id, username, type, amount, balance_before, balance_after,
          reference_id, description, created_at
        ) VALUES (?, ?, ?, 'REFUND', ?, ?, ?, ?, ?, ?)
      `).run(
        entryId,
        withdrawal.user_id,
        withdrawal.username,
        cleanAmount,
        wallet.balance - cleanAmount,
        wallet.balance,
        `wth_ref_${withdrawalId}`,
        `Withdrawal rejected and refunded to wallet: ${reason || 'Rejected by administrator'}`,
        now
      );

      this.recordAuditLog({
        adminUserId: adminId,
        action: 'REJECT_WITHDRAWAL',
        targetUserId: withdrawal.user_id,
        targetRecordId: withdrawalId,
        metadata: { reason, refundedAmount: withdrawal.amount }
      });

      return this.getWithdrawalRequest(withdrawalId)!;
    });
  }

  // ==================== GAMES & TICKETS ====================

  public createGame(game: {
    id: string;
    roomId: string;
    betPerCard: number;
    serverSecret: string;
    commitmentHash: string;
  }): GameRow {
    const now = new Date().toISOString();
    const existing = this.getGame(game.id);
    if (existing) return existing;

    const stmt = this.db.prepare(`
      INSERT INTO games (
        id, room_id, status, bet_per_card, server_secret, commitment_hash, total_cards_sold, prize_pool, created_at
      ) VALUES (?, ?, 'lobby', ?, ?, ?, 0, 0.0, ?)
    `);
    stmt.run(game.id, game.roomId, game.betPerCard, game.serverSecret, game.commitmentHash, now);
    return this.getGame(game.id)!;
  }

  public getGame(id: string): GameRow | undefined {
    const stmt = this.db.prepare('SELECT * FROM games WHERE id = ?');
    return stmt.get(id) as GameRow | undefined;
  }

  public updateGame(id: string, updates: Partial<GameRow>): void {
    const fields: string[] = [];
    const values: any[] = [];
    for (const [k, v] of Object.entries(updates)) {
      if (['status', 'total_cards_sold', 'prize_pool', 'finished_at'].includes(k)) {
        fields.push(`${k} = ?`);
        values.push(v);
      }
    }
    if (fields.length === 0) return;
    values.push(id);
    this.db.prepare(`UPDATE games SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  }

  public createPlayerTicket(ticket: {
    id: string;
    gameId: string;
    cardNumber: number;
    userId: string;
    username: string;
    gridJson: string;
    fingerprintHash: string;
    isBot?: boolean;
  }): TicketRow {
    const now = new Date().toISOString();
    const existing = this.getPlayerTicket(ticket.id);
    if (existing) return existing;

    // Ensure referenced game exists in DB
    if (!this.getGame(ticket.gameId)) {
      this.createGame({
        id: ticket.gameId,
        roomId: 'room_default',
        betPerCard: 20,
        serverSecret: 'sec_default',
        commitmentHash: 'hash_default'
      });
    }

    const stmt = this.db.prepare(`
      INSERT INTO player_tickets (
        id, game_id, card_number, user_id, username, grid_json, fingerprint_hash, is_bot, purchased_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      ticket.id,
      ticket.gameId,
      ticket.cardNumber,
      ticket.userId,
      ticket.username,
      ticket.gridJson,
      ticket.fingerprintHash,
      ticket.isBot ? 1 : 0,
      now
    );

    return {
      id: ticket.id,
      game_id: ticket.gameId,
      card_number: ticket.cardNumber,
      user_id: ticket.userId,
      username: ticket.username,
      grid_json: ticket.gridJson,
      fingerprint_hash: ticket.fingerprintHash,
      is_bot: ticket.isBot ? 1 : 0,
      purchased_at: now
    };
  }

  public getPlayerTicket(ticketId: string): TicketRow | undefined {
    const stmt = this.db.prepare('SELECT * FROM player_tickets WHERE id = ?');
    return stmt.get(ticketId) as TicketRow | undefined;
  }

  public getActiveOrLobbyGames(roomId?: string): GameRow[] {
    if (roomId) {
      const stmt = this.db.prepare("SELECT * FROM games WHERE room_id = ? AND status IN ('lobby', 'active')");
      return stmt.all(roomId) as GameRow[];
    }
    const stmt = this.db.prepare("SELECT * FROM games WHERE status IN ('lobby', 'active')");
    return stmt.all() as GameRow[];
  }

  public getTicketsForGame(gameId: string): TicketRow[] {
    const stmt = this.db.prepare('SELECT * FROM player_tickets WHERE game_id = ?');
    return stmt.all(gameId) as TicketRow[];
  }

  public getLedgerTransactionByReference(referenceId: string): LedgerRow | undefined {
    const stmt = this.db.prepare('SELECT * FROM ledger_transactions WHERE reference_id = ?');
    return stmt.get(referenceId) as LedgerRow | undefined;
  }

  // ==================== BINGO CLAIMS (IDEMPOTENT) ====================

  public recordBingoClaim(claim: {
    gameId: string;
    ticketId: string;
    userId: string;
    payoutAmount: number;
    patternType: string;
  }): ClaimRow {
    const id = `clm_${claim.gameId}_${claim.ticketId}`;
    const now = new Date().toISOString();

    // Ensure referenced game and ticket exist in DB
    if (!this.getGame(claim.gameId)) {
      this.createGame({
        id: claim.gameId,
        roomId: 'room_default',
        betPerCard: 20,
        serverSecret: 'sec_default',
        commitmentHash: 'hash_default'
      });
    }
    if (!this.getPlayerTicket(claim.ticketId)) {
      this.createPlayerTicket({
        id: claim.ticketId,
        gameId: claim.gameId,
        cardNumber: 1,
        userId: claim.userId,
        username: 'Player',
        gridJson: '{}',
        fingerprintHash: 'hash_claim'
      });
    }

    const stmt = this.db.prepare(`
      INSERT INTO bingo_claims (
        id, game_id, ticket_id, user_id, payout_amount, pattern_type, status, claimed_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'VERIFIED', ?)
    `);

    stmt.run(id, claim.gameId, claim.ticketId, claim.userId, claim.payoutAmount, claim.patternType, now);

    return {
      id,
      game_id: claim.gameId,
      ticket_id: claim.ticketId,
      user_id: claim.userId,
      payout_amount: claim.payoutAmount,
      pattern_type: claim.patternType,
      status: 'VERIFIED',
      claimed_at: now
    };
  }

  public getBingoClaim(gameId: string, ticketId: string): ClaimRow | undefined {
    const stmt = this.db.prepare('SELECT * FROM bingo_claims WHERE game_id = ? AND ticket_id = ?');
    return stmt.get(gameId, ticketId) as ClaimRow | undefined;
  }

  // ==================== USER PROFILE & STATS ====================

  public getUserStats(userId: string): {
    totalGames: number;
    totalWon: number;
    currentStreak: number;
    xp: number;
    level: number;
    levelProgressXp: number;
    levelTotalXp: number;
    levelPercent: number;
    vipTier: string;
  } {
    // 1. Total distinct games played by this user
    const gamesStmt = this.db.prepare('SELECT COUNT(DISTINCT game_id) as c FROM player_tickets WHERE user_id = ?');
    const totalGames = (gamesStmt.get(userId) as any)?.c || 0;

    // 2. Total winnings from immutable double-entry ledger
    const wonStmt = this.db.prepare(
      "SELECT COALESCE(SUM(amount), 0) as total FROM ledger_transactions WHERE user_id = ? AND type = 'WIN_PAYOUT'"
    );
    const totalWon = Math.max(0, (wonStmt.get(userId) as any)?.total || 0);

    // 3. User's isolated current win streak
    const recentGamesStmt = this.db.prepare(
      'SELECT DISTINCT game_id, MAX(purchased_at) as latest_purchase FROM player_tickets WHERE user_id = ? GROUP BY game_id ORDER BY latest_purchase DESC LIMIT 50'
    );
    const recentGames = recentGamesStmt.all(userId) as Array<{ game_id: string; latest_purchase: string }>;

    let currentStreak = 0;
    const claimStmt = this.db.prepare("SELECT 1 FROM bingo_claims WHERE user_id = ? AND game_id = ? AND status = 'VERIFIED' LIMIT 1");
    for (const g of recentGames) {
      const won = claimStmt.get(userId, g.game_id);
      if (won) {
        currentStreak++;
      } else {
        break;
      }
    }

    // 4. Dynamic XP, Level, and VIP progression
    const winsStmt = this.db.prepare("SELECT COUNT(*) as c FROM bingo_claims WHERE user_id = ? AND status = 'VERIFIED'");
    const totalWins = (winsStmt.get(userId) as any)?.c || 0;
    const xp = Math.floor(totalGames * 20 + Math.floor(totalWon / 5) + totalWins * 50);

    const xpPerLevel = 500;
    const level = Math.floor(xp / xpPerLevel) + 1;
    const levelProgressXp = xp % xpPerLevel;
    const levelPercent = Math.min(100, Math.round((levelProgressXp / xpPerLevel) * 100));

    let vipTier = 'BRONZE VIP';
    if (level >= 10) vipTier = 'VIP CHAMPION';
    else if (level >= 6) vipTier = 'GOLD VIP';
    else if (level >= 3) vipTier = 'SILVER VIP';

    return {
      totalGames,
      totalWon,
      currentStreak,
      xp,
      level,
      levelProgressXp,
      levelTotalXp: xpPerLevel,
      levelPercent,
      vipTier
    };
  }

  // ==================== AUDIT LOGS ====================

  public recordAuditLog(log: {
    adminUserId: string;
    action: string;
    targetUserId?: string;
    targetRecordId?: string;
    metadata?: Record<string, any>;
  }): AuditRow {
    const id = `aud_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const now = new Date().toISOString();
    const metaJson = log.metadata ? JSON.stringify(log.metadata) : null;

    // Ensure admin or system user exists in users table to satisfy foreign key constraint
    if (!this.getUserById(log.adminUserId)) {
      this.createUser({
        id: log.adminUserId,
        telegram_id: `admin_${log.adminUserId}`,
        username: log.adminUserId === 'system' ? 'System' : `Admin_${log.adminUserId}`,
        referral_code: `ADM_${log.adminUserId.replace(/[^A-Za-z0-9]/g, '').slice(0, 5).toUpperCase() || 'SYS01'}`,
        role: 'ADMIN'
      });
    }

    const stmt = this.db.prepare(`
      INSERT INTO audit_logs (
        id, admin_user_id, action, target_user_id, target_record_id, metadata_json, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(id, log.adminUserId, log.action, log.targetUserId || null, log.targetRecordId || null, metaJson, now);

    return {
      id,
      admin_user_id: log.adminUserId,
      action: log.action,
      target_user_id: log.targetUserId,
      target_record_id: log.targetRecordId,
      metadata_json: metaJson || undefined,
      timestamp: now
    };
  }

  public getAuditLogs(): AuditRow[] {
    const stmt = this.db.prepare('SELECT * FROM audit_logs ORDER BY timestamp DESC');
    return stmt.all() as AuditRow[];
  }

  // ==================== PENDING REGISTRATIONS ====================

  public createPendingRegistration(data: {
    id: string;
    phone: string;
    name: string;
    passwordHash: string;
    salt: string;
    telegramUserId?: string;
    expiresInMinutes?: number;
  }): PendingRegistrationRow {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + (data.expiresInMinutes || 60) * 60000);
    const createdAtStr = now.toISOString();
    const expiresAtStr = expiresAt.toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO pending_registrations (
        id, phone, name, password_hash, password_salt, telegram_user_id, status, created_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)
      ON CONFLICT(phone) DO UPDATE SET
        name = excluded.name,
        password_hash = excluded.password_hash,
        password_salt = excluded.password_salt,
        telegram_user_id = excluded.telegram_user_id,
        status = 'PENDING',
        denial_reason = NULL,
        created_at = excluded.created_at,
        expires_at = excluded.expires_at
    `);

    stmt.run(
      data.id,
      data.phone,
      data.name,
      data.passwordHash,
      data.salt,
      data.telegramUserId || null,
      createdAtStr,
      expiresAtStr
    );

    return this.getPendingRegistrationByPhone(data.phone)!;
  }

  public getPendingRegistrationByPhone(phone: string): PendingRegistrationRow | undefined {
    const stmt = this.db.prepare('SELECT * FROM pending_registrations WHERE phone = ?');
    return stmt.get(phone) as PendingRegistrationRow | undefined;
  }

  public getPendingRegistrationById(id: string): PendingRegistrationRow | undefined {
    const stmt = this.db.prepare('SELECT * FROM pending_registrations WHERE id = ?');
    return stmt.get(id) as PendingRegistrationRow | undefined;
  }

  public updatePendingRegistration(
    id: string,
    updates: Partial<{
      status: 'PENDING' | 'VERIFIED' | 'DENIED' | 'EXPIRED';
      denial_reason?: string;
      telegram_user_id?: string;
    }>
  ): PendingRegistrationRow | undefined {
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.status !== undefined) {
      fields.push('status = ?');
      values.push(updates.status);
    }
    if (updates.denial_reason !== undefined) {
      fields.push('denial_reason = ?');
      values.push(updates.denial_reason);
    }
    if (updates.telegram_user_id !== undefined) {
      fields.push('telegram_user_id = ?');
      values.push(updates.telegram_user_id);
    }

    if (fields.length === 0) return this.getPendingRegistrationById(id);

    values.push(id);
    this.db.prepare(`UPDATE pending_registrations SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return this.getPendingRegistrationById(id);
  }

  public deletePendingRegistration(id: string): void {
    this.db.prepare('DELETE FROM pending_registrations WHERE id = ?').run(id);
  }

  // ====================================================================
  // DAILY GRAND JACKPOT METHODS
  // ====================================================================

  public getOrCreateDailyJackpotRound(dateStr: string, cutoffIso: string): DailyJackpotRoundRow {
    const existing = this.getDailyJackpotRoundByDate(dateStr);
    if (existing) return existing;

    const roundId = `daily-jackpot-${dateStr}`;
    const now = new Date().toISOString();

    try {
      this.db.prepare(`
        INSERT INTO daily_jackpot_rounds (
          id, date_str, status, cards_sold, gross_sales, jackpot_amount,
          platform_retained_amount, cutoff_at, created_at, updated_at
        ) VALUES (?, ?, 'REGISTRATION_OPEN', 0, 0.0, 0.0, 0.0, ?, ?, ?)
      `).run(roundId, dateStr, cutoffIso, now, now);
    } catch (err: any) {
      // If another concurrent call inserted it, return existing
      const recheck = this.getDailyJackpotRoundByDate(dateStr);
      if (recheck) return recheck;
      throw err;
    }

    return this.getDailyJackpotRound(roundId)!;
  }

  public getDailyJackpotRound(roundId: string): DailyJackpotRoundRow | null {
    const row = this.db.prepare('SELECT * FROM daily_jackpot_rounds WHERE id = ?').get(roundId);
    return (row as DailyJackpotRoundRow) || null;
  }

  public getDailyJackpotRoundByDate(dateStr: string): DailyJackpotRoundRow | null {
    const row = this.db.prepare('SELECT * FROM daily_jackpot_rounds WHERE date_str = ?').get(dateStr);
    return (row as DailyJackpotRoundRow) || null;
  }

  public updateDailyJackpotRound(roundId: string, updates: Partial<DailyJackpotRoundRow>): DailyJackpotRoundRow {
    const allowed = [
      'status', 'cards_sold', 'gross_sales', 'jackpot_amount', 'platform_retained_amount',
      'cutoff_at', 'checked_at', 'postponement_reason', 'winner_user_id', 'winner_ticket_id',
      'winner_card_number', 'winner_username', 'payout_status', 'paid_at'
    ];

    const fields: string[] = [];
    const values: any[] = [];

    for (const key of allowed) {
      if ((updates as any)[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push((updates as any)[key]);
      }
    }

    fields.push('updated_at = ?');
    values.push(new Date().toISOString());

    values.push(roundId);
    this.db.prepare(`UPDATE daily_jackpot_rounds SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return this.getDailyJackpotRound(roundId)!;
  }

  public getDailyJackpotTickets(roundId: string): DailyJackpotTicketRow[] {
    const rows = this.db.prepare('SELECT * FROM daily_jackpot_tickets WHERE round_id = ? ORDER BY card_number ASC').all(roundId);
    return (rows as DailyJackpotTicketRow[]) || [];
  }

  public getUserDailyJackpotTickets(roundId: string, userId: string): DailyJackpotTicketRow[] {
    const rows = this.db.prepare('SELECT * FROM daily_jackpot_tickets WHERE round_id = ? AND user_id = ? ORDER BY card_number ASC').all(roundId, userId);
    return (rows as DailyJackpotTicketRow[]) || [];
  }

  public getAllDailyJackpotRounds(limit: number = 30): DailyJackpotRoundRow[] {
    const rows = this.db.prepare('SELECT * FROM daily_jackpot_rounds ORDER BY created_at DESC LIMIT ?').all(limit);
    return (rows as DailyJackpotRoundRow[]) || [];
  }

  /**
   * Authoritative, atomic card purchase for the Daily Grand Jackpot
   */
  public purchaseDailyJackpotTickets(params: {
    roundId: string;
    userId: string;
    username: string;
    cardNumbers: number[];
    cardGrids?: Map<number, any>;
    fingerprintSecret: string;
  }): { success: boolean; tickets: DailyJackpotTicketRow[]; newBalance: number } {
    const { roundId, userId, username, cardNumbers, cardGrids, fingerprintSecret } = params;

    if (!Array.isArray(cardNumbers) || cardNumbers.length === 0) {
      throw new Error('At least 1 card number must be selected.');
    }

    // Validate numbers 1..200
    for (const n of cardNumbers) {
      if (!Number.isInteger(n) || n < 1 || n > 200) {
        throw new Error(`Invalid card number: ${n}. Cards must be between 1 and 200.`);
      }
    }

    // Check duplicates in request
    const uniqueNums = new Set(cardNumbers);
    if (uniqueNums.size !== cardNumbers.length) {
      throw new Error('Duplicate card numbers in purchase request.');
    }

    const CARD_PRICE = 999.0;
    const totalCost = Number((cardNumbers.length * CARD_PRICE).toFixed(2));

    return this.transaction(() => {
      // 1. Check round state
      const round = this.getDailyJackpotRound(roundId);
      if (!round) {
        throw new Error(`Daily Jackpot round ${roundId} not found.`);
      }

      if (round.status !== 'REGISTRATION_OPEN' && round.status !== 'POSTPONED') {
        throw new Error(`Registration is not open for round ${roundId} (status: ${round.status}).`);
      }

      // Check capacity
      if (round.cards_sold + cardNumbers.length > 200) {
        throw new Error(`Cannot purchase ${cardNumbers.length} card(s). Only ${200 - round.cards_sold} card(s) remaining for this round.`);
      }

      // 2. Check if any card is already sold
      const placeholders = cardNumbers.map(() => '?').join(',');
      const takenRows = this.db.prepare(`
        SELECT card_number FROM daily_jackpot_tickets WHERE round_id = ? AND card_number IN (${placeholders})
      `).all(roundId, ...cardNumbers) as Array<{ card_number: number }>;

      if (takenRows && takenRows.length > 0) {
        const takenList = takenRows.map(r => `#${r.card_number}`).join(', ');
        throw new Error(`Card(s) already taken: ${takenList}`);
      }

      // 3. Atomically consume bonus balance first, then cash balance
      const now = new Date().toISOString();
      const cardListStr = cardNumbers.map(n => `#${n}`).join(', ');
      const splitResult = this.rewardService.consumeBonusForPurchase(
        userId,
        totalCost,
        'DAILY_GRAND_JACKPOT_CARD',
        roundId
      );

      const wallet = this.getWallet(userId)!;
      const entryId = `tx_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      let splitDesc = `Daily Grand Jackpot: Card(s) ${cardListStr} (${cardNumbers.length} @ 999 ETB)`;
      if (splitResult.bonusPaid > 0) {
        splitDesc += ` [Paid: ${splitResult.bonusPaid.toFixed(2)} Bonus + ${splitResult.cashPaid.toFixed(2)} Cash]`;
      }

      this.db.prepare(`
        INSERT INTO ledger_transactions (
          id, user_id, username, type, amount, balance_before, balance_after,
          game_id, description, created_at
        ) VALUES (?, ?, ?, 'BET', ?, ?, ?, ?, ?, ?)
      `).run(
        entryId,
        userId,
        username,
        totalCost,
        wallet.balance + splitResult.cashPaid,
        wallet.balance,
        roundId,
        splitDesc,
        now
      );

      // 4. Insert each ticket
      const createdTickets: DailyJackpotTicketRow[] = [];
      const insertTicketStmt = this.db.prepare(`
        INSERT INTO daily_jackpot_tickets (
          id, round_id, card_number, user_id, username, price, grid_json, fingerprint_hash, purchased_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const cardNum of cardNumbers) {
        const ticketId = `djtkt_${roundId}_c${cardNum}_${Date.now().toString().slice(-4)}`;
        const grid = (cardGrids && cardGrids.get(cardNum)) || {
          B: [1, 5, 8, 12, 15],
          I: [16, 20, 24, 28, 30],
          N: [31, 35, 0, 40, 45],
          G: [46, 50, 53, 57, 60],
          O: [61, 65, 68, 72, 75]
        };
        const gridJson = JSON.stringify(grid);
        const fingerprintHash = crypto.createHash('sha256')
          .update(`${gridJson}:${userId}:${roundId}:${fingerprintSecret}`)
          .digest('hex');

        insertTicketStmt.run(
          ticketId,
          roundId,
          cardNum,
          userId,
          username,
          CARD_PRICE,
          gridJson,
          fingerprintHash,
          now
        );

        createdTickets.push({
          id: ticketId,
          round_id: roundId,
          card_number: cardNum,
          user_id: userId,
          username,
          price: CARD_PRICE,
          grid_json: gridJson,
          fingerprint_hash: fingerprintHash,
          purchased_at: now
        });
      }

      // 5. Increment cards_sold & gross_sales on round
      this.db.prepare(`
        UPDATE daily_jackpot_rounds
        SET cards_sold = cards_sold + ?,
            gross_sales = gross_sales + ?,
            updated_at = ?
        WHERE id = ?
      `).run(cardNumbers.length, totalCost, now, roundId);

      return {
        success: true,
        tickets: createdTickets,
        newBalance: wallet.balance,
        newBonusBalance: wallet.bonus_balance,
        totalPlayableBalance: Number((wallet.balance + wallet.bonus_balance).toFixed(2))
      };
    });
  }

  /**
   * Record Daily Grand Jackpot winner & payout atomically
   */
  public recordDailyJackpotWinner(params: {
    roundId: string;
    winnerUserId: string;
    winnerUsername: string;
    winnerTicketId: string;
    winnerCardNumber: number;
    jackpotAmount: number;
    platformRetained: number;
  }): void {
    const {
      roundId,
      winnerUserId,
      winnerUsername,
      winnerTicketId,
      winnerCardNumber,
      jackpotAmount,
      platformRetained
    } = params;

    this.transaction(() => {
      const now = new Date().toISOString();

      // Guard: Ensure round is not already completed
      const updateResult = this.db.prepare(`
        UPDATE daily_jackpot_rounds
        SET status = 'COMPLETED',
            jackpot_amount = ?,
            platform_retained_amount = ?,
            winner_user_id = ?,
            winner_username = ?,
            winner_ticket_id = ?,
            winner_card_number = ?,
            payout_status = 'PAID',
            paid_at = ?,
            updated_at = ?
        WHERE id = ? AND status != 'COMPLETED'
      `).run(
        jackpotAmount,
        platformRetained,
        winnerUserId,
        winnerUsername,
        winnerTicketId,
        winnerCardNumber,
        now,
        now,
        roundId
      );

      if (updateResult.changes !== 1) {
        throw new Error(`Round ${roundId} is already completed or not found.`);
      }

      // Credit winner wallet and record double-entry ledger entry atomically
      this.recordLedgerTransaction({
        userId: winnerUserId,
        username: winnerUsername,
        type: 'WIN_PAYOUT',
        amount: jackpotAmount,
        gameId: roundId,
        ticketId: winnerTicketId,
        referenceId: `jackpot_payout_${roundId}_${winnerTicketId}`,
        description: `Daily Grand Jackpot Champion Payout on Card #${winnerCardNumber} (${jackpotAmount.toLocaleString()} ETB)`
      });

      // Record audit log
      this.recordAuditLog({
        adminUserId: 'system',
        action: 'DAILY_JACKPOT_PAYOUT',
        targetUserId: winnerUserId,
        targetRecordId: roundId,
        metadata: {
          jackpotAmount,
          platformRetained,
          card: winnerCardNumber,
          ticketId: winnerTicketId
        }
      });
    });
  }

  /**
   * Reset database (primarily for clean test suite runs)
   */
  public resetDatabase(): void {
    this.db.exec(`
      DELETE FROM promotional_rewards;
      DELETE FROM daily_jackpot_tickets;
      DELETE FROM daily_jackpot_rounds;
      DELETE FROM pending_registrations;
      DELETE FROM audit_logs;
      DELETE FROM bingo_claims;
      DELETE FROM player_tickets;
      DELETE FROM game_rounds;
      DELETE FROM games;
      DELETE FROM withdrawal_requests;
      DELETE FROM deposit_requests;
      DELETE FROM ledger_transactions;
      DELETE FROM wallets;
      DELETE FROM sessions;
      DELETE FROM telegram_accounts;
      DELETE FROM users;
    `);
  }
}

export const databaseService = new DatabaseService();
