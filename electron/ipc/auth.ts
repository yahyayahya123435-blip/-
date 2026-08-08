import { z } from 'zod';
import { handlePublic, handleAuthed } from './handler';
import { hasAnyUser, createSuperAdmin, verifyLogin, setupInput, loginInput, changePassword } from '../../src/lib/auth';
import { createSession, destroySession } from '../../src/lib/session';
import { AppError } from '../../src/lib/app-error';

export function registerAuthHandlers(): void {
  handlePublic('auth:hasAnyUser', async () => {
    return { hasAnyUser: await hasAnyUser() };
  });

  handlePublic<typeof setupInput._type>('auth:setup', async ({ payload }) => {
    const user = await createSuperAdmin(payload);
    const session = await createSession(user.id);
    return { token: session.token, user: sanitizeUser(user) };
  });

  handlePublic<typeof loginInput._type>('auth:login', async ({ payload }) => {
    const parsed = loginInput.parse(payload);
    const user = await verifyLogin(parsed.username, parsed.password);
    if (!user) {
      throw new AppError('INVALID_CREDENTIALS', 'اسم المستخدم أو كلمة المرور غير صحيحة');
    }
    const session = await createSession(user.id);
    return { token: session.token, user: sanitizeUser(user) };
  });

  handleAuthed('auth:logout', async ({ token }) => {
    await destroySession(token);
    return { success: true };
  });

  handleAuthed('auth:me', async ({ user }) => {
    return { user: sanitizeUser(user) };
  });

  const changePasswordPayload = z.object({ currentPassword: z.string(), newPassword: z.string().min(8) });
  handleAuthed<z.infer<typeof changePasswordPayload>, { success: true }>(
    'auth:changePassword',
    async ({ user, payload }) => {
      const parsed = changePasswordPayload.parse(payload);
      await changePassword(user.id, parsed.currentPassword, parsed.newPassword);
      return { success: true };
    },
  );
}

function sanitizeUser(user: { id: string; username: string; fullName: string; roleId: string; isActive: boolean }) {
  // Never send passwordHash to the renderer, even indirectly.
  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    roleId: user.roleId,
    isActive: user.isActive,
  };
}
