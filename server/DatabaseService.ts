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

export type UserRole = 'USER' | 'AGENT' | 'SUPER_ADMIN' | 'ADMIN';

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
  role: UserRole;
  account_status: 'ACTIVE' | 'SUSPENDED' | 'BANNED' | 'DEACTIVATED' | 'DELETION_REQUESTED' | 'DELETED';
  registration_status: 'PENDING' | 'COMPLETED';
  avatar_url?: string;
  is_bot: number;
  account_type?: 'REAL' | 'GUEST' | 'BOT' | 'TEST' | 'ADMIN' | 'AGENT';
  telebirr_number?: string;
  assigned_agent_name?: string;
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
  payment_account_id?: string;
  payment_phone?: string;
  assigned_agent_id?: string;
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
  assigned_agent_id?: string;
  created_at: string;
  processed_at?: string;
  processed_by?: string;
  rejection_reason?: string;
}

export interface PaymentAccountRow {
  id: string;
  provider: string;
  account_name: string;
  phone_number: string;
  assigned_agent_id?: string | null;
  assigned_agent_name?: string | null;
  is_active: number;
  account_status?: 'ACTIVE' | 'INACTIVE' | 'DELETED';
  instructions?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PaymentAccountLogRow {
  id: string;
  account_id: string;
  changed_by: string;
  old_phone?: string | null;
  new_phone?: string | null;
  old_name?: string | null;
  new_name?: string | null;
  action: string;
  reason?: string | null;
  timestamp: string;
}

export interface AgentActivityLogRow {
  id: string;
  actor_id: string;
  actor_name: string;
  role: string;
  action: string;
  target_type?: string | null;
  target_id?: string | null;
  metadata_json?: string | null;
  ip_address?: string | null;
  timestamp: string;
}

export interface WeekendJackpotConfigRow {
  id: string;
  day_of_week: string;
  start_time: string;
  timezone: string;
  card_price: number;
  min_cards: number;
  max_cards: number;
  is_active: number;
  updated_by?: string | null;
  updated_at: string;
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
  checked_at?: string | null;
  postponement_reason?: string | null;
  winner_user_id?: string | null;
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
    const isTestArg = process.argv && process.argv.some(arg => /(?:test|verify|spec)/i.test(arg));
    const isTest = (process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST) || process.env.IS_TEST_SCRIPT === 'true' || isTestArg) && !process.env.TEST_PERSISTENT_DB;
    const defaultDbPath = path.resolve(projectRoot, 'data', 'bingo.db');

    // SECURITY CRITICAL: Prevent test runner or script from silently connecting to production db in test mode!
    if (isTest && customPath && customPath === defaultDbPath && !process.env.TEST_PERSISTENT_DB) {
      throw new Error(`SECURITY CRITICAL: Test execution attempted to connect to persistent production database: ${customPath}`);
    }

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

  public getDb(): any {
    return this.db;
  }

  private initSchema() {
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.db.exec('PRAGMA busy_timeout = 5000;');
    if (!this.isMemory) {
      this.db.exec('PRAGMA journal_mode = WAL;');
      this.db.exec('PRAGMA synchronous = NORMAL;');
    }

    // Pre-migration step: If users table exists from previous schema, migrate columns before executing schemaSql
    this.runMigrations();

    const schemaPath = path.resolve(projectRoot, 'db', 'schema.sql');
    if (fs.existsSync(schemaPath)) {
      const schemaSql = fs.readFileSync(schemaPath, 'utf8');
      this.db.exec(schemaSql);
    }

    // Post-migration step: ensure system identities and indexes exist
    this.runMigrations();
  }

  /**
   * Idempotent migrations for existing production and local databases
   */
  private runMigrations() {
    try {
      const userCols = this.db.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>;
      if (!userCols || userCols.length === 0) {
        // Users table does not exist yet; schema.sql will create it
        return;
      }
      const colNames = new Set(userCols.map((c: any) => c.name));

      if (!colNames.has('password_hash')) {
        console.log('[DatabaseService] Running migration: adding password_hash to users table');
        this.db.exec('ALTER TABLE users ADD COLUMN password_hash TEXT DEFAULT NULL;');
      }

      if (!colNames.has('password_salt')) {
        console.log('[DatabaseService] Running migration: adding password_salt to users table');
        this.db.exec('ALTER TABLE users ADD COLUMN password_salt TEXT DEFAULT NULL;');
      }

      if (!colNames.has('account_type')) {
        console.log('[DatabaseService] Running migration: adding account_type to users table');
        this.db.exec("ALTER TABLE users ADD COLUMN account_type TEXT NOT NULL DEFAULT 'REAL' CHECK(account_type IN ('REAL', 'GUEST', 'BOT', 'TEST', 'ADMIN', 'AGENT'));");
        // Categorize existing users based on immutable provenance
        this.db.exec("UPDATE users SET account_type = 'BOT' WHERE is_bot = 1 OR id LIKE 'usr_000%';");
        this.db.exec("UPDATE users SET account_type = 'ADMIN' WHERE role = 'ADMIN' AND account_type != 'BOT';");
        this.db.exec("UPDATE users SET account_type = 'GUEST' WHERE id LIKE 'usr_%' AND username LIKE 'Player_%' AND phone IS NULL AND telegram_username IS NULL;");
        this.db.exec("UPDATE users SET account_type = 'TEST' WHERE id LIKE 'usr_e2e_%' OR id = 'usr_me' OR id = 'tg_123' OR telegram_id LIKE 'test_%' OR username LIKE '%Tester%';");
        this.db.exec("UPDATE users SET account_type = 'ADMIN' WHERE id LIKE 'admin_%';");
      }

      if (!colNames.has('telebirr_number')) {
        console.log('[DatabaseService] Running migration: adding telebirr_number to users table');
        this.db.exec('ALTER TABLE users ADD COLUMN telebirr_number TEXT DEFAULT NULL;');
      }

      if (!colNames.has('assigned_agent_name')) {
        console.log('[DatabaseService] Running migration: adding assigned_agent_name to users table');
        this.db.exec('ALTER TABLE users ADD COLUMN assigned_agent_name TEXT DEFAULT NULL;');
      }

      // Check if users table needs rebuild to permit AGENT and SUPER_ADMIN in role CHECK constraint and DEACTIVATED/DELETED in account_status
      try {
        const userSqlRow = this.db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'").get() as { sql: string } | undefined;
        if (userSqlRow && userSqlRow.sql && (!userSqlRow.sql.includes('AGENT') || !userSqlRow.sql.includes('DELETED'))) {
          console.log('[DatabaseService] Running migration: rebuilding users table to support AGENT/SUPER_ADMIN roles and DELETED/DEACTIVATED statuses...');
          this.db.exec('PRAGMA foreign_keys = OFF;');
          this.db.exec('BEGIN TRANSACTION;');
          try {
            this.db.exec(`
              CREATE TABLE users_new (
                id TEXT PRIMARY KEY,
                telegram_id TEXT NOT NULL UNIQUE,
                telegram_username TEXT,
                first_name TEXT,
                last_name TEXT,
                username TEXT NOT NULL UNIQUE,
                phone TEXT,
                password_hash TEXT,
                password_salt TEXT,
                referral_code TEXT NOT NULL UNIQUE,
                referred_by TEXT REFERENCES users(id) ON DELETE SET NULL,
                role TEXT NOT NULL DEFAULT 'USER' CHECK(role IN ('USER', 'AGENT', 'SUPER_ADMIN', 'ADMIN')),
                account_status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(account_status IN ('ACTIVE', 'SUSPENDED', 'BANNED', 'DEACTIVATED', 'DELETION_REQUESTED', 'DELETED')),
                registration_status TEXT NOT NULL DEFAULT 'COMPLETED' CHECK(registration_status IN ('PENDING', 'COMPLETED')),
                avatar_url TEXT,
                is_bot INTEGER NOT NULL DEFAULT 0,
                account_type TEXT NOT NULL DEFAULT 'REAL' CHECK(account_type IN ('REAL', 'GUEST', 'BOT', 'TEST', 'ADMIN', 'AGENT')),
                telebirr_number TEXT,
                assigned_agent_name TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                last_login_at TEXT
              );

              INSERT INTO users_new (
                id, telegram_id, telegram_username, first_name, last_name,
                username, phone, password_hash, password_salt, referral_code, referred_by,
                role, account_status, registration_status, avatar_url, is_bot, account_type,
                telebirr_number, assigned_agent_name, created_at, updated_at, last_login_at
              )
              SELECT
                id, telegram_id, telegram_username, first_name, last_name,
                username, phone, password_hash, password_salt, referral_code, referred_by,
                role, account_status, registration_status, avatar_url, is_bot, account_type,
                ${colNames.has('telebirr_number') ? 'telebirr_number' : 'NULL'},
                ${colNames.has('assigned_agent_name') ? 'assigned_agent_name' : 'NULL'},
                created_at, updated_at, last_login_at
              FROM users;

              DROP TABLE users;
              ALTER TABLE users_new RENAME TO users;

              CREATE INDEX IF NOT EXISTS idx_users_account_type ON users(account_type);
              CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id);
              CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
              CREATE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code);
              CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone_unique ON users(phone) WHERE phone IS NOT NULL;
            `);
            this.db.exec('COMMIT;');
            console.log('[DatabaseService] Successfully rebuilt users table with AGENT/SUPER_ADMIN and DELETED/DEACTIVATED statuses.');
          } catch (migrateErr) {
            this.db.exec('ROLLBACK;');
            console.error('[DatabaseService] Failed to rebuild users table:', migrateErr);
            throw migrateErr;
          } finally {
            this.db.exec('PRAGMA foreign_keys = ON;');
          }
        }
      } catch (uMigErr) {
        console.warn('[DatabaseService] User role/status rebuild check warning:', uMigErr);
      }

      // Check payment_accounts columns
      try {
        const paCols = this.db.prepare('PRAGMA table_info(payment_accounts)').all() as Array<{ name: string }>;
        if (paCols && paCols.length > 0) {
          const paColNames = new Set(paCols.map((c: any) => c.name));
          if (!paColNames.has('account_status')) {
            this.db.exec("ALTER TABLE payment_accounts ADD COLUMN account_status TEXT DEFAULT 'ACTIVE';");
          }
        }
      } catch (paErr) {
        console.warn('[DatabaseService] payment_accounts column migration warning:', paErr);
      }

      // Check deposit_requests columns
      try {
        const depCols = this.db.prepare('PRAGMA table_info(deposit_requests)').all() as Array<{ name: string }>;
        const depColNames = new Set(depCols.map((c: any) => c.name));
        if (!depColNames.has('payment_account_id')) {
          this.db.exec('ALTER TABLE deposit_requests ADD COLUMN payment_account_id TEXT DEFAULT NULL;');
        }
        if (!depColNames.has('payment_phone')) {
          this.db.exec('ALTER TABLE deposit_requests ADD COLUMN payment_phone TEXT DEFAULT NULL;');
        }
        if (!depColNames.has('assigned_agent_id')) {
          this.db.exec('ALTER TABLE deposit_requests ADD COLUMN assigned_agent_id TEXT DEFAULT NULL;');
        }
      } catch (depErr) {
        console.warn('[DatabaseService] deposit_requests column migration warning:', depErr);
      }

      // Check withdrawal_requests columns
      try {
        const wthCols = this.db.prepare('PRAGMA table_info(withdrawal_requests)').all() as Array<{ name: string }>;
        const wthColNames = new Set(wthCols.map((c: any) => c.name));
        if (!wthColNames.has('assigned_agent_id')) {
          this.db.exec('ALTER TABLE withdrawal_requests ADD COLUMN assigned_agent_id TEXT DEFAULT NULL;');
        }
      } catch (wthErr) {
        console.warn('[DatabaseService] withdrawal_requests column migration warning:', wthErr);
      }

      // Idempotent migration: Ensure ledger_transactions accepts 'ESCROW_HOLD' in its CHECK constraint
      try {
        const ledgerSqlRow = this.db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='ledger_transactions'").get() as { sql: string } | undefined;
        if (ledgerSqlRow && ledgerSqlRow.sql && !ledgerSqlRow.sql.includes('ESCROW_HOLD')) {
          console.log('[DatabaseService] Running migration: rebuilding ledger_transactions to include ESCROW_HOLD in CHECK constraint...');
          this.db.exec('PRAGMA foreign_keys = OFF;');
          this.db.exec('BEGIN TRANSACTION;');
          try {
            this.db.exec(`
              CREATE TABLE ledger_transactions_new (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                username TEXT NOT NULL,
                type TEXT NOT NULL CHECK(type IN ('DEPOSIT', 'BET', 'WIN_PAYOUT', 'WITHDRAWAL', 'REFUND', 'BONUS', 'LOSS', 'ADMIN_ADJUSTMENT', 'ESCROW_HOLD')),
                amount REAL NOT NULL,
                balance_before REAL NOT NULL,
                balance_after REAL NOT NULL,
                game_id TEXT,
                ticket_id TEXT,
                reference_id TEXT UNIQUE,
                description TEXT NOT NULL,
                created_at TEXT NOT NULL
              );

              INSERT INTO ledger_transactions_new (
                id, user_id, username, type, amount, balance_before, balance_after,
                game_id, ticket_id, reference_id, description, created_at
              )
              SELECT
                id, user_id, username, type, amount, balance_before, balance_after,
                game_id, ticket_id, reference_id, description, created_at
              FROM ledger_transactions;

              DROP TABLE ledger_transactions;

              ALTER TABLE ledger_transactions_new RENAME TO ledger_transactions;

              CREATE INDEX IF NOT EXISTS idx_ledger_user_id ON ledger_transactions(user_id);
              CREATE INDEX IF NOT EXISTS idx_ledger_type ON ledger_transactions(type);
              CREATE INDEX IF NOT EXISTS idx_ledger_reference ON ledger_transactions(reference_id);
            `);
            this.db.exec('COMMIT;');
            console.log('[DatabaseService] Successfully rebuilt ledger_transactions with ESCROW_HOLD.');
          } catch (migrateErr) {
            this.db.exec('ROLLBACK;');
            console.error('[DatabaseService] Failed to rebuild ledger_transactions table:', migrateErr);
            throw migrateErr;
          } finally {
            this.db.exec('PRAGMA foreign_keys = ON;');
          }

          const fkErrors = this.db.prepare('PRAGMA foreign_key_check;').all();
          if (fkErrors && fkErrors.length > 0) {
            console.error('[DatabaseService] Foreign key violations after ledger_transactions rebuild:', fkErrors);
            throw new Error(`Foreign key integrity check failed after migration: ${JSON.stringify(fkErrors)}`);
          }
        }
      } catch (ledgerMigErr) {
        console.error('[DatabaseService] Error in ledger_transactions migration check:', ledgerMigErr);
        throw ledgerMigErr;
      }

      // Ensure dedicated system account exists for background & audit operations without manufacturing fake customers
      const systemUser = this.db.prepare("SELECT id FROM users WHERE id = 'system'").get();
      if (!systemUser) {
        this.db.prepare(`
          INSERT OR IGNORE INTO users (
            id, telegram_id, username, referral_code, role, account_status, registration_status, is_bot, account_type, created_at, updated_at
          ) VALUES ('system', 'system', 'System', 'REF_SYS_000', 'ADMIN', 'ACTIVE', 'COMPLETED', 0, 'ADMIN', datetime('now'), datetime('now'))
        `).run();
        this.getOrCreateWallet('system');
      }

      // Performance and ranking indexes
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_users_account_type ON users(account_type);');
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_claims_status_game ON bingo_claims(status, game_id);');
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_claims_status_user ON bingo_claims(status, user_id);');
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_games_status ON games(status);');

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

        -- 17. User Room Play Reward Progress table
        CREATE TABLE IF NOT EXISTS user_room_reward_progress (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          room_id TEXT NOT NULL,
          cards_purchased INTEGER NOT NULL DEFAULT 0 CHECK(cards_purchased >= 0),
          milestones_claimed INTEGER NOT NULL DEFAULT 0 CHECK(milestones_claimed >= 0),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE(user_id, room_id)
        );
        CREATE INDEX IF NOT EXISTS idx_room_progress_user ON user_room_reward_progress(user_id);

        -- 18. Referral Reward Claims table
        CREATE TABLE IF NOT EXISTS referral_reward_claims (
          id TEXT PRIMARY KEY,
          referrer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          referee_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
          reward_amount REAL NOT NULL DEFAULT 10.0,
          claimed_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_ref_claims_referrer ON referral_reward_claims(referrer_id);

        -- 19. Authoritative Reward Claims History table
        CREATE TABLE IF NOT EXISTS reward_claims (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          reward_type TEXT NOT NULL CHECK(reward_type IN ('FIRST_DEPOSIT', 'ROOM_PLAY', 'REFERRAL')),
          reward_amount REAL NOT NULL CHECK(reward_amount > 0),
          details_json TEXT NOT NULL,
          claimed_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_reward_claims_user ON reward_claims(user_id);
        CREATE INDEX IF NOT EXISTS idx_reward_claims_type ON reward_claims(reward_type);

        -- 20. Payment Accounts table (Dynamic Telebirr deposit numbers controlled by Super Admin)
        CREATE TABLE IF NOT EXISTS payment_accounts (
            id TEXT PRIMARY KEY,
            provider TEXT NOT NULL DEFAULT 'TELEBIRR',
            account_name TEXT NOT NULL,
            phone_number TEXT NOT NULL,
            assigned_agent_id TEXT REFERENCES users(id) ON DELETE SET NULL,
            is_active INTEGER NOT NULL DEFAULT 1,
            instructions TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_payment_accounts_active ON payment_accounts(is_active);

        -- 21. Payment Account Audit Logs
        CREATE TABLE IF NOT EXISTS payment_account_logs (
            id TEXT PRIMARY KEY,
            account_id TEXT NOT NULL REFERENCES payment_accounts(id) ON DELETE CASCADE,
            changed_by TEXT NOT NULL REFERENCES users(id),
            old_phone TEXT,
            new_phone TEXT,
            old_name TEXT,
            new_name TEXT,
            action TEXT NOT NULL,
            reason TEXT,
            timestamp TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_payment_acc_logs_acc ON payment_account_logs(account_id);

        -- 22. Agent Activity Logs (Operational audit trail for financial actions)
        CREATE TABLE IF NOT EXISTS agent_activity_logs (
            id TEXT PRIMARY KEY,
            actor_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            actor_name TEXT NOT NULL,
            role TEXT NOT NULL,
            action TEXT NOT NULL,
            target_type TEXT,
            target_id TEXT,
            metadata_json TEXT,
            ip_address TEXT,
            timestamp TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_agent_activity_actor ON agent_activity_logs(actor_id);
        CREATE INDEX IF NOT EXISTS idx_agent_activity_action ON agent_activity_logs(action);

        -- 23. Weekend Jackpot Configuration table
        CREATE TABLE IF NOT EXISTS weekend_jackpot_config (
            id TEXT PRIMARY KEY,
            day_of_week TEXT NOT NULL DEFAULT 'Sunday',
            start_time TEXT NOT NULL DEFAULT '10:00',
            timezone TEXT NOT NULL DEFAULT 'Africa/Addis_Ababa',
            card_price REAL NOT NULL DEFAULT 999.0,
            min_cards INTEGER NOT NULL DEFAULT 100,
            max_cards INTEGER NOT NULL DEFAULT 200,
            is_active INTEGER NOT NULL DEFAULT 1,
            updated_by TEXT REFERENCES users(id),
            updated_at TEXT NOT NULL
        );
      `);

      // Seed default active payment account if table is empty
      try {
        const accCount = (this.db.prepare('SELECT count(*) as count FROM payment_accounts').get() as any)?.count || 0;
        if (accCount === 0) {
          this.db.prepare(`
            INSERT INTO payment_accounts (
              id, provider, account_name, phone_number, is_active, instructions, created_at, updated_at
            ) VALUES (
              'acc_telebirr_primary', 'TELEBIRR', 'BINGO OFFICIAL MERCHANT', '0912345678', 1,
              'Send your payment via Telebirr (*127# or SuperApp) to 0912345678 (BINGO OFFICIAL MERCHANT). After completing payment, enter your Telebirr transaction reference number below.',
              datetime('now'), datetime('now')
            )
          `).run();
        }
      } catch (seedAccErr) {
        console.warn('[DatabaseService] Payment account seed warning:', seedAccErr);
      }

      // Seed default weekend jackpot configuration if table is empty
      try {
        const cfgCount = (this.db.prepare('SELECT count(*) as count FROM weekend_jackpot_config').get() as any)?.count || 0;
        if (cfgCount === 0) {
          this.db.prepare(`
            INSERT INTO weekend_jackpot_config (
              id, day_of_week, start_time, timezone, card_price, min_cards, max_cards, is_active, updated_at
            ) VALUES (
              'default', 'Sunday', '10:00', 'Africa/Addis_Ababa', 999.0, 100, 200, 1, datetime('now')
            )
          `).run();
        }
      } catch (seedCfgErr) {
        console.warn('[DatabaseService] Jackpot config seed warning:', seedCfgErr);
      }

      // Automatic elevation of configured Super Admin accounts
      try {
        const superAdmins = ['mxt_mdn', 'sammy_erk', 'jagema_kello'];
        const envAdmins = (process.env.SUPER_ADMIN_TELEGRAM_USERNAMES || '')
          .split(',')
          .map(s => s.trim().toLowerCase().replace(/^@/, ''))
          .filter(Boolean);
        const allTargetSuperAdmins = Array.from(new Set([...superAdmins, ...envAdmins]));

        if (allTargetSuperAdmins.length > 0) {
          const placeholders = allTargetSuperAdmins.map(() => '?').join(',');
          const updateStmt = this.db.prepare(`
            UPDATE users
            SET role = 'SUPER_ADMIN'
            WHERE (LOWER(REPLACE(telegram_username, '@', '')) IN (${placeholders})
               OR LOWER(REPLACE(username, '@', '')) IN (${placeholders}))
              AND role != 'SUPER_ADMIN'
          `);
          const res = updateStmt.run(...allTargetSuperAdmins, ...allTargetSuperAdmins);
          if (res.changes > 0) {
            console.log(`[DatabaseService] Elevated ${res.changes} account(s) to SUPER_ADMIN: ${allTargetSuperAdmins.join(', ')}`);
          }
        }
      } catch (adminErr) {
        console.warn('[DatabaseService] Super admin upgrade warning:', adminErr);
      }
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
    telegram_id?: string;
    telegram_username?: string;
    first_name?: string;
    last_name?: string;
    username: string;
    phone?: string;
    password_hash?: string;
    password_salt?: string;
    referral_code?: string;
    referred_by?: string;
    role?: UserRole;
    account_status?: 'ACTIVE' | 'SUSPENDED' | 'BANNED';
    registration_status?: 'PENDING' | 'COMPLETED';
    avatar_url?: string;
    is_bot?: boolean;
    account_type?: 'REAL' | 'GUEST' | 'BOT' | 'TEST' | 'ADMIN' | 'AGENT';
    telebirr_number?: string;
    assigned_agent_name?: string;
    created_at?: string;
  }): UserRow {
    const now = new Date().toISOString();
    const normalizedPhone = user.phone ? (normalizeEthiopianPhone(user.phone) || user.phone) : null;
    const effectiveTgId = user.telegram_id || (normalizedPhone ? `phone_${normalizedPhone}` : `web_${user.id}`);
    const effectiveAccountType = user.account_type || (user.is_bot ? 'BOT' : (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN' ? 'ADMIN' : (user.role === 'AGENT' ? 'AGENT' : 'REAL')));

    const stmt = this.db.prepare(`
      INSERT INTO users (
        id, telegram_id, telegram_username, first_name, last_name,
        username, phone, password_hash, password_salt, referral_code, referred_by, role,
        account_status, registration_status, avatar_url, is_bot, account_type,
        telebirr_number, assigned_agent_name,
        created_at, updated_at, last_login_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      user.referral_code || ('REF_' + user.id.replace(/[^A-Za-z0-9]/g, '').slice(0, 8).toUpperCase()),
      user.referred_by || null,
      user.role || 'USER',
      user.account_status || 'ACTIVE',
      user.registration_status || 'COMPLETED',
      user.avatar_url || null,
      user.is_bot ? 1 : 0,
      effectiveAccountType,
      user.telebirr_number || null,
      user.assigned_agent_name || null,
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
      'is_bot', 'account_type', 'last_login_at', 'telebirr_number', 'assigned_agent_name'
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

  public getAllUsers(filter?: string): UserRow[] {
    let sql = 'SELECT * FROM users';
    switch (filter?.toUpperCase()) {
      case 'REAL':
        sql += " WHERE (account_type = 'REAL' OR account_type IS NULL) AND is_bot = 0 AND role NOT IN ('ADMIN', 'SUPER_ADMIN', 'AGENT')";
        break;
      case 'ADMIN':
      case 'SUPER_ADMIN':
        sql += " WHERE account_type = 'ADMIN' OR role IN ('ADMIN', 'SUPER_ADMIN')";
        break;
      case 'AGENT':
        sql += " WHERE role = 'AGENT' OR account_type = 'AGENT'";
        break;
      case 'BOT':
        sql += " WHERE account_type = 'BOT' OR is_bot = 1";
        break;
      case 'GUEST':
        sql += " WHERE account_type = 'GUEST'";
        break;
      case 'TEST':
        sql += " WHERE account_type = 'TEST'";
        break;
      case 'BANNED':
        sql += " WHERE account_status = 'BANNED'";
        break;
      case 'ALL':
      default:
        // No filter
        break;
    }
    sql += ' ORDER BY created_at DESC';
    return this.db.prepare(sql).all() as UserRow[];
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

      if (typeof data.amount !== 'number' || !Number.isFinite(data.amount) || Number.isNaN(data.amount)) {
        throw new Error('Transaction amount must be a valid finite number');
      }

      const wallet = this.getOrCreateWallet(data.userId);
      const balanceBefore = wallet.balance;
      let balanceAfter = balanceBefore;

      const cleanAmount = Math.round(data.amount * 100) / 100;
      if (['DEPOSIT', 'WIN_PAYOUT', 'REFUND', 'BONUS'].includes(data.type)) {
        if (cleanAmount <= 0) {
          throw new Error(`${data.type} amount must be greater than zero`);
        }
        balanceAfter = Math.round((balanceBefore + cleanAmount) * 100) / 100;
      } else if (data.type === 'ADMIN_ADJUSTMENT') {
        if (cleanAmount === 0) {
          throw new Error('ADMIN_ADJUSTMENT amount cannot be zero');
        }
        balanceAfter = Math.round((balanceBefore + cleanAmount) * 100) / 100;
      } else if (['BET', 'WITHDRAWAL', 'LOSS', 'ESCROW_HOLD'].includes(data.type)) {
        if (cleanAmount <= 0) {
          throw new Error(`${data.type} amount must be greater than zero`);
        }
        if (balanceBefore < cleanAmount) {
          throw new Error(`Insufficient wallet balance: required ${cleanAmount.toFixed(2)}, available ${balanceBefore.toFixed(2)}`);
        }
        balanceAfter = Math.round((balanceBefore - cleanAmount) * 100) / 100;
      }

      if (balanceAfter < 0) {
        throw new Error(`Transaction would cause negative balance (${balanceAfter.toFixed(2)})`);
      }

      const entryId = `tx_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
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
        cleanAmount,
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
        amount: cleanAmount,
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

  public getLedgerEntries(userId: string): LedgerRow[] {
    return this.getLedgerForUser(userId);
  }

  public getAllLedgerTransactions(): LedgerRow[] {
    const stmt = this.db.prepare('SELECT * FROM ledger_transactions ORDER BY created_at DESC');
    return stmt.all() as LedgerRow[];
  }

  // ==================== DEPOSITS ====================

  public createDepositRequest(
    userIdOrData: string | { userId?: string; user_id?: string; username?: string; amount: number; paymentMethod?: string; payment_method?: string; referenceId?: string; reference_id?: string; paymentAccountId?: string; payment_account_id?: string; paymentPhone?: string; payment_phone?: string; payment_account_number?: string },
    usernameArg?: string,
    amountArg?: number,
    paymentMethodArg: string = 'Telebirr',
    referenceIdArg?: string,
    paymentAccountIdArg?: string,
    paymentPhoneArg?: string
  ): DepositRow {
    const isObj = typeof userIdOrData === 'object' && userIdOrData !== null;
    const userId = isObj ? (userIdOrData.userId || userIdOrData.user_id || '') : userIdOrData;
    const username = isObj ? (userIdOrData.username || '') : (usernameArg || '');
    const amount = isObj ? userIdOrData.amount : (amountArg !== undefined ? amountArg : 0);
    const paymentMethod = isObj ? (userIdOrData.paymentMethod || userIdOrData.payment_method || 'Telebirr') : paymentMethodArg;
    const referenceId = isObj ? (userIdOrData.referenceId || userIdOrData.reference_id) : referenceIdArg;
    const paymentAccountId = isObj ? (userIdOrData.paymentAccountId || userIdOrData.payment_account_id) : paymentAccountIdArg;
    const paymentPhone = isObj ? (userIdOrData.paymentPhone || userIdOrData.payment_phone || userIdOrData.payment_account_number) : paymentPhoneArg;

    return this.transaction(() => {
      if (typeof amount !== 'number' || !Number.isFinite(amount) || Number.isNaN(amount)) {
        throw new Error('Deposit amount must be a valid finite number');
      }
      const cleanAmount = Math.round(amount * 100) / 100;
      if (cleanAmount <= 0) {
        throw new Error('Deposit amount must be greater than zero');
      }

      const id = `dep_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
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

      // Automatically anchor current active payment account and phone number so historical records are immutable
      const activeAccount = paymentAccountId
        ? this.getPaymentAccountById(paymentAccountId)
        : this.getActivePaymentAccount();
      const effectiveAccId = activeAccount?.id || paymentAccountId || null;
      const effectivePhone = activeAccount?.phone_number || paymentPhone || null;
      const assignedAgentId = activeAccount?.assigned_agent_id || null;

      try {
        const stmt = this.db.prepare(`
          INSERT INTO deposit_requests (
            id, user_id, username, amount, payment_method, status, reference_id,
            payment_account_id, payment_phone, assigned_agent_id, created_at
          ) VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, ?, ?)
        `);
        stmt.run(id, userId, username, cleanAmount, normalizedPaymentMethod, cleanRef, effectiveAccId, effectivePhone, assignedAgentId, now);
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

      if (adminId && deposit.user_id && String(adminId).trim() === String(deposit.user_id).trim()) {
        throw new Error('Self-approval forbidden: Cannot approve your own deposit request');
      }

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
      if (typeof amount !== 'number' || !Number.isFinite(amount) || Number.isNaN(amount)) {
        throw new Error('Withdrawal amount must be a valid finite number');
      }
      const cleanAmount = Math.round(amount * 100) / 100;
      if (cleanAmount <= 0) {
        throw new Error('Withdrawal amount must be greater than zero');
      }

      const user = this.getUserById(userId);
      if (user) {
        if (user.is_bot || user.account_type === 'BOT') {
          throw new Error('Automated or bot accounts cannot request withdrawals');
        }
        if (user.account_type === 'GUEST') {
          throw new Error('Guest accounts cannot request withdrawals. Please complete account registration.');
        }
        if (user.account_status === 'BANNED' || user.account_status === 'SUSPENDED' || user.account_status === 'DELETED') {
          throw new Error(`Account is ${user.account_status.toLowerCase()}. Withdrawals are prohibited.`);
        }
        if (user.registration_status === 'PENDING') {
          throw new Error('Please complete phone verification before requesting a withdrawal');
        }
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

      const id = `wth_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      const stmt = this.db.prepare(`
        INSERT INTO withdrawal_requests (
          id, user_id, username, amount, address, status, created_at
        ) VALUES (?, ?, ?, ?, ?, 'PENDING', ?)
      `);
      stmt.run(id, userId, username, cleanAmount, address, now);

      const wallet = this.getWallet(userId)!;
      const entryId = `tx_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
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

      if (adminId && withdrawal.user_id && String(adminId).trim() === String(withdrawal.user_id).trim()) {
        throw new Error('Self-approval forbidden: Cannot approve your own withdrawal request');
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
      const entryId = `tx_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
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
      const entryId = `tx_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
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

  public updateGameStatus(id: string, status: string): void {
    this.updateGame(id, { status: status as any });
  }

  public recordDrawnBall(gameId: string, ballIndex: number, ballNumber: number, ballLetter: string): void {
    const id = `rnd_${gameId}_${ballIndex}`;
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT OR IGNORE INTO game_rounds (id, game_id, ball_index, ball_number, ball_letter, drawn_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, gameId, ballIndex, ballNumber, ballLetter, now);
  }

  public getDrawnBallsForGame(gameId: string): Array<{ ball_index: number; ball_number: number; ball_letter: string; drawn_at: string }> {
    return this.db.prepare(
      'SELECT ball_index, ball_number, ball_letter, drawn_at FROM game_rounds WHERE game_id = ? ORDER BY ball_index ASC'
    ).all(gameId) as Array<{ ball_index: number; ball_number: number; ball_letter: string; drawn_at: string }>;
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

  public deletePlayerTicket(gameId: string, cardNumber: number): boolean {
    const stmt = this.db.prepare('DELETE FROM player_tickets WHERE game_id = ? AND card_number = ?');
    const result = stmt.run(gameId, cardNumber);
    return result.changes > 0;
  }

  public deletePlayerTicketById(ticketId: string): boolean {
    const stmt = this.db.prepare('DELETE FROM player_tickets WHERE id = ?');
    const result = stmt.run(ticketId);
    return result.changes > 0;
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

  public createBingoClaim(claim: {
    gameId: string;
    ticketId: string;
    userId: string;
    payoutAmount: number;
    patternType: string;
  }): ClaimRow {
    return this.recordBingoClaim(claim);
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
    const id = `aud_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const now = new Date().toISOString();

    // SECURITY & DATA INTEGRITY:
    // Never silently manufacture fake customer/admin accounts for audit logging.
    // If the provided admin actor does not exist, map to the dedicated 'system' identity
    // and record the unresolved original actor in audit metadata.
    let effectiveAdminId = log.adminUserId;
    const metadataObj: Record<string, any> = log.metadata ? { ...log.metadata } : {};

    if (!this.getUserById(effectiveAdminId)) {
      if (!this.getUserById('system')) {
        this.db.prepare(`
          INSERT OR IGNORE INTO users (
            id, telegram_id, username, referral_code, role, account_status, registration_status, is_bot, account_type, created_at, updated_at
          ) VALUES ('system', 'system', 'System', 'REF_SYS_000', 'ADMIN', 'ACTIVE', 'COMPLETED', 0, 'ADMIN', datetime('now'), datetime('now'))
        `).run();
      }
      metadataObj.originalActorId = log.adminUserId;
      effectiveAdminId = 'system';
    }

    const metaJson = Object.keys(metadataObj).length > 0 ? JSON.stringify(metadataObj) : null;

    const stmt = this.db.prepare(`
      INSERT INTO audit_logs (
        id, admin_user_id, action, target_user_id, target_record_id, metadata_json, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(id, effectiveAdminId, log.action, log.targetUserId || null, log.targetRecordId || null, metaJson, now);

    return {
      id,
      admin_user_id: effectiveAdminId,
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

  // ==================== PAYMENT ACCOUNTS & TELEBIRR DEPOSIT NUMBERS ====================

  public getActivePaymentAccount(): PaymentAccountRow | null {
    const stmt = this.db.prepare("SELECT * FROM payment_accounts WHERE is_active = 1 AND (account_status IS NULL OR account_status != 'DELETED') ORDER BY updated_at DESC LIMIT 1");
    const row = stmt.get() as PaymentAccountRow | undefined;
    return row || null;
  }

  public getAllPaymentAccounts(): PaymentAccountRow[] {
    const stmt = this.db.prepare(`
      SELECT pa.*, u.username as assigned_agent_name
      FROM payment_accounts pa
      LEFT JOIN users u ON pa.assigned_agent_id = u.id
      ORDER BY pa.is_active DESC, pa.updated_at DESC
    `);
    return stmt.all() as PaymentAccountRow[];
  }

  public getPaymentAccountById(id: string): PaymentAccountRow | null {
    const stmt = this.db.prepare(`
      SELECT pa.*, u.username as assigned_agent_name
      FROM payment_accounts pa
      LEFT JOIN users u ON pa.assigned_agent_id = u.id
      WHERE pa.id = ?
    `);
    const row = stmt.get(id) as PaymentAccountRow | undefined;
    return row || null;
  }

  public createPaymentAccount(data: {
    id?: string;
    provider?: string;
    account_name: string;
    phone_number: string;
    assigned_agent_id?: string | null;
    is_active?: number;
    instructions?: string;
  }): PaymentAccountRow {
    const id = data.id || `acc_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const now = new Date().toISOString();
    const provider = data.provider || 'TELEBIRR';
    const isActive = data.is_active !== undefined ? data.is_active : 0;

    const phoneNumber = data.phone_number || (data as any).account_number || '';

    return this.transaction(() => {
      // If setting this account as active, deactivate other accounts
      if (isActive === 1) {
        this.db.prepare('UPDATE payment_accounts SET is_active = 0, updated_at = ?').run(now);
      }

      const stmt = this.db.prepare(`
        INSERT INTO payment_accounts (
          id, provider, account_name, phone_number, assigned_agent_id, is_active, account_status, instructions, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?)
      `);
      stmt.run(
        id, provider, data.account_name, phoneNumber,
        data.assigned_agent_id || null, isActive,
        data.instructions || null, now, now
      );

      return this.getPaymentAccountById(id)!;
    });
  }

  public updatePaymentAccount(id: string, updates: Partial<PaymentAccountRow>, changedBy?: string, reason?: string): PaymentAccountRow {
    return this.transaction(() => {
      const existing = this.getPaymentAccountById(id);
      if (!existing) throw new Error('Payment account not found');

      const now = new Date().toISOString();
      const fields: string[] = [];
      const values: any[] = [];

      const allowed = ['account_name', 'phone_number', 'assigned_agent_id', 'is_active', 'account_status', 'instructions'];
      for (const [key, val] of Object.entries(updates)) {
        if (allowed.includes(key)) {
          fields.push(`${key} = ?`);
          values.push(val);
        }
      }

      if (updates.is_active === 1) {
        this.db.prepare('UPDATE payment_accounts SET is_active = 0, updated_at = ? WHERE id != ?').run(now, id);
      }

      fields.push('updated_at = ?');
      values.push(now);
      values.push(id);

      this.db.prepare(`UPDATE payment_accounts SET ${fields.join(', ')} WHERE id = ?`).run(...values);

      // Audit log the update if changedBy is supplied or if phone/name changed
      if (changedBy && (updates.phone_number !== undefined || updates.account_name !== undefined || updates.is_active !== undefined)) {
        this.logPaymentAccountChange({
          account_id: id,
          changed_by: changedBy,
          old_phone: existing.phone_number,
          new_phone: updates.phone_number || existing.phone_number,
          old_name: existing.account_name,
          new_name: updates.account_name || existing.account_name,
          action: updates.is_active === 1 ? 'ACTIVATE_ACCOUNT' : 'UPDATE_ACCOUNT',
          reason: reason || 'Payment account configuration updated by admin'
        });
      }

      return this.getPaymentAccountById(id)!;
    });
  }

  public setActivePaymentAccount(id: string, changedBy: string, reason?: string): PaymentAccountRow {
    return this.transaction(() => {
      const target = this.getPaymentAccountById(id);
      if (!target) throw new Error('Payment account not found');

      const oldActive = this.getActivePaymentAccount();
      const now = new Date().toISOString();

      this.db.prepare('UPDATE payment_accounts SET is_active = 0, updated_at = ?').run(now);
      this.db.prepare('UPDATE payment_accounts SET is_active = 1, updated_at = ? WHERE id = ?').run(now, id);

      this.logPaymentAccountChange({
        account_id: id,
        changed_by: changedBy,
        old_phone: oldActive?.phone_number || null,
        new_phone: target.phone_number,
        old_name: oldActive?.account_name || null,
        new_name: target.account_name,
        action: 'SWITCH_ACTIVE_PAYMENT_NUMBER',
        reason: reason || 'Super Admin activated new Telebirr deposit number'
      });

      this.recordAuditLog({
        adminUserId: changedBy,
        action: 'SWITCH_ACTIVE_PAYMENT_NUMBER',
        targetRecordId: id,
        metadata: {
          oldNumber: oldActive?.phone_number,
          newNumber: target.phone_number,
          accountName: target.account_name,
          reason
        }
      });

      return this.getPaymentAccountById(id)!;
    });
  }

  public deletePaymentAccount(id: string, actorId: string, reason?: string): { deleted: boolean; archived: boolean; message: string } {
    return this.transaction(() => {
      const account = this.getPaymentAccountById(id);
      if (!account) throw new Error('Payment account not found');

      const historicalDeposits = this.db.prepare(
        'SELECT COUNT(*) as c FROM deposit_requests WHERE payment_account_id = ? OR payment_phone = ?'
      ).get(account.id, account.phone_number) as { c: number } | undefined;

      const count = historicalDeposits?.c || 0;

      if (count > 0) {
        // Financial records exist: safe deactivation & archive
        this.db.prepare(`
          UPDATE payment_accounts
          SET is_active = 0, account_status = 'DELETED', updated_at = ?
          WHERE id = ?
        `).run(new Date().toISOString(), id);

        this.logPaymentAccountChange({
          account_id: id,
          changed_by: actorId,
          old_phone: account.phone_number,
          new_phone: account.phone_number,
          old_name: account.account_name,
          new_name: account.account_name,
          action: 'PAYMENT_ACCOUNT_ARCHIVED',
          reason: reason || `Safely archived payment number due to ${count} historical deposit transactions.`
        });

        this.recordAuditLog({
          adminUserId: actorId,
          action: 'PAYMENT_ACCOUNT_ARCHIVED',
          targetRecordId: id,
          metadata: { id, phoneNumber: account.phone_number, count, reason }
        });

        return {
          action: 'ARCHIVED',
          deleted: false,
          archived: true,
          historicalDepositsCount: count,
          message: `Payment number ${account.phone_number} has ${count} historical deposit transactions. It has been deactivated and archived to preserve financial and audit records.`
        };
      } else {
        // Safe to physically delete
        this.db.prepare('DELETE FROM payment_account_logs WHERE account_id = ?').run(id);
        this.db.prepare('DELETE FROM payment_accounts WHERE id = ?').run(id);

        this.recordAuditLog({
          adminUserId: actorId,
          action: 'PAYMENT_ACCOUNT_DELETED',
          targetRecordId: id,
          metadata: { id, phoneNumber: account.phone_number, reason }
        });

        return {
          action: 'HARD_DELETED',
          deleted: true,
          archived: false,
          historicalDepositsCount: 0,
          message: `Payment number ${account.phone_number} had no historical dependencies and was permanently deleted.`
        };
      }
    });
  }

  public deactivatePaymentAccount(id: string, actorId: string, reason?: string): PaymentAccountRow {
    return this.transaction(() => {
      const account = this.getPaymentAccountById(id);
      if (!account) throw new Error('Payment account not found');

      const now = new Date().toISOString();
      this.db.prepare('UPDATE payment_accounts SET is_active = 0, updated_at = ? WHERE id = ?').run(now, id);

      this.logPaymentAccountChange({
        account_id: id,
        changed_by: actorId,
        old_phone: account.phone_number,
        new_phone: account.phone_number,
        old_name: account.account_name,
        new_name: account.account_name,
        action: 'DEACTIVATE_ACCOUNT',
        reason: reason || 'Payment account deactivated by admin'
      });

      return this.getPaymentAccountById(id)!;
    });
  }

  public logPaymentAccountChange(data: {
    account_id: string;
    changed_by: string;
    old_phone?: string | null;
    new_phone?: string | null;
    old_name?: string | null;
    new_name?: string | null;
    action: string;
    reason?: string | null;
  }): PaymentAccountLogRow {
    const id = `pal_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO payment_account_logs (
        id, account_id, changed_by, old_phone, new_phone, old_name, new_name, action, reason, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, data.account_id, data.changed_by,
      data.old_phone || null, data.new_phone || null,
      data.old_name || null, data.new_name || null,
      data.action, data.reason || null, now
    );
    return {
      id,
      account_id: data.account_id,
      changed_by: data.changed_by,
      old_phone: data.old_phone,
      new_phone: data.new_phone,
      old_name: data.old_name,
      new_name: data.new_name,
      action: data.action,
      reason: data.reason,
      timestamp: now
    };
  }

  public getPaymentAccountLogs(limit: number = 100): Array<PaymentAccountLogRow & { changed_by_name?: string; new_number?: string | null; old_number?: string | null; note?: string | null }> {
    const stmt = this.db.prepare(`
      SELECT pal.*, u.username as changed_by_name
      FROM payment_account_logs pal
      LEFT JOIN users u ON pal.changed_by = u.id
      ORDER BY pal.timestamp DESC
      LIMIT ?
    `);
    const rows = stmt.all(limit) as Array<PaymentAccountLogRow & { changed_by_name?: string }>;
    return rows.map((r: any) => ({
      ...r,
      new_number: r.new_phone,
      old_number: r.old_phone,
      note: r.reason
    }));
  }

  // ==================== AGENT MANAGEMENT & ACTIVITY LOGGING ====================

  public assignDepositToAgent(depositId: string, agentId: string): DepositRow {
    const deposit = this.getDepositRequest(depositId);
    if (!deposit) throw new Error('Deposit request not found');
    const agent = this.getUserById(agentId);
    if (!agent) throw new Error('Agent not found');
    if (agent.role !== 'AGENT' && agent.role !== 'ADMIN' && agent.role !== 'SUPER_ADMIN') {
      throw new Error('Target user is not an agent or staff member');
    }
    if (deposit.user_id && String(deposit.user_id).trim() === String(agentId).trim()) {
      throw new Error('Self-assignment forbidden: Cannot assign your own deposit request to yourself');
    }

    this.db.prepare('UPDATE deposit_requests SET assigned_agent_id = ? WHERE id = ?').run(agentId, depositId);
    return this.getDepositRequest(depositId)!;
  }

  public assignWithdrawalToAgent(withdrawalId: string, agentId: string): WithdrawalRow {
    const withdrawal = this.getWithdrawalRequest(withdrawalId);
    if (!withdrawal) throw new Error('Withdrawal request not found');
    const agent = this.getUserById(agentId);
    if (!agent) throw new Error('Agent not found');
    if (agent.role !== 'AGENT' && agent.role !== 'ADMIN' && agent.role !== 'SUPER_ADMIN') {
      throw new Error('Target user is not an agent or staff member');
    }
    if (withdrawal.user_id && String(withdrawal.user_id).trim() === String(agentId).trim()) {
      throw new Error('Self-assignment forbidden: Cannot assign your own withdrawal request to yourself');
    }

    this.db.prepare('UPDATE withdrawal_requests SET assigned_agent_id = ? WHERE id = ?').run(agentId, withdrawalId);
    return this.getWithdrawalRequest(withdrawalId)!;
  }

  public logAgentActivity(data: {
    actor_id: string;
    actor_name?: string;
    role?: string;
    actor_role?: string;
    action: string;
    target_type?: string | null;
    target_id?: string | null;
    target_user_id?: string | null;
    metadata?: any;
    ip_address?: string | null;
  }): AgentActivityLogRow {
    const id = `act_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const now = new Date().toISOString();
    const metaJson = data.metadata ? JSON.stringify(data.metadata) : null;
    const finalRole = data.role || data.actor_role || 'AGENT';
    const finalActorName = data.actor_name || (data.actor_id ? this.getUserById(data.actor_id)?.username : '') || data.actor_id || 'System';
    const finalTargetId = data.target_id || data.target_user_id || null;

    this.db.prepare(`
      INSERT INTO agent_activity_logs (
        id, actor_id, actor_name, role, action, target_type, target_id, metadata_json, ip_address, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, data.actor_id, finalActorName, finalRole, data.action,
      data.target_type || null, finalTargetId, metaJson, data.ip_address || null, now
    );

    return {
      id,
      actor_id: data.actor_id,
      actor_name: finalActorName,
      role: finalRole,
      action: data.action,
      target_type: data.target_type,
      target_id: finalTargetId,
      metadata_json: metaJson,
      ip_address: data.ip_address,
      timestamp: now
    };
  }

  public getAgentActivityLogs(filters?: { actor_id?: string; action?: string; limit?: number }): AgentActivityLogRow[] {
    let sql = 'SELECT * FROM agent_activity_logs';
    const params: any[] = [];
    const conditions: string[] = [];

    if (filters?.actor_id) {
      conditions.push('actor_id = ?');
      params.push(filters.actor_id);
    }
    if (filters?.action) {
      conditions.push('action = ?');
      params.push(filters.action);
    }
    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }
    sql += ' ORDER BY timestamp DESC LIMIT ?';
    params.push(filters?.limit || 100);

    return this.db.prepare(sql).all(...params) as AgentActivityLogRow[];
  }

  public getAllAgents(): any[] {
    return this.getAgentPerformance();
  }

  public getAgentPerformance(agentId?: string): any[] {
    let sql = `
      SELECT
        u.id as agent_id,
        COALESCE(u.assigned_agent_name, u.first_name, u.username) as agent_name,
        u.username,
        u.phone,
        u.telebirr_number,
        u.account_status,
        u.account_status as status,
        u.created_at,
        u.last_login_at,
        (SELECT COUNT(*) FROM deposit_requests WHERE processed_by = u.id AND status = 'APPROVED') as deposits_approved,
        (SELECT COALESCE(SUM(amount), 0) FROM deposit_requests WHERE processed_by = u.id AND status = 'APPROVED') as deposit_amount,
        (SELECT COUNT(*) FROM deposit_requests WHERE processed_by = u.id AND status = 'REJECTED') as deposits_rejected,
        (SELECT COUNT(*) FROM withdrawal_requests WHERE processed_by = u.id AND status = 'APPROVED') as withdrawals_approved,
        (SELECT COALESCE(SUM(amount), 0) FROM withdrawal_requests WHERE processed_by = u.id AND status = 'APPROVED') as withdrawal_amount,
        (SELECT COUNT(*) FROM withdrawal_requests WHERE processed_by = u.id AND status = 'REJECTED') as withdrawals_rejected,
        (SELECT COUNT(*) FROM deposit_requests WHERE assigned_agent_id = u.id AND status = 'PENDING') +
        (SELECT COUNT(*) FROM withdrawal_requests WHERE assigned_agent_id = u.id AND status = 'PENDING') as pending_workload,
        (SELECT MAX(timestamp) FROM agent_activity_logs WHERE actor_id = u.id) as last_activity,
        (SELECT MAX(timestamp) FROM agent_activity_logs WHERE actor_id = u.id) as last_activity_at
      FROM users u
      WHERE u.role = 'AGENT'
    `;
    const params: any[] = [];
    if (agentId) {
      sql += ' AND u.id = ?';
      params.push(agentId);
    }
    sql += ' ORDER BY deposits_approved DESC';
    const rows = this.db.prepare(sql).all(...params) as any[];
    return rows.map(r => ({
      ...r,
      deposit_amount: Number(r.deposit_amount) || 0,
      withdrawal_amount: Number(r.withdrawal_amount) || 0,
      deposits_approved: Number(r.deposits_approved) || 0,
      deposits_rejected: Number(r.deposits_rejected) || 0,
      withdrawals_approved: Number(r.withdrawals_approved) || 0,
      withdrawals_rejected: Number(r.withdrawals_rejected) || 0,
      pending_workload: Number(r.pending_workload) || 0,
      deposits_processed: (Number(r.deposits_approved) || 0) + (Number(r.deposits_rejected) || 0),
      withdrawals_processed: (Number(r.withdrawals_approved) || 0) + (Number(r.withdrawals_rejected) || 0),
      last_activity_at: r.last_activity_at || r.last_activity || null
    }));
  }

  // ==================== WEEKEND JACKPOT (SUNDAY 10:00 ADDIS ABABA) ====================

  public getWeekendJackpotConfig(): WeekendJackpotConfigRow {
    const stmt = this.db.prepare('SELECT * FROM weekend_jackpot_config WHERE id = ?');
    let row = stmt.get('default') as WeekendJackpotConfigRow | undefined;
    if (!row) {
      const now = new Date().toISOString();
      this.db.prepare(`
        INSERT INTO weekend_jackpot_config (
          id, day_of_week, start_time, timezone, card_price, min_cards, max_cards, is_active, updated_at
        ) VALUES ('default', 'Sunday', '10:00', 'Africa/Addis_Ababa', 999.0, 100, 200, 1, ?)
      `).run(now);
      row = stmt.get('default') as WeekendJackpotConfigRow;
    }
    return row;
  }

  public updateWeekendJackpotConfig(updates: Partial<WeekendJackpotConfigRow>, updatedBy?: string): WeekendJackpotConfigRow {
    const now = new Date().toISOString();
    const fields: string[] = [];
    const values: any[] = [];

    const allowed = ['day_of_week', 'start_time', 'timezone', 'card_price', 'min_cards', 'max_cards', 'is_active'];
    for (const [key, val] of Object.entries(updates)) {
      if (allowed.includes(key)) {
        fields.push(`${key} = ?`);
        values.push(val);
      }
    }

    if (updatedBy) {
      fields.push('updated_by = ?');
      values.push(updatedBy);
    }
    fields.push('updated_at = ?');
    values.push(now);
    values.push('default');

    this.db.prepare(`UPDATE weekend_jackpot_config SET ${fields.join(', ')} WHERE id = ?`).run(...values);

    if (updatedBy) {
      this.recordAuditLog({
        adminUserId: updatedBy,
        action: 'UPDATE_WEEKEND_JACKPOT_CONFIG',
        metadata: updates
      });
    }

    return this.getWeekendJackpotConfig();
  }

  /**
   * Authoritative query of real players who purchased tickets for a given Weekend Jackpot round.
   * Absolutely NO fake players, demo users, or fabricated statistics.
   */
  public getWeekendJackpotPlayers(roundId: string): Array<{
    user_id: string;
    username: string;
    phone?: string;
    cards_purchased: number;
    card_numbers: number[];
    amount_spent: number;
    purchase_timestamp: string;
    payment_source: string;
    round_id: string;
    is_winner: boolean;
  }> {
    const round = this.getDailyJackpotRound(roundId);
    const tickets = this.db.prepare(`
      SELECT
        t.user_id,
        t.username,
        u.phone,
        t.card_number,
        t.price,
        t.purchased_at
      FROM daily_jackpot_tickets t
      LEFT JOIN users u ON t.user_id = u.id
      WHERE t.round_id = ?
      ORDER BY t.purchased_at ASC
    `).all(roundId) as Array<{
      user_id: string;
      username: string;
      phone?: string;
      card_number: number;
      price: number;
      purchased_at: string;
    }>;

    // Group tickets by user
    const map = new Map<string, {
      user_id: string;
      username: string;
      phone?: string;
      cards_purchased: number;
      card_numbers: number[];
      amount_spent: number;
      purchase_timestamp: string;
      payment_source: string;
      round_id: string;
      is_winner: boolean;
    }>();

    for (const ticket of tickets) {
      const existing = map.get(ticket.user_id);
      const isWinner = Boolean(round?.winner_user_id && round.winner_user_id === ticket.user_id);
      if (existing) {
        existing.cards_purchased += 1;
        existing.card_numbers.push(ticket.card_number);
        existing.amount_spent += ticket.price;
        if (!existing.phone && ticket.phone) existing.phone = ticket.phone;
      } else {
        map.set(ticket.user_id, {
          user_id: ticket.user_id,
          username: ticket.username,
          phone: ticket.phone,
          cards_purchased: 1,
          card_numbers: [ticket.card_number],
          amount_spent: ticket.price,
          purchase_timestamp: ticket.purchased_at,
          payment_source: 'ETB Wallet',
          round_id: roundId,
          is_winner: isWinner
        });
      }
    }

    return Array.from(map.values()).map(p => ({
      ...p,
      cards_count: p.cards_purchased,
      total_spent: p.amount_spent
    }));
  }

  public getWeekendJackpotHistory(limit: number = 50): any[] {
    const rounds = this.db.prepare(`
      SELECT
        r.*,
        (SELECT COUNT(DISTINCT user_id) FROM daily_jackpot_tickets WHERE round_id = r.id) as unique_players
      FROM daily_jackpot_rounds r
      ORDER BY r.created_at DESC
      LIMIT ?
    `).all(limit) as any[];

    return rounds.map(r => ({
      roundId: r.id,
      date: r.date_str,
      startTime: r.cutoff_at,
      status: r.status,
      cardsSold: r.cards_sold,
      uniquePlayers: r.unique_players || 0,
      prizePool: r.jackpot_amount,
      winnerUsername: r.winner_username || null,
      winnerCardNumber: r.winner_card_number || null,
      winnerUserId: r.winner_user_id || null,
      payoutStatus: r.payout_status,
      completedAt: r.paid_at || r.updated_at
    }));
  }

  // ==================== FINANCIAL RECONCILIATION & OVERVIEW ====================

  public getReconciliationReport(filters: {
    startDate?: string;
    endDate?: string;
    agentId?: string;
    paymentPhone?: string;
    status?: string;
    type?: string;
    minAmount?: number;
    maxAmount?: number;
  }): any {
    // 1. Fetch deposits matching filters
    let depSql = `
      SELECT d.*, u.phone as customer_phone, ag.username as assigned_agent_username
      FROM deposit_requests d
      LEFT JOIN users u ON d.user_id = u.id
      LEFT JOIN users ag ON d.assigned_agent_id = ag.id
      WHERE 1=1
    `;
    const depParams: any[] = [];
    if (filters.status && filters.status !== 'ALL') {
      depSql += ' AND d.status = ?';
      depParams.push(filters.status);
    }
    if (filters.agentId && filters.agentId !== 'ALL') {
      depSql += ' AND (d.assigned_agent_id = ? OR d.processed_by = ?)';
      depParams.push(filters.agentId, filters.agentId);
    }
    if (filters.paymentPhone) {
      depSql += ' AND d.payment_phone = ?';
      depParams.push(filters.paymentPhone);
    }
    if (filters.minAmount !== undefined) {
      depSql += ' AND d.amount >= ?';
      depParams.push(filters.minAmount);
    }
    if (filters.maxAmount !== undefined) {
      depSql += ' AND d.amount <= ?';
      depParams.push(filters.maxAmount);
    }
    if (filters.startDate) {
      depSql += ' AND d.created_at >= ?';
      depParams.push(filters.startDate);
    }
    if (filters.endDate) {
      depSql += ' AND d.created_at <= ?';
      depParams.push(filters.endDate);
    }
    depSql += ' ORDER BY d.created_at DESC';
    const deposits = this.db.prepare(depSql).all(...depParams) as any[];

    // 2. Fetch withdrawals matching filters
    let wthSql = `
      SELECT w.*, u.phone as customer_phone, ag.username as assigned_agent_username
      FROM withdrawal_requests w
      LEFT JOIN users u ON w.user_id = u.id
      LEFT JOIN users ag ON w.assigned_agent_id = ag.id
      WHERE 1=1
    `;
    const wthParams: any[] = [];
    if (filters.status && filters.status !== 'ALL') {
      wthSql += ' AND w.status = ?';
      wthParams.push(filters.status);
    }
    if (filters.agentId && filters.agentId !== 'ALL') {
      wthSql += ' AND (w.assigned_agent_id = ? OR w.processed_by = ?)';
      wthParams.push(filters.agentId, filters.agentId);
    }
    if (filters.minAmount !== undefined) {
      wthSql += ' AND w.amount >= ?';
      wthParams.push(filters.minAmount);
    }
    if (filters.maxAmount !== undefined) {
      wthSql += ' AND w.amount <= ?';
      wthParams.push(filters.maxAmount);
    }
    if (filters.startDate) {
      wthSql += ' AND w.created_at >= ?';
      wthParams.push(filters.startDate);
    }
    if (filters.endDate) {
      wthSql += ' AND w.created_at <= ?';
      wthParams.push(filters.endDate);
    }
    wthSql += ' ORDER BY w.created_at DESC';
    const withdrawals = this.db.prepare(wthSql).all(...wthParams) as any[];

    // 3. Detect potential duplicates: same user and same amount within 10 minutes, or matching references
    const potentialDuplicates: any[] = [];
    for (let i = 0; i < deposits.length; i++) {
      for (let j = i + 1; j < deposits.length; j++) {
        const d1 = deposits[i];
        const d2 = deposits[j];
        if (d1.user_id === d2.user_id && d1.amount === d2.amount) {
          const t1 = new Date(d1.created_at).getTime();
          const t2 = new Date(d2.created_at).getTime();
          if (Math.abs(t1 - t2) <= 10 * 60 * 1000) {
            potentialDuplicates.push({
              type: 'DEPOSIT_DUPLICATE_SUSPICION',
              records: [d1, d2],
              reason: `User ${d1.username} submitted multiple ${d1.amount} ETB deposits within 10 minutes`
            });
          }
        }
      }
    }

    // Unmatched/problem: deposits where status is APPROVED but no corresponding DEPOSIT entry in ledger_transactions
    let unmatchedCount = 0;
    for (const d of deposits) {
      if (d.status === 'APPROVED') {
        const hasTx = this.db.prepare("SELECT id FROM ledger_transactions WHERE user_id = ? AND type = 'DEPOSIT' AND (reference_id = ? OR reference_id = ?)").get(d.user_id, d.reference_id, `dep_appr_${d.id}`);
        if (!hasTx) unmatchedCount++;
      }
    }

    let approvedDepositsCount = 0;
    let rejectedDepositsCount = 0;
    let pendingDepositsCount = 0;
    let totalDeposited = 0;
    for (const d of deposits) {
      if (d.status === 'APPROVED') {
        approvedDepositsCount++;
        totalDeposited += d.amount;
      } else if (d.status === 'REJECTED') {
        rejectedDepositsCount++;
      } else if (d.status === 'PENDING') {
        pendingDepositsCount++;
      }
    }

    let approvedWithdrawalsCount = 0;
    let rejectedWithdrawalsCount = 0;
    let pendingWithdrawalsCount = 0;
    let totalWithdrawn = 0;
    for (const w of withdrawals) {
      if (w.status === 'APPROVED' || w.status === 'COMPLETED') {
        approvedWithdrawalsCount++;
        totalWithdrawn += w.amount;
      } else if (w.status === 'REJECTED') {
        rejectedWithdrawalsCount++;
      } else if (w.status === 'PENDING' || w.status === 'PROCESSING') {
        pendingWithdrawalsCount++;
      }
    }

    return {
      summary: {
        totalCount: deposits.length + withdrawals.length,
        total_transactions: deposits.length + withdrawals.length,
        totalDeposited,
        totalWithdrawn,
        total_amount: totalDeposited + totalWithdrawn,
        approvedDepositsCount,
        rejectedDepositsCount,
        pendingDepositsCount,
        approvedWithdrawalsCount,
        rejectedWithdrawalsCount,
        pendingWithdrawalsCount,
        approved_count: approvedDepositsCount + approvedWithdrawalsCount,
        approved_amount: totalDeposited + totalWithdrawn,
        rejected_count: rejectedDepositsCount + rejectedWithdrawalsCount,
        pending_count: pendingDepositsCount + pendingWithdrawalsCount,
        potentialDuplicatesCount: potentialDuplicates.length,
        discrepancy_count: potentialDuplicates.length + unmatchedCount,
        unmatchedCount
      },
      deposits,
      withdrawals,
      transactions: [
        ...deposits.map(d => ({ ...d, type: 'DEPOSIT' })),
        ...withdrawals.map(w => ({ ...w, type: 'WITHDRAWAL' }))
      ],
      potentialDuplicates
    };
  }

  public getSuperAdminOverviewStats(): {
    financial: {
      pendingDeposits: number;
      todayApprovedDeposits: number;
      todayRejectedDeposits: number;
      pendingWithdrawals: number;
      todayCompletedWithdrawals: number;
      totalDepositedToday: number;
      totalWithdrawnToday: number;
    };
    users: {
      totalRegistered: number;
      newToday: number;
      activeUsers: number;
      jackpotParticipants: number;
      jackpotCardBuyers: number;
    };
    agents: {
      activeAgents: number;
      suspendedAgents: number;
      agentsProcessing: number;
      agentTransactionActivity: number;
    };
    jackpot: {
      status: string;
      cardsSold: number;
      participatingPlayers: number;
      prizePool: number;
      startTime: string;
      isEligible: boolean;
    };
  } {
    const today = new Date().toISOString().slice(0, 10);

    // Financial
    const pendingDeposits = (this.db.prepare("SELECT count(*) as count FROM deposit_requests WHERE status = 'PENDING'").get() as any)?.count || 0;
    const todayApprovedDeposits = (this.db.prepare("SELECT count(*) as count, COALESCE(sum(amount), 0) as total FROM deposit_requests WHERE status = 'APPROVED' AND date(processed_at) = ?").get(today) as any);
    const todayRejectedDeposits = (this.db.prepare("SELECT count(*) as count FROM deposit_requests WHERE status = 'REJECTED' AND date(processed_at) = ?").get(today) as any)?.count || 0;

    const pendingWithdrawals = (this.db.prepare("SELECT count(*) as count FROM withdrawal_requests WHERE status IN ('PENDING', 'PROCESSING')").get() as any)?.count || 0;
    const todayCompletedWithdrawals = (this.db.prepare("SELECT count(*) as count, COALESCE(sum(amount), 0) as total FROM withdrawal_requests WHERE status IN ('APPROVED', 'COMPLETED') AND date(processed_at) = ?").get(today) as any);

    // Users
    const totalRegistered = (this.db.prepare("SELECT count(*) as count FROM users WHERE account_type NOT IN ('BOT', 'TEST')").get() as any)?.count || 0;
    const newToday = (this.db.prepare("SELECT count(*) as count FROM users WHERE date(created_at) = ? AND account_type NOT IN ('BOT', 'TEST')").get(today) as any)?.count || 0;
    const activeUsers = (this.db.prepare("SELECT count(*) as count FROM users WHERE account_status = 'ACTIVE' AND account_type NOT IN ('BOT', 'TEST')").get() as any)?.count || 0;
    const jackpotParticipants = (this.db.prepare("SELECT count(DISTINCT user_id) as count FROM daily_jackpot_tickets").get() as any)?.count || 0;
    const jackpotCardBuyers = (this.db.prepare("SELECT count(*) as count FROM daily_jackpot_tickets").get() as any)?.count || 0;

    // Agents
    const activeAgents = (this.db.prepare("SELECT count(*) as count FROM users WHERE role = 'AGENT' AND account_status = 'ACTIVE'").get() as any)?.count || 0;
    const suspendedAgents = (this.db.prepare("SELECT count(*) as count FROM users WHERE role = 'AGENT' AND account_status = 'SUSPENDED'").get() as any)?.count || 0;
    const agentsProcessing = (this.db.prepare("SELECT count(DISTINCT processed_by) as count FROM deposit_requests WHERE date(processed_at) = ?").get(today) as any)?.count || 0;
    const agentTransactionActivity = (this.db.prepare("SELECT count(*) as count FROM agent_activity_logs WHERE date(timestamp) = ?").get(today) as any)?.count || 0;

    // Weekend Jackpot current round
    const currentRound = this.db.prepare("SELECT * FROM daily_jackpot_rounds ORDER BY created_at DESC LIMIT 1").get() as any;
    const currentParticipants = currentRound ? ((this.db.prepare("SELECT count(DISTINCT user_id) as count FROM daily_jackpot_tickets WHERE round_id = ?").get(currentRound.id) as any)?.count || 0) : 0;

    return {
      financial: {
        pendingDeposits,
        todayApprovedDeposits: todayApprovedDeposits?.count || 0,
        todayRejectedDeposits,
        pendingWithdrawals,
        todayCompletedWithdrawals: todayCompletedWithdrawals?.count || 0,
        totalDepositedToday: todayApprovedDeposits?.total || 0,
        totalWithdrawnToday: todayCompletedWithdrawals?.total || 0
      },
      users: {
        totalRegistered,
        newToday,
        activeUsers,
        jackpotParticipants,
        jackpotCardBuyers
      },
      agents: {
        activeAgents,
        suspendedAgents,
        agentsProcessing,
        agentTransactionActivity
      },
      jackpot: {
        status: currentRound?.status || 'REGISTRATION_OPEN',
        cardsSold: currentRound?.cards_sold || 0,
        participatingPlayers: currentParticipants,
        prizePool: currentRound?.jackpot_amount || 0,
        startTime: currentRound?.cutoff_at || '10:00 Africa/Addis_Ababa',
        isEligible: Boolean(currentRound && currentRound.cards_sold >= 100)
      }
    };
  }

  public getUserTransactionCounts(userId: string): { deposit_count: number; withdrawal_count: number; jackpot_cards_purchased: number } {
    const depositCount = this.db.prepare('SELECT COUNT(*) as c FROM deposit_requests WHERE user_id = ?').get(userId) as { c: number } | undefined;
    const withdrawalCount = this.db.prepare('SELECT COUNT(*) as c FROM withdrawal_requests WHERE user_id = ?').get(userId) as { c: number } | undefined;
    const jackpotCards = this.db.prepare('SELECT COUNT(*) as c FROM daily_jackpot_tickets WHERE user_id = ?').get(userId) as { c: number } | undefined;
    return {
      deposit_count: depositCount?.c || 0,
      withdrawal_count: withdrawalCount?.c || 0,
      jackpot_cards_purchased: jackpotCards?.c || 0
    };
  }

  public getUserFinancialStats(userId: string) {
    const depositStats = this.db.prepare(`
      SELECT
        COUNT(*) as total_deposits_count,
        COALESCE(SUM(CASE WHEN status = 'APPROVED' THEN amount ELSE 0 END), 0) as total_deposited,
        COALESCE(SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END), 0) as pending_deposits_count
      FROM deposit_requests WHERE user_id = ?
    `).get(userId) as any;

    const withdrawalStats = this.db.prepare(`
      SELECT
        COUNT(*) as total_withdrawals_count,
        COALESCE(SUM(CASE WHEN status IN ('APPROVED', 'COMPLETED') THEN amount ELSE 0 END), 0) as total_withdrawn,
        COALESCE(SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END), 0) as pending_withdrawals_count
      FROM withdrawal_requests WHERE user_id = ?
    `).get(userId) as any;

    const bingoStats = this.db.prepare(`
      SELECT
        COUNT(*) as tickets_bought
      FROM player_tickets WHERE user_id = ?
    `).get(userId) as any;

    const winStats = this.db.prepare(`
      SELECT
        COUNT(*) as win_count,
        COALESCE(SUM(payout_amount), 0) as total_won
      FROM bingo_claims WHERE user_id = ?
    `).get(userId) as any;

    const jackpotStats = this.db.prepare(`
      SELECT
        COUNT(*) as jackpot_tickets,
        COALESCE(SUM(price), 0) as jackpot_spend
      FROM daily_jackpot_tickets WHERE user_id = ?
    `).get(userId) as any;

    const rewardStats = this.db.prepare(`
      SELECT
        COALESCE(SUM(reward_amount), 0) as total_rewards
      FROM reward_claims WHERE user_id = ?
    `).get(userId) as any;

    const lastLedger = this.db.prepare(`
      SELECT created_at FROM ledger_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1
    `).get(userId) as any;

    return {
      total_deposited: depositStats?.total_deposited || 0,
      total_withdrawn: withdrawalStats?.total_withdrawn || 0,
      deposit_count: depositStats?.total_deposits_count || 0,
      withdrawal_count: withdrawalStats?.total_withdrawals_count || 0,
      pending_deposits_count: depositStats?.pending_deposits_count || 0,
      pending_withdrawals_count: withdrawalStats?.pending_withdrawals_count || 0,
      bingo_purchases: bingoStats?.tickets_bought || 0,
      win_count: winStats?.win_count || 0,
      total_won: winStats?.total_won || 0,
      jackpot_cards_purchased: jackpotStats?.jackpot_tickets || 0,
      jackpot_spend: jackpotStats?.jackpot_spend || 0,
      total_rewards: rewardStats?.total_rewards || 0,
      last_activity: lastLedger?.created_at || null
    };
  }

  public getUserDetailedProfile(userId: string) {
    const user = this.getUserById(userId);
    if (!user) return null;
    const wallet = this.getOrCreateWallet(userId);
    const stats = this.getUserFinancialStats(userId);

    const deposits = this.db.prepare(
      'SELECT * FROM deposit_requests WHERE user_id = ? ORDER BY created_at DESC LIMIT 20'
    ).all(userId);

    const withdrawals = this.db.prepare(
      'SELECT * FROM withdrawal_requests WHERE user_id = ? ORDER BY created_at DESC LIMIT 20'
    ).all(userId);

    const bingoTickets = this.db.prepare(`
      SELECT pt.id, pt.game_id, pt.card_number, pt.purchased_at, g.bet_per_card, g.status as game_status
      FROM player_tickets pt
      LEFT JOIN games g ON pt.game_id = g.id
      WHERE pt.user_id = ?
      ORDER BY pt.purchased_at DESC LIMIT 20
    `).all(userId);

    const jackpotTickets = this.db.prepare(`
      SELECT jt.id, jt.round_id, jt.card_number, jt.price, jt.purchased_at, jr.date_str, jr.status as round_status
      FROM daily_jackpot_tickets jt
      LEFT JOIN daily_jackpot_rounds jr ON jt.round_id = jr.id
      WHERE jt.user_id = ?
      ORDER BY jt.purchased_at DESC LIMIT 20
    `).all(userId);

    const recentTransactions = this.db.prepare(`
      SELECT * FROM ledger_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 20
    `).all(userId);

    return {
      user: {
        ...user,
        balance: wallet.balance,
        reserved_balance: wallet.reserved_balance,
        bonus_balance: wallet.bonus_balance || 0,
        total_playable: Number(((wallet.balance || 0) + (wallet.bonus_balance || 0)).toFixed(2))
      },
      stats,
      deposits,
      withdrawals,
      bingoTickets,
      jackpotTickets,
      recentTransactions
    };
  }

  public getAgentTransactions(agentId: string) {
    const deposits = this.db.prepare(`
      SELECT * FROM deposit_requests
      WHERE processed_by = ? OR assigned_agent_id = ?
      ORDER BY created_at DESC LIMIT 50
    `).all(agentId, agentId);

    const withdrawals = this.db.prepare(`
      SELECT * FROM withdrawal_requests
      WHERE processed_by = ? OR assigned_agent_id = ?
      ORDER BY created_at DESC LIMIT 50
    `).all(agentId, agentId);

    return { deposits, withdrawals };
  }

  /**
   * Reset database (primarily for clean test suite runs)
   */
  public resetDatabase(): void {
    this.db.exec(`
      DELETE FROM weekend_jackpot_config;
      DELETE FROM agent_activity_logs;
      DELETE FROM payment_account_logs;
      DELETE FROM payment_accounts;
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
