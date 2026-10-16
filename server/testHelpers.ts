import { databaseService } from './DatabaseService.js';
import { normalizeEthiopianPhone } from './PhoneUtils.js';

/**
 * Test-only: give a user a verified phone number (withdrawals may only go to it).
 * Frees the number from any other test user first, since phone numbers are unique.
 */
export function setVerifiedPhone(userId: string, phone: string): void {
  const normalized = normalizeEthiopianPhone(phone);
  if (!normalized) throw new Error(`Invalid test phone: ${phone}`);
  const holder = databaseService.getUserByPhone(normalized);
  if (holder && holder.id !== userId) {
    databaseService.getDb().prepare('UPDATE users SET phone = NULL WHERE id = ?').run(holder.id);
  }
  databaseService.updateUser(userId, { phone: normalized });
}

/**
 * Test-only: disable the referral anti-farming thresholds (min deposit / min cards / daily cap) for tests
 * that exercise claim mechanics with tiny fixtures. Returns a function restoring the previous values.
 */
export function relaxReferralRules(): () => void {
  const keys = ['REFERRAL_MIN_DEPOSIT_ETB', 'REFERRAL_MIN_CARDS', 'REFERRAL_MAX_REWARDS_PER_DAY'] as const;
  const previous = keys.map((k) => process.env[k]);
  process.env.REFERRAL_MIN_DEPOSIT_ETB = '0';
  process.env.REFERRAL_MIN_CARDS = '0';
  process.env.REFERRAL_MAX_REWARDS_PER_DAY = '1000';
  return () => keys.forEach((k, i) => {
    if (previous[i] === undefined) delete process.env[k];
    else process.env[k] = previous[i];
  });
}
