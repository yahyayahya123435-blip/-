/**
 * SERVER-ONLY. Module×action permission checks. The backend is the sole
 * enforcement point — hiding a button in the renderer is a UX nicety, not a
 * security boundary. Every sensitive IPC handler must call requirePermission.
 */
import { getPrisma } from './db';

export type PermissionAction = 'view' | 'create' | 'update' | 'delete' | 'export' | 'approve';

export async function getUserPermissions(userId: string): Promise<Set<string>> {
  const prisma = getPrisma();
  const rolePerms = await prisma.rolePermission.findMany({
    where: { role: { users: { some: { id: userId } } } },
    include: { permission: true },
  });
  return new Set(rolePerms.map((rp) => `${rp.permission.module}.${rp.permission.action}`));
}

export async function hasPermission(
  userId: string,
  module: string,
  action: PermissionAction,
): Promise<boolean> {
  const perms = await getUserPermissions(userId);
  return perms.has(`${module}.${action}`);
}

export class PermissionDeniedError extends Error {
  constructor(module: string, action: string) {
    super(`PERMISSION_DENIED: ${module}.${action}`);
    this.name = 'PermissionDeniedError';
  }
}

export async function requirePermission(
  userId: string,
  module: string,
  action: PermissionAction,
): Promise<void> {
  const ok = await hasPermission(userId, module, action);
  if (!ok) throw new PermissionDeniedError(module, action);
}
