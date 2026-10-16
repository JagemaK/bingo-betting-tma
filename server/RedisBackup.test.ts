import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';
import {
  SnapshotStore,
  SnapshotKeys,
  snapshotKeys,
  restoreDatabase,
  BackupScheduler
} from './RedisBackup.js';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite');

/** In-memory stand-in for Redis with the same fencing semantics as the Lua script. */
class FakeStore implements SnapshotStore {
  data = new Map<string, string>();
  async get(key: string) { return this.data.get(key) ?? null; }
  async incr(key: string) {
    const next = Number(this.data.get(key) ?? '0') + 1;
    this.data.set(key, String(next));
    return next;
  }
  async writeSnapshotFenced(keys: SnapshotKeys, generation: number, snapshot: string, meta: string) {
    if (Number(this.data.get(keys.generation) ?? '0') !== generation) return false;
    const current = this.data.get(keys.snapshot);
    if (current) {
      this.data.set(keys.prevSnapshot, current);
      this.data.set(keys.prevMeta, this.data.get(keys.meta) ?? '');
    }
    this.data.set(keys.snapshot, snapshot);
    this.data.set(keys.meta, meta);
    return true;
  }
  async close() {}
}

describe('Redis database backup & restore', () => {
  const keys = snapshotKeys('test:');
  let dir: string;
  let store: FakeStore;

  const openDb = (file: string) => {
    const db = new DatabaseSync(file);
    db.exec('CREATE TABLE IF NOT EXISTS balances (user TEXT PRIMARY KEY, amount REAL)');
    return db;
  };
  const balanceOf = (file: string, user: string) => {
    const db = new DatabaseSync(file);
    try {
      return (db.prepare('SELECT amount FROM balances WHERE user = ?').get(user) as any)?.amount;
    } finally {
      db.close();
    }
  };

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bingo-redis-test-'));
    store = new FakeStore();
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('round-trips the database through a snapshot after a simulated disk wipe', async () => {
    const gen = await store.incr(keys.generation);
    const db = openDb(path.join(dir, 'live.db'));
    db.prepare('INSERT INTO balances VALUES (?, ?)').run('alice', 250);

    await new BackupScheduler(store, db, gen, keys).backupNow();
    db.close();

    const restoredPath = path.join(dir, 'fresh-disk', 'bingo.db');
    expect(await restoreDatabase(store, restoredPath, keys)).toBe('restored');
    expect(balanceOf(restoredPath, 'alice')).toBe(250);
  });

  it('only snapshots when the database changed', async () => {
    const gen = await store.incr(keys.generation);
    const db = openDb(path.join(dir, 'live.db'));
    const scheduler = new BackupScheduler(store, db, gen, keys);

    await scheduler.backupIfChanged();
    const first = store.data.get(keys.meta);
    await scheduler.backupIfChanged();
    expect(store.data.get(keys.meta)).toBe(first);

    db.prepare('INSERT INTO balances VALUES (?, ?)').run('bob', 10);
    await scheduler.backupIfChanged();
    expect(store.data.get(keys.meta)).not.toBe(first);
    db.close();
  });

  it('fences out an old instance once a newer one has booted', async () => {
    const oldGen = await store.incr(keys.generation);
    const oldDb = openDb(path.join(dir, 'old.db'));
    oldDb.prepare('INSERT INTO balances VALUES (?, ?)').run('carol', 100);
    const oldScheduler = new BackupScheduler(store, oldDb, oldGen, keys);
    await oldScheduler.backupNow();

    // New instance boots (takes a new generation) and writes its own state
    const newGen = await store.incr(keys.generation);
    const newDb = openDb(path.join(dir, 'new.db'));
    newDb.prepare('INSERT INTO balances VALUES (?, ?)').run('carol', 999);
    await new BackupScheduler(store, newDb, newGen, keys).backupNow();

    // The old instance's final snapshot on shutdown must not overwrite the new one
    oldDb.prepare('UPDATE balances SET amount = 1 WHERE user = ?').run('carol');
    await oldScheduler.backupNow();
    expect(oldScheduler.isFencedOut).toBe(true);

    const restoredPath = path.join(dir, 'restored.db');
    await restoreDatabase(store, restoredPath, keys);
    expect(balanceOf(restoredPath, 'carol')).toBe(999);
    oldDb.close();
    newDb.close();
  });

  it('falls back to the previous snapshot when the latest is corrupt', async () => {
    const gen = await store.incr(keys.generation);
    const db = openDb(path.join(dir, 'live.db'));
    db.prepare('INSERT INTO balances VALUES (?, ?)').run('dan', 42);
    const scheduler = new BackupScheduler(store, db, gen, keys);
    await scheduler.backupNow();
    db.prepare('INSERT INTO balances VALUES (?, ?)').run('erin', 7);
    await scheduler.backupNow();
    db.close();

    store.data.set(keys.snapshot, Buffer.from('not a database').toString('base64'));

    const restoredPath = path.join(dir, 'restored.db');
    expect(await restoreDatabase(store, restoredPath, keys)).toBe('restored-previous');
    expect(balanceOf(restoredPath, 'dan')).toBe(42);
  });

  it('never overwrites an existing local database and reports an empty Redis', async () => {
    const localPath = path.join(dir, 'local.db');
    const db = openDb(localPath);
    db.prepare('INSERT INTO balances VALUES (?, ?)').run('frank', 5);
    db.close();

    expect(await restoreDatabase(store, path.join(dir, 'missing.db'), keys)).toBe('no-snapshot');

    store.data.set(keys.snapshot, 'anything');
    expect(await restoreDatabase(store, localPath, keys)).toBe('local-exists');
    expect(balanceOf(localPath, 'frank')).toBe(5);
  });
});
