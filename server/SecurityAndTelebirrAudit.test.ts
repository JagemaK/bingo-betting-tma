import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { app, httpServer } from './index.js';
import { authService } from './AuthService.js';
import { ledgerService } from './LedgerService.js';
import { databaseService } from './DatabaseService.js';

let BASE_URL: string;
let adminToken: string;
let adminUser: any;
let userTokenA: string;
let userA: any;
let userTokenB: string;
let userB: any;

describe('Security and Telebirr-Only Audit Suite', () => {
  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      httpServer.listen(0, '127.0.0.1', () => {
        const addr = httpServer.address() as any;
        BASE_URL = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });

    // 1. Create verified Admin user and session
    adminUser = databaseService.getUserById('usr_audit_admin') || databaseService.createUser({
      id: 'usr_audit_admin',
      telegram_id: '888999111',
      username: 'AuditAdmin',
      referral_code: 'AUDITADM',
      role: 'ADMIN'
    });
    const adminSession = databaseService.createSession(adminUser.id, adminUser.telegram_id);
    adminToken = adminSession.id;

    // 2. Create User A
    const tgIdA = Math.floor(780000000 + Math.random() * 899999);
    const initDataA = authService.createSignedTelegramInitData(
      { id: tgIdA, first_name: 'AuditUserA', username: `audit_a_${tgIdA}` },
      process.env.TELEGRAM_BOT_TOKEN || 'test_mock_bot_token_123456:ABCdefGHIjklMNOpqrSTUvwxYZ'
    );
    const authA = await authService.authenticateTelegram(initDataA);
    const regA = await authService.completeRegistration(authA.tempToken!, 'AuditUserA');
    expect(regA.success).toBe(true);
    userA = regA.user;
    userTokenA = regA.sessionToken!;

    // 3. Create User B
    const tgIdB = Math.floor(780000000 + Math.random() * 899999);
    const initDataB = authService.createSignedTelegramInitData(
      { id: tgIdB, first_name: 'AuditUserB', username: `audit_b_${tgIdB}` },
      process.env.TELEGRAM_BOT_TOKEN || 'test_mock_bot_token_123456:ABCdefGHIjklMNOpqrSTUvwxYZ'
    );
    const authB = await authService.authenticateTelegram(initDataB);
    const regB = await authService.completeRegistration(authB.tempToken!, 'AuditUserB');
    expect(regB.success).toBe(true);
    userB = regB.user;
    userTokenB = regB.sessionToken!;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });
  });

  describe('PART 5 & 6 & 7: Telebirr Only Payment System & Reference Uniqueness', () => {
    it('creates a Telebirr deposit request in PENDING state with reference ID and does NOT credit balance immediately', async () => {
      const balanceBefore = databaseService.getWallet(userA.id)?.balance || 0;
      const refId = `TLB-TEST-${Date.now()}-A1`;

      const res = await fetch(`${BASE_URL}/api/wallet/deposit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userTokenA}`
        },
        body: JSON.stringify({
          amount: 250,
          paymentMethod: 'Telebirr',
          referenceId: refId
        })
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.request.status).toBe('PENDING');
      expect(data.request.paymentMethod).toBe('Telebirr');
      expect(data.request.referenceId).toBe(refId);

      // Verify balance is NOT credited
      const balanceAfter = databaseService.getWallet(userA.id)?.balance;
      expect(balanceAfter).toBe(balanceBefore);
    });

    it('rejects non-Telebirr payment methods or defaults strictly to Telebirr', async () => {
      const res = await fetch(`${BASE_URL}/api/wallet/deposit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userTokenA}`
        },
        body: JSON.stringify({
          amount: 150,
          paymentMethod: 'Chapa', // Non-Telebirr
          referenceId: `NON-TLB-${Date.now()}`
        })
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/telebirr/i);
    });

    it('prevents reuse of the same Telebirr transaction reference (cross-account idempotency)', async () => {
      const sharedRef = `TLB-UNIQUE-${Date.now()}`;

      // User A submits deposit with sharedRef
      const resA = await fetch(`${BASE_URL}/api/wallet/deposit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userTokenA}`
        },
        body: JSON.stringify({
          amount: 100,
          paymentMethod: 'Telebirr',
          referenceId: sharedRef
        })
      });
      expect(resA.status).toBe(200);

      // User B attempts to submit the same Telebirr reference
      const resB = await fetch(`${BASE_URL}/api/wallet/deposit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userTokenB}`
        },
        body: JSON.stringify({
          amount: 100,
          paymentMethod: 'Telebirr',
          referenceId: sharedRef
        })
      });

      expect(resB.status).toBe(409);
      const dataB = await resB.json();
      expect(dataB.error).toMatch(/already.*submitted|credited/i);
    });

    it('prevents simultaneous duplicate deposit submissions with the same Telebirr reference (concurrent race)', async () => {
      const concurrentRef = `TLB-CONC-${Date.now()}`;

      const [resA, resB] = await Promise.all([
        fetch(`${BASE_URL}/api/wallet/deposit`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${userTokenA}`
          },
          body: JSON.stringify({
            amount: 150,
            paymentMethod: 'Telebirr',
            referenceId: concurrentRef
          })
        }),
        fetch(`${BASE_URL}/api/wallet/deposit`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${userTokenB}`
          },
          body: JSON.stringify({
            amount: 150,
            paymentMethod: 'Telebirr',
            referenceId: concurrentRef
          })
        })
      ]);

      const statuses = [resA.status, resB.status];
      expect(statuses).toContain(200);
      expect(statuses).toContain(409);
    });

    it('enforces database-level UNIQUE constraint on reference_id', () => {
      const rawDb = (databaseService as any).db;
      const ref = `DB-UNIQUE-TEST-${Date.now()}`;
      const now = new Date().toISOString();

      rawDb.prepare(`
        INSERT INTO deposit_requests (id, user_id, username, amount, payment_method, status, reference_id, created_at)
        VALUES ('dep_sql_uniq_1', '${userA.id}', '${userA.username}', 100, 'Telebirr', 'PENDING', '${ref}', '${now}')
      `).run();

      // Attempt second insert with identical reference_id directly in SQL
      expect(() => {
        rawDb.prepare(`
          INSERT INTO deposit_requests (id, user_id, username, amount, payment_method, status, reference_id, created_at)
          VALUES ('dep_sql_uniq_2', '${userB.id}', '${userB.username}', 100, 'Telebirr', 'PENDING', '${ref}', '${now}')
        `).run();
      }).toThrow(/UNIQUE constraint failed/);
    });
  });

  describe('PART 2: Concurrency and Race Condition Protections', () => {
    it('prevents double-credit when two admin deposit approvals run concurrently', async () => {
      const ref = `TLB-RACE-${Date.now()}`;
      const depRes = await fetch(`${BASE_URL}/api/wallet/deposit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userTokenA}`
        },
        body: JSON.stringify({
          amount: 300,
          paymentMethod: 'Telebirr',
          referenceId: ref
        })
      });
      const depData = await depRes.json();
      const depositId = depData.request.id;

      const balanceBefore = databaseService.getWallet(userA.id)?.balance || 0;

      // Fire two approve requests in parallel
      const [res1, res2] = await Promise.all([
        fetch(`${BASE_URL}/api/admin/deposits/${depositId}/approve`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${adminToken}`
          }
        }),
        fetch(`${BASE_URL}/api/admin/deposits/${depositId}/approve`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${adminToken}`
          }
        })
      ]);

      const results = [res1.status, res2.status];
      expect(results).toContain(200);
      expect(results).toContain(400);

      // Verify balance was credited EXACTLY once (+300)
      const balanceAfter = databaseService.getWallet(userA.id)?.balance;
      expect(balanceAfter).toBe(balanceBefore + 300);
    });

    it('prevents race-condition over-withdrawal beyond available balance', async () => {
      // Ensure user has exactly 200 ETB available
      databaseService.updateWalletBalance(userB.id, 200, 0);
      const startBalance = databaseService.getWallet(userB.id)?.balance;
      expect(startBalance).toBe(200);

      // Fire two concurrent withdrawal requests for 200 ETB each
      const [wRes1, wRes2] = await Promise.all([
        fetch(`${BASE_URL}/api/wallet/withdraw`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${userTokenB}`
          },
          body: JSON.stringify({
            amount: 200,
            address: '0911223344',
            paymentMethod: 'Telebirr'
          })
        }),
        fetch(`${BASE_URL}/api/wallet/withdraw`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${userTokenB}`
          },
          body: JSON.stringify({
            amount: 200,
            address: '0911223344',
            paymentMethod: 'Telebirr'
          })
        })
      ]);

      const statuses = [wRes1.status, wRes2.status];
      // One must succeed (200), one must fail with insufficient balance (400)
      expect(statuses).toContain(200);
      expect(statuses).toContain(400);

      const endWallet = databaseService.getWallet(userB.id);
      expect(endWallet?.balance).toBe(0);
      expect(endWallet?.reserved_balance).toBe(200);
    });

    it('prevents double finalization when two admin withdrawal approvals run concurrently', async () => {
      // Give user A balance and create a withdrawal request
      databaseService.updateWalletBalance(userA.id, 500, 0);
      const wthRes = await fetch(`${BASE_URL}/api/wallet/withdraw`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userTokenA}`
        },
        body: JSON.stringify({
          amount: 150,
          address: '0912345678',
          paymentMethod: 'Telebirr'
        })
      });
      const wthData = await wthRes.json();
      const withdrawalId = wthData.request.id;

      const walletBefore = databaseService.getWallet(userA.id)!;
      expect(walletBefore.reserved_balance).toBe(150);

      // Fire two approval requests simultaneously
      const [res1, res2] = await Promise.all([
        fetch(`${BASE_URL}/api/admin/withdrawals/${withdrawalId}/approve`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${adminToken}`
          }
        }),
        fetch(`${BASE_URL}/api/admin/withdrawals/${withdrawalId}/approve`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${adminToken}`
          }
        })
      ]);

      const results = [res1.status, res2.status];
      expect(results).toContain(200);
      expect(results).toContain(400);

      // Reserved balance deducted exactly once, no negative balance
      const walletAfter = databaseService.getWallet(userA.id)!;
      expect(walletAfter.reserved_balance).toBe(0);
    });
  });

  describe('PART 15: Input Validation for Financial Operations', () => {
    it('rejects invalid or unsafe deposit amounts', async () => {
      const invalidAmounts = [-100, 0, 4, 100000, NaN, 'one-hundred', null, undefined];

      for (const amt of invalidAmounts) {
        const res = await fetch(`${BASE_URL}/api/wallet/deposit`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${userTokenA}`
          },
          body: JSON.stringify({
            amount: amt,
            paymentMethod: 'Telebirr'
          })
        });
        expect(res.status).toBe(400);
      }
    });

    it('rejects invalid Telebirr phone numbers on withdrawal', async () => {
      // Credit some funds for testing
      databaseService.updateWalletBalance(userA.id, 500, 0);

      const invalidPhones = ['12345', '0812345678', '+12025550199', '091122334455', 'abcdefghij'];

      for (const phone of invalidPhones) {
        const res = await fetch(`${BASE_URL}/api/wallet/withdraw`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${userTokenA}`
          },
          body: JSON.stringify({
            amount: 50,
            address: phone,
            paymentMethod: 'Telebirr'
          })
        });
        expect(res.status).toBe(400);
      }
    });

    it('accepts valid Telebirr phone format (09xxxxxxxx or 07xxxxxxxx)', async () => {
      const res = await fetch(`${BASE_URL}/api/wallet/withdraw`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userTokenA}`
        },
        body: JSON.stringify({
          amount: 50,
          address: '0912345678',
          paymentMethod: 'Telebirr'
        })
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.request.address).toBe('0912345678');
    });
  });

  describe('PART 3 & 4: Telegram Authentication & Privilege Escalation Protection', () => {
    it('blocks admin Telegram ID from using unauthenticated telegramLogin', () => {
      // Admin ID passed directly to legacy telegramLogin must be rejected
      const adminTgId = '888999111';
      const loginRes = authService.telegramLogin({
        id: parseInt(adminTgId),
        first_name: 'Hacker',
        username: 'fake_admin'
      });
      expect(loginRes.success).toBe(false);
      expect(loginRes.error).toMatch(/verified Telegram WebApp initData|Administrative accounts/i);
    });

    it('rejects regular user trying to access admin endpoints', async () => {
      const res = await fetch(`${BASE_URL}/api/admin/deposits`, {
        headers: {
          'Authorization': `Bearer ${userTokenA}`
        }
      });
      expect(res.status).toBe(403);
    });
  });

  describe('PART 6: Financial Multi-Step Failure and ACID Rollback Verification', () => {
    it('rolls back wallet balance deduction if an error occurs during withdrawal creation', () => {
      databaseService.updateWalletBalance(userA.id, 500, 0);
      const balanceBefore = databaseService.getWallet(userA.id)?.balance;
      const reservedBefore = databaseService.getWallet(userA.id)?.reserved_balance;

      expect(() => {
        databaseService.transaction(() => {
          // Step 1: Deduct balance and reserve
          (databaseService as any).db.prepare(`
            UPDATE wallets SET balance = balance - 100, reserved_balance = reserved_balance + 100 WHERE user_id = ?
          `).run(userA.id);

          // Step 2: Simulate failure (e.g. invalid query or unexpected crash before withdrawal request insert)
          throw new Error('Simulated failure during withdrawal creation');
        });
      }).toThrow('Simulated failure during withdrawal creation');

      // Verify wallet balance and reserved balance were completely rolled back
      const walletAfter = databaseService.getWallet(userA.id)!;
      expect(walletAfter.balance).toBe(balanceBefore);
      expect(walletAfter.reserved_balance).toBe(reservedBefore);
    });

    it('rolls back deposit approval if an error occurs during ledger recording', () => {
      const dep = databaseService.createDepositRequest(userA.id, userA.username, 300, 'Telebirr', `DEP-ROLLBACK-${Date.now()}`);
      expect(dep.status).toBe('PENDING');

      const balanceBefore = databaseService.getWallet(userA.id)?.balance || 0;

      expect(() => {
        databaseService.transaction(() => {
          // Step 1: Update status to APPROVED
          (databaseService as any).db.prepare(`
            UPDATE deposit_requests SET status = 'APPROVED' WHERE id = ?
          `).run(dep.id);

          // Step 2: Simulate failure before ledger insertion completes
          throw new Error('Simulated failure during ledger insertion');
        });
      }).toThrow('Simulated failure during ledger insertion');

      // Verify status is STILL PENDING and balance was NOT credited
      const depAfter = databaseService.getDepositRequest(dep.id)!;
      expect(depAfter.status).toBe('PENDING');
      const walletAfter = databaseService.getWallet(userA.id)!;
      expect(walletAfter.balance).toBe(balanceBefore);
    });

    it('rolls back withdrawal approval if an error occurs during ledger recording', () => {
      databaseService.updateWalletBalance(userA.id, 500, 0);
      const wth = databaseService.createWithdrawalRequest(userA.id, userA.username, 100, '0912345678');
      expect(wth.status).toBe('PENDING');

      const walletBefore = databaseService.getWallet(userA.id)!;
      expect(walletBefore.reserved_balance).toBe(100);

      expect(() => {
        databaseService.transaction(() => {
          // Step 1: Update status to APPROVED
          (databaseService as any).db.prepare(`
            UPDATE withdrawal_requests SET status = 'APPROVED' WHERE id = ?
          `).run(wth.id);

          // Step 2: Simulate failure before reserved balance deduction completes
          throw new Error('Simulated failure during withdrawal finalization');
        });
      }).toThrow('Simulated failure during withdrawal finalization');

      // Verify status is STILL PENDING and reserved balance is NOT lost
      const wthAfter = databaseService.getWithdrawalRequest(wth.id)!;
      expect(wthAfter.status).toBe('PENDING');
      const walletAfter = databaseService.getWallet(userA.id)!;
      expect(walletAfter.reserved_balance).toBe(100);
    });
  });

  describe('PART 8: Money Representation & Floating-Point Stability', () => {
    it('maintains exact 2-decimal precision without floating point inaccuracies', () => {
      databaseService.updateWalletBalance(userA.id, 0, 0);

      // Perform fractional ledger operations (0.10 + 0.20)
      databaseService.recordLedgerTransaction({
        userId: userA.id,
        username: userA.username,
        type: 'DEPOSIT',
        amount: 0.10,
        description: 'Fractional deposit 1'
      });

      databaseService.recordLedgerTransaction({
        userId: userA.id,
        username: userA.username,
        type: 'DEPOSIT',
        amount: 0.20,
        description: 'Fractional deposit 2'
      });

      const wallet = databaseService.getWallet(userA.id)!;
      // In raw JS floating point, 0.1 + 0.2 is 0.30000000000000004.
      // Our database and ledger must report exactly 0.3
      expect(wallet.balance).toBe(0.3);
    });
  });
});
