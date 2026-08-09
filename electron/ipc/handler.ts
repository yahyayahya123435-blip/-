/**
 * IPC handler helpers shared by every domain module under electron/ipc/.
 * Three tiers, from least to most restrictive:
 *   - handlePublic:    no session required (first-run checks, login, setup)
 *   - handleAuthed:    valid session required, no specific permission
 *   - handlePermitted: valid session + module.action permission required
 *
 * Every handler's result is normalized to { ok, data } | { ok:false, error }
 * and every thrown error is passed through toSafeError so raw Prisma/trigger
 * messages and stack traces never reach the renderer.
 */
import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import type { User } from '../../generated/prisma';
import { toSafeError } from '../../src/lib/app-error';
import { requireSession } from '../../src/lib/session';
import { requirePermission, type PermissionAction } from '../../src/lib/permissions';

export interface IpcRequest<T = unknown> {
  token?: string | null;
  payload?: T;
}

export type IpcResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

type SessionUser = User & { role: { id: string; name: string } };

async function wrap<TResult>(fn: () => Promise<TResult>): Promise<IpcResult<TResult>> {
  try {
    const data = await fn();
    return { ok: true, data };
  } catch (err) {
    const safe = toSafeError(err);
    return { ok: false, error: { code: safe.code, message: safe.message } };
  }
}

export function handlePublic<TPayload = unknown, TResult = unknown>(
  channel: string,
  fn: (ctx: { payload: TPayload }) => Promise<TResult>,
): void {
  ipcMain.handle(channel, (_event: IpcMainInvokeEvent, req: IpcRequest<TPayload>) =>
    wrap(() => fn({ payload: req?.payload as TPayload })),
  );
}

export function handleAuthed<TPayload = unknown, TResult = unknown>(
  channel: string,
  fn: (ctx: { user: SessionUser; token: string; payload: TPayload }) => Promise<TResult>,
): void {
  ipcMain.handle(channel, (_event: IpcMainInvokeEvent, req: IpcRequest<TPayload>) =>
    wrap(async () => {
      const user = (await requireSession(req?.token)) as SessionUser;
      return fn({ user, token: req.token as string, payload: req?.payload as TPayload });
    }),
  );
}

export function handlePermitted<TPayload = unknown, TResult = unknown>(
  channel: string,
  module: string,
  action: PermissionAction,
  fn: (ctx: { user: SessionUser; token: string; payload: TPayload }) => Promise<TResult>,
): void {
  ipcMain.handle(channel, (_event: IpcMainInvokeEvent, req: IpcRequest<TPayload>) =>
    wrap(async () => {
      const user = (await requireSession(req?.token)) as SessionUser;
      await requirePermission(user.id, module, action);
      return fn({ user, token: req.token as string, payload: req?.payload as TPayload });
    }),
  );
}
