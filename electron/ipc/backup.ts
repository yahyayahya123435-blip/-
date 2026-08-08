import { app } from 'electron';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import { handlePermitted } from './handler';
import { createBackupZip, listBackups, restoreBackupZip } from '../../src/services/backup';
import { getRuntimePaths } from '../runtime-context';
import { disconnectPrisma, initPrisma } from '../../src/lib/db';
import { getLatestMigrationName } from '../db-version';

export function registerBackupHandlers(): void {
  handlePermitted('backup:create', 'backup', 'create', async () => {
    const paths = getRuntimePaths();
    const filePath = await createBackupZip(
      { dbFile: paths.dbFile, attachments: paths.attachments, documents: paths.documents, metadata: paths.metadata, backups: paths.backups },
      app.getVersion(),
      getLatestMigrationName(),
    );
    return { filePath };
  });

  handlePermitted('backup:list', 'backup', 'view', async () => {
    const paths = getRuntimePaths();
    return listBackups(paths.backups);
  });

  handlePermitted<{ fileName: string }>('backup:restore', 'backup', 'update', async ({ payload }) => {
    const paths = getRuntimePaths();
    const zipPath = path.join(paths.backups, payload.fileName);
    const tempDir = path.join(os.tmpdir(), 'ghsoon-zahran-restore');
    const result = await restoreBackupZip(
      zipPath,
      { dbFile: paths.dbFile, attachments: paths.attachments, documents: paths.documents, metadata: paths.metadata, backups: paths.backups },
      app.getVersion(),
      getLatestMigrationName(),
      {
        beforeSwap: async () => disconnectPrisma(),
        afterSwap: async () => {
          initPrisma(paths.dbFile);
        },
      },
      tempDir,
    );
    return result;
  });
}
