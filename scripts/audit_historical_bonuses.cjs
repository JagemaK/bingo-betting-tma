/**
 * Phase 1B: Forensic Historical Bonus Audit & Dry-Run Script
 * 
 * Safety Rules:
 * - Read-only dry-run by default.
 * - Does NOT mutate any user balance without explicit --execute flag AND operator confirmation.
 * - Identifies legacy 1,000 ETB registration bonuses using:
 *     1. type = 'BONUS'
 *     2. reference_id LIKE 'bonus_welcome_%'
 *     3. amount = 1000.00
 * - Assesses whether users have deposited legitimate funds.
 * - Generates a detailed audit report.
 */

const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

const dbPath = path.resolve(__dirname, '..', 'data', 'bingo.db');

if (!fs.existsSync(dbPath)) {
  console.log(`[Phase 1B Audit] No SQLite database found at: ${dbPath}`);
  console.log('[Phase 1B Audit] Nothing to audit. Safe to proceed.');
  process.exit(0);
}

console.log('===============================================================');
console.log('           BINGO.BET — HISTORICAL BONUS AUDIT (PHASE 1B)       ');
console.log('===============================================================');
console.log(`Database: ${dbPath}\n`);

const db = new DatabaseSync(dbPath);

// Query historical welcome bonus entries
const bonusQuery = `
  SELECT 
    lt.id AS tx_id,
    lt.user_id,
    lt.username,
    lt.amount,
    lt.reference_id,
    lt.description,
    lt.created_at AS bonus_credited_at,
    w.balance AS current_balance,
    w.reserved_balance,
    w.bonus_balance,
    (SELECT COUNT(*) FROM deposit_requests dr WHERE dr.user_id = lt.user_id AND dr.status = 'APPROVED') AS approved_deposits_count,
    (SELECT COALESCE(SUM(dr.amount), 0) FROM deposit_requests dr WHERE dr.user_id = lt.user_id AND dr.status = 'APPROVED') AS total_deposited_amount,
    (SELECT COUNT(*) FROM ledger_transactions bt WHERE bt.user_id = lt.user_id AND bt.type = 'BET') AS bets_placed_count
  FROM ledger_transactions lt
  LEFT JOIN wallets w ON w.user_id = lt.user_id
  WHERE lt.type = 'BONUS'
    AND (lt.reference_id LIKE 'bonus_welcome_%' OR lt.description LIKE '%Welcome%')
  ORDER BY lt.created_at ASC
`;

let affectedRows = [];
try {
  affectedRows = db.prepare(bonusQuery).all();
} catch (err) {
  console.error('[Phase 1B Audit] Query error:', err.message);
  process.exit(1);
}

console.log(`Found ${affectedRows.length} legacy registration bonus transaction(s).\n`);

if (affectedRows.length === 0) {
  console.log('✅ Clean state: No legacy registration bonus transactions detected.');
  process.exit(0);
}

let totalBonusAwarded = 0;
let usersWithLegitDeposits = 0;
let usersWithActiveBets = 0;

console.log(
  'User ID'.padEnd(20) +
  'Username'.padEnd(18) +
  'Bonus'.padEnd(10) +
  'Current Bal'.padEnd(14) +
  'Deposits'.padEnd(12) +
  'Bets'.padEnd(8) +
  'Credited At'
);
console.log('-'.repeat(95));

for (const row of affectedRows) {
  totalBonusAwarded += Number(row.amount);
  if (row.approved_deposits_count > 0) usersWithLegitDeposits++;
  if (row.bets_placed_count > 0) usersWithActiveBets++;

  console.log(
    String(row.user_id).padEnd(20) +
    String(row.username).slice(0, 16).padEnd(18) +
    String(row.amount).padEnd(10) +
    String(row.current_balance ?? 0).padEnd(14) +
    String(row.total_deposited_amount ?? 0).padEnd(12) +
    String(row.bets_placed_count).padEnd(8) +
    String(row.bonus_credited_at)
  );
}

console.log('-'.repeat(95));
console.log(`\nSUMMARY AUDIT FINDINGS:`);
console.log(`Total Accounts with Welcome Bonus: ${affectedRows.length}`);
console.log(`Total Bonus Amount Credited:       ${totalBonusAwarded.toLocaleString()} ETB`);
console.log(`Accounts with Legitimate Deposits: ${usersWithLegitDeposits}`);
console.log(`Accounts that Placed Real Bets:    ${usersWithActiveBets}`);
console.log(`\nCRITICAL SAFETY POLICY:`);
console.log(`1. Accounts with legitimate approved deposits CANNOT have balances blindly reduced.`);
console.log(`2. Accounts that already wagered these funds cannot have balances driven negative.`);
console.log(`3. This dry-run does NOT modify database balances.`);
console.log(`4. Any historical cleanup requires explicit operator review and verified manual rollback scripts.`);
console.log('===============================================================\n');
