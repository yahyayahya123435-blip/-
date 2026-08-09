/**
 * SERVER-ONLY. Import only from electron/ipc/*, electron/main.ts, or
 * src/services/*.ts — never from src/app or src/components. The Next.js
 * renderer runs as a static export with no server; it never talks to
 * Prisma/SQLite directly, only via IPC into this main-process module.
 */
import { PrismaClient } from '../../generated/prisma';

let client: PrismaClient | null = null;

export function initPrisma(dbFilePath: string): PrismaClient {
  if (client) return client;
  client = new PrismaClient({
    datasources: { db: { url: `file:${dbFilePath}` } },
  });
  return client;
}

export function getPrisma(): PrismaClient {
  if (!client) {
    throw new Error('Prisma client not initialized — call initPrisma() at app startup first');
  }
  return client;
}

/**
 * Flushes WAL-mode content into the main database file. Must run before any
 * operation (backup) that reads database.db directly from disk instead of
 * through Prisma — otherwise recently committed rows still sitting in
 * database.db-wal are silently missing from the copy.
 */
export async function checkpointWal(): Promise<void> {
  // PRAGMA wal_checkpoint returns a result row (busy, log, checkpointed
  // frame counts), so it must go through $queryRawUnsafe — $executeRawUnsafe
  // rejects any statement that returns rows on SQLite.
  await getPrisma().$queryRawUnsafe('PRAGMA wal_checkpoint(TRUNCATE)');
}

export async function disconnectPrisma(): Promise<void> {
  if (client) {
    await client.$disconnect();
    client = null;
  }
}
