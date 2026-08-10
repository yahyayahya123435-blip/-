/**
 * SQLite access for the field app.
 *
 * The database lives inside the app's private storage (expo-sqlite's default
 * location), so it survives the app being closed, the phone being restarted,
 * and having no network — which is the normal working condition here, not an
 * edge case. Nothing is ever sent anywhere; the only way data leaves is a
 * transfer file the user creates and shares by hand.
 */
import * as SQLite from 'expo-sqlite';
import * as Crypto from 'expo-crypto';
import { SCHEMA_SQL, SCHEMA_VERSION } from './schema';

const DATABASE_NAME = 'ghsoon-zahran-field.db';

let database: SQLite.SQLiteDatabase | null = null;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (database) return database;
  const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
  await db.execAsync(SCHEMA_SQL);
  await db.runAsync(
    `INSERT INTO meta (key, value) VALUES ('schemaVersion', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    String(SCHEMA_VERSION),
  );
  database = db;
  return db;
}

/** A v4 UUID — the primary key for every record created on this phone. */
export function newId(): string {
  return Crypto.randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}

export async function getMeta(key: string): Promise<string | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM meta WHERE key = ?', key);
  return row?.value ?? null;
}

export async function setMeta(key: string, value: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO meta (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    key,
    value,
  );
}

/**
 * This installation's device id — generated once and kept forever, so the
 * desktop can tell which phone a transfer package came from.
 */
export async function getDeviceId(): Promise<string> {
  const existing = await getMeta('deviceId');
  if (existing) return existing;
  const id = newId();
  await setMeta('deviceId', id);
  return id;
}

/** Runs `fn` inside a transaction; any throw rolls the whole thing back. */
export async function withTransaction<T>(
  fn: (db: SQLite.SQLiteDatabase) => Promise<T>,
): Promise<T> {
  const db = await getDatabase();
  let result!: T;
  await db.withTransactionAsync(async () => {
    result = await fn(db);
  });
  return result;
}
