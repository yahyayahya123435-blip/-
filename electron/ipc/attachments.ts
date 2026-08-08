import { dialog, shell } from 'electron';
import { z } from 'zod';
import { handlePermitted } from './handler';
import { listAttachments, deleteAttachment, uploadAttachment, resolveAttachmentFullPath } from '../../src/services/attachments';
import { getRuntimePaths } from '../runtime-context';

export function registerAttachmentHandlers(): void {
  handlePermitted<{ entityType: string; entityId: string }>('attachments:list', 'documents', 'view', async ({ payload }) =>
    listAttachments(payload.entityType, payload.entityId),
  );

  handlePermitted<{ entityType: string; entityId: string }>(
    'attachments:pickAndUpload',
    'documents',
    'create',
    async ({ user, payload }) => {
      const picked = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [
          { name: 'الملفات المدعومة', extensions: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'jpg', 'jpeg', 'png', 'gif', 'txt', 'csv'] },
        ],
      });
      if (picked.canceled || picked.filePaths.length === 0) {
        return { canceled: true as const };
      }
      const sourcePath = picked.filePaths[0];
      const originalFileName = sourcePath.split(/[\\/]/).pop() ?? 'file';
      const attachment = await uploadAttachment(
        { userId: user.id, username: user.username },
        getRuntimePaths().attachments,
        { entityType: payload.entityType, entityId: payload.entityId, sourcePath, originalFileName },
      );
      return { canceled: false as const, attachment };
    },
  );

  handlePermitted<{ id: string }>('attachments:delete', 'documents', 'delete', async ({ user, payload }) =>
    deleteAttachment({ userId: user.id, username: user.username }, getRuntimePaths().attachments, payload.id),
  );

  handlePermitted<{ storedName: string }>('attachments:openInFolder', 'documents', 'view', async ({ payload }) => {
    const fullPath = resolveAttachmentFullPath(getRuntimePaths().attachments, payload.storedName);
    shell.showItemInFolder(fullPath);
    return { success: true };
  });
}
