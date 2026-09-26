export interface BingoGrid {
  B: number[];
  I: number[];
  N: number[];
  G: number[];
  O: number[];
}

export type CurrencyType = 'ETB';

export interface PurchasedTicket {
  ticketId: string;
  cardNumber?: number;
  playerId: string;
  username: string;
  grid: BingoGrid;
  fingerprintHash: string;
  purchasedAt: string;
  isBot?: boolean;
}

export interface WinnerRecord {
  ticketId: string;
  cardNumber?: number;
  playerId: string;
  username: string;
  patternsWon: string[];
  winningNumbers: Record<string, number[]>;
  payoutAmount: number;
  patternType: string;
  claimedAtBallIndex: number;
  isBot?: boolean;
}

export interface RoomSummary {
  roomId: string;
  roomName: string;
  betPerCard: number;
  etbEquivalent: number;
  badge?: string;
  status: 'lobby' | 'active' | 'finished';
  lobbyTimeRemaining: number;
  lobbyDuration: number;
  isCountdownActive?: boolean;
  activePlayersCount: number;
  totalCardsSold: number;
  totalCatalogCards: number;
  minCardsToStart: number;
  totalPot: number;
  winnerPayoutAmount: number;
  playerPayoutPool: number;
  isFivePlayerBonus: boolean;
  gameId: string;
}

export interface GameRoomState {
  roomId: string;
  roomName: string;
  gameId: string;
  status: 'lobby' | 'active' | 'finished';
  betPerCard: number;
  etbEquivalent: number;
  rakePercent: number;
  badge?: string;
  lobbyTimeRemaining: number;
  lobbyDuration: number;
  isCountdownActive?: boolean;
  drawIntervalMs: number;
  totalCatalogCards: number;
  minCardsToStart: number;
  commitmentHash: string;
  serverSeedRevealed?: string;
  fullShuffledBallsRevealed?: number[];
  drawnBalls: number[];
  currentBall: { letter: 'B' | 'I' | 'N' | 'G' | 'O'; number: number } | null;
  totalBallsToDraw: number;
  totalCardsSold: number;
  totalPot: number;
  houseRakeAmount: number;
  playerPayoutPool: number;
  winnerPayoutAmount: number;
  winnerPayoutPercent: number;
  isFivePlayerBonus: boolean;
  fullHousePot: number;
  linePot: number;
  fourCornersPot: number;
  takenCardNumbers?: Record<number, { playerId: string; username: string; isBot: boolean }>;
  tickets: PurchasedTicket[];
  activePlayersCount: number;
  winners: WinnerRecord[];
}

export type UserRole = 'USER' | 'AGENT' | 'SUPER_ADMIN' | 'ADMIN';

export interface UserAccount {
  id?: string;
  playerId: string;
  username: string;
  walletBalance: number;
  reservedBalance?: number;
  bonusBalance?: number;
  totalPlayableBalance?: number;
  avatarUrl?: string;
  isBot?: boolean;
  phone?: string;
  telebirr_number?: string;
  assigned_agent_name?: string;
  isVerified?: boolean;
  registration_status?: string;
  role?: UserRole;
  account_status?: 'ACTIVE' | 'SUSPENDED' | 'BANNED' | 'DEACTIVATED' | 'DELETION_REQUESTED' | 'DELETED';
  token?: string;
  totalGamesPlayed?: number;
  totalWonETB?: number;
  vipTier?: string;
  currentStreak?: number;
  xp?: number;
  level?: number;
  levelProgressXp?: number;
  levelTotalXp?: number;
  levelPercent?: number;
  telegram_username?: string;
}

export interface PromotionalReward {
  id: string;
  userId: string;
  rewardType: 'FIRST_DEPOSIT_BONUS';
  source: string;
  qualifyingDepositId: string;
  depositAmount: number;
  bonusPercentage: number;
  bonusAmount: number;
  remainingAmount: number;
  status: 'AWARDED' | 'PARTIALLY_CONSUMED' | 'CONSUMED' | 'EXPIRED';
  issuedAt: string;
  expiresAt: string;
  consumedAt?: string;
  expiredAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserProfile extends UserAccount {
  totalGamesPlayed: number;
  totalWonETB: number;
  currentStreak: number;
  xp: number;
  level: number;
  levelProgressXp: number;
  levelTotalXp: number;
  levelPercent: number;
  vipTier: string;
}

export interface LedgerEntry {
  id: string;
  playerId: string;
  username: string;
  type: 'deposit' | 'buy_in' | 'win_payout' | 'withdrawal' | 'refund' | 'bonus' | 'loss' | 'adjustment' | 'escrow_hold';
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  gameId?: string;
  ticketId?: string;
  referenceId?: string;
  description: string;
  timestamp: string;
}

export interface LeaderboardWinner {
  rank: number;
  userId?: string;
  username?: string;
  name?: string;
  avatar?: string;
  totalWon?: number;
  totalWonUSD?: number;
  totalWonETB: number;
  wins?: number;
  gamesPlayed: number;
  level?: number;
  xp?: number;
  badge?: string;
}

export interface RecentJackpot {
  id?: string;
  userId?: string;
  username: string;
  avatar?: string;
  amountUSD?: number;
  amountETB: number;
  pattern: string;
  time?: string;
  timeAgo?: string;
  room: string;
  winType?: 'BINGO' | 'DAILY_JACKPOT';
}

export interface CurrentUserRankStats {
  rank: number | null;
  totalWonETB: number;
  totalWins: number;
  gamesPlayed: number;
  level: number;
  xp: number;
  isRanked: boolean;
}

export interface LeaderboardApiResponse {
  success?: boolean;
  topWinners: LeaderboardWinner[];
  recentJackpots: RecentJackpot[];
  currentUserRank?: CurrentUserRankStats;
}

export interface ReferralStats {
  referralCode: string;
  referralLink: string;
  totalInvited: number;
  activeReferrals: number;
  totalEarnedUSD: number;
  totalEarnedETB: number;
  pendingClaimUSD: number;
  pendingClaimETB: number;
  commissionRate: string;
}

export interface FirstDepositRewardStatus {
  status: 'NOT_ELIGIBLE' | 'CLAIMABLE' | 'CLAIMED';
  qualifyingDepositAmount: number;
  rewardAmount: number;
  claimedAt?: string | null;
  depositId?: string;
}

export interface RoomPlayRewardStatus {
  roomId: string;
  roomName: string;
  cardPrice: number;
  cardsPurchased: number;
  milestonesClaimed: number;
  completedBlocks: number;
  availableBlocks: number;
  availableRewardAmount: number;
  progress: number;
  target: number;
  status: 'PROGRESS' | 'REWARD_AVAILABLE' | 'CLAIMED';
  badge?: string;
}

export interface ReferralRewardStatus {
  referralCode: string;
  referralLink: string;
  totalInvited: number;
  qualifiedCount: number;
  claimedCount: number;
  unclaimedCount: number;
  availableRewardAmount: number;
  rewardPerReferral: number;
}

export interface RewardHistoryItem {
  id: string;
  rewardType: 'FIRST_DEPOSIT' | 'ROOM_PLAY' | 'REFERRAL';
  amount: number;
  claimedAt: string;
  status: 'CLAIMED';
  description: string;
}

export interface UserRewardsSummary {
  bonusBalance: number;
  cashBalance: number;
  firstDeposit: FirstDepositRewardStatus;
  roomRewards: RoomPlayRewardStatus[];
  referralRewards: ReferralRewardStatus;
  history: RewardHistoryItem[];
}

export interface DepositRequest {
  id: string;
  playerId: string;
  username: string;
  amount: number;
  paymentMethod: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  referenceId?: string;
  createdAt: string;
  processedAt?: string;
  processedBy?: string;
  rejectionReason?: string;
  paymentAccountId?: string;
  paymentPhone?: string;
  assignedAgentId?: string;
  customerPhone?: string;
}

export interface WithdrawalRequest {
  id: string;
  playerId: string;
  username: string;
  amount: number;
  address: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  referenceId?: string;
  createdAt: string;
  processedAt?: string;
  processedBy?: string;
  rejectionReason?: string;
  assignedAgentId?: string;
  customerPhone?: string;
}

export interface PaymentAccount {
  id: string;
  provider: string;
  account_name: string;
  phone_number: string;
  assigned_agent_id?: string | null;
  assigned_agent_name?: string | null;
  active: boolean | number;
  instructions?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface PaymentAccountLog {
  id: string;
  account_id: string;
  action: string;
  old_number?: string | null;
  new_number?: string | null;
  changed_by: string;
  note?: string | null;
  created_at: string;
}

export interface AgentPerformance {
  agent_id: string;
  username: string;
  phone: string;
  telebirr_number: string;
  assigned_agent_name: string;
  account_status: string;
  created_at: string;
  last_login_at: string;
  deposits_processed: number;
  deposit_amount: number;
  withdrawals_processed: number;
  withdrawal_amount: number;
  deposits_approved: number;
  deposits_rejected: number;
  withdrawals_approved: number;
  withdrawals_rejected: number;
  pending_workload: number;
  last_activity_at: string;
}

export interface AgentActivityLog {
  id: string;
  actor_id: string;
  actor_role: string;
  action: string;
  target_id?: string | null;
  target_user_id?: string | null;
  metadata?: any;
  ip_address?: string | null;
  created_at: string;
}

export interface WeekendJackpotPlayer {
  user_id: string;
  username: string;
  phone: string | null;
  cards_count: number;
  total_spent: number;
  first_purchase_at: string;
  last_purchase_at: string;
  card_numbers: number[];
  payment_source: string;
  round_id: string;
  is_winner: boolean;
}

export interface WeekendJackpotRoundSummary {
  round_id: string;
  date: string;
  cutoff_at: string;
  start_time: string;
  cards_sold: number;
  unique_players: number;
  prize_pool: number;
  winner_username: string | null;
  winner_card_number: number | null;
  winning_ticket_id: string | null;
  status: string;
  completed_at: string | null;
}

export interface WeekendJackpotConfig {
  id: string;
  day_of_week: string;
  start_time: string;
  timezone: string;
  min_cards: number;
  max_cards: number;
  card_price: number;
  updated_at: string;
}

export interface SuperAdminOverviewStats {
  pending_deposits: number;
  today_approved_deposits: number;
  today_rejected_deposits: number;
  pending_withdrawals: number;
  today_completed_withdrawals: number;
  today_deposited_amount: number;
  today_withdrawn_amount: number;
  total_users: number;
  new_users_today: number;
  active_users: number;
  jackpot_participating_users: number;
  jackpot_cards_sold_all_time: number;
  active_agents: number;
  suspended_agents: number;
  agents_processing_count: number;
  current_jackpot_status: string;
  current_jackpot_cards_sold: number;
  current_jackpot_players: number;
  current_jackpot_prize_pool: number;
  current_jackpot_start_time: string;
  current_jackpot_is_eligible: boolean;
}

export interface ReconciliationReport {
  summary: {
    total_transactions: number;
    total_amount: number;
    approved_count: number;
    approved_amount: number;
    rejected_count: number;
    rejected_amount: number;
    pending_count: number;
    pending_amount: number;
    discrepancy_count: number;
  };
  transactions: Array<{
    id: string;
    type: 'DEPOSIT' | 'WITHDRAWAL';
    user_id: string;
    username: string;
    customer_phone: string | null;
    amount: number;
    payment_method: string;
    payment_phone?: string | null;
    payment_account_id?: string | null;
    reference_id: string | null;
    status: string;
    assigned_agent_id: string | null;
    processed_by: string | null;
    created_at: string;
    processed_at: string | null;
    rejection_reason: string | null;
    has_discrepancy: boolean;
    discrepancy_note: string | null;
  }>;
}

export interface AuditLogRecord {
  id: string;
  admin_user_id: string;
  action: string;
  target_user_id: string;
  target_record_id: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface AdminUserDetail {
  id: string;
  playerId: string;
  telegram_id: string;
  telegram_username?: string;
  first_name: string;
  last_name?: string;
  username: string;
  phone?: string;
  walletBalance: number;
  reservedBalance?: number;
  bonusBalance?: number;
  totalPlayableBalance?: number;
  balance?: number;
  total_deposited?: number;
  total_withdrawn?: number;
  deposit_count?: number;
  withdrawal_count?: number;
  bingo_tickets_count?: number;
  jackpot_tickets_count?: number;
  wins_count?: number;
  role: UserRole;
  account_type?: 'REAL' | 'GUEST' | 'BOT' | 'TEST' | 'ADMIN' | 'AGENT';
  is_bot?: boolean;
  account_status: 'ACTIVE' | 'SUSPENDED' | 'BANNED' | 'DEACTIVATED' | 'DELETION_REQUESTED' | 'DELETED';
  registration_status: string;
  created_at: string;
  last_login_at: string;
}

export interface DailyJackpotTicket {
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

export interface DailyJackpotPublicState {
  roundId: string;
  date: string;
  status: 'SCHEDULED' | 'REGISTRATION_OPEN' | 'REGISTRATION_CLOSED' | 'CHECKING_ELIGIBILITY' | 'POSTPONED' | 'JACKPOT_READY' | 'GAME_RUNNING' | 'WINNER_FOUND' | 'JACKPOT_PAID' | 'COMPLETED';
  cardsSold: number;
  maxCards: number;
  minCards: number;
  cardPrice: number;
  jackpotAmount: number;
  cutoffTime: string;
  serverTime: string;
  isPostponed: boolean;
  postponementMessage: string | null;
  myTickets: DailyJackpotTicket[];
  winner?: {
    username: string;
    cardNumber: number;
    amount: number;
  } | null;
}

export interface DailyJackpotCardCatalogItem {
  cardNumber: number;
  isTaken: boolean;
  isOwnedByMe: boolean;
  price: number;
  grid?: BingoGrid;
}

export interface DailyJackpotAdminRound {
  id: string;
  round_id?: string;
  jackpot_date?: string;
  date_str?: string;
  date?: string;
  status: string;
  cards_sold: number;
  gross_sales?: number;
  gross_card_sales?: number;
  jackpot_amount?: number;
  calculated_jackpot?: number;
  calculatedJackpot?: number;
  platform_retained_amount?: number;
  calculatedPlatformRetained?: number;
  cutoff_time?: string;
  cutoff_at?: string;
  checked_at?: string;
  postponed_reason?: string;
  postponement_reason?: string;
  winner_user_id?: string;
  winner_ticket_id?: string;
  winner_card_number?: number;
  winner_payout_amount?: number;
  payout_status?: string;
  created_at?: string;
  updated_at?: string;
}

export interface DailyJackpotAdminState {
  currentRound: DailyJackpotAdminRound;
  history: DailyJackpotAdminRound[];
}
