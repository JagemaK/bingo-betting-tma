/**
 * Redis-backed persistence for the SQLite database.
 *
 * Hosts with ephemeral disks (e.g. Render's free plan) wipe the SQLite file on every deploy/restart.
 * When REDIS_URL is set, the server:
 *   1. Restores the latest snapshot from Redis on boot, before the database is opened (see start.ts),
 *      unless a local database file already exists (e.g. a persistent disk).
 *   2. Snapshots the database to Redis whenever it has changed (every REDIS_BACKUP_INTERVAL_SECONDS)
 *      and once more on graceful shutdown.
 *
 * Safety:
 *   - Fencing: every boot takes a new generation number. A snapshot is written only while this process
 *     still owns the latest generation, so an old instance shutting down during a deploy can never
 *     overwrite the newer instance's data.
 *   - Fail closed: if a restore is needed but Redis can't be read, boot is aborted rather than starting
 *     with an empty database that would later overwrite the good snapshot.
 *   - Each snapshot is checksummed and integrity-checked on restore; the previous snapshot is kept as a fallback.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import zlib from 'zlib';
import { createRequire } from 'module';
import { createClient } from 'redis';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite');

export interface SnapshotMeta {
  createdAt: string;
  bytes: number;
  sha256: string;
  generation: number;
}

/** Minimal storage interface, so the logic can be tested without a Redis server. */
export interface SnapshotStore {
  get(key: string): Promise<string | null>;
  incr(key: string): Promise<number>;
  /** Atomically keep the current snapshot as "prev" and write the new one, only if `generation` is still current. */
  writeSnapshotFenced(keys: SnapshotKeys, generation: number, snapshot: string, meta: string): Promise<boolean>;
  close(): Promise<void>;
}

export interface SnapshotKeys {
  generation: string;
  snapshot: string;
  meta: string;
  prevSnapshot: string;
  prevMeta: string;
}

export function snapshotKeys(prefix = process.env.REDIS_KEY_PREFIX || 'bingo:'): SnapshotKeys {
  return {
    generation: `${prefix}db:generation`,
    snapshot: `${prefix}db:snapshot`,
    meta: `${prefix}db:snapshot:meta`,
    prevSnapshot: `${prefix}db:snapshot:prev`,
    prevMeta: `${prefix}db:snapshot:prev:meta`
  };
}

const FENCED_WRITE_SCRIPT = `
if tonumber(redis.call('GET', KEYS[1]) or '0') ~= tonumber(ARGV[1]) then return 0 end
local current = redis.call('GET', KEYS[2])
if current then
  redis.call('SET', KEYS[4], current)
  redis.call('SET', KEYS[5], redis.call('GET', KEYS[3]) or '')
end
redis.call('SET', KEYS[2], ARGV[2])
redis.call('SET', KEYS[3], ARGV[3])
return 1
`;

export async function createRedisSnapshotStore(url: string): Promise<SnapshotStore> {
  let everConnected = false;
  const client = createClient({
    url,
    socket: {
      connectTimeout: 10000,
      // Give up quickly on the initial connection (boot fails loudly); reconnect indefinitely afterwards
      reconnectStrategy: (retries) => (!everConnected && retries >= 5)
        ? new Error('Redis is unreachable')
        : Math.min(retries * 500, 5000)
    }
  });
  client.on('error', (err) => console.error('[RedisBackup] Redis error:', err?.message || err));
  await client.connect();
  everConnected = true;
  return {
    get: (key) => client.get(key),
    incr: (key) => client.incr(key),
    async writeSnapshotFenced(keys, generation, snapshot, meta) {
      const result = await client.eval(FENCED_WRITE_SCRIPT, {
        keys: [keys.generation, keys.snapshot, keys.meta, keys.prevSnapshot, keys.prevMeta],
        arguments: [String(generation), snapshot, meta]
      });
      return Number(result) === 1;
    },
    async close() {
      try { await client.quit(); } catch { /* already closed */ }
    }
  };
}

/** Take a consistent copy of the live database (WAL included) as a gzip+base64 payload. */
export function createSnapshot(db: any, generation: number): { payload: string; meta: SnapshotMeta } {
  const tmpFile = path.join(os.tmpdir(), `bingo-snapshot-${process.pid}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.db`);
  try {
    db.exec(`VACUUM INTO '${tmpFile.replace(/'/g, "''")}'`);
    const raw = fs.readFileSync(tmpFile);
    return {
      payload: zlib.gzipSync(raw).toString('base64'),
      meta: {
        createdAt: new Date().toISOString(),
        bytes: raw.length,
        sha256: crypto.createHash('sha256').update(raw).digest('hex'),
        generation
      }
    };
  } finally {
    fs.rmSync(tmpFile, { force: true });
  }
}

function decodeAndVerify(payload: string, metaJson: string | null, label: string): Buffer {
  const raw = zlib.gunzipSync(Buffer.from(payload, 'base64'));
  if (metaJson) {
    const meta = JSON.parse(metaJson) as SnapshotMeta;
    const digest = crypto.createHash('sha256').update(raw).digest('hex');
    if (meta.sha256 && meta.sha256 !== digest) {
      throw new Error(`${label} checksum mismatch`);
    }
  }
  return raw;
}

function writeVerifiedDatabase(raw: Buffer, dbPath: string): void {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const tmpPath = `${dbPath}.restore-${process.pid}`;
  fs.writeFileSync(tmpPath, raw);
  try {
    const check = new DatabaseSync(tmpPath);
    try {
      const row = check.prepare('PRAGMA quick_check').get() as any;
      const verdict = row ? Object.values(row)[0] : undefined;
      if (verdict !== 'ok') throw new Error(`integrity check failed: ${verdict}`);
    } finally {
      check.close();
    }
    fs.renameSync(tmpPath, dbPath);
  } catch (err) {
    fs.rmSync(tmpPath, { force: true });
    throw err;
  }
}

export type RestoreOutcome = 'local-exists' | 'no-snapshot' | 'restored' | 'restored-previous';

/** Restore the newest valid snapshot to dbPath, unless a local database already exists. */
export async function restoreDatabase(store: SnapshotStore, dbPath: string, keys = snapshotKeys()): Promise<RestoreOutcome> {
  if (fs.existsSync(dbPath)) return 'local-exists';

  const candidates: Array<{ label: string; data: string | null; meta: string | null; outcome: RestoreOutcome }> = [
    { label: 'latest snapshot', data: await store.get(keys.snapshot), meta: await store.get(keys.meta), outcome: 'restored' },
    { label: 'previous snapshot', data: await store.get(keys.prevSnapshot), meta: await store.get(keys.prevMeta), outcome: 'restored-previous' }
  ];
  if (!candidates.some((c) => c.data)) return 'no-snapshot';

  let lastError: unknown;
  for (const c of candidates) {
    if (!c.data) continue;
    try {
      writeVerifiedDatabase(decodeAndVerify(c.data, c.meta || null, c.label), dbPath);
      return c.outcome;
    } catch (err) {
      lastError = err;
      console.error(`[RedisBackup] Could not restore ${c.label}:`, (err as any)?.message || err);
    }
  }
  throw new Error(`No usable snapshot in Redis: ${(lastError as any)?.message || lastError}`);
}

export class BackupScheduler {
  private timer: NodeJS.Timeout | null = null;
  private lastChanges = -1;
  private inFlight: Promise<void> | null = null;
  private fencedOut = false;

  constructor(
    private store: SnapshotStore,
    private db: any,
    private generation: number,
    private keys: SnapshotKeys = snapshotKeys()
  ) {}

  start(intervalMs: number): void {
    this.timer = setInterval(() => {
      this.backupIfChanged().catch((err) => console.error('[RedisBackup] Scheduled backup failed:', err?.message || err));
    }, intervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** True once a newer instance has taken over; this process stops writing snapshots. */
  get isFencedOut(): boolean {
    return this.fencedOut;
  }

  async backupIfChanged(): Promise<void> {
    const changes = Number((this.db.prepare('SELECT total_changes() AS c').get() as any)?.c ?? 0);
    if (changes === this.lastChanges) return;
    await this.backupNow();
  }

  backupNow(): Promise<void> {
    if (this.fencedOut) return Promise.resolve();
    if (this.inFlight) return this.inFlight;
    this.inFlight = (async () => {
      const changes = Number((this.db.prepare('SELECT total_changes() AS c').get() as any)?.c ?? 0);
      const { payload, meta } = createSnapshot(this.db, this.generation);
      const ok = await this.store.writeSnapshotFenced(this.keys, this.generation, payload, JSON.stringify(meta));
      if (!ok) {
        this.fencedOut = true;
        this.stop();
        console.warn(`[RedisBackup] A newer server instance owns the database (generation > ${this.generation}); this instance stopped writing snapshots.`);
        return;
      }
      this.lastChanges = changes;
    })().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }
}

// ---------------- Process-wide wiring (used by start.ts and index.ts) ----------------

let active: { store: SnapshotStore; generation: number } | null = null;
let scheduler: BackupScheduler | null = null;

/** Called by start.ts before the database module loads. Throws (aborting boot) if Redis is unusable. */
export async function initRedisPersistence(dbPath: string): Promise<void> {
  const url = process.env.REDIS_URL?.trim();
  if (!url) return;
  const store = await createRedisSnapshotStore(url);
  const keys = snapshotKeys();
  const generation = await store.incr(keys.generation);
  const outcome = await restoreDatabase(store, dbPath, keys);
  const messages: Record<RestoreOutcome, string> = {
    'local-exists': `local database ${dbPath} already exists; keeping it (no restore)`,
    'no-snapshot': 'no snapshot in Redis yet; starting with a fresh database',
    'restored': `restored database from Redis to ${dbPath}`,
    'restored-previous': `latest snapshot was unusable; restored the PREVIOUS snapshot to ${dbPath}`
  };
  console.log(`[RedisBackup] Generation ${generation}: ${messages[outcome]}`);
  active = { store, generation };
}

/** Called by index.ts once the database is open. */
export function startRedisBackups(db: any): BackupScheduler | null {
  if (!active || scheduler) return scheduler;
  const seconds = Number.parseInt(process.env.REDIS_BACKUP_INTERVAL_SECONDS || '', 10);
  const intervalMs = (Number.isFinite(seconds) && seconds > 0 ? seconds : 10) * 1000;
  scheduler = new BackupScheduler(active.store, db, active.generation);
  scheduler.start(intervalMs);
  // Take the first snapshot right away (also seeds Redis on the very first deploy)
  scheduler.backupNow().catch((err) => console.error('[RedisBackup] Initial backup failed:', err?.message || err));
  console.log(`[RedisBackup] Backing up the database to Redis every ${intervalMs / 1000}s when it changes.`);
  return scheduler;
}

export function getRedisBackupStatus(): { enabled: boolean; generation?: number; fencedOut?: boolean } {
  if (!active) return { enabled: false };
  return { enabled: true, generation: active.generation, fencedOut: scheduler?.isFencedOut ?? false };
}

/** Final snapshot on shutdown. Safe to call when Redis is not configured. */
export async function flushRedisBackup(): Promise<void> {
  if (!scheduler || !active) return;
  scheduler.stop();
  // Twice: the first call may only await a backup that was already in flight
  await scheduler.backupIfChanged();
  await scheduler.backupIfChanged();
  await active.store.close();
}
