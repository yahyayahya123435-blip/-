/**
 * SERVER-ONLY. Rebuilds the "who did this write" mechanism for SQLite.
 *
 * PostgreSQL used SET LOCAL / set_config() to make the acting user visible
 * to triggers within a transaction. SQLite has no session-local GUCs, so the
 * app instead updates a single-row _audit_context table INSIDE the same
 * transaction as the write it is attributing, then commits. Because SQLite
 * serializes writers (single-writer, WAL mode), there is no cross-transaction
 * race here the way there would be with pooled PostgreSQL connections.
 *
 * Every write to an audited table MUST go through runWithAuditContext so the
 * AFTER INSERT/UPDATE/DELETE triggers (prisma/sqlite-sql/audit-triggers.sql)
 * can read back who performed it.
 */
import type { Prisma, PrismaClient } from '../../generated/prisma';
import { getPrisma } from './db';

export type AuditActor = { userId: string | null; username: string | null };

type TxClient = Prisma.TransactionClient;

export async function runWithAuditContext<T>(
  actor: AuditActor,
  fn: (tx: TxClient) => Promise<T>,
): Promise<T> {
  const prisma: PrismaClient = getPrisma();
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `UPDATE _audit_context SET value = ? WHERE key = 'current_user_id'`,
      actor.userId,
    );
    await tx.$executeRawUnsafe(
      `UPDATE _audit_context SET value = ? WHERE key = 'current_username'`,
      actor.username,
    );
    return fn(tx);
  });
}
