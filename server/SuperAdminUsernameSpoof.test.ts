import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { DatabaseService } from './DatabaseService.js';
import { AuthService } from './AuthService.js';

// Regression: super-admin status used to be granted at boot to any row whose
// `username` matched a hardcoded list. Phone registration lets anyone pick that
// username, so a restart turned a self-registered account into a SUPER_ADMIN.
describe('Super admin cannot be claimed via a chosen username', () => {
  let tmpDir: string;
  let dbPath: string;
  const savedEnv: Record<string, string | undefined> = {};
  const ENV_KEYS = ['TEST_PERSISTENT_DB', 'SUPER_ADMIN_TELEGRAM_IDS', 'SUPER_ADMIN_TELEGRAM_USERNAMES'];
  const openDbs: DatabaseService[] = [];

  beforeEach(() => {
    for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
    process.env.TEST_PERSISTENT_DB = '1';
    process.env.SUPER_ADMIN_TELEGRAM_IDS = '99887766';
    // Even if a deployment still sets the legacy env var, it must not grant privileges.
    process.env.SUPER_ADMIN_TELEGRAM_USERNAMES = 'legacy_admin_name';
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'superadmin-spoof-'));
    dbPath = path.join(tmpDir, 'bingo.db');
  });

  afterEach(() => {
    for (const db of openDbs.splice(0)) {
      try { (db as any).db?.close(); } catch { /* already closed */ }
    }
    for (const k of ENV_KEYS) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  for (const name of ['jagema_kello', 'mxt_mdn', '@sammy_erk', 'legacy_admin_name']) {
    it(`keeps a phone-registered "${name}" as USER after the database is reopened`, () => {
      const db1 = new DatabaseService(dbPath);
      openDbs.push(db1);
      const auth1 = new AuthService(db1);

      const res = auth1.register(name, '0944123456', 'secret123');
      expect(res.success).toBe(true);
      const playerId = res.user!.playerId;
      expect(res.user!.role).toBe('USER');
      expect(db1.getUserById(playerId)?.role).toBe('USER');

      // Simulate a server restart: a fresh DatabaseService on the same file runs migrations.
      const db2 = new DatabaseService(dbPath);
      openDbs.push(db2);
      expect(db2.getUserById(playerId)?.role).toBe('USER');
    });
  }
});
