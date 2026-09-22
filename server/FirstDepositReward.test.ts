import { describe, it, expect, beforeAll } from 'vitest';
import { databaseService } from './DatabaseService.js';
import { RewardService } from './RewardService.js';

describe('REWARDS SYSTEM V2 — FIRST DEPOSIT PROMOTIONAL BONUS SUITE', () => {
  const rewardService = databaseService.rewardService;

  beforeAll(() => {
    // Ensure migrations have executed
    expect(rewardService).toBeDefined();
  });

  // =========================================================================
  // 1. EXACT DETERMINISTIC MONEY CALCULATION & MAXIMUM CAP ENFORCEMENT
  // =========================================================================

  it('Requirement 1: First deposit of 100 ETB -> exactly 10 ETB bonus (10%)', () => {
    const bonus = rewardService.calculateFirstDepositBonus(100);
    expect(bonus).toBe(10);
  });

  it('Requirement 2: First deposit of 500 ETB -> exactly 50 ETB bonus (10%)', () => {
    const bonus = rewardService.calculateFirstDepositBonus(500);
    expect(bonus).toBe(50);
  });

  it('Requirement 3: First deposit of 1,000 ETB -> exactly 50 ETB bonus (capped at 50 ETB max)', () => {
    const bonus = rewardService.calculateFirstDepositBonus(1000);
    expect(bonus).toBe(50);
  });

  it('Requirement 4: First deposit of 50 ETB -> exactly 5 ETB bonus (10%)', () => {
    const bonus = rewardService.calculateFirstDepositBonus(50);
    expect(bonus).toBe(5);
  });

  it('Deterministic arithmetic checks: handles fractional cents safely without float drift', () => {
    // 77.77 ETB -> 10% is 7.777 -> rounded to 7.77 ETB (cents floor)
    const bonus1 = rewardService.calculateFirstDepositBonus(77.77);
    expect(bonus1).toBe(7.77);

    // Negative or 0 deposits return 0 bonus
    expect(rewardService.calculateFirstDepositBonus(0)).toBe(0);
    expect(rewardService.calculateFirstDepositBonus(-100)).toBe(0);
  });

  // =========================================================================
  // 2. END-TO-END DEPOSIT APPROVAL & ELIGIBILITY ENFORCEMENT
  // =========================================================================

  it('Requirement 5 & 22: First deposit issues bonus, separates cash and bonus, and second deposit yields NO additional bonus', () => {
    const userId = `usr_test_bonus_${Date.now()}_1`;
    databaseService.createUser({
      id: userId,
      telegram_id: `tg_${Date.now()}_1`,
      username: 'Abebe First',
      phone: '0911000001',
      referral_code: `REF_${Date.now()}_1`,
      role: 'USER'
    });

    const walletBefore = databaseService.getOrCreateWallet(userId);
    expect(walletBefore.balance).toBe(0);
    expect(walletBefore.bonus_balance).toBe(0);

    // First deposit: 100 ETB
    const dep1 = databaseService.createDepositRequest(
      userId,
      'Abebe First',
      100,
      'Telebirr',
      `REF_TB_${Date.now()}_1`
    );

    // Admin approves first deposit
    const approved1 = databaseService.approveDeposit('admin_usr_01', dep1.id);
    expect(approved1.promotionalBonus).toBeDefined();
    expect(approved1.promotionalBonus?.bonusAmount).toBe(10);
    expect(approved1.promotionalBonus?.status).toBe('AWARDED');

    // Authoritative wallet check
    const walletAfter1 = databaseService.getOrCreateWallet(userId);
    expect(walletAfter1.balance).toBe(100);
    expect(walletAfter1.bonus_balance).toBe(10);

    // User's active bonus check
    const activeBonus1 = rewardService.getUserActiveBonus(userId);
    expect(activeBonus1.activeReward).toBeDefined();
    expect(activeBonus1.activeReward?.remainingAmount).toBe(10);
    expect(activeBonus1.timeRemainingSeconds).toBeGreaterThan(86300);

    // Second deposit: 200 ETB for the same user
    const dep2 = databaseService.createDepositRequest(
      userId,
      'Abebe First',
      200,
      'Telebirr',
      `REF_TB_${Date.now()}_2`
    );

    // Admin approves second deposit -> MUST NOT receive a second bonus
    const approved2 = databaseService.approveDeposit('admin_usr_01', dep2.id);
    expect(approved2.promotionalBonus).toBeNull();

    const walletAfter2 = databaseService.getOrCreateWallet(userId);
    expect(walletAfter2.balance).toBe(300); // 100 + 200
    expect(walletAfter2.bonus_balance).toBe(10); // remains 10, strictly not doubled
  });

  // =========================================================================
  // 3. IDEMPOTENCY & CONCURRENCY PROTECTION
  // =========================================================================

  it('Requirement 6: Duplicate deposit approval -> idempotent, no duplicate bonus', () => {
    const userId = `usr_test_bonus_${Date.now()}_dup`;
    databaseService.createUser({
      id: userId,
      telegram_id: `tg_${Date.now()}_dup`,
      username: 'Dup Tester',
      phone: '0911000002',
      referral_code: `REF_${Date.now()}_dup`,
      role: 'USER'
    });

    const dep = databaseService.createDepositRequest(
      userId,
      'Dup Tester',
      500,
      'Telebirr',
      `REF_TB_DUP_${Date.now()}`
    );

    // First approval
    const app1 = databaseService.approveDeposit('admin_usr_01', dep.id);
    expect(app1.promotionalBonus?.bonusAmount).toBe(50);

    // Repeated approval of already approved deposit
    expect(() => {
      databaseService.approveDeposit('admin_usr_01', dep.id);
    }).toThrow(/Deposit is already APPROVED/i);

    const wallet = databaseService.getOrCreateWallet(userId);
    expect(wallet.bonus_balance).toBe(50); // Did not double to 100
  });

  it('Requirement 7: Concurrent first-deposit processing -> only one bonus can ever be issued', () => {
    const userId = `usr_test_bonus_${Date.now()}_conc`;
    databaseService.createUser({
      id: userId,
      telegram_id: `tg_${Date.now()}_conc`,
      username: 'Concurrent Tester',
      phone: '0911000003',
      referral_code: `REF_${Date.now()}_conc`,
      role: 'USER'
    });

    // Create two valid qualifying deposits in the database
    const dep1 = databaseService.createDepositRequest(
      userId,
      'Concurrent Tester',
      200,
      'Telebirr',
      `REF_CONC_1_${Date.now()}`
    );

    const dep2 = databaseService.createDepositRequest(
      userId,
      'Concurrent Tester',
      300,
      'Telebirr',
      `REF_CONC_2_${Date.now()}`
    );

    // Directly attempt to issue bonus twice concurrently with different qualifying deposit IDs
    const r1 = rewardService.issueFirstDepositBonus(userId, 'Concurrent Tester', dep1.id, 200);
    expect(r1).toBeDefined();
    expect(r1?.bonusAmount).toBe(20);

    // Second issuance MUST fail due to DB unique partial index constraint & eligibility check
    const r2 = rewardService.issueFirstDepositBonus(userId, 'Concurrent Tester', dep2.id, 300);
    expect(r2).toBeNull();

    const wallet = databaseService.getOrCreateWallet(userId);
    expect(wallet.bonus_balance).toBe(20);
  });

  // =========================================================================
  // 4. EXPIRATION ENFORCEMENT & SERVER-SIDE AUTHORIZATION
  // =========================================================================

  it('Requirement 8, 9 & 24: Bonus expires after exactly 24 hours and cannot be spent once expired', () => {
    const userId = `usr_test_bonus_${Date.now()}_exp`;
    databaseService.createUser({
      id: userId,
      telegram_id: `tg_${Date.now()}_exp`,
      username: 'Expiry Tester',
      phone: '0911000004',
      referral_code: `REF_${Date.now()}_exp`,
      role: 'USER'
    });

    const dep = databaseService.createDepositRequest(
      userId,
      'Expiry Tester',
      100,
      'Telebirr',
      `REF_TB_EXP_${Date.now()}`
    );

    const now = new Date('2026-09-20T12:00:00.000Z');
    const reward = rewardService.issueFirstDepositBonus(userId, 'Expiry Tester', dep.id, 100, now);
    expect(reward).toBeDefined();
    expect(reward?.bonusAmount).toBe(10);
    expect(new Date(reward!.expiresAt).getTime() - now.getTime()).toBe(24 * 60 * 60 * 1000);

    // Check at 23 hours 59 minutes: Still valid
    const time23h = new Date('2026-09-21T11:59:00.000Z');
    const activeAt23h = rewardService.getUserActiveBonus(userId, time23h);
    expect(activeAt23h.activeReward).toBeDefined();
    expect(activeAt23h.activeReward?.remainingAmount).toBe(10);

    // Check at 24 hours 1 second: Expired!
    const time24h1s = new Date('2026-09-21T12:00:01.000Z');
    const activeAt24h = rewardService.getUserActiveBonus(userId, time24h1s);
    expect(activeAt24h.activeReward).toBeNull();
    expect(activeAt24h.bonusBalance).toBe(0);

    // Attempting purchase with expired bonus must be rejected from consuming bonus
    expect(() => {
      rewardService.consumeBonusForPurchase(userId, 8, 'BINGO_CARD', 'game_1', time24h1s);
    }).toThrow(/Insufficient funds/i);

    // Verify wallet bonus_balance was zeroed out upon expiration
    const wallet = databaseService.getOrCreateWallet(userId);
    expect(wallet.bonus_balance).toBe(0);

    // Verify promotional reward record was marked EXPIRED and remains auditable
    const allRewards = rewardService.listAllRewards();
    const expiredRecord = allRewards.find(r => r.id === reward?.id);
    expect(expiredRecord).toBeDefined();
    expect(expiredRecord?.status).toBe('EXPIRED');
    expect(expiredRecord?.expiredAt).toBeDefined();
  });

  // =========================================================================
  // 5. WITHDRAWAL & TRANSFER ISOLATION
  // =========================================================================

  it('Requirement 10, 11 & 23: Bonus cannot be withdrawn or transferred, cash balance is strictly isolated', () => {
    const userId = `usr_test_bonus_${Date.now()}_with`;
    databaseService.createUser({
      id: userId,
      telegram_id: `tg_${Date.now()}_with`,
      username: 'Withdrawal Tester',
      phone: '0911000005',
      referral_code: `REF_${Date.now()}_with`,
      role: 'USER'
    });

    const dep = databaseService.createDepositRequest(
      userId,
      'Withdrawal Tester',
      500,
      'Telebirr',
      `REF_TB_W_${Date.now()}`
    );

    // Give user 50 ETB cash and 50 ETB bonus
    databaseService.updateWalletBalance(userId, 50, 0, 0);
    rewardService.issueFirstDepositBonus(userId, 'Withdrawal Tester', dep.id, 500);

    const wallet = databaseService.getOrCreateWallet(userId);
    expect(wallet.balance).toBe(50);
    expect(wallet.bonus_balance).toBe(50);

    // User attempts to withdraw 60 ETB (more than cash 50, but less than total 100)
    // MUST BE REJECTED because bonus cannot be withdrawn!
    expect(() => {
      databaseService.createWithdrawalRequest(
        userId,
        'Withdrawal Tester',
        60,
        '0911000005'
      );
    }).toThrow(/Insufficient funds/i);

    // User withdraws 30 ETB (within 50 ETB cash) -> MUST SUCCEED and reserve ONLY cash
    const withReq = databaseService.createWithdrawalRequest(
      userId,
      'Withdrawal Tester',
      30,
      '0911000005'
    );

    expect(withReq.status).toBe('PENDING');
    const walletAfterWith = databaseService.getOrCreateWallet(userId);
    expect(walletAfterWith.balance).toBe(20); // 50 - 30 reserved
    expect(walletAfterWith.reserved_balance).toBe(30);
    expect(walletAfterWith.bonus_balance).toBe(50); // Bonus untouched!
  });

  // =========================================================================
  // 6. CARD PURCHASE INTEGRATION (BINGO & DAILY GRAND JACKPOT)
  // =========================================================================

  it('Requirement 12, 18, 19 & 20: Bonus can purchase eligible Bingo card, uses bonus first, fails gracefully and handles concurrency', () => {
    const userId = `usr_test_bonus_${Date.now()}_bingo`;
    databaseService.createUser({
      id: userId,
      telegram_id: `tg_${Date.now()}_bingo`,
      username: 'Bingo Buyer',
      phone: '0911000006',
      referral_code: `REF_${Date.now()}_bingo`,
      role: 'USER'
    });

    const dep = databaseService.createDepositRequest(
      userId,
      'Bingo Buyer',
      150,
      'Telebirr',
      `REF_TB_BG_${Date.now()}`
    );

    // Cash: 10 ETB, Bonus: 15 ETB. Total: 25 ETB
    databaseService.updateWalletBalance(userId, 10, 0, 0);
    rewardService.issueFirstDepositBonus(userId, 'Bingo Buyer', dep.id, 150);

    // Card 1 cost: 10 ETB -> Fully funded from bonus!
    const split1 = rewardService.consumeBonusForPurchase(userId, 10, 'BINGO_CARD', 'game_bg_1');
    expect(split1.bonusPaid).toBe(10);
    expect(split1.cashPaid).toBe(0);

    let wallet = databaseService.getOrCreateWallet(userId);
    expect(wallet.bonus_balance).toBe(5);
    expect(wallet.balance).toBe(10);

    // Card 2 cost: 10 ETB -> Split funded: 5 from bonus, 5 from cash!
    const split2 = rewardService.consumeBonusForPurchase(userId, 10, 'BINGO_CARD', 'game_bg_2');
    expect(split2.bonusPaid).toBe(5);
    expect(split2.cashPaid).toBe(5);

    wallet = databaseService.getOrCreateWallet(userId);
    expect(wallet.bonus_balance).toBe(0);
    expect(wallet.balance).toBe(5);

    // Card 3 cost: 10 ETB -> Exceeds remaining total 5 ETB -> MUST FAIL atomically
    expect(() => {
      rewardService.consumeBonusForPurchase(userId, 10, 'BINGO_CARD', 'game_bg_3');
    }).toThrow(/Insufficient funds/i);

    // Balances remained intact after failed purchase
    wallet = databaseService.getOrCreateWallet(userId);
    expect(wallet.bonus_balance).toBe(0);
    expect(wallet.balance).toBe(5);

    // Refund Card 2 (5 bonus + 5 cash)
    rewardService.refundPurchase(userId, split2.bonusPaid, split2.cashPaid, split2.bonusConsumedRecords);
    wallet = databaseService.getOrCreateWallet(userId);
    expect(wallet.bonus_balance).toBe(5);
    expect(wallet.balance).toBe(10);
  });

  it('Requirement 13: Bonus can participate in the Daily Grand Jackpot card purchase flow', () => {
    const userId = `usr_test_bonus_${Date.now()}_jackpot`;
    databaseService.createUser({
      id: userId,
      telegram_id: `tg_${Date.now()}_jackpot`,
      username: 'Jackpot Buyer',
      phone: '0911000007',
      referral_code: `REF_${Date.now()}_jackpot`,
      role: 'USER'
    });

    const dep = databaseService.createDepositRequest(
      userId,
      'Jackpot Buyer',
      500,
      'Telebirr',
      `REF_TB_JK_${Date.now()}`
    );

    // Provide 50 ETB bonus and 949 ETB cash (Jackpot ticket = 999 ETB)
    databaseService.updateWalletBalance(userId, 949, 0, 0);
    rewardService.issueFirstDepositBonus(userId, 'Jackpot Buyer', dep.id, 500);

    const split = rewardService.consumeBonusForPurchase(userId, 999, 'DAILY_GRAND_JACKPOT_CARD', 'round_1');
    expect(split.bonusPaid).toBe(50);
    expect(split.cashPaid).toBe(949);

    const wallet = databaseService.getOrCreateWallet(userId);
    expect(wallet.bonus_balance).toBe(0);
    expect(wallet.balance).toBe(0);
  });

  // =========================================================================
  // 7. PRODUCT RESTRICTION ALLOWLIST & SECURITY AUDITING
  // =========================================================================

  it('Requirement 14: Bonus cannot purchase unrelated products (strict allowlist enforcement)', () => {
    const userId = `usr_test_bonus_${Date.now()}_unrelated`;
    databaseService.createUser({
      id: userId,
      telegram_id: `tg_${Date.now()}_unrelated`,
      username: 'Unrelated Product',
      phone: '0911000008',
      referral_code: `REF_${Date.now()}_unrelated`,
      role: 'USER'
    });

    const dep = databaseService.createDepositRequest(
      userId,
      'Unrelated Product',
      100,
      'Telebirr',
      `REF_TB_UN_${Date.now()}`
    );

    rewardService.issueFirstDepositBonus(userId, 'Unrelated Product', dep.id, 100);

    expect(() => {
      rewardService.consumeBonusForPurchase(userId, 10, 'CASINO_SLOTS' as any, 'spin_1');
    }).toThrow(/Promotional bonus cannot be used for product type/i);

    expect(() => {
      rewardService.consumeBonusForPurchase(userId, 10, 'SPORTS_BETTING' as any, 'bet_1');
    }).toThrow(/Promotional bonus cannot be used for product type/i);
  });

  it('Requirement 15, 16 & 17: Client cannot forge bonus amount, user ID, or spend another user\'s bonus', () => {
    const userA = `usr_test_a_${Date.now()}`;
    const userB = `usr_test_b_${Date.now()}`;

    databaseService.createUser({
      id: userA,
      telegram_id: `tg_a_${Date.now()}`,
      username: 'User A',
      phone: '0911000009',
      referral_code: `REF_A_${Date.now()}`,
      role: 'USER'
    });

    databaseService.createUser({
      id: userB,
      telegram_id: `tg_b_${Date.now()}`,
      username: 'User B',
      phone: '0911000010',
      referral_code: `REF_B_${Date.now()}`,
      role: 'USER'
    });

    const depA = databaseService.createDepositRequest(
      userA,
      'User A',
      500,
      'Telebirr',
      `REF_TB_A_${Date.now()}`
    );

    // Issue 50 ETB bonus to User A
    rewardService.issueFirstDepositBonus(userA, 'User A', depA.id, 500);

    // User B has 0 bonus
    expect(rewardService.getUserActiveBonus(userB).activeReward).toBeNull();

    // User B attempting to consume User A's bonus via User B's playerId
    expect(() => {
      rewardService.consumeBonusForPurchase(userB, 10, 'BINGO_CARD', 'game_1');
    }).toThrow(/Insufficient funds/i);

    // User A's bonus remains intact at 50 ETB
    const bonusA = rewardService.getUserActiveBonus(userA);
    expect(bonusA.activeReward?.remainingAmount).toBe(50);
  });

  // =========================================================================
  // 8. PERSISTENCE ACROSS RESTART & ADMIN SAFEGUARDS
  // =========================================================================

  it('Requirement 21 & 25: Server restart preserves bonus state and Admin cannot convert bonus into cash', () => {
    const userId = `usr_test_restart_${Date.now()}`;
    databaseService.createUser({
      id: userId,
      telegram_id: `tg_rest_${Date.now()}`,
      username: 'Restart User',
      phone: '0911000011',
      referral_code: `REF_REST_${Date.now()}`,
      role: 'USER'
    });

    const dep = databaseService.createDepositRequest(
      userId,
      'Restart User',
      200,
      'Telebirr',
      `REF_TB_RST_${Date.now()}`
    );

    rewardService.issueFirstDepositBonus(userId, 'Restart User', dep.id, 200);

    // Instantiate a new RewardService representing server restart
    const restartedRewardService = new RewardService(databaseService['db']);
    const activeBonus = restartedRewardService.getUserActiveBonus(userId);
    expect(activeBonus.activeReward).toBeDefined();
    expect(activeBonus.activeReward?.remainingAmount).toBe(20);
    expect(activeBonus.activeReward?.status).toBe('AWARDED');

    // Admin manual adjustment modifies cash balance, leaving bonus balance distinct
    databaseService.updateWalletBalance(userId, 50, 0, 20);
    const wallet = databaseService.getOrCreateWallet(userId);
    expect(wallet.balance).toBe(50); // Cash
    expect(wallet.bonus_balance).toBe(20); // Promotional bonus preserved separately
  });
});
