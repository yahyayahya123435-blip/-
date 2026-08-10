/**
 * Shared setup for the service-level tests. Each test file gets its own
 * throwaway SQLite file, bootstrapped through the exact same code path the
 * packaged Electron app uses (migrations + constraint SQL + audit triggers +
 * reference-data seed), so a test failure means the real app would fail too.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { bootstrapDatabase } from '../src/lib/db-bootstrap';
import { initPrisma, disconnectPrisma } from '../src/lib/db';
import { seedCoreData } from '../src/services/seed';
import type { PrismaClient } from '../generated/prisma';

export const PROJECT_ROOT = path.join(__dirname, '..');

export interface TestEnv {
  prisma: PrismaClient;
  dbFile: string;
  root: string;
  cleanup: () => Promise<void>;
}

export async function createTestEnv(label: string): Promise<TestEnv> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `gz-${label}-`));
  const dbFile = path.join(root, 'data', 'database.db');

  bootstrapDatabase(dbFile, PROJECT_ROOT);
  const prisma = initPrisma(dbFile);
  await seedCoreData(prisma);

  return {
    prisma,
    dbFile,
    root,
    cleanup: async () => {
      await disconnectPrisma();
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

/** An audit actor standing in for a signed-in operator. */
export const TEST_ACTOR = { userId: null as string | null, username: 'test-runner' };

export async function countAudit(prisma: PrismaClient, tableName: string, action: string) {
  return prisma.auditLog.count({ where: { tableName, action } });
}
