import { handlePermitted } from './handler';
import { listAuditLogs, listAuditLogsInput } from '../../src/services/audit';
import { z } from 'zod';

export function registerAuditHandlers(): void {
  // "audit_logs" module permission is granted only to roles that should see
  // the trail (Super Admin / مدير الجمعية via seed). No write channels exist.
  handlePermitted<z.infer<typeof listAuditLogsInput>>('auditLogs:list', 'users', 'view', async ({ payload }) =>
    listAuditLogs(payload),
  );
}
