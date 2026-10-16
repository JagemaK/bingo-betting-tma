/**
 * Production entry point.
 *
 * Restores the SQLite database from Redis (when REDIS_URL is set) BEFORE the server modules load,
 * because the database is opened as soon as DatabaseService is imported.
 */
import { resolveDatabasePath } from './dbPath.js';
import { initRedisPersistence } from './RedisBackup.js';

try {
  await initRedisPersistence(resolveDatabasePath());
} catch (err: any) {
  console.error('[Startup] FATAL: REDIS_URL is set but the database could not be restored from Redis:', err?.message || err);
  console.error('[Startup] Refusing to start with an empty database that would overwrite the backup. Check REDIS_URL / Redis availability.');
  process.exit(1);
}

await import('./index.js');
