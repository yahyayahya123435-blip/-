/**
 * SERVER-ONLY. Import only from electron/ipc/*, electron/main.ts, or
 * src/services/*.ts — never from src/app or src/components. The Next.js
 * renderer runs as a static export with no server; it never talks to
 * Prisma/SQLite directly, only via IPC into this main-process module.
 */
import { PrismaClient } from '@prisma/client';

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

export async function disconnectPrisma(): Promise<void> {
  if (client) {
    await client.$disconnect();
    client = null;
  }
}
