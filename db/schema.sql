-- ====================================================================
-- Bingo Telegram Mini App - Relational Database Schema
-- Compatible with SQLite (native Node.js 24) and PostgreSQL
-- ====================================================================

-- 1. Users table (Central authoritative player identity)
CREATE TABLE IF NOT EXISTS users (
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

CREATE INDEX IF NOT EXISTS idx_users_account_type ON users(account_type);

CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code);

-- 2. Telegram Accounts table (Immutable external identity linkage)
CREATE TABLE IF NOT EXISTS telegram_accounts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    telegram_id TEXT NOT NULL UNIQUE,
    first_name TEXT,
    last_name TEXT,
    username TEXT,
    photo_url TEXT,
    auth_date INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_telegram_accounts_user ON telegram_accounts(user_id);

-- 3. Sessions table (Persistent and secure session tokens)
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    telegram_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    last_used_at INTEGER NOT NULL,
    revoked_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_telegram_id ON sessions(telegram_id);

-- 4. Wallets table (Server-authoritative balance and reserved holds)
CREATE TABLE IF NOT EXISTS wallets (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    balance REAL NOT NULL DEFAULT 0.0 CHECK(balance >= 0.0),
    reserved_balance REAL NOT NULL DEFAULT 0.0 CHECK(reserved_balance >= 0.0),
    bonus_balance REAL NOT NULL DEFAULT 0.0 CHECK(bonus_balance >= 0.0),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- 5. Financial Ledger Transactions table (Immutable double-entry transaction record)
CREATE TABLE IF NOT EXISTS ledger_transactions (
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

CREATE INDEX IF NOT EXISTS idx_ledger_user_id ON ledger_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_ledger_type ON ledger_transactions(type);
CREATE INDEX IF NOT EXISTS idx_ledger_reference ON ledger_transactions(reference_id);

-- 6. Deposit Requests table (Strict administrative approval workflow)
CREATE TABLE IF NOT EXISTS deposit_requests (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    username TEXT NOT NULL,
    amount REAL NOT NULL CHECK(amount > 0),
    payment_method TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'APPROVED', 'REJECTED')),
    reference_id TEXT,
    payment_account_id TEXT,
    payment_phone TEXT,
    assigned_agent_id TEXT,
    created_at TEXT NOT NULL,
    processed_at TEXT,
    processed_by TEXT,
    rejection_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_deposits_user ON deposit_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_deposits_status ON deposit_requests(status);
CREATE INDEX IF NOT EXISTS idx_deposits_agent ON deposit_requests(assigned_agent_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_deposits_reference_unique ON deposit_requests(reference_id) WHERE reference_id IS NOT NULL;

-- 7. Withdrawal Requests table (Balance reservation and approval workflow)
CREATE TABLE IF NOT EXISTS withdrawal_requests (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    username TEXT NOT NULL,
    amount REAL NOT NULL CHECK(amount > 0),
    address TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'APPROVED', 'REJECTED', 'PROCESSING', 'COMPLETED', 'FAILED')),
    reference_id TEXT,
    assigned_agent_id TEXT,
    created_at TEXT NOT NULL,
    processed_at TEXT,
    processed_by TEXT,
    rejection_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_withdrawals_user ON withdrawal_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON withdrawal_requests(status);
CREATE INDEX IF NOT EXISTS idx_withdrawals_agent ON withdrawal_requests(assigned_agent_id);

-- 8. Games table (Shared bingo game sessions)
CREATE TABLE IF NOT EXISTS games (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('lobby', 'active', 'finished')),
    bet_per_card REAL NOT NULL,
    server_secret TEXT NOT NULL,
    commitment_hash TEXT NOT NULL,
    total_cards_sold INTEGER NOT NULL DEFAULT 0,
    prize_pool REAL NOT NULL DEFAULT 0.0,
    created_at TEXT NOT NULL,
    finished_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_games_room_id ON games(room_id);

-- 9. Game Rounds (Drawn balls per game)
CREATE TABLE IF NOT EXISTS game_rounds (
    id TEXT PRIMARY KEY,
    game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    ball_index INTEGER NOT NULL,
    ball_number INTEGER NOT NULL,
    ball_letter TEXT NOT NULL,
    drawn_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_game_rounds_game ON game_rounds(game_id);

-- 10. Player Tickets table
CREATE TABLE IF NOT EXISTS player_tickets (
    id TEXT PRIMARY KEY,
    game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    card_number INTEGER NOT NULL,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    username TEXT NOT NULL,
    grid_json TEXT NOT NULL,
    fingerprint_hash TEXT NOT NULL,
    is_bot INTEGER NOT NULL DEFAULT 0,
    purchased_at TEXT NOT NULL,
    UNIQUE(game_id, card_number)
);

CREATE INDEX IF NOT EXISTS idx_player_tickets_user ON player_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_player_tickets_game ON player_tickets(game_id);

-- 11. Bingo Claims table (Idempotent single payout enforcement)
CREATE TABLE IF NOT EXISTS bingo_claims (
    id TEXT PRIMARY KEY,
    game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    ticket_id TEXT NOT NULL REFERENCES player_tickets(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    payout_amount REAL NOT NULL,
    pattern_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'VERIFIED',
    claimed_at TEXT NOT NULL,
    UNIQUE(game_id, ticket_id)
);

CREATE INDEX IF NOT EXISTS idx_bingo_claims_game ON bingo_claims(game_id);
CREATE INDEX IF NOT EXISTS idx_bingo_claims_ticket ON bingo_claims(ticket_id);

-- 12. Admin Audit Logs table (Immutable security compliance log)
CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    admin_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    target_user_id TEXT,
    target_record_id TEXT,
    metadata_json TEXT,
    timestamp TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_admin ON audit_logs(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_target ON audit_logs(target_user_id);

-- 13. Pending Registrations table (Persistent storage for fallback sign-ups)
CREATE TABLE IF NOT EXISTS pending_registrations (
    id TEXT PRIMARY KEY,
    phone TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    telegram_user_id TEXT,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'VERIFIED', 'DENIED', 'EXPIRED')),
    denial_reason TEXT,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pending_reg_phone ON pending_registrations(phone);
CREATE INDEX IF NOT EXISTS idx_pending_reg_telegram_id ON pending_registrations(telegram_user_id);

-- 14. Daily Grand Jackpot Rounds table (Authoritative daily 12:00 PM Addis Ababa jackpot lifecycle)
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

-- 15. Daily Grand Jackpot Tickets table (Purchased 75-ball catalog tickets 1..200)
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

-- 16. Promotional Rewards table (First Deposit Bonus & Promotional Ledger)
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

-- 17. User Room Play Reward Progress table (Per-room 10-card progress & milestone tracking)
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

-- 18. Referral Reward Claims table (10 ETB per qualifying deposited referred user)
CREATE TABLE IF NOT EXISTS referral_reward_claims (
    id TEXT PRIMARY KEY,
    referrer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    referee_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    reward_amount REAL NOT NULL DEFAULT 10.0,
    claimed_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ref_claims_referrer ON referral_reward_claims(referrer_id);

-- 19. Authoritative Reward Claims History table (First Deposit, Room Play, and Referral Claims)
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
    account_status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(account_status IN ('ACTIVE', 'INACTIVE', 'DELETED')),
    instructions TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_payment_accounts_active ON payment_accounts(is_active);
CREATE INDEX IF NOT EXISTS idx_payment_accounts_agent ON payment_accounts(assigned_agent_id);

-- 21. Payment Account Audit Logs (Immutable trail of phone number and account name changes)
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
CREATE INDEX IF NOT EXISTS idx_payment_acc_logs_admin ON payment_account_logs(changed_by);

-- 22. Agent Activity Logs (Granular operational audit trail for financial actions)
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
CREATE INDEX IF NOT EXISTS idx_agent_activity_time ON agent_activity_logs(timestamp);

-- 23. Weekend Jackpot Configuration table (Configurable Sunday 10:00 Africa/Addis_Ababa schedule)
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

