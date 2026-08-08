import { handlePermitted } from './handler';
import {
  listUsers,
  createUser,
  updateUser,
  setUserActive,
  resetUserPassword,
  listRoles,
  getRolePermissions,
  createUserInput,
  updateUserInput,
} from '../../src/services/users';
import { z } from 'zod';

export function registerUserHandlers(): void {
  handlePermitted('users:list', 'users', 'view', async () => listUsers());

  handlePermitted<z.infer<typeof createUserInput>>('users:create', 'users', 'create', async ({ user, payload }) =>
    createUser({ userId: user.id, username: user.username }, payload),
  );

  handlePermitted<z.infer<typeof updateUserInput>>('users:update', 'users', 'update', async ({ user, payload }) =>
    updateUser({ userId: user.id, username: user.username }, payload),
  );

  handlePermitted<{ id: string; isActive: boolean }>('users:setActive', 'users', 'update', async ({ user, payload }) =>
    setUserActive({ userId: user.id, username: user.username }, payload.id, payload.isActive),
  );

  handlePermitted<{ id: string; newPassword: string }>(
    'users:resetPassword',
    'users',
    'update',
    async ({ user, payload }) =>
      resetUserPassword({ userId: user.id, username: user.username }, payload.id, payload.newPassword),
  );

  handlePermitted('roles:list', 'users', 'view', async () => listRoles());

  handlePermitted<{ roleId: string }>('roles:permissions', 'users', 'view', async ({ payload }) =>
    getRolePermissions(payload.roleId),
  );
}
