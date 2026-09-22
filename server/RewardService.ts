import crypto from 'crypto';

export const BONUS_PERCENTAGE = 10.0;
export const MAX_FIRST_DEPOSIT_BONUS = 50.0; // 50.00 ETB
export const BONUS_EXPIRATION_HOURS = 24;
export const BONUS_ALLOWED_PURCHASES = ['BINGO_CARD', 'DAILY_GRAND_JACKPOT_CARD'] as const;
export type BonusAllowedPurchase = typeof BONUS_ALLOWED_PURCHASES[number];

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

  constructor(dbInstance: any) {
    this.db = dbInstance;
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
}
