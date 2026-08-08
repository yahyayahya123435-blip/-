/** SERVER-ONLY. User & role management. */
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { getPrisma } from '../lib/db';
import { runWithAuditContext, type AuditActor } from '../lib/audit-context';

export const createUserInput = z.object({
  fullName: z.string().trim().min(2).max(100),
  username: z
    .string()
    .trim()
    .min(3)
    .max(50)
    .regex(/^[a-zA-Z0-9_.]+$/),
  password: z.string().min(8).max(200),
  roleId: z.string().min(1),
});

export const updateUserInput = z.object({
  id: z.string().min(1),
  fullName: z.string().trim().min(2).max(100).optional(),
  roleId: z.string().min(1).optional(),
});

export async function listUsers() {
  const prisma = getPrisma();
  const users = await prisma.user.findMany({
    include: { role: true },
    orderBy: { createdAt: 'desc' },
  });
  return users.map(({ passwordHash: _passwordHash, ...rest }) => rest);
}

export async function createUser(actor: AuditActor, input: z.infer<typeof createUserInput>) {
  const parsed = createUserInput.parse(input);
  const passwordHash = await bcrypt.hash(parsed.password, 12);
  return runWithAuditContext(actor, (tx) =>
    tx.user.create({
      data: {
        fullName: parsed.fullName,
        username: parsed.username,
        passwordHash,
        roleId: parsed.roleId,
      },
    }),
  );
}

export async function updateUser(actor: AuditActor, input: z.infer<typeof updateUserInput>) {
  const parsed = updateUserInput.parse(input);
  const { id, ...data } = parsed;
  return runWithAuditContext(actor, (tx) => tx.user.update({ where: { id }, data }));
}

export async function setUserActive(actor: AuditActor, id: string, isActive: boolean) {
  return runWithAuditContext(actor, (tx) => tx.user.update({ where: { id }, data: { isActive } }));
}

export async function resetUserPassword(actor: AuditActor, id: string, newPassword: string) {
  const passwordHash = await bcrypt.hash(z.string().min(8).max(200).parse(newPassword), 12);
  return runWithAuditContext(actor, (tx) => tx.user.update({ where: { id }, data: { passwordHash } }));
}

export async function listRoles() {
  const prisma = getPrisma();
  return prisma.role.findMany({ orderBy: { name: 'asc' } });
}

export async function getRolePermissions(roleId: string) {
  const prisma = getPrisma();
  const rolePerms = await prisma.rolePermission.findMany({
    where: { roleId },
    include: { permission: true },
  });
  return rolePerms.map((rp) => ({ module: rp.permission.module, action: rp.permission.action }));
}
