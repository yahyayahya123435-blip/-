/**
 * IPC for the manual phone↔PC transfer.
 *
 * The renderer never sees a filesystem path it did not get from a dialog:
 * `transfer:pickAndPreview` returns a path only after the user picked the
 * file themselves, and `transfer:commit` accepts only that path back. Preview
 * is gated on transfer.view, committing on transfer.create.
 */
import { app, dialog, shell } from 'electron';
import { z } from 'zod';
import { handlePermitted } from './handler';
import {
  previewTransferPackage, commitTransferPackage, exportForMobile, listImportBatches,
} from '../../src/services/transfer';
import { TRANSFER_FILE_EXTENSION } from '../../src/lib/transfer-format';
import { getRuntimePaths } from '../runtime-context';
import { getOrCreateDeviceId } from '../device-id';

const commitInput = z.object({ filePath: z.string().min(1) });

export function registerTransferHandlers(): void {
  handlePermitted('transfer:pickAndPreview', 'transfer', 'view', async () => {
    const picked = await dialog.showOpenDialog({
      title: 'اختر ملف النقل القادم من الهاتف',
      properties: ['openFile'],
      filters: [{ name: 'ملف نقل غصون زهران', extensions: [TRANSFER_FILE_EXTENSION.replace('.', ''), 'zip'] }],
    });
    if (picked.canceled || picked.filePaths.length === 0) {
      return { canceled: true as const };
    }
    const filePath = picked.filePaths[0];
    return { canceled: false as const, filePath, preview: await previewTransferPackage(filePath) };
  });

  handlePermitted<z.infer<typeof commitInput>>('transfer:commit', 'transfer', 'create', async ({ user, payload }) => {
    const { filePath } = commitInput.parse(payload);
    const paths = getRuntimePaths();
    return commitTransferPackage(
      { userId: user.id, username: user.username },
      filePath,
      { attachments: paths.attachments, metadata: paths.metadata },
    );
  });

  handlePermitted('transfer:exportForMobile', 'transfer', 'export', async ({ user }) => {
    const paths = getRuntimePaths();
    const filePath = await exportForMobile({
      deviceId: getOrCreateDeviceId(paths.metadata),
      appVersion: app.getVersion(),
      sourceUser: user.username,
      outputDir: paths.documents,
    });
    return { filePath };
  });

  handlePermitted<{ limit?: number }>('transfer:history', 'transfer', 'view', async ({ payload }) =>
    listImportBatches(Math.min(Math.max(payload?.limit ?? 25, 1), 100)),
  );

  handlePermitted<{ filePath: string }>('transfer:revealFile', 'transfer', 'view', async ({ payload }) => {
    shell.showItemInFolder(payload.filePath);
    return { success: true };
  });
}
