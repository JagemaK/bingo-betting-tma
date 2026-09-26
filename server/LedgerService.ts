import crypto from 'crypto';
import { databaseService, LedgerRow, DepositRow, WithdrawalRow, AuditRow } from './DatabaseService.js';

export type UserRole = 'USER' | 'AGENT' | 'SUPER_ADMIN' | 'ADMIN';
export type AccountStatus = 'ACTIVE' | 'SUSPENDED' | 'BANNED' | 'DEACTIVATED' | 'DELETION_REQUESTED' | 'DELETED';

export interface UserAccount {
  id?: string;
  playerId: string;
  telegram_id?: string;
  telegramId?: string;
  username: string;
  walletBalance: number;
  reservedBalance?: number;
  bonusBalance?: number;
  totalPlayableBalance?: number;
  avatarUrl?: string;
  isBot?: boolean;
  registration_status?: string;
  role?: UserRole;
  account_status?: AccountStatus;
  account_type?: 'REAL' | 'GUEST' | 'BOT' | 'TEST' | 'ADMIN' | 'AGENT';
  phone?: string;
  telebirrNumber?: string;
  assignedAgentName?: string;
}

export type LedgerTransactionType =
  | 'deposit'
  | 'buy_in'
  | 'win_payout'
  | 'withdrawal'
  | 'refund'
  | 'bonus'
  | 'loss'
  | 'adjustment'
  | 'escrow_hold';

export interface LedgerEntry {
  id: string;
  playerId: string;
  username: string;
  type: LedgerTransactionType;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  gameId?: string;
  ticketId?: string;
  referenceId?: string;
  description: string;
  timestamp: string;
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

export interface AuditLogRecord {
  id: string;
  admin_user_id: string;
  action: string;
  target_user_id: string;
  target_record_id: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

export class LedgerService {
  /**
   * Helper to map database type to legacy type
   */
  private mapDbToLegacyType(t: LedgerRow['type']): LedgerTransactionType {
    switch (t) {
      case 'DEPOSIT': return 'deposit';
      case 'BET': return 'buy_in';
      case 'WIN_PAYOUT': return 'win_payout';
      case 'WITHDRAWAL': return 'withdrawal';
      case 'REFUND': return 'refund';
      case 'BONUS': return 'bonus';
      case 'LOSS': return 'loss';
      case 'ADMIN_ADJUSTMENT': return 'adjustment';
      case 'ESCROW_HOLD': return 'escrow_hold';
      default: return 'adjustment';
    }
  }

  private mapLegacyToDbType(t: LedgerTransactionType): LedgerRow['type'] {
    switch (t) {
      case 'deposit': return 'DEPOSIT';
      case 'buy_in': return 'BET';
      case 'win_payout': return 'WIN_PAYOUT';
      case 'withdrawal': return 'WITHDRAWAL';
      case 'refund': return 'REFUND';
      case 'bonus': return 'BONUS';
      case 'loss': return 'LOSS';
      case 'adjustment': return 'ADMIN_ADJUSTMENT';
      case 'escrow_hold': return 'ESCROW_HOLD';
      default: return 'ADMIN_ADJUSTMENT';
    }
  }

  public getUser(playerId: string): UserAccount | undefined {
    const userRow = databaseService.getUserById(playerId);
    if (!userRow) return undefined;

    const wallet = databaseService.getOrCreateWallet(playerId);
    const bonusBalance = wallet.bonus_balance || 0.0;
    const totalPlayableBalance = Number(((wallet.balance || 0) + bonusBalance).toFixed(2));
    return {
      id: userRow.id,
      playerId: userRow.id,
      telegram_id: userRow.telegram_id,
      telegramId: userRow.telegram_id,
      username: userRow.username,
      walletBalance: wallet.balance,
      reservedBalance: wallet.reserved_balance,
      bonusBalance,
      totalPlayableBalance,
      avatarUrl: userRow.avatar_url,
      isBot: Boolean(userRow.is_bot),
      account_type: userRow.account_type || 'REAL',
      registration_status: userRow.registration_status,
      role: userRow.role,
      account_status: userRow.account_status,
      phone: userRow.phone
    };
  }

  public getOrCreateUser(
    playerId: string,
    username: string,
    avatarUrl?: string,
    role: UserRole = 'USER',
    initialBalance: number = 0.00,
    accountType?: 'REAL' | 'GUEST' | 'BOT' | 'TEST' | 'ADMIN'
  ): UserAccount {
    let existing = this.getUser(playerId);
    if (existing) {
      return existing;
    }

    // Create user in database
    const telegramId = playerId.startsWith('tg_') ? playerId.substring(3) : playerId;
    const refCode = `REF_${username.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 5)}_${crypto.randomInt(100, 1000)}`;
    const effectiveType = accountType || (role === 'ADMIN' ? 'ADMIN' : (playerId.startsWith('usr_000') ? 'BOT' : (playerId.startsWith('usr_e2e_') ? 'TEST' : (username.startsWith('Player_') ? 'GUEST' : 'REAL'))));

    try {
      databaseService.createUser({
        id: playerId,
        telegram_id: telegramId,
        username,
        referral_code: refCode,
        role,
        avatar_url: avatarUrl,
        account_type: effectiveType,
        is_bot: effectiveType === 'BOT'
      });

      if (initialBalance > 0) {
        databaseService.recordLedgerTransaction({
          userId: playerId,
          username,
          type: 'BONUS',
          amount: initialBalance,
          description: 'Welcome Sign-Up Bonus',
          referenceId: `bonus_welcome_${playerId}`
        });
      }
    } catch (e) {
      // If user was created concurrently, return existing
      const retry = this.getUser(playerId);
      if (retry) return retry;
    }

    return this.getUser(playerId)!;
  }

  /**
   * Record a financial transaction with full ACID serialization and idempotency
   */
  public async recordTransaction(
    playerId: string,
    type: LedgerTransactionType,
    amount: number,
    description: string,
    gameId?: string,
    ticketId?: string,
    referenceId?: string
  ): Promise<LedgerEntry> {
    const user = this.getUser(playerId);
    if (!user) throw new Error(`User ${playerId} not found`);

    const dbType = this.mapLegacyToDbType(type);
    const { entry } = databaseService.recordLedgerTransaction({
      userId: playerId,
      username: user.username,
      type: dbType,
      amount,
      description,
      gameId,
      ticketId,
      referenceId
    });

    return {
      id: entry.id,
      playerId: entry.user_id,
      username: entry.username,
      type: this.mapDbToLegacyType(entry.type),
      amount: entry.amount,
      balanceBefore: entry.balance_before,
      balanceAfter: entry.balance_after,
      gameId: entry.game_id,
      ticketId: entry.ticket_id,
      referenceId: entry.reference_id,
      description: entry.description,
      timestamp: entry.created_at
    };
  }

  public async updateBalance(playerId: string, delta: number, description: string): Promise<UserAccount> {
    const user = this.getUser(playerId);
    if (!user) throw new Error(`User ${playerId} not found`);

    if (delta > 0) {
      await this.recordTransaction(playerId, 'adjustment', delta, description);
    } else if (delta < 0) {
      await this.recordTransaction(playerId, 'loss', Math.abs(delta), description);
    }

    return this.getUser(playerId)!;
  }

  // ==================== DEPOSITS (STRICT ADMIN APPROVAL) ====================

  public createDepositRequest(
    playerId: string,
    username: string,
    amount: number,
    paymentMethod: string = 'Telebirr',
    referenceId?: string
  ): DepositRequest {
    const row = databaseService.createDepositRequest(playerId, username, amount, paymentMethod, referenceId);
    return {
      id: row.id,
      playerId: row.user_id,
      username: row.username,
      amount: row.amount,
      paymentMethod: row.payment_method,
      status: row.status,
      referenceId: row.reference_id,
      createdAt: row.created_at,
      processedAt: row.processed_at,
      processedBy: row.processed_by,
      rejectionReason: row.rejection_reason,
      paymentAccountId: row.payment_account_id,
      paymentPhone: row.payment_phone,
      assignedAgentId: row.assigned_agent_id
    };
  }

  public getDepositRequests(status?: string): DepositRequest[] {
    const rows = databaseService.getDepositRequests(status);
    return rows.map(r => ({
      id: r.id,
      playerId: r.user_id,
      username: r.username,
      amount: r.amount,
      paymentMethod: r.payment_method,
      status: r.status,
      referenceId: r.reference_id,
      createdAt: r.created_at,
      processedAt: r.processed_at,
      processedBy: r.processed_by,
      rejectionReason: r.rejection_reason,
      paymentAccountId: r.payment_account_id,
      paymentPhone: r.payment_phone,
      assignedAgentId: r.assigned_agent_id,
      customerPhone: (r as any).customer_phone
    }));
  }

  public async approveDeposit(
    adminId: string,
    depositId: string
  ): Promise<{ deposit: DepositRequest; entry: LedgerEntry; promotionalBonus?: any }> {
    const { deposit, entry, promotionalBonus } = databaseService.approveDeposit(adminId, depositId);
    return {
      deposit: {
        id: deposit.id,
        playerId: deposit.user_id,
        username: deposit.username,
        amount: deposit.amount,
        paymentMethod: deposit.payment_method,
        status: deposit.status,
        referenceId: deposit.reference_id,
        createdAt: deposit.created_at,
        processedAt: deposit.processed_at,
        processedBy: deposit.processed_by,
        rejectionReason: deposit.rejection_reason,
        paymentAccountId: deposit.payment_account_id,
        paymentPhone: deposit.payment_phone,
        assignedAgentId: deposit.assigned_agent_id,
        customerPhone: (deposit as any).customer_phone
      },
      entry: {
        id: entry.id,
        playerId: entry.user_id,
        username: entry.username,
        type: this.mapDbToLegacyType(entry.type),
        amount: entry.amount,
        balanceBefore: entry.balance_before,
        balanceAfter: entry.balance_after,
        referenceId: entry.reference_id,
        description: entry.description,
        timestamp: entry.created_at
      },
      promotionalBonus
    };
  }

  public rejectDeposit(adminId: string, depositId: string, reason?: string): DepositRequest {
    const deposit = databaseService.rejectDeposit(adminId, depositId, reason);
    return {
      id: deposit.id,
      playerId: deposit.user_id,
      username: deposit.username,
      amount: deposit.amount,
      paymentMethod: deposit.payment_method,
      status: deposit.status,
      referenceId: deposit.reference_id,
      createdAt: deposit.created_at,
      processedAt: deposit.processed_at,
      processedBy: deposit.processed_by,
      rejectionReason: deposit.rejection_reason,
      paymentAccountId: deposit.payment_account_id,
      paymentPhone: deposit.payment_phone,
      assignedAgentId: deposit.assigned_agent_id,
      customerPhone: (deposit as any).customer_phone
    };
  }

  // ==================== WITHDRAWALS (RESERVED BALANCE HOLD) ====================

  public createWithdrawalRequest(
    playerId: string,
    username: string,
    amount: number,
    address: string
  ): WithdrawalRequest {
    const row = databaseService.createWithdrawalRequest(playerId, username, amount, address);
    return {
      id: row.id,
      playerId: row.user_id,
      username: row.username,
      amount: row.amount,
      address: row.address,
      status: row.status as any,
      referenceId: row.reference_id,
      createdAt: row.created_at,
      processedAt: row.processed_at,
      processedBy: row.processed_by,
      rejectionReason: row.rejection_reason,
      assignedAgentId: row.assigned_agent_id
    };
  }

  public getWithdrawalRequests(status?: string): WithdrawalRequest[] {
    const rows = databaseService.getWithdrawalRequests(status);
    return rows.map(r => ({
      id: r.id,
      playerId: r.user_id,
      username: r.username,
      amount: r.amount,
      address: r.address,
      status: r.status as any,
      referenceId: r.reference_id,
      createdAt: r.created_at,
      processedAt: r.processed_at,
      processedBy: r.processed_by,
      rejectionReason: r.rejection_reason,
      assignedAgentId: r.assigned_agent_id,
      customerPhone: (r as any).customer_phone
    }));
  }

  public async approveWithdrawal(
    adminId: string,
    withdrawalId: string
  ): Promise<{ withdrawal: WithdrawalRequest; entry: LedgerEntry }> {
    const { withdrawal, entry } = databaseService.approveWithdrawal(adminId, withdrawalId);
    return {
      withdrawal: {
        id: withdrawal.id,
        playerId: withdrawal.user_id,
        username: withdrawal.username,
        amount: withdrawal.amount,
        address: withdrawal.address,
        status: withdrawal.status as any,
        referenceId: withdrawal.reference_id,
        createdAt: withdrawal.created_at,
        processedAt: withdrawal.processed_at,
        processedBy: withdrawal.processed_by,
        rejectionReason: withdrawal.rejection_reason,
        assignedAgentId: withdrawal.assigned_agent_id,
        customerPhone: (withdrawal as any).customer_phone
      },
      entry: {
        id: entry.id,
        playerId: entry.user_id,
        username: entry.username,
        type: this.mapDbToLegacyType(entry.type),
        amount: entry.amount,
        balanceBefore: entry.balance_before,
        balanceAfter: entry.balance_after,
        referenceId: entry.reference_id,
        description: entry.description,
        timestamp: entry.created_at
      }
    };
  }

  public rejectWithdrawal(adminId: string, withdrawalId: string, reason?: string): WithdrawalRequest {
    const withdrawal = databaseService.rejectWithdrawal(adminId, withdrawalId, reason);
    return {
      id: withdrawal.id,
      playerId: withdrawal.user_id,
      username: withdrawal.username,
      amount: withdrawal.amount,
      address: withdrawal.address,
      status: withdrawal.status as any,
      referenceId: withdrawal.reference_id,
      createdAt: withdrawal.created_at,
      processedAt: withdrawal.processed_at,
      processedBy: withdrawal.processed_by,
      rejectionReason: withdrawal.rejection_reason,
      assignedAgentId: withdrawal.assigned_agent_id,
      customerPhone: (withdrawal as any).customer_phone
    };
  }

  // ==================== LEDGER QUERIES ====================

  public getLedgerForUser(playerId: string): LedgerEntry[] {
    const rows = databaseService.getLedgerForUser(playerId);
    return rows.map(r => ({
      id: r.id,
      playerId: r.user_id,
      username: r.username,
      type: this.mapDbToLegacyType(r.type),
      amount: r.amount,
      balanceBefore: r.balance_before,
      balanceAfter: r.balance_after,
      gameId: r.game_id,
      ticketId: r.ticket_id,
      referenceId: r.reference_id,
      description: r.description,
      timestamp: r.created_at
    }));
  }

  public getAllTransactions(): LedgerEntry[] {
    const rows = databaseService.getAllLedgerTransactions();
    return rows.map(r => ({
      id: r.id,
      playerId: r.user_id,
      username: r.username,
      type: this.mapDbToLegacyType(r.type),
      amount: r.amount,
      balanceBefore: r.balance_before,
      balanceAfter: r.balance_after,
      gameId: r.game_id,
      ticketId: r.ticket_id,
      referenceId: r.reference_id,
      description: r.description,
      timestamp: r.created_at
    }));
  }

  public getAllLedgerEntries(): LedgerEntry[] {
    return this.getAllTransactions();
  }

  public async manualBalanceAdjustment(
    adminId: string,
    targetPlayerId: string,
    amount: number,
    reason: string
  ): Promise<{ user: UserAccount; entry: LedgerEntry }> {
    if (typeof amount !== 'number' || !Number.isFinite(amount) || Number.isNaN(amount)) {
      throw new Error('Adjustment amount must be a valid finite number');
    }
    const cleanAmount = Math.round(amount * 100) / 100;
    if (cleanAmount === 0) {
      throw new Error('Adjustment amount cannot be zero');
    }

    const user = this.getUser(targetPlayerId);
    if (!user) throw new Error('Target user not found');

    if (adminId && targetPlayerId && String(adminId).trim() === String(targetPlayerId).trim()) {
      throw new Error('Self-adjustment forbidden: Cannot adjust your own balance');
    }

    const entry = await this.recordTransaction(
      targetPlayerId,
      'adjustment',
      cleanAmount,
      `Manual Balance Adjustment by Admin (${reason})`,
      undefined,
      undefined,
      `adj_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`
    );

    this.recordAuditLog(
      adminId,
      'BALANCE_ADJUSTMENT',
      targetPlayerId,
      entry.id,
      { amount, reason }
    );

    const updatedUser = this.getUser(targetPlayerId)!;
    return { user: updatedUser, entry };
  }

  // ==================== AUDIT LOGS ====================

  public recordAuditLog(
    adminId: string,
    action: string,
    targetUserId: string,
    targetRecordId: string,
    metadata?: Record<string, any>
  ): AuditLogRecord {
    const row = databaseService.recordAuditLog({
      adminUserId: adminId,
      action,
      targetUserId,
      targetRecordId,
      metadata
    });

    return {
      id: row.id,
      admin_user_id: row.admin_user_id,
      action: row.action,
      target_user_id: row.target_user_id || '',
      target_record_id: row.target_record_id || '',
      timestamp: row.timestamp,
      metadata
    };
  }

  public getAuditLogs(limit?: number): AuditLogRecord[] {
    const rows = databaseService.getAuditLogs();
    const sliced = limit && limit > 0 ? rows.slice(0, limit) : rows;
    return sliced.map(r => ({
      id: r.id,
      admin_user_id: r.admin_user_id,
      action: r.action,
      target_user_id: r.target_user_id || '',
      target_record_id: r.target_record_id || '',
      timestamp: r.timestamp,
      metadata: r.metadata_json ? JSON.parse(r.metadata_json) : undefined
    }));
  }
}

export const ledgerService = new LedgerService();
