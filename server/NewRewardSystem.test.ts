import { describe, it, expect, beforeAll } from 'vitest';
import { databaseService } from './DatabaseService.js';
import { RewardService } from './RewardService.js';

describe('AUTHORITATIVE NEW REWARDS SYSTEM SUITE (3 REWARD TYPES)', () => {
  const rewardService: RewardService = databaseService.rewardService;

  beforeAll(() => {
    expect(rewardService).toBeDefined();
    // Register test rooms
    rewardService.registerRoomConfig({ roomId: 'room_10birr', roomName: 'Starter Lounge', cardPrice: 10 });
    rewardService.registerRoomConfig({ roomId: 'room_20birr', roomName: 'Bronze Room', cardPrice: 20 });
    rewardService.registerRoomConfig({ roomId: 'room_50birr', roomName: 'Gold Arena', cardPrice: 50 });
    rewardService.registerRoomConfig({ roomId: 'room_100birr', roomName: 'Diamond High-Roller', cardPrice: 100 });
    rewardService.registerRoomConfig({ roomId: 'room_500birr', roomName: 'VIP Grand Arena', cardPrice: 500 });
  });

  // =========================================================================
  // 1. FIRST DEPOSIT REWARD (10% MAX 50 ETB, ONE-TIME ONLY)
  // =========================================================================
  describe('1. First Deposit Reward Calculations & Caps', () => {
    it('Deposit 100 ETB -> Reward = 10 ETB', () => {
      expect(rewardService.calculateFirstDepositBonus(100)).toBe(10);
    });

    it('Deposit 300 ETB -> Reward = 30 ETB', () => {
      expect(rewardService.calculateFirstDepositBonus(300)).toBe(30);
    });

    it('Deposit 500 ETB -> Reward = 50 ETB', () => {
      expect(rewardService.calculateFirstDepositBonus(500)).toBe(50);
    });

    it('Deposit 1,000 ETB -> Calculated 100 ETB, capped strictly at 50 ETB', () => {
      expect(rewardService.calculateFirstDepositBonus(1000)).toBe(50);
    });

    it('Handles fractional values deterministically and rejects non-positive deposits', () => {
      expect(rewardService.calculateFirstDepositBonus(250)).toBe(25);
      expect(rewardService.calculateFirstDepositBonus(99.99)).toBe(9.99);
      expect(rewardService.calculateFirstDepositBonus(0)).toBe(0);
      expect(rewardService.calculateFirstDepositBonus(-50)).toBe(0);
    });

    it('First deposit generates reward, second deposit CANNOT generate another reward', () => {
      const userId = `usr_fd_${Date.now()}_1`;
      databaseService.createUser({
        id: userId,
        telegram_id: `tg_fd_${Date.now()}_1`,
        username: 'FirstDepPlayer1',
        phone: '0922000001',
        referral_code: `REF_FD1_${Date.now()}`,
        role: 'USER'
      });

      // Before deposit: Status is NOT_ELIGIBLE
      const statusBefore = rewardService.getFirstDepositRewardStatus(userId);
      expect(statusBefore.status).toBe('NOT_ELIGIBLE');

      // First deposit: 300 ETB
      const dep1 = databaseService.createDepositRequest(userId, 'FirstDepPlayer1', 300, 'Telebirr');
      databaseService.approveDeposit('admin_01', dep1.id);

      // Wallet bonus balance is credited with 30 ETB (10% of 300)
      const walletAfterDep1 = databaseService.getOrCreateWallet(userId);
      expect(walletAfterDep1.balance).toBe(300);
      expect(walletAfterDep1.bonus_balance).toBe(30);

      // Status is now CLAIMED
      const statusAfter = rewardService.getFirstDepositRewardStatus(userId);
      expect(statusAfter.status).toBe('CLAIMED');
      expect(statusAfter.rewardAmount).toBe(30);

      // Second deposit: 500 ETB
      const dep2 = databaseService.createDepositRequest(userId, 'FirstDepPlayer1', 500, 'Telebirr');
      const approved2 = databaseService.approveDeposit('admin_01', dep2.id);
      expect(approved2.promotionalBonus).toBeNull();

      const walletAfterDep2 = databaseService.getOrCreateWallet(userId);
      expect(walletAfterDep2.balance).toBe(800); // 300 + 500
      expect(walletAfterDep2.bonus_balance).toBe(30); // strictly not incremented!
    });

    it('Duplicate claim cannot create duplicate reward (idempotency)', () => {
      const userId = `usr_fd_${Date.now()}_dup`;
      databaseService.createUser({
        id: userId,
        telegram_id: `tg_fd_${Date.now()}_dup`,
        username: 'DupClaimPlayer',
        phone: '0922000002',
        referral_code: `REF_FD2_${Date.now()}`,
        role: 'USER'
      });

      const dep = databaseService.createDepositRequest(userId, 'DupClaimPlayer', 200, 'Telebirr');
      databaseService.approveDeposit('admin_01', dep.id);

      const wallet1 = databaseService.getOrCreateWallet(userId);
      expect(wallet1.bonus_balance).toBe(20);

      // Explicit claim attempt on already claimed reward must fail
      expect(() => {
        rewardService.claimFirstDepositReward(userId);
      }).toThrow(/already been claimed/i);

      const wallet2 = databaseService.getOrCreateWallet(userId);
      expect(wallet2.bonus_balance).toBe(20); // No double credit
    });
  });

  // =========================================================================
  // 2. CARD / ROOM PLAY REWARD (10 CARDS = ROOM CARD PRICE)
  // =========================================================================
  describe('2. Room Play Rewards: Per-Room Progress & Milestone Claiming', () => {
    it('10 ETB room: 1-9 cards -> no completed reward', () => {
      const userId = `usr_room_${Date.now()}_1`;
      databaseService.createUser({
        id: userId,
        telegram_id: `tg_rm_${Date.now()}_1`,
        username: 'RoomPlayer1',
        phone: '0922000003',
        referral_code: `REF_RM1_${Date.now()}`,
        role: 'USER'
      });

      // Buy 9 cards in 10 ETB room
      rewardService.recordCardPurchase(userId, 'room_10birr', 9);

      const rewards = rewardService.getRoomPlayRewards(userId);
      const room10 = rewards.find(r => r.roomId === 'room_10birr')!;
      expect(room10.cardsPurchased).toBe(9);
      expect(room10.progress).toBe(9);
      expect(room10.completedBlocks).toBe(0);
      expect(room10.availableBlocks).toBe(0);
      expect(room10.availableRewardAmount).toBe(0);
      expect(room10.status).toBe('PROGRESS');

      // Attempt to claim must fail
      expect(() => {
        rewardService.claimRoomPlayReward(userId, 'room_10birr');
      }).toThrow(/no unclaimed rewards available/i);
    });

    it('10 ETB room: 10 cards -> exactly 10 ETB reward', () => {
      const userId = `usr_room_${Date.now()}_2`;
      databaseService.createUser({
        id: userId,
        telegram_id: `tg_rm_${Date.now()}_2`,
        username: 'RoomPlayer2',
        phone: '0922000004',
        referral_code: `REF_RM2_${Date.now()}`,
        role: 'USER'
      });

      // Buy 10 cards
      rewardService.recordCardPurchase(userId, 'room_10birr', 10);

      const rewardsBefore = rewardService.getRoomPlayRewards(userId);
      const room10 = rewardsBefore.find(r => r.roomId === 'room_10birr')!;
      expect(room10.cardsPurchased).toBe(10);
      expect(room10.completedBlocks).toBe(1);
      expect(room10.availableBlocks).toBe(1);
      expect(room10.availableRewardAmount).toBe(10);
      expect(room10.status).toBe('REWARD_AVAILABLE');

      // Claim reward
      const claimResult = rewardService.claimRoomPlayReward(userId, 'room_10birr');
      expect(claimResult.success).toBe(true);
      expect(claimResult.rewardAmount).toBe(10);
      expect(claimResult.blocksClaimed).toBe(1);

      // Verify wallet bonus_balance
      const wallet = databaseService.getOrCreateWallet(userId);
      expect(wallet.bonus_balance).toBe(10);

      // Verify progress state after claim: completed blocks consumed, available is now 0
      const rewardsAfter = rewardService.getRoomPlayRewards(userId);
      const room10After = rewardsAfter.find(r => r.roomId === 'room_10birr')!;
      expect(room10After.availableBlocks).toBe(0);
      expect(room10After.availableRewardAmount).toBe(0);
      expect(room10After.milestonesClaimed).toBe(1);
      expect(room10After.progress).toBe(0);

      // Second claim attempt must fail
      expect(() => {
        rewardService.claimRoomPlayReward(userId, 'room_10birr');
      }).toThrow(/no unclaimed rewards available/i);
    });

    it('10 ETB room: 11 cards -> 10 ETB reward + 1/10 progress toward next', () => {
      const userId = `usr_room_${Date.now()}_3`;
      databaseService.createUser({
        id: userId,
        telegram_id: `tg_rm_${Date.now()}_3`,
        username: 'RoomPlayer3',
        phone: '0922000005',
        referral_code: `REF_RM3_${Date.now()}`,
        role: 'USER'
      });

      rewardService.recordCardPurchase(userId, 'room_10birr', 11);

      const rewards = rewardService.getRoomPlayRewards(userId);
      const room10 = rewards.find(r => r.roomId === 'room_10birr')!;
      expect(room10.completedBlocks).toBe(1);
      expect(room10.availableBlocks).toBe(1);
      expect(room10.availableRewardAmount).toBe(10);
      expect(room10.progress).toBe(1); // 1 remaining progress!

      // Claim
      rewardService.claimRoomPlayReward(userId, 'room_10birr');

      // Progress after claim must remain 1/10
      const rewardsAfter = rewardService.getRoomPlayRewards(userId);
      const room10After = rewardsAfter.find(r => r.roomId === 'room_10birr')!;
      expect(room10After.availableBlocks).toBe(0);
      expect(room10After.progress).toBe(1); // Not lost!
    });

    it('10 ETB room: 20 cards -> two completed rewards (20 ETB)', () => {
      const userId = `usr_room_${Date.now()}_4`;
      databaseService.createUser({
        id: userId,
        telegram_id: `tg_rm_${Date.now()}_4`,
        username: 'RoomPlayer4',
        phone: '0922000006',
        referral_code: `REF_RM4_${Date.now()}`,
        role: 'USER'
      });

      rewardService.recordCardPurchase(userId, 'room_10birr', 20);

      const rewards = rewardService.getRoomPlayRewards(userId);
      const room10 = rewards.find(r => r.roomId === 'room_10birr')!;
      expect(room10.completedBlocks).toBe(2);
      expect(room10.availableBlocks).toBe(2);
      expect(room10.availableRewardAmount).toBe(20);

      const claim = rewardService.claimRoomPlayReward(userId, 'room_10birr');
      expect(claim.rewardAmount).toBe(20);
      expect(claim.blocksClaimed).toBe(2);

      const wallet = databaseService.getOrCreateWallet(userId);
      expect(wallet.bonus_balance).toBe(20);
    });

    it('10 ETB room: 21 cards -> two rewards + 1/10 progress remaining', () => {
      const userId = `usr_room_${Date.now()}_5`;
      databaseService.createUser({
        id: userId,
        telegram_id: `tg_rm_${Date.now()}_5`,
        username: 'RoomPlayer5',
        phone: '0922000007',
        referral_code: `REF_RM5_${Date.now()}`,
        role: 'USER'
      });

      rewardService.recordCardPurchase(userId, 'room_10birr', 21);

      const rewards = rewardService.getRoomPlayRewards(userId);
      const room10 = rewards.find(r => r.roomId === 'room_10birr')!;
      expect(room10.completedBlocks).toBe(2);
      expect(room10.availableBlocks).toBe(2);
      expect(room10.availableRewardAmount).toBe(20);
      expect(room10.progress).toBe(1);

      rewardService.claimRoomPlayReward(userId, 'room_10birr');

      const rewardsAfter = rewardService.getRoomPlayRewards(userId);
      const room10After = rewardsAfter.find(r => r.roomId === 'room_10birr')!;
      expect(room10After.availableBlocks).toBe(0);
      expect(room10After.progress).toBe(1); // Preserves remainder!
    });

    it('100 ETB room: 10 cards -> 100 ETB reward', () => {
      const userId = `usr_room_${Date.now()}_6`;
      databaseService.createUser({
        id: userId,
        telegram_id: `tg_rm_${Date.now()}_6`,
        username: 'RoomPlayer6',
        phone: '0922000008',
        referral_code: `REF_RM6_${Date.now()}`,
        role: 'USER'
      });

      rewardService.recordCardPurchase(userId, 'room_100birr', 10);

      const rewards = rewardService.getRoomPlayRewards(userId);
      const room100 = rewards.find(r => r.roomId === 'room_100birr')!;
      expect(room100.completedBlocks).toBe(1);
      expect(room100.availableBlocks).toBe(1);
      expect(room100.availableRewardAmount).toBe(100);

      const claim = rewardService.claimRoomPlayReward(userId, 'room_100birr');
      expect(claim.rewardAmount).toBe(100);

      const wallet = databaseService.getOrCreateWallet(userId);
      expect(wallet.bonus_balance).toBe(100);
    });

    it('500 ETB room: 10 cards -> 500 ETB reward', () => {
      const userId = `usr_room_${Date.now()}_7`;
      databaseService.createUser({
        id: userId,
        telegram_id: `tg_rm_${Date.now()}_7`,
        username: 'RoomPlayer7',
        phone: '0922000009',
        referral_code: `REF_RM7_${Date.now()}`,
        role: 'USER'
      });

      rewardService.recordCardPurchase(userId, 'room_500birr', 10);

      const rewards = rewardService.getRoomPlayRewards(userId);
      const room500 = rewards.find(r => r.roomId === 'room_500birr')!;
      expect(room500.availableRewardAmount).toBe(500);

      const claim = rewardService.claimRoomPlayReward(userId, 'room_500birr');
      expect(claim.rewardAmount).toBe(500);
    });

    it('Multiple rooms: counters remain strictly independent and cannot be combined', () => {
      const userId = `usr_room_multi_${Date.now()}`;
      databaseService.createUser({
        id: userId,
        telegram_id: `tg_rm_multi_${Date.now()}`,
        username: 'MultiRoomPlayer',
        phone: '0922000010',
        referral_code: `REF_RMM_${Date.now()}`,
        role: 'USER'
      });

      // Buy 5 cards in 10 ETB room and 5 cards in 100 ETB room
      rewardService.recordCardPurchase(userId, 'room_10birr', 5);
      rewardService.recordCardPurchase(userId, 'room_100birr', 5);

      const rewards = rewardService.getRoomPlayRewards(userId);
      const room10 = rewards.find(r => r.roomId === 'room_10birr')!;
      const room100 = rewards.find(r => r.roomId === 'room_100birr')!;

      // 5 + 5 does NOT equal 10!
      expect(room10.progress).toBe(5);
      expect(room10.availableBlocks).toBe(0);
      expect(room100.progress).toBe(5);
      expect(room100.availableBlocks).toBe(0);

      // Neither is claimable
      expect(() => rewardService.claimRoomPlayReward(userId, 'room_10birr')).toThrow();
      expect(() => rewardService.claimRoomPlayReward(userId, 'room_100birr')).toThrow();
    });

    it('Card deselection refunds reverse the play reward counter', () => {
      const userId = `usr_room_desel_${Date.now()}`;
      databaseService.createUser({
        id: userId,
        telegram_id: `tg_rm_desel_${Date.now()}`,
        username: 'DeselRoomPlayer',
        phone: '0922000011',
        referral_code: `REF_RMD_${Date.now()}`,
        role: 'USER'
      });

      // Buy 10 cards -> 1 milestone
      rewardService.recordCardPurchase(userId, 'room_20birr', 10);
      let room20 = rewardService.getRoomPlayRewards(userId).find(r => r.roomId === 'room_20birr')!;
      expect(room20.availableBlocks).toBe(1);

      // User deselects 1 card in lobby
      rewardService.recordCardRefund(userId, 'room_20birr', 1);

      room20 = rewardService.getRoomPlayRewards(userId).find(r => r.roomId === 'room_20birr')!;
      expect(room20.cardsPurchased).toBe(9);
      expect(room20.availableBlocks).toBe(0);
      expect(room20.progress).toBe(9);
    });
  });

  // =========================================================================
  // 3. REFERRAL REWARDS (10 ETB PER QUALIFIED DEPOSITING REFEREE)
  // =========================================================================
  describe('3. Referral Rewards: Qualification & Claiming', () => {
    it('Referral link alone / registration alone -> NO reward granted', () => {
      const referrerId = `usr_ref_agent_${Date.now()}_1`;
      databaseService.createUser({
        id: referrerId,
        telegram_id: `tg_refa_${Date.now()}_1`,
        username: 'ReferrerOne',
        phone: '0922000012',
        referral_code: `REF_AGENT_1_${Date.now()}`,
        role: 'USER'
      });

      // User B clicks referral link and registers
      const refereeId = `usr_ref_player_${Date.now()}_1`;
      databaseService.createUser({
        id: refereeId,
        telegram_id: `tg_refp_${Date.now()}_1`,
        username: 'RefereeOne',
        phone: '0922000013',
        referral_code: `REF_SUB_1_${Date.now()}`,
        referred_by: referrerId,
        role: 'USER'
      });

      const stats = rewardService.getReferralRewards(referrerId);
      expect(stats.totalInvited).toBe(1);
      expect(stats.qualifiedCount).toBe(0); // No deposit yet!
      expect(stats.availableRewardAmount).toBe(0);

      // Claim attempt must be rejected
      expect(() => {
        rewardService.claimReferralRewards(referrerId);
      }).toThrow(/referred players must make a qualifying deposit/i);
    });

    it('Referred player deposits -> Referrer becomes eligible for 10 ETB', () => {
      const referrerId = `usr_ref_agent_${Date.now()}_2`;
      databaseService.createUser({
        id: referrerId,
        telegram_id: `tg_refa_${Date.now()}_2`,
        username: 'ReferrerTwo',
        phone: '0922000014',
        referral_code: `REF_AGENT_2_${Date.now()}`,
        role: 'USER'
      });

      const refereeId = `usr_ref_player_${Date.now()}_2`;
      databaseService.createUser({
        id: refereeId,
        telegram_id: `tg_refp_${Date.now()}_2`,
        username: 'RefereeTwo',
        phone: '0922000015',
        referral_code: `REF_SUB_2_${Date.now()}`,
        referred_by: referrerId,
        role: 'USER'
      });

      // Referee makes qualifying deposit
      const dep = databaseService.createDepositRequest(refereeId, 'RefereeTwo', 100, 'Telebirr');
      databaseService.approveDeposit('admin_01', dep.id);

      const statsBefore = rewardService.getReferralRewards(referrerId);
      expect(statsBefore.totalInvited).toBe(1);
      expect(statsBefore.qualifiedCount).toBe(1);
      expect(statsBefore.unclaimedCount).toBe(1);
      expect(statsBefore.availableRewardAmount).toBe(10);

      // Referrer claims reward
      const claimResult = rewardService.claimReferralRewards(referrerId);
      expect(claimResult.success).toBe(true);
      expect(claimResult.rewardAmount).toBe(10);
      expect(claimResult.qualifiedClaimed).toBe(1);

      // Bonus balance credited
      const wallet = databaseService.getOrCreateWallet(referrerId);
      expect(wallet.bonus_balance).toBe(10);

      // Check stats after claim
      const statsAfter = rewardService.getReferralRewards(referrerId);
      expect(statsAfter.claimedCount).toBe(1);
      expect(statsAfter.unclaimedCount).toBe(0);
      expect(statsAfter.availableRewardAmount).toBe(0);
    });

    it('Same referred player cannot trigger another reward on repeated deposits', () => {
      const referrerId = `usr_ref_agent_${Date.now()}_3`;
      databaseService.createUser({
        id: referrerId,
        telegram_id: `tg_refa_${Date.now()}_3`,
        username: 'ReferrerThree',
        phone: '0922000016',
        referral_code: `REF_AGENT_3_${Date.now()}`,
        role: 'USER'
      });

      const refereeId = `usr_ref_player_${Date.now()}_3`;
      databaseService.createUser({
        id: refereeId,
        telegram_id: `tg_refp_${Date.now()}_3`,
        username: 'RefereeThree',
        phone: '0922000017',
        referral_code: `REF_SUB_3_${Date.now()}`,
        referred_by: referrerId,
        role: 'USER'
      });

      // Referee Deposit 1
      const dep1 = databaseService.createDepositRequest(refereeId, 'RefereeThree', 100, 'Telebirr');
      databaseService.approveDeposit('admin_01', dep1.id);

      // Claim reward for Deposit 1
      rewardService.claimReferralRewards(referrerId);

      // Referee Deposit 2 & Deposit 3
      const dep2 = databaseService.createDepositRequest(refereeId, 'RefereeThree', 200, 'Telebirr');
      databaseService.approveDeposit('admin_01', dep2.id);

      const dep3 = databaseService.createDepositRequest(refereeId, 'RefereeThree', 500, 'Telebirr');
      databaseService.approveDeposit('admin_01', dep3.id);

      // Referrer must NOT have any new unclaimed rewards!
      const stats = rewardService.getReferralRewards(referrerId);
      expect(stats.qualifiedCount).toBe(1);
      expect(stats.claimedCount).toBe(1);
      expect(stats.unclaimedCount).toBe(0);
      expect(stats.availableRewardAmount).toBe(0);

      // Attempting second claim must fail
      expect(() => {
        rewardService.claimReferralRewards(referrerId);
      }).toThrow(/no unclaimed referral rewards available/i);
    });

    it('Self-referral cannot generate referral rewards', () => {
      const selfUserId = `usr_self_ref_${Date.now()}`;
      databaseService.createUser({
        id: selfUserId,
        telegram_id: `tg_self_${Date.now()}`,
        username: 'SelfReferrer',
        phone: '0922000018',
        referral_code: `REF_SELF_${Date.now()}`,
        referred_by: selfUserId, // Self-referral attempt
        role: 'USER'
      });

      const dep = databaseService.createDepositRequest(selfUserId, 'SelfReferrer', 200, 'Telebirr');
      databaseService.approveDeposit('admin_01', dep.id);

      const stats = rewardService.getReferralRewards(selfUserId);
      expect(stats.totalInvited).toBe(0);
      expect(stats.qualifiedCount).toBe(0);
      expect(stats.availableRewardAmount).toBe(0);

      expect(() => {
        rewardService.claimReferralRewards(selfUserId);
      }).toThrow();
    });
  });

  // =========================================================================
  // 4. BONUS BALANCE RESTRICTIONS & INVARIANTS
  // =========================================================================
  describe('4. Bonus Balance Restrictions & Invariants', () => {
    it('Bonus can purchase eligible Bingo cards and consumes bonus before cash', () => {
      const userId = `usr_spend_${Date.now()}`;
      databaseService.createUser({
        id: userId,
        telegram_id: `tg_sp_${Date.now()}`,
        username: 'BonusSpender',
        phone: '0922000019',
        referral_code: `REF_SP_${Date.now()}`,
        role: 'USER'
      });

      // Give 20 ETB cash and 15 ETB bonus
      databaseService.updateWalletBalance(userId, 20, 0, 0);
      (databaseService as any).db.prepare(`
        UPDATE wallets SET bonus_balance = 15.0 WHERE user_id = ?
      `).run(userId);

      // Buy card costing 10 ETB -> 10 from bonus, 0 from cash
      const split1 = rewardService.consumeBonusForPurchase(userId, 10, 'BINGO_CARD', 'game_1');
      expect(split1.bonusPaid).toBe(10);
      expect(split1.cashPaid).toBe(0);

      let wallet = databaseService.getOrCreateWallet(userId);
      expect(wallet.bonus_balance).toBe(5);
      expect(wallet.balance).toBe(20);

      // Buy card costing 10 ETB -> 5 from bonus, 5 from cash
      const split2 = rewardService.consumeBonusForPurchase(userId, 10, 'BINGO_CARD', 'game_2');
      expect(split2.bonusPaid).toBe(5);
      expect(split2.cashPaid).toBe(5);

      wallet = databaseService.getOrCreateWallet(userId);
      expect(wallet.bonus_balance).toBe(0);
      expect(wallet.balance).toBe(15);
    });

    it('Bonus CANNOT be withdrawn', () => {
      const userId = `usr_with_test_${Date.now()}`;
      databaseService.createUser({
        id: userId,
        telegram_id: `tg_wt_${Date.now()}`,
        username: 'BonusWithdrawer',
        phone: '0922000020',
        referral_code: `REF_WT_${Date.now()}`,
        role: 'USER'
      });

      // 50 ETB cash, 50 ETB bonus
      databaseService.updateWalletBalance(userId, 50, 0, 0);
      (databaseService as any).db.prepare(`
        UPDATE wallets SET bonus_balance = 50.0 WHERE user_id = ?
      `).run(userId);

      // Try to withdraw 60 ETB (more than cash 50, but less than cash+bonus 100)
      expect(() => {
        databaseService.createWithdrawalRequest(userId, 'BonusWithdrawer', 60, '0922000020');
      }).toThrow(/insufficient funds/i);

      // Withdraw 40 ETB -> succeeds from cash
      const withReq = databaseService.createWithdrawalRequest(userId, 'BonusWithdrawer', 40, '0922000020');
      expect(withReq.status).toBe('PENDING');

      const wallet = databaseService.getOrCreateWallet(userId);
      expect(wallet.balance).toBe(10); // 50 - 40 reserved
      expect(wallet.bonus_balance).toBe(50); // Bonus strictly untouched!
    });
  });

  // =========================================================================
  // 5. REWARD HISTORY AUDITING
  // =========================================================================
  describe('5. Reward History Auditing', () => {
    it('Accurately logs all claimed rewards with details, types, amounts, and dates', () => {
      const userId = `usr_hist_${Date.now()}`;
      databaseService.createUser({
        id: userId,
        telegram_id: `tg_hi_${Date.now()}`,
        username: 'HistoryTester',
        phone: '0922000021',
        referral_code: `REF_HI_${Date.now()}`,
        role: 'USER'
      });

      // 1. First deposit
      const dep = databaseService.createDepositRequest(userId, 'HistoryTester', 100, 'Telebirr');
      databaseService.approveDeposit('admin_01', dep.id);

      // 2. Room play
      rewardService.recordCardPurchase(userId, 'room_10birr', 10);
      rewardService.claimRoomPlayReward(userId, 'room_10birr');

      const history = rewardService.getRewardHistory(userId);
      expect(history.length).toBeGreaterThanOrEqual(2);

      const fd = history.find(h => h.rewardType === 'FIRST_DEPOSIT');
      expect(fd).toBeDefined();
      expect(fd?.amount).toBe(10);

      const rm = history.find(h => h.rewardType === 'ROOM_PLAY');
      expect(rm).toBeDefined();
      expect(rm?.amount).toBe(10);
    });
  });
});
