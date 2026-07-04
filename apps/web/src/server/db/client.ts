import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import * as schema from './schema';

let sqlite: Database.Database | null = null;
let dbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null;

/**
 * Default DB location when neither an explicit path nor BOOKKEEPRR_DB_PATH is
 * set. A deployed container exports BOOKKEEPRR_CONFIG_DIR pointing at the
 * mounted config volume (e.g. /config), so the DB lands there and survives
 * container recreates/updates. Only local dev (no CONFIG_DIR) keeps the
 * repo-local dev DB.
 *
 * This used to fall back to ./bookkeeprr.dev.db unconditionally — in a
 * container that path lives in the EPHEMERAL writable layer, so every recreate
 * silently discarded the entire database. Defaulting onto CONFIG_DIR makes
 * persistence the safe default even if BOOKKEEPRR_DB_PATH is never set.
 */
function defaultDbPath(): string {
  const configDir = process.env.BOOKKEEPRR_CONFIG_DIR;
  return configDir ? join(configDir, 'bookkeeprr.db') : './bookkeeprr.dev.db';
}

export function getDb(dbPath?: string): ReturnType<typeof drizzle<typeof schema>> {
  if (dbInstance) return dbInstance;
  // Under Vitest, refuse the dev-DB fallback. A test that reaches getDb()
  // without an explicit path or BOOKKEEPRR_DB_PATH would otherwise read/write
  // ./bookkeeprr.dev.db — silently corrupting real settings (e.g. resetting the
  // ComicVine/MAL keys to their defaults). Fail loudly so the leaking test gets
  // fixed (use seedDb() or set BOOKKEEPRR_DB_PATH to a temp file) instead.
  if (process.env.VITEST && dbPath == null && !process.env.BOOKKEEPRR_DB_PATH) {
    throw new Error(
      'getDb() called under test without an isolated DB. Set BOOKKEEPRR_DB_PATH ' +
        '(or use seedDb()) so the test never touches ./bookkeeprr.dev.db.',
    );
  }
  const path = dbPath ?? process.env.BOOKKEEPRR_DB_PATH ?? defaultDbPath();
  mkdirSync(dirname(path), { recursive: true });
  sqlite = new Database(path);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('synchronous = NORMAL');
  sqlite.pragma('busy_timeout = 5000');
  sqlite.pragma('foreign_keys = ON');
  dbInstance = drizzle(sqlite, { schema });
  return dbInstance;
}

export function closeDb(): void {
  sqlite?.close();
  sqlite = null;
  dbInstance = null;
}
