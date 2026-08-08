/**
 * SERVER-ONLY. Read-only access to audit_logs. There is deliberately no
 * create/update/delete function in this file, no IPC channel for mutating
 * audit_logs, and no UI button anywhere in the app for it — audit_logs is
 * populated exclusively by SQLite triggers (prisma/sqlite-sql/audit-triggers.sql)
 * and is append-only for the lifetime of the application.
 */
import { z } from 'zod';
import { getPrisma } from '../lib/db';
import { paginationInput, paginationSkipTake } from '../lib/validation';

export const listAuditLogsInput = paginationInput.extend({
  tableName: z.string().optional(),
  recordId: z.string().optional(),
  action: z.enum(['INSERT', 'UPDATE', 'DELETE']).optional(),
});

export async function listAuditLogs(input: z.infer<typeof listAuditLogsInput>) {
  const parsed = listAuditLogsInput.parse(input);
  const prisma = getPrisma();
  const where = {
    ...(parsed.tableName ? { tableName: parsed.tableName } : {}),
    ...(parsed.recordId ? { recordId: parsed.recordId } : {}),
    ...(parsed.action ? { action: parsed.action } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      ...paginationSkipTake(parsed),
    }),
    prisma.auditLog.count({ where }),
  ]);
  return { rows, total, page: parsed.page, pageSize: parsed.pageSize };
}
