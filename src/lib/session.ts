/**
 * SERVER-ONLY. Local session management. The renderer never decides who is
 * logged in — it only holds an opaque token and every sensitive IPC call is
 * re-verified against the sessions table in the main process.
 */
import crypto from 'node:crypto';
import { getPrisma } from './db';

const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

export async function createSession(userId: string) {
  const prisma = getPrisma();
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  // Single active session per user keeps "who is logged in" unambiguous for
  // a single-machine desktop app.
  await prisma.session.deleteMany({ where: { userId } });
  await prisma.session.create({ data: { userId, token, expiresAt } });
  return { token, expiresAt };
}

export async function verifySession(token: string | null | undefined) {
  if (!token) return null;
  const prisma = getPrisma();
  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: { include: { role: true } } },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) {
    await prisma.session.delete({ where: { token } }).catch(() => undefined);
    return null;
  }
  if (!session.user.isActive) return null;
  return session.user;
}

export async function destroySession(token: string | null | undefined) {
  if (!token) return;
  const prisma = getPrisma();
  await prisma.session.deleteMany({ where: { token } });
}

export async function requireSession(token: string | null | undefined) {
  const user = await verifySession(token);
  if (!user) throw new Error('UNAUTHENTICATED');
  return user;
}
