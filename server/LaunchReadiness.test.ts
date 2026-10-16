import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { httpServer } from './index.js';
import { authService } from './AuthService.js';
import { DatabaseService, databaseService } from './DatabaseService.js';

let BASE_URL: string;

describe('Launch readiness: deposit account safety', () => {
  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      httpServer.listen(0, '127.0.0.1', () => {
        const addr = httpServer.address() as any;
        BASE_URL = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  it('never seeds the placeholder Telebirr number in production', () => {
    const origEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      const prodDb = new DatabaseService(':memory:');
      expect(prodDb.getActivePaymentAccount()).toBeNull();
    } finally {
      process.env.NODE_ENV = origEnv;
    }
  });

  it('deactivates a previously seeded placeholder account on a production boot', () => {
    const db = new DatabaseService(':memory:');
    expect(db.getActivePaymentAccount()?.phone_number).toBe('0912345678');

    const origEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      (db as any).runMigrations();
      expect(db.getActivePaymentAccount()).toBeNull();
    } finally {
      process.env.NODE_ENV = origEnv;
    }
  });

  it('shows no deposit number and rejects deposits when no account is configured', async () => {
    const active = databaseService.getActivePaymentAccount();
    if (active) {
      databaseService.getDb().prepare('UPDATE payment_accounts SET is_active = 0').run();
    }
    try {
      const accRes = await fetch(`${BASE_URL}/api/payment/active-account`);
      expect(accRes.status).toBe(200);
      const accData = await accRes.json();
      expect(accData.success).toBe(true);
      expect(accData.account).toBeNull();

      const reg = authService.register('Launch Tester', '0933221100', 'launch_pass_1');
      expect(reg.success).toBe(true);
      const depRes = await fetch(`${BASE_URL}/api/wallet/deposit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${reg.token}` },
        body: JSON.stringify({ amount: 100, paymentMethod: 'Telebirr', referenceId: 'TBR_LAUNCH_001' })
      });
      expect(depRes.status).toBe(503);
      expect((await depRes.json()).error).toMatch(/temporarily unavailable/i);
    } finally {
      if (active) {
        databaseService.getDb().prepare('UPDATE payment_accounts SET is_active = 1 WHERE id = ?').run(active.id);
      }
    }
  });

  it('reports launch-critical configuration in /api/health', async () => {
    const res = await fetch(`${BASE_URL}/api/health`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(typeof data.database.persistentPathConfigured).toBe('boolean');
    expect(typeof data.payments.depositAccountConfigured).toBe('boolean');
    expect(['off', 'polling', 'webhook']).toContain(data.telegram.mode);
  });
});
