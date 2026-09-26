process.env.IS_TEST_SCRIPT = 'true';
import { DatabaseService } from './DatabaseService.js';
import { RewardService } from './RewardService.js';

const databaseService = new DatabaseService(':memory:');

async function main() {
  console.log('=====================================================');
  console.log('STARTING REWARDS SYSTEM V2 END-TO-END FLOW TEST');
  console.log('=====================================================');

  const rewardService = databaseService.rewardService;

  // 1. REGISTER
  const ts = Date.now();
  const userId = `usr_e2e_${ts}`;
  const username = `E2E_Player_${ts}`;
  databaseService.createUser({
    id: userId,
    telegram_id: `tg_e2e_${ts}`,
    username,
    phone: `0911${Math.floor(100000 + Math.random() * 900000)}`,
    referral_code: `REF_E2E_${ts}`,
    role: 'USER'
  });
  console.log(`[1] Registered user: ${userId} (${username})`);

  let wallet = databaseService.getOrCreateWallet(userId);
  console.log(`Initial Balances: Cash = ${wallet.balance} ETB, Bonus = ${wallet.bonus_balance} ETB`);
  if (wallet.balance !== 0 || wallet.bonus_balance !== 0) {
    throw new Error('Initial balance is not 0!');
  }

  // 2. FIRST TELEBIRR DEPOSIT: 100 ETB
  const dep1 = databaseService.createDepositRequest(
    userId,
    username,
    100,
    'Telebirr',
    `REF_E2E_TB_1_${ts}`
  );
  console.log(`[2] Submitted Telebirr deposit request: ${dep1.id}, amount: ${dep1.amount} ETB`);

  // 3. ADMIN APPROVES
  const approval1 = databaseService.approveDeposit('admin_usr_01', dep1.id);
  console.log(`[3] Admin approved deposit. Promotional Bonus:`, approval1.promotionalBonus);
  if (!approval1.promotionalBonus || approval1.promotionalBonus.bonusAmount !== 10) {
    throw new Error(`Expected 10 ETB bonus, got ${approval1.promotionalBonus?.bonusAmount}`);
  }

  // 4. WALLET SHOWS CASH + BONUS SEPARATELY
  wallet = databaseService.getOrCreateWallet(userId);
  console.log(`[4] Wallet Balances after 1st deposit: Cash = ${wallet.balance} ETB, Bonus = ${wallet.bonus_balance} ETB`);
  if (wallet.balance !== 100 || wallet.bonus_balance !== 10) {
    throw new Error(`Expected Cash: 100, Bonus: 10. Got Cash: ${wallet.balance}, Bonus: ${wallet.bonus_balance}`);
  }

  const activeBonus = rewardService.getUserActiveBonus(userId);
  console.log(`Active bonus countdown: ${activeBonus?.timeRemainingSeconds}s remaining`);

  // 5. BUY BINGO CARD USING ELIGIBLE BONUS: Card cost = 8 ETB
  console.log(`[5] Purchasing Bingo Card (cost: 8 ETB)...`);
  const splitPurchase = rewardService.consumeBonusForPurchase(userId, 8, 'BINGO_CARD', 'game_room_1');
  console.log(`Purchase funding split: Bonus Paid = ${splitPurchase.bonusPaid} ETB, Cash Paid = ${splitPurchase.cashPaid} ETB`);
  if (splitPurchase.bonusPaid !== 8 || splitPurchase.cashPaid !== 0) {
    throw new Error(`Expected 8 ETB paid from bonus. Got bonus: ${splitPurchase.bonusPaid}, cash: ${splitPurchase.cashPaid}`);
  }

  // 6. VERIFY BONUS DECREASE
  wallet = databaseService.getOrCreateWallet(userId);
  console.log(`[6] Wallet Balances after card purchase: Cash = ${wallet.balance} ETB, Bonus = ${wallet.bonus_balance} ETB`);
  if (wallet.bonus_balance !== 2 || wallet.balance !== 100) {
    throw new Error(`Expected Cash: 100, Bonus: 2. Got Cash: ${wallet.balance}, Bonus: ${wallet.bonus_balance}`);
  }

  // 7. VERIFY BONUS IS NOT WITHDRAWABLE
  console.log(`[7] Testing non-withdrawable restriction: attempting to withdraw 101 ETB (Cash is 100, Total is 102)...`);
  let withdrawalBlocked = false;
  try {
    databaseService.createWithdrawalRequest(
      userId,
      username,
      101,
      '0911000000'
    );
  } catch (err: any) {
    withdrawalBlocked = true;
    console.log(`Withdrawal successfully blocked with error: "${err.message}"`);
  }
  if (!withdrawalBlocked) {
    throw new Error('Promotional bonus was illegally included in withdrawable balance!');
  }

  // 8. VERIFY SECOND DEPOSIT DOES NOT CREATE ANOTHER BONUS
  console.log(`[8] Submitting second deposit of 500 ETB...`);
  const dep2 = databaseService.createDepositRequest(
    userId,
    username,
    500,
    'Telebirr',
    `REF_E2E_TB_2_${ts}`
  );
  const approval2 = databaseService.approveDeposit('admin_usr_01', dep2.id);
  console.log(`Second deposit approved. Promotional Bonus:`, approval2.promotionalBonus);
  if (approval2.promotionalBonus !== null) {
    throw new Error('Second deposit illegally generated a promotional bonus!');
  }

  wallet = databaseService.getOrCreateWallet(userId);
  console.log(`Wallet Balances after 2nd deposit: Cash = ${wallet.balance} ETB (expected 600), Bonus = ${wallet.bonus_balance} ETB (expected 2)`);
  if (wallet.balance !== 600 || wallet.bonus_balance !== 2) {
    throw new Error(`Balances incorrect after second deposit! Cash: ${wallet.balance}, Bonus: ${wallet.bonus_balance}`);
  }

  // 9. EXPIRATION TEST: ADVANCE CLOCK 24 HOURS
  console.log('-----------------------------------------------------');
  console.log('[9] TESTING 24-HOUR EXPIRATION LIFECYCLE...');
  const futureTime = new Date(Date.now() + 25 * 60 * 60 * 1000); // 25 hours later
  console.log(`Simulating time advance to: ${futureTime.toISOString()}`);

  const activeBonusAfter24h = rewardService.getUserActiveBonus(userId, futureTime);
  console.log(`Active bonus after 24h:`, activeBonusAfter24h);
  if (activeBonusAfter24h.activeReward !== null || activeBonusAfter24h.bonusBalance !== 0) {
    throw new Error('Bonus should have expired after 24 hours!');
  }

  // 10. ATTEMPT CARD PURCHASE USING EXPIRED BONUS
  console.log(`[10] Attempting card purchase relying on expired bonus...`);
  // Drain cash first to 0 to test that expired bonus cannot be spent
  databaseService.updateWalletBalance(userId, 0, 0, 0);
  let purchaseBlocked = false;
  try {
    rewardService.consumeBonusForPurchase(userId, 2, 'BINGO_CARD', 'game_room_late', futureTime);
  } catch (err: any) {
    purchaseBlocked = true;
    console.log(`Purchase successfully rejected: "${err.message}"`);
  }
  if (!purchaseBlocked) {
    throw new Error('Expired bonus was illegally accepted for card purchase!');
  }

  console.log('=====================================================');
  console.log('ALL REAL-WORLD LIFECYCLE VERIFICATIONS PASSED 100%!');
  console.log('=====================================================');
}

main().catch((err) => {
  console.error('E2E TEST FAILURE:', err);
  process.exit(1);
});
