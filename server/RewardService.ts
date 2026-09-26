import crypto from 'crypto';

export const BONUS_PERCENTAGE = 10.0;
export const MAX_FIRST_DEPOSIT_BONUS = 50.0; // 50.00 ETB
export const BONUS_EXPIRATION_HOURS = 24;
export const BONUS_ALLOWED_PURCHASES = ['BINGO_CARD', 'DAILY_GRAND_JACKPOT_CARD'] as const;
export type BonusAllowedPurchase = typeof BONUS_ALLOWED_PURCHASES[number];

export const REFERRAL_REWARD_AMOUNT = 10.0; // 10.00 ETB per qualified referral
export const CARDS_PER_ROOM_REWARD_MILESTONE = 10; // 10 cards per room milestone

export interface RoomRewardConfig {
  roomId: string;
  roomName: string;
  cardPrice: number; // in ETB
  badge?: string;
}

export const DEFAULT_ROOM_REWARDS: RoomRewardConfig[] = [
  { roomId: 'room_10birr', roomName: 'Starter Lounge', cardPrice: 10, badge: '🔥 10 BIRR ENTRY' },
  { roomId: 'room_20birr', roomName: 'Bronze Room', cardPrice: 20, badge: '⭐ 20 BIRR' },
  { roomId: 'room_50birr', roomName: 'Gold Arena', cardPrice: 50, badge: '💎 50 BIRR POPULAR' },
  { roomId: 'room_100birr', roomName: 'Diamond High-Roller', cardPrice: 100, badge: '👑 100 BIRR MAX VIP' }
];

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

export interface FirstDepositRewardStatus {
  status: 'NOT_ELIGIBLE' | 'CLAIMABLE' | 'CLAIMED';
  qualifyingDepositAmount: number;
  rewardAmount: number;
  claimedAt?: string | null;
  depositId?: string;
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

export interface PurchaseSplitResult {
  bonusPaid: number;
  cashPaid: number;
  totalCost: number;
  bonusConsumedRecords: Array<{ rewardId: string; amount: number }>;
}

/**
 * Exact deterministic calculation of first-deposit bonus.
 * bonus = min(firstDepositAmount * 0.10, 50.00 ETB)
 * Uses exact integer cent arithmetic to avoid floating-point drift.
 */
export function calculateFirstDepositBonus(depositAmount: number): number {
  if (typeof depositAmount !== 'number' || !Number.isFinite(depositAmount) || depositAmount <= 0) {
    return 0;
  }
  const depositCents = Math.round(depositAmount * 100);
  const maxBonusCents = Math.round(MAX_FIRST_DEPOSIT_BONUS * 100); // 5000 cents
  const bonusCents = Math.min(Math.floor(depositCents * 0.10), maxBonusCents);
  return Number((bonusCents / 100).toFixed(2));
}

export class RewardService {
  private db: any;
  private roomConfigs: Map<string, RoomRewardConfig> = new Map();

  constructor(dbInstance: any) {
    this.db = dbInstance;
    for (const cfg of DEFAULT_ROOM_REWARDS) {
      this.roomConfigs.set(cfg.roomId, cfg);
    }
  }

  public calculateFirstDepositBonus(depositAmount: number): number {
    return calculateFirstDepositBonus(depositAmount);
  }

  /**
   * Determine if a user is eligible for a First Deposit Bonus.
   * Authoritative server check:
   * 1. User has not already received a FIRST_DEPOSIT_BONUS.
   * 2. User has no prior approved deposits other than this qualifying deposit.
   */
  public isEligibleForFirstDepositBonus(userId: string, currentDepositId: string): boolean {
    if (!userId || !currentDepositId) return false;

    // Check 1: Has the user already received a FIRST_DEPOSIT_BONUS?
    const existingReward = this.db.prepare(
      "SELECT id FROM promotional_rewards WHERE user_id = ? AND reward_type = 'FIRST_DEPOSIT_BONUS'"
    ).get(userId);
    if (existingReward) {
      return false;
    }

    // Check 2: Does the user have any other approved deposits prior to this?
    const priorApproved = this.db.prepare(
      "SELECT id FROM deposit_requests WHERE user_id = ? AND status = 'APPROVED' AND id != ?"
    ).get(userId, currentDepositId);
    if (priorApproved) {
      return false;
    }

    return true;
  }

  /**
   * Issues the first-deposit promotional bonus within an existing ACID transaction.
   * Returns the created PromotionalReward, or null if not eligible.
   */
  public issueFirstDepositBonus(
    userId: string,
    username: string,
    depositId: string,
    depositAmount: number,
    issuedTime?: Date
  ): PromotionalReward | null {
    if (!this.isEligibleForFirstDepositBonus(userId, depositId)) {
      return null;
    }

    const bonusAmount = calculateFirstDepositBonus(depositAmount);
    if (bonusAmount <= 0) {
      return null;
    }

    const now = issuedTime || new Date();
    const issuedAt = now.toISOString();
    const expiresAt = new Date(now.getTime() + BONUS_EXPIRATION_HOURS * 60 * 60 * 1000).toISOString();
    const rewardId = `rew_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    // 1. Insert into promotional_rewards
    // Unique partial index idx_rewards_user_first_deposit and UNIQUE(qualifying_deposit_id)
    // guarantee zero duplicate rewards even under concurrency.
    const insertStmt = this.db.prepare(`
      INSERT INTO promotional_rewards (
        id, user_id, reward_type, source, qualifying_deposit_id,
        deposit_amount, bonus_percentage, bonus_amount, remaining_amount,
        status, issued_at, expires_at, created_at, updated_at
      ) VALUES (?, ?, 'FIRST_DEPOSIT_BONUS', 'TELEBIRR_DEPOSIT', ?, ?, ?, ?, ?, 'AWARDED', ?, ?, ?, ?)
    `);

    try {
      insertStmt.run(
        rewardId,
        userId,
        depositId,
        depositAmount,
        BONUS_PERCENTAGE,
        bonusAmount,
        bonusAmount,
        issuedAt,
        expiresAt,
        issuedAt,
        issuedAt
      );
    } catch (err: any) {
      if (err.message && (err.message.includes('UNIQUE constraint failed') || err.message.includes('idx_rewards_user_first_deposit'))) {
        console.warn(`[RewardService] Idempotency catch: User ${userId} or deposit ${depositId} already received first-deposit bonus`);
        return null;
      }
      throw err;
    }

    // 2. Increment wallet's bonus_balance
    this.db.prepare(`
      UPDATE wallets
      SET bonus_balance = round(bonus_balance + ?, 2), updated_at = ?
      WHERE user_id = ?
    `).run(bonusAmount, issuedAt, userId);

    // 3. Record double-entry financial ledger entry
    const entryId = `tx_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const wallet = this.db.prepare('SELECT balance, bonus_balance FROM wallets WHERE user_id = ?').get(userId);
    const balanceBefore = wallet ? wallet.balance : 0;
    const balanceAfter = balanceBefore; // Cash balance does NOT change when bonus is credited!

    this.db.prepare(`
      INSERT INTO ledger_transactions (
        id, user_id, username, type, amount, balance_before, balance_after,
        reference_id, description, created_at
      ) VALUES (?, ?, ?, 'BONUS', ?, ?, ?, ?, ?, ?)
    `).run(
      entryId,
      userId,
      username,
      bonusAmount,
      balanceBefore,
      balanceAfter,
      `first_deposit_bonus_${depositId}`,
      `First Deposit Promotional Bonus (10% on ${depositAmount.toFixed(2)} ETB, max 50 ETB, 24h validity)`,
      issuedAt
    );

    // 4. Record in reward_claims
    try {
      this.db.prepare(`
        INSERT INTO reward_claims (id, user_id, reward_type, reward_amount, details_json, claimed_at)
        VALUES (?, ?, 'FIRST_DEPOSIT', ?, ?, ?)
      `).run(
        `claim_fd_${rewardId}`,
        userId,
        bonusAmount,
        JSON.stringify({
          depositId,
          depositAmount,
          bonusPercentage: BONUS_PERCENTAGE,
          cappedAt: MAX_FIRST_DEPOSIT_BONUS
        }),
        issuedAt
      );
    } catch (_) {}

    return {
      id: rewardId,
      userId,
      rewardType: 'FIRST_DEPOSIT_BONUS',
      source: 'TELEBIRR_DEPOSIT',
      qualifyingDepositId: depositId,
      depositAmount,
      bonusPercentage: BONUS_PERCENTAGE,
      bonusAmount,
      remainingAmount: bonusAmount,
      status: 'AWARDED',
      issuedAt,
      expiresAt,
      createdAt: issuedAt,
      updatedAt: issuedAt
    };
  }

  /**
   * Authoritative server-side expiration check.
   * Evaluates if any active promotional rewards have expired (`expires_at <= now`).
   * Can be invoked specifically for a user before a purchase, or globally as a maintenance sweep.
   * Forfeits any expired remaining amount and deducts it from wallets.bonus_balance.
   * Preserves full historical auditability.
   */
  public expireRewardsIfDue(userId?: string, referenceTime?: Date): number {
    const now = referenceTime || new Date();
    const nowIso = now.toISOString();

    let query = `
      SELECT * FROM promotional_rewards
      WHERE status IN ('AWARDED', 'PARTIALLY_CONSUMED')
        AND expires_at <= ?
    `;
    const params: any[] = [nowIso];
    if (userId) {
      query += ' AND user_id = ?';
      params.push(userId);
    }

    const expiredRows = this.db.prepare(query).all(...params) as Array<any>;
    if (!expiredRows || expiredRows.length === 0) {
      return 0;
    }

    let totalExpiredCount = 0;
    for (const reward of expiredRows) {
      const remaining = Number(reward.remaining_amount) || 0;
      // Mark reward as EXPIRED
      this.db.prepare(`
        UPDATE promotional_rewards
        SET status = 'EXPIRED', remaining_amount = 0.0, expired_at = ?, updated_at = ?
        WHERE id = ? AND status IN ('AWARDED', 'PARTIALLY_CONSUMED')
      `).run(nowIso, nowIso, reward.id);

      // Decrement wallet bonus_balance by remaining amount
      if (remaining > 0) {
        this.db.prepare(`
          UPDATE wallets
          SET bonus_balance = max(0.0, round(bonus_balance - ?, 2)), updated_at = ?
          WHERE user_id = ?
        `).run(remaining, nowIso, reward.user_id);

        // Record expiration in ledger for auditability
        const entryId = `tx_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
        const wallet = this.db.prepare('SELECT balance FROM wallets WHERE user_id = ?').get(reward.user_id);
        const cashBal = wallet ? wallet.balance : 0;
        this.db.prepare(`
          INSERT INTO ledger_transactions (
            id, user_id, username, type, amount, balance_before, balance_after,
            reference_id, description, created_at
          ) VALUES (?, ?, 'Player', 'LOSS', ?, ?, ?, ?, ?, ?)
        `).run(
          entryId,
          reward.user_id,
          remaining,
          cashBal,
          cashBal,
          `bonus_expired_${reward.id}`,
          `Promotional Bonus Expired (${remaining.toFixed(2)} ETB forfeited after 24 hours)`,
          nowIso
        );
      }
      totalExpiredCount++;
    }

    return totalExpiredCount;
  }

  /**
   * Consume promotional bonus for eligible purchases (Bingo card, Daily Jackpot card).
   * Spends active non-expired bonus FIRST, and deducts the remainder from cash balance.
   * Must be called within an ACID transaction.
   */
  public consumeBonusForPurchase(
    userId: string,
    cost: number,
    purchaseType: BonusAllowedPurchase,
    referenceId: string,
    referenceTime?: Date
  ): PurchaseSplitResult {
    // 1. Validate purchaseType allowlist
    if (!BONUS_ALLOWED_PURCHASES.includes(purchaseType)) {
      throw new Error(`Promotional bonus cannot be used for product type: ${purchaseType}. Allowed: ${BONUS_ALLOWED_PURCHASES.join(', ')}`);
    }

    if (typeof cost !== 'number' || !Number.isFinite(cost) || cost <= 0) {
      throw new Error('Purchase cost must be a positive number');
    }

    const cleanCost = Math.round(cost * 100) / 100;
    const now = referenceTime || new Date();
    const nowIso = now.toISOString();

    // 2. Expire any due rewards for this user first
    this.expireRewardsIfDue(userId, now);

    // 3. Fetch user wallet
    const wallet = this.db.prepare('SELECT balance, bonus_balance FROM wallets WHERE user_id = ?').get(userId);
    if (!wallet) {
      throw new Error(`Wallet not found for user ${userId}`);
    }

    const cashBalance = Number(wallet.balance) || 0;
    const bonusBalance = Number(wallet.bonus_balance) || 0;
    const totalPlayable = Math.round((cashBalance + bonusBalance) * 100) / 100;

    if (totalPlayable < cleanCost) {
      throw new Error(`Insufficient wallet balance (Insufficient funds): total playable balance is ${totalPlayable.toFixed(2)} ETB (Cash: ${cashBalance.toFixed(2)}, Bonus: ${bonusBalance.toFixed(2)}), required ${cleanCost.toFixed(2)} ETB`);
    }

    // 4. Fetch active non-expired rewards ordered by earliest expiration
    const activeRewards = this.db.prepare(`
      SELECT * FROM promotional_rewards
      WHERE user_id = ?
        AND status IN ('AWARDED', 'PARTIALLY_CONSUMED')
        AND remaining_amount > 0
        AND expires_at > ?
      ORDER BY expires_at ASC
    `).all(userId, nowIso) as Array<any>;

    let remainingCostCents = Math.round(cleanCost * 100);
    let totalBonusPaidCents = 0;
    const bonusConsumedRecords: Array<{ rewardId: string; amount: number }> = [];

    // Deduct from promotional rewards
    for (const reward of activeRewards) {
      if (remainingCostCents <= 0) break;

      const rewardRemainingCents = Math.round(Number(reward.remaining_amount) * 100);
      if (rewardRemainingCents <= 0) continue;

      const consumeCents = Math.min(rewardRemainingCents, remainingCostCents);
      const consumeAmount = Number((consumeCents / 100).toFixed(2));
      const newRemainingCents = rewardRemainingCents - consumeCents;
      const newRemainingAmount = Number((newRemainingCents / 100).toFixed(2));
      const newStatus = newRemainingCents === 0 ? 'CONSUMED' : 'PARTIALLY_CONSUMED';
      const consumedAt = newRemainingCents === 0 ? nowIso : null;

      this.db.prepare(`
        UPDATE promotional_rewards
        SET remaining_amount = ?, status = ?, consumed_at = COALESCE(consumed_at, ?), updated_at = ?
        WHERE id = ?
      `).run(newRemainingAmount, newStatus, consumedAt, nowIso, reward.id);

      bonusConsumedRecords.push({ rewardId: reward.id, amount: consumeAmount });
      totalBonusPaidCents += consumeCents;
      remainingCostCents -= consumeCents;
    }

    // If remainingCostCents > 0 and user has remaining bonus balance in wallet (e.g. from Room / Referral rewards):
    const totalWalletBonusCents = Math.round(bonusBalance * 100);
    const unallocatedBonusCents = Math.max(0, totalWalletBonusCents - totalBonusPaidCents);
    if (remainingCostCents > 0 && unallocatedBonusCents > 0) {
      const extraBonusCents = Math.min(remainingCostCents, unallocatedBonusCents);
      const extraBonusAmount = Number((extraBonusCents / 100).toFixed(2));
      bonusConsumedRecords.push({ rewardId: `bonus_${referenceId}`, amount: extraBonusAmount });
      totalBonusPaidCents += extraBonusCents;
      remainingCostCents -= extraBonusCents;
    }

    const bonusPaid = Number((totalBonusPaidCents / 100).toFixed(2));
    const cashPaid = Number((remainingCostCents / 100).toFixed(2));

    if (cashPaid > cashBalance) {
      throw new Error(`Insufficient cash balance: cash required ${cashPaid.toFixed(2)} ETB, available ${cashBalance.toFixed(2)} ETB`);
    }

    // 5. Update wallet balances atomically
    this.db.prepare(`
      UPDATE wallets
      SET balance = round(balance - ?, 2),
          bonus_balance = max(0.0, round(bonus_balance - ?, 2)),
          updated_at = ?
      WHERE user_id = ?
    `).run(cashPaid, bonusPaid, nowIso, userId);

    return {
      bonusPaid,
      cashPaid,
      totalCost: cleanCost,
      bonusConsumedRecords
    };
  }

  /**
   * Refund a purchase that used split funding (e.g. card deselection in lobby).
   * Restores cash to cash and bonus to bonus without extending the original 24h expiration.
   */
  public refundPurchase(
    userId: string,
    bonusPaid: number,
    cashPaid: number,
    bonusConsumedRecords?: Array<{ rewardId: string; amount: number }>,
    referenceTime?: Date
  ): void {
    const now = referenceTime || new Date();
    const nowIso = now.toISOString();

    const cleanCash = Math.round(cashPaid * 100) / 100;
    const cleanBonus = Math.round(bonusPaid * 100) / 100;

    // 1. Restore cash to wallet
    if (cleanCash > 0) {
      this.db.prepare(`
        UPDATE wallets
        SET balance = round(balance + ?, 2), updated_at = ?
        WHERE user_id = ?
      `).run(cleanCash, nowIso, userId);
    }

    // 2. Restore bonus to promotional_rewards and wallet
    if (cleanBonus > 0) {
      if (bonusConsumedRecords && bonusConsumedRecords.length > 0) {
        for (const record of bonusConsumedRecords) {
          const rew = this.db.prepare('SELECT * FROM promotional_rewards WHERE id = ?').get(record.rewardId);
          if (rew && rew.expires_at > nowIso) {
            const restoredRemaining = Math.min(
              rew.bonus_amount,
              Number((Math.round((rew.remaining_amount + record.amount) * 100) / 100).toFixed(2))
            );
            const status = restoredRemaining === rew.bonus_amount ? 'AWARDED' : 'PARTIALLY_CONSUMED';
            this.db.prepare(`
              UPDATE promotional_rewards
              SET remaining_amount = ?, status = ?, updated_at = ?
              WHERE id = ?
            `).run(restoredRemaining, status, nowIso, rew.id);
          }
        }
      } else {
        // Fallback for crash/server recovery where specific consumed record IDs were not preserved in memory
        const activeOrConsumed = this.db.prepare(`
          SELECT * FROM promotional_rewards
          WHERE user_id = ? AND expires_at > ? AND status IN ('AWARDED', 'PARTIALLY_CONSUMED', 'CONSUMED')
          ORDER BY expires_at DESC LIMIT 1
        `).get(userId, nowIso) as any;
        if (activeOrConsumed) {
          const restoredRemaining = Math.min(
            activeOrConsumed.bonus_amount,
            Number((Math.round((activeOrConsumed.remaining_amount + cleanBonus) * 100) / 100).toFixed(2))
          );
          const status = restoredRemaining === activeOrConsumed.bonus_amount ? 'AWARDED' : 'PARTIALLY_CONSUMED';
          this.db.prepare(`
            UPDATE promotional_rewards
            SET remaining_amount = ?, status = ?, updated_at = ?
            WHERE id = ?
          `).run(restoredRemaining, status, nowIso, activeOrConsumed.id);
        }
      }

      this.db.prepare(`
        UPDATE wallets
        SET bonus_balance = round(bonus_balance + ?, 2), updated_at = ?
        WHERE user_id = ?
      `).run(cleanBonus, nowIso, userId);
    }
  }

  /**
   * Get active promotional reward for a user (for UI display & countdown)
   */
  public getUserActiveBonus(userId: string, referenceTime?: Date): {
    bonusBalance: number;
    cashBalance: number;
    totalPlayableBalance: number;
    activeReward: PromotionalReward | null;
    timeRemainingSeconds: number;
  } {
    const now = referenceTime || new Date();
    this.expireRewardsIfDue(userId, now);

    const wallet = this.db.prepare('SELECT balance, bonus_balance FROM wallets WHERE user_id = ?').get(userId);
    const cashBalance = wallet ? Number(wallet.balance) : 0;
    const bonusBalance = wallet ? Number(wallet.bonus_balance) : 0;

    const row = this.db.prepare(`
      SELECT * FROM promotional_rewards
      WHERE user_id = ?
        AND status IN ('AWARDED', 'PARTIALLY_CONSUMED')
        AND remaining_amount > 0
        AND expires_at > ?
      ORDER BY expires_at ASC
      LIMIT 1
    `).get(userId, now.toISOString()) as any;

    if (!row) {
      return {
        bonusBalance,
        cashBalance,
        totalPlayableBalance: Number((cashBalance + bonusBalance).toFixed(2)),
        activeReward: null,
        timeRemainingSeconds: 0
      };
    }

    const expiresAtDate = new Date(row.expires_at);
    const timeRemainingSeconds = Math.max(0, Math.floor((expiresAtDate.getTime() - now.getTime()) / 1000));

    return {
      bonusBalance,
      cashBalance,
      totalPlayableBalance: Number((cashBalance + bonusBalance).toFixed(2)),
      activeReward: {
        id: row.id,
        userId: row.user_id,
        rewardType: row.reward_type,
        source: row.source,
        qualifyingDepositId: row.qualifying_deposit_id,
        depositAmount: row.deposit_amount,
        bonusPercentage: row.bonus_percentage,
        bonusAmount: row.bonus_amount,
        remainingAmount: row.remaining_amount,
        status: row.status,
        issuedAt: row.issued_at,
        expiresAt: row.expires_at,
        consumedAt: row.consumed_at,
        expiredAt: row.expired_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      },
      timeRemainingSeconds
    };
  }

  /**
   * List all promotional rewards for an admin audit view
   */
  public listAllRewards(status?: string): PromotionalReward[] {
    let query = 'SELECT * FROM promotional_rewards';
    const params: any[] = [];
    if (status && status !== 'ALL') {
      query += ' WHERE status = ?';
      params.push(status);
    }
    query += ' ORDER BY created_at DESC';

    const rows = this.db.prepare(query).all(...params) as any[];
    return rows.map(r => ({
      id: r.id,
      userId: r.user_id,
      rewardType: r.reward_type,
      source: r.source,
      qualifyingDepositId: r.qualifying_deposit_id,
      depositAmount: r.deposit_amount,
      bonusPercentage: r.bonus_percentage,
      bonusAmount: r.bonus_amount,
      remainingAmount: r.remaining_amount,
      status: r.status,
      issuedAt: r.issued_at,
      expiresAt: r.expires_at,
      consumedAt: r.consumed_at,
      expiredAt: r.expired_at,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    }));
  }

  // =========================================================================
  // 1. AUTHORITATIVE FIRST DEPOSIT REWARD (10% MAX 50 ETB, IDEMPOTENT)
  // =========================================================================

  public getFirstDepositRewardStatus(userId: string): FirstDepositRewardStatus {
    // Check if already recorded in reward_claims
    const existingClaim = this.db.prepare(`
      SELECT * FROM reward_claims WHERE user_id = ? AND reward_type = 'FIRST_DEPOSIT'
    `).get(userId) as any;

    if (existingClaim) {
      let depositAmt = 0;
      try {
        const details = JSON.parse(existingClaim.details_json);
        depositAmt = details.depositAmount || 0;
      } catch (_) {}
      return {
        status: 'CLAIMED',
        qualifyingDepositAmount: depositAmt,
        rewardAmount: Number(existingClaim.reward_amount),
        claimedAt: existingClaim.claimed_at
      };
    }

    // Check promotional_rewards table for legacy or auto-awarded rewards
    const promo = this.db.prepare(`
      SELECT * FROM promotional_rewards WHERE user_id = ? AND reward_type = 'FIRST_DEPOSIT_BONUS'
    `).get(userId) as any;

    if (promo) {
      return {
        status: 'CLAIMED',
        qualifyingDepositAmount: Number(promo.deposit_amount),
        rewardAmount: Number(promo.bonus_amount),
        claimedAt: promo.issued_at,
        depositId: promo.qualifying_deposit_id
      };
    }

    // Find earliest approved deposit
    const firstApproved = this.db.prepare(`
      SELECT * FROM deposit_requests WHERE user_id = ? AND status = 'APPROVED' ORDER BY created_at ASC LIMIT 1
    `).get(userId) as any;

    if (!firstApproved) {
      return {
        status: 'NOT_ELIGIBLE',
        qualifyingDepositAmount: 0,
        rewardAmount: 0,
        claimedAt: null
      };
    }

    const bonusAmount = calculateFirstDepositBonus(Number(firstApproved.amount));
    return {
      status: 'CLAIMABLE',
      qualifyingDepositAmount: Number(firstApproved.amount),
      rewardAmount: bonusAmount,
      claimedAt: null,
      depositId: firstApproved.id
    };
  }

  public claimFirstDepositReward(userId: string): {
    success: boolean;
    rewardAmount: number;
    qualifyingDepositAmount: number;
    bonusBalance: number;
  } {
    const status = this.getFirstDepositRewardStatus(userId);
    if (status.status === 'CLAIMED') {
      throw new Error('First deposit reward has already been claimed');
    }
    if (status.status === 'NOT_ELIGIBLE' || status.rewardAmount <= 0) {
      throw new Error('User is not eligible for first deposit reward. A qualifying first deposit is required.');
    }

    const rewardAmount = status.rewardAmount;
    const depositAmount = status.qualifyingDepositAmount;
    const now = new Date().toISOString();
    const claimId = `claim_fd_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    // 1. Insert into reward_claims
    this.db.prepare(`
      INSERT INTO reward_claims (id, user_id, reward_type, reward_amount, details_json, claimed_at)
      VALUES (?, ?, 'FIRST_DEPOSIT', ?, ?, ?)
    `).run(claimId, userId, rewardAmount, JSON.stringify({
      depositId: status.depositId,
      depositAmount,
      bonusPercentage: BONUS_PERCENTAGE,
      cappedAt: MAX_FIRST_DEPOSIT_BONUS
    }), now);

    // 2. Increment wallet bonus_balance
    this.db.prepare(`
      UPDATE wallets
      SET bonus_balance = round(bonus_balance + ?, 2), updated_at = ?
      WHERE user_id = ?
    `).run(rewardAmount, now, userId);

    // 3. Record financial ledger transaction
    const entryId = `tx_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const wallet = this.db.prepare('SELECT balance, bonus_balance FROM wallets WHERE user_id = ?').get(userId);
    const cashBal = wallet ? Number(wallet.balance) : 0;
    const bonusBal = wallet ? Number(wallet.bonus_balance) : 0;

    this.db.prepare(`
      INSERT INTO ledger_transactions (
        id, user_id, username, type, amount, balance_before, balance_after,
        reference_id, description, created_at
      ) VALUES (?, ?, 'Player', 'BONUS', ?, ?, ?, ?, ?, ?)
    `).run(
      entryId,
      userId,
      rewardAmount,
      cashBal,
      cashBal,
      `first_deposit_reward_${userId}`,
      `First Deposit Reward (10% on ${depositAmount.toFixed(2)} ETB, max 50 ETB)`,
      now
    );

    return {
      success: true,
      rewardAmount,
      qualifyingDepositAmount: depositAmount,
      bonusBalance: bonusBal
    };
  }

  // =========================================================================
  // 2. AUTHORITATIVE CARD / ROOM PLAY REWARD (10 CARDS = ROOM CARD PRICE)
  // =========================================================================

  public registerRoomConfig(config: RoomRewardConfig): void {
    this.roomConfigs.set(config.roomId, config);
  }

  public getRoomRewardConfig(roomId: string): RoomRewardConfig {
    if (this.roomConfigs.has(roomId)) {
      return this.roomConfigs.get(roomId)!;
    }
    const match = roomId.match(/(\d+)/);
    const price = match ? parseInt(match[1], 10) : 10;
    return { roomId, roomName: `Room ${price} ETB`, cardPrice: price };
  }

  public recordCardPurchase(userId: string, roomId: string, quantity: number = 1): void {
    if (!userId || !roomId || quantity <= 0) return;
    const now = new Date().toISOString();
    const id = `rprog_${userId}_${roomId}`;

    this.db.prepare(`
      INSERT INTO user_room_reward_progress (id, user_id, room_id, cards_purchased, milestones_claimed, created_at, updated_at)
      VALUES (?, ?, ?, ?, 0, ?, ?)
      ON CONFLICT(user_id, room_id) DO UPDATE SET
        cards_purchased = cards_purchased + excluded.cards_purchased,
        updated_at = excluded.updated_at
    `).run(id, userId, roomId, quantity, now, now);
  }

  public recordCardRefund(userId: string, roomId: string, quantity: number = 1): void {
    if (!userId || !roomId || quantity <= 0) return;
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE user_room_reward_progress
      SET cards_purchased = max(0, cards_purchased - ?), updated_at = ?
      WHERE user_id = ? AND room_id = ?
    `).run(quantity, now, userId, roomId);
  }

  public getRoomPlayRewards(userId: string): RoomPlayRewardStatus[] {
    const rooms = Array.from(this.roomConfigs.values());
    const rows = this.db.prepare(`
      SELECT * FROM user_room_reward_progress WHERE user_id = ?
    `).all(userId) as any[];
    const progressMap = new Map(rows.map(r => [r.room_id, r]));

    return rooms.map(room => {
      const prog = progressMap.get(room.roomId);
      const cardsPurchased = prog ? Number(prog.cards_purchased) || 0 : 0;
      const milestonesClaimed = prog ? Number(prog.milestones_claimed) || 0 : 0;
      const completedBlocks = Math.floor(cardsPurchased / CARDS_PER_ROOM_REWARD_MILESTONE);
      const availableBlocks = Math.max(0, completedBlocks - milestonesClaimed);
      const availableRewardAmount = Number((availableBlocks * room.cardPrice).toFixed(2));
      const progress = cardsPurchased % CARDS_PER_ROOM_REWARD_MILESTONE;
      const status: 'PROGRESS' | 'REWARD_AVAILABLE' | 'CLAIMED' =
        availableBlocks > 0 ? 'REWARD_AVAILABLE' : (milestonesClaimed > 0 ? 'CLAIMED' : 'PROGRESS');

      return {
        roomId: room.roomId,
        roomName: room.roomName,
        cardPrice: room.cardPrice,
        cardsPurchased,
        milestonesClaimed,
        completedBlocks,
        availableBlocks,
        availableRewardAmount,
        progress,
        target: CARDS_PER_ROOM_REWARD_MILESTONE,
        status,
        badge: room.badge
      };
    });
  }

  public claimRoomPlayReward(userId: string, roomId: string): {
    success: boolean;
    roomId: string;
    rewardAmount: number;
    blocksClaimed: number;
    bonusBalance: number;
  } {
    const room = this.getRoomRewardConfig(roomId);
    const prog = this.db.prepare(`
      SELECT * FROM user_room_reward_progress WHERE user_id = ? AND room_id = ?
    `).get(userId, roomId) as any;

    if (!prog) {
      throw new Error(`No play reward progress found for room ${roomId}`);
    }

    const cardsPurchased = Number(prog.cards_purchased) || 0;
    const milestonesClaimed = Number(prog.milestones_claimed) || 0;
    const completedBlocks = Math.floor(cardsPurchased / CARDS_PER_ROOM_REWARD_MILESTONE);
    const availableBlocks = completedBlocks - milestonesClaimed;

    if (availableBlocks <= 0) {
      throw new Error(`No unclaimed rewards available for room ${room.roomName} (${roomId}). Progress: ${cardsPurchased % CARDS_PER_ROOM_REWARD_MILESTONE}/10`);
    }

    const rewardAmount = Number((availableBlocks * room.cardPrice).toFixed(2));
    const now = new Date().toISOString();

    // 1. Update progress in user_room_reward_progress
    this.db.prepare(`
      UPDATE user_room_reward_progress
      SET milestones_claimed = milestones_claimed + ?, updated_at = ?
      WHERE id = ?
    `).run(availableBlocks, now, prog.id);

    // 2. Increment wallet bonus_balance
    this.db.prepare(`
      UPDATE wallets
      SET bonus_balance = round(bonus_balance + ?, 2), updated_at = ?
      WHERE user_id = ?
    `).run(rewardAmount, now, userId);

    // 3. Record in reward_claims
    const claimId = `claim_room_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    this.db.prepare(`
      INSERT INTO reward_claims (id, user_id, reward_type, reward_amount, details_json, claimed_at)
      VALUES (?, ?, 'ROOM_PLAY', ?, ?, ?)
    `).run(claimId, userId, rewardAmount, JSON.stringify({
      roomId: room.roomId,
      roomName: room.roomName,
      cardPrice: room.cardPrice,
      blocksClaimed: availableBlocks,
      totalCardsPurchased: cardsPurchased
    }), now);

    // 4. Record financial ledger transaction
    const entryId = `tx_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const wallet = this.db.prepare('SELECT balance, bonus_balance FROM wallets WHERE user_id = ?').get(userId);
    const cashBal = wallet ? Number(wallet.balance) : 0;
    const bonusBal = wallet ? Number(wallet.bonus_balance) : 0;

    this.db.prepare(`
      INSERT INTO ledger_transactions (
        id, user_id, username, type, amount, balance_before, balance_after,
        reference_id, description, created_at
      ) VALUES (?, ?, 'Player', 'BONUS', ?, ?, ?, ?, ?, ?)
    `).run(
      entryId,
      userId,
      rewardAmount,
      cashBal,
      cashBal,
      `room_play_reward_${claimId}`,
      `Room Play Reward (${availableBlocks}x milestone in ${room.roomName} @ ${room.cardPrice} ETB)`,
      now
    );

    return {
      success: true,
      roomId,
      rewardAmount,
      blocksClaimed: availableBlocks,
      bonusBalance: bonusBal
    };
  }

  // =========================================================================
  // 3. AUTHORITATIVE REFERRAL REWARD (10 ETB PER QUALIFIED DEPOSIT)
  // =========================================================================

  public getReferralRewards(userId: string): ReferralRewardStatus {
    const user = this.db.prepare('SELECT referral_code FROM users WHERE id = ?').get(userId) as any;
    const referralCode = user?.referral_code || `BINGO_${userId.slice(-4).toUpperCase()}`;
    const botUsername = process.env.TELEGRAM_BOT_USERNAME || 'BINGOBEET_BOT';
    const referralLink = `https://t.me/${botUsername}?start=${referralCode}`;

    // Total invited users
    const totalInvitedRow = this.db.prepare(`
      SELECT COUNT(*) as count FROM users WHERE referred_by = ? AND id != ?
    `).get(userId, userId) as any;
    const totalInvited = totalInvitedRow ? Number(totalInvitedRow.count) : 0;

    // Qualified referees: referred users who have at least ONE approved deposit
    const qualifiedReferees = this.db.prepare(`
      SELECT u.id, u.username
      FROM users u
      JOIN deposit_requests dr ON dr.user_id = u.id AND dr.status = 'APPROVED'
      WHERE u.referred_by = ? AND u.id != ?
      GROUP BY u.id, u.username
    `).all(userId, userId) as any[];

    // Referees already claimed
    const claimedReferees = this.db.prepare(`
      SELECT referee_id FROM referral_reward_claims WHERE referrer_id = ?
    `).all(userId) as any[];
    const claimedSet = new Set(claimedReferees.map(r => r.referee_id));

    const unclaimedReferees = qualifiedReferees.filter(r => !claimedSet.has(r.id));
    const qualifiedCount = qualifiedReferees.length;
    const claimedCount = claimedSet.size;
    const unclaimedCount = unclaimedReferees.length;
    const availableRewardAmount = Number((unclaimedCount * REFERRAL_REWARD_AMOUNT).toFixed(2));

    return {
      referralCode,
      referralLink,
      totalInvited,
      qualifiedCount,
      claimedCount,
      unclaimedCount,
      availableRewardAmount,
      rewardPerReferral: REFERRAL_REWARD_AMOUNT
    };
  }

  public claimReferralRewards(userId: string): {
    success: boolean;
    rewardAmount: number;
    qualifiedClaimed: number;
    bonusBalance: number;
  } {
    // Find unclaimed qualified referees
    const qualifiedReferees = this.db.prepare(`
      SELECT u.id, u.username
      FROM users u
      JOIN deposit_requests dr ON dr.user_id = u.id AND dr.status = 'APPROVED'
      WHERE u.referred_by = ? AND u.id != ?
      GROUP BY u.id, u.username
    `).all(userId, userId) as any[];

    const claimedReferees = this.db.prepare(`
      SELECT referee_id FROM referral_reward_claims WHERE referrer_id = ?
    `).all(userId) as any[];
    const claimedSet = new Set(claimedReferees.map(r => r.referee_id));

    const unclaimedReferees = qualifiedReferees.filter(r => !claimedSet.has(r.id));

    if (unclaimedReferees.length === 0) {
      throw new Error('No unclaimed referral rewards available. Referred players must make a qualifying deposit first.');
    }

    const count = unclaimedReferees.length;
    const totalReward = Number((count * REFERRAL_REWARD_AMOUNT).toFixed(2));
    const now = new Date().toISOString();

    // 1. Insert into referral_reward_claims for each referee (UNIQUE constraint protects against duplicate referee claim)
    const insertClaimStmt = this.db.prepare(`
      INSERT INTO referral_reward_claims (id, referrer_id, referee_id, reward_amount, claimed_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    for (const ref of unclaimedReferees) {
      const claimRefId = `ref_claim_${userId}_${ref.id}`;
      insertClaimStmt.run(claimRefId, userId, ref.id, REFERRAL_REWARD_AMOUNT, now);
    }

    // 2. Increment wallet bonus_balance
    this.db.prepare(`
      UPDATE wallets
      SET bonus_balance = round(bonus_balance + ?, 2), updated_at = ?
      WHERE user_id = ?
    `).run(totalReward, now, userId);

    // 3. Record in reward_claims
    const claimId = `claim_ref_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    this.db.prepare(`
      INSERT INTO reward_claims (id, user_id, reward_type, reward_amount, details_json, claimed_at)
      VALUES (?, ?, 'REFERRAL', ?, ?, ?)
    `).run(claimId, userId, totalReward, JSON.stringify({
      qualifiedCount: count,
      refereeIds: unclaimedReferees.map(r => r.id),
      rewardPerReferral: REFERRAL_REWARD_AMOUNT
    }), now);

    // 4. Record financial ledger transaction
    const entryId = `tx_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const wallet = this.db.prepare('SELECT balance, bonus_balance FROM wallets WHERE user_id = ?').get(userId);
    const cashBal = wallet ? Number(wallet.balance) : 0;
    const bonusBal = wallet ? Number(wallet.bonus_balance) : 0;

    this.db.prepare(`
      INSERT INTO ledger_transactions (
        id, user_id, username, type, amount, balance_before, balance_after,
        reference_id, description, created_at
      ) VALUES (?, ?, 'Player', 'BONUS', ?, ?, ?, ?, ?, ?)
    `).run(
      entryId,
      userId,
      totalReward,
      cashBal,
      cashBal,
      `referral_reward_${claimId}`,
      `Referral Reward (${count} qualifying referred player deposit${count > 1 ? 's' : ''} @ ${REFERRAL_REWARD_AMOUNT} ETB)`,
      now
    );

    return {
      success: true,
      rewardAmount: totalReward,
      qualifiedClaimed: count,
      bonusBalance: bonusBal
    };
  }

  // =========================================================================
  // 4. REWARD SUMMARY & HISTORY
  // =========================================================================

  public getUserRewardsSummary(userId: string): UserRewardsSummary {
    const wallet = this.db.prepare('SELECT balance, bonus_balance FROM wallets WHERE user_id = ?').get(userId) as any;
    const cashBalance = wallet ? Number(wallet.balance) || 0 : 0;
    const bonusBalance = wallet ? Number(wallet.bonus_balance) || 0 : 0;

    const firstDeposit = this.getFirstDepositRewardStatus(userId);
    const roomRewards = this.getRoomPlayRewards(userId);
    const referralRewards = this.getReferralRewards(userId);
    const history = this.getRewardHistory(userId);

    return {
      bonusBalance,
      cashBalance,
      firstDeposit,
      roomRewards,
      referralRewards,
      history
    };
  }

  public getRewardHistory(userId: string): RewardHistoryItem[] {
    const claims = this.db.prepare(`
      SELECT * FROM reward_claims WHERE user_id = ? ORDER BY claimed_at DESC LIMIT 50
    `).all(userId) as any[];

    return claims.map(c => {
      let desc = '';
      try {
        const details = JSON.parse(c.details_json);
        if (c.reward_type === 'FIRST_DEPOSIT') {
          desc = `10% First Deposit Bonus (${details.depositAmount || 0} ETB deposit)`;
        } else if (c.reward_type === 'ROOM_PLAY') {
          desc = `${details.blocksClaimed || 1}x Milestone in ${details.roomName || details.roomId} (${details.cardPrice || 0} ETB)`;
        } else if (c.reward_type === 'REFERRAL') {
          desc = `Referral Bonus for ${details.qualifiedCount || 1} depositing player${(details.qualifiedCount || 1) > 1 ? 's' : ''}`;
        }
      } catch (_) {
        desc = `${c.reward_type} Reward`;
      }

      return {
        id: c.id,
        rewardType: c.reward_type,
        amount: Number(c.reward_amount),
        claimedAt: c.claimed_at,
        status: 'CLAIMED',
        description: desc
      };
    });
  }
}

