/**
 * SERVER-ONLY. Local authentication — no Supabase Auth, no remote identity
 * provider. Passwords are bcrypt-hashed (cost 12), never stored or logged
 * in plain text, and explicitly excluded from audit_logs payloads (see
 * scripts/generate-sqlite-triggers.ts EXCLUDED_COLUMNS).
 */
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { getPrisma } from './db';
import { runWithAuditContext } from './audit-context';

const BCRYPT_COST = 12;

export const setupInput = z.object({
  fullName: z.string().trim().min(2).max(100),
  username: z
    .string()
    .trim()
    .min(3)
    .max(50)
    .regex(/^[a-zA-Z0-9_.]+$/, 'اسم المستخدم يجب أن يحتوي أحرف/أرقام/نقطة/شرطة سفلية فقط'),
  password: z.string().min(8).max(200),
});
export type SetupInput = z.infer<typeof setupInput>;

export async function hasAnyUser(): Promise<boolean> {
  const prisma = getPrisma();
  const count = await prisma.user.count();
  return count > 0;
}

export async function createSuperAdmin(input: SetupInput) {
  const parsed = setupInput.parse(input);
  if (await hasAnyUser()) {
    throw new Error('SETUP_ALREADY_DONE');
  }
  const prisma = getPrisma();
  const role = await prisma.role.findUnique({ where: { name: 'Super Admin' } });
  if (!role) throw new Error('ROLE_NOT_SEEDED');

  const passwordHash = await bcrypt.hash(parsed.password, BCRYPT_COST);
  return runWithAuditContext({ userId: null, username: 'system:setup' }, (tx) =>
    tx.user.create({
      data: {
        fullName: parsed.fullName,
        username: parsed.username,
        passwordHash,
        roleId: role.id,
      },
    }),
  );
}

export const loginInput = z.object({
  username: z.string().trim().min(1).max(50),
  password: z.string().min(1).max(200),
});

export async function verifyLogin(username: string, password: string) {
  const prisma = getPrisma();
  const user = await prisma.user.findUnique({
    where: { username },
    include: { role: true },
  });
  if (!user || !user.isActive) return null;
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return null;
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  return user;
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const prisma = getPrisma();
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error('USER_NOT_FOUND');
  const ok = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!ok) throw new Error('INVALID_CURRENT_PASSWORD');
  const passwordHash = await bcrypt.hash(z.string().min(8).max(200).parse(newPassword), BCRYPT_COST);
  return runWithAuditContext({ userId, username: user.username }, (tx) =>
    tx.user.update({ where: { id: userId }, data: { passwordHash } }),
  );
}
