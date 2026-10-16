import path from 'path';
import { fileURLToPath } from 'url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const DEFAULT_DB_PATH = path.resolve(projectRoot, 'data', 'bingo.db');

/** The SQLite file the server uses outside tests: DATABASE_PATH if set, else data/bingo.db. */
export function resolveDatabasePath(): string {
  const envPath = process.env.DATABASE_PATH?.trim();
  return envPath ? path.resolve(envPath) : DEFAULT_DB_PATH;
}
