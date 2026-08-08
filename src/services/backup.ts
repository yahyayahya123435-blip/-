/**
 * SERVER-ONLY, pure Node (no Prisma/Electron imports) — testable in isolation.
 * Full backup = database.db + Attachments/ + Documents/ + metadata/ + a
 * manifest recording app/db version, zipped as
 * GhsoonZahran_Backup_YYYY-MM-DD_HHmm.zip. Restore always takes a fresh
 * "pre-restore" backup first and rolls back completely on any failure so
 * the app is never left half-restored.
 */
import fs from 'node:fs';
import path from 'node:path';
import archiver from 'archiver';
import unzipper from 'unzipper';

export interface BackupPaths {
  dbFile: string;
  attachments: string;
  documents: string;
  metadata: string;
  backups: string;
}

export interface BackupManifest {
  appVersion: string;
  dbVersion: string;
  createdAt: string;
}

function timestampName(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `GhsoonZahran_Backup_${stamp}.zip`;
}

async function dirExists(p: string): Promise<boolean> {
  return fs.promises.stat(p).then((s) => s.isDirectory()).catch(() => false);
}

export async function createBackupZip(
  paths: BackupPaths,
  appVersion: string,
  dbVersion: string,
  fileName?: string,
  /**
   * Must run `PRAGMA wal_checkpoint(TRUNCATE)` (or equivalent) against the
   * live connection before archiving. SQLite in WAL mode keeps recently
   * committed rows in database.db-wal, not database.db itself — a backup
   * that only zips database.db silently drops everything still sitting in
   * the WAL file. Optional only so this pure-Node module doesn't need a
   * Prisma/better-sqlite3 dependency of its own; callers MUST provide it.
   */
  checkpoint?: () => Promise<void>,
): Promise<string> {
  await checkpoint?.();
  await fs.promises.mkdir(paths.backups, { recursive: true });
  const outName = fileName ?? timestampName();
  const outPath = path.join(paths.backups, outName);

  const manifest: BackupManifest = { appVersion, dbVersion, createdAt: new Date().toISOString() };

  await new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(outPath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    output.on('close', () => resolve());
    archive.on('error', (err) => reject(err));
    archive.pipe(output);

    archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });
    if (fs.existsSync(paths.dbFile)) {
      archive.file(paths.dbFile, { name: 'data/database.db' });
    }
    archive.directory(paths.attachments, 'Attachments');
    archive.directory(paths.documents, 'Documents');
    archive.directory(paths.metadata, 'metadata');

    archive.finalize();
  });

  return outPath;
}

export async function listBackups(backupsDir: string): Promise<{ fileName: string; sizeBytes: number; createdAt: string }[]> {
  await fs.promises.mkdir(backupsDir, { recursive: true });
  const entries = await fs.promises.readdir(backupsDir);
  const zipFiles = entries.filter((e) => e.endsWith('.zip'));
  const stats = await Promise.all(
    zipFiles.map(async (f) => {
      const s = await fs.promises.stat(path.join(backupsDir, f));
      return { fileName: f, sizeBytes: s.size, createdAt: s.mtime.toISOString() };
    }),
  );
  return stats.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export class BackupValidationError extends Error {}
export class BackupRestoreError extends Error {}

async function extractZip(zipPath: string, destDir: string): Promise<void> {
  await fs.promises.mkdir(destDir, { recursive: true });
  await fs
    .createReadStream(zipPath)
    .pipe(unzipper.Extract({ path: destDir }))
    .promise();
}

async function copyDirReplacing(sourceDir: string, targetDir: string): Promise<void> {
  await fs.promises.rm(targetDir, { recursive: true, force: true });
  await fs.promises.mkdir(targetDir, { recursive: true });
  if (await dirExists(sourceDir)) {
    await fs.promises.cp(sourceDir, targetDir, { recursive: true });
  }
}

/**
 * Restores a backup zip. `hooks.beforeSwap` must disconnect the live Prisma
 * connection (SQLite file cannot be safely overwritten while open);
 * `hooks.afterSwap` must reconnect it. On any error, the pre-restore backup
 * taken at the start is used to fully roll back — the caller re-invokes
 * `hooks.afterSwap` after rollback too, so the app never sits half-restored.
 */
export async function restoreBackupZip(
  zipPath: string,
  paths: BackupPaths,
  currentAppVersion: string,
  currentDbVersion: string,
  hooks: { beforeSwap: () => Promise<void>; afterSwap: () => Promise<void>; checkpoint?: () => Promise<void> },
  tempDir: string,
): Promise<{ manifest: BackupManifest; preRestoreBackupPath: string }> {
  const extractDir = path.join(tempDir, `restore-${Date.now()}`);
  await extractZip(zipPath, extractDir);

  const manifestPath = path.join(extractDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    await fs.promises.rm(extractDir, { recursive: true, force: true });
    throw new BackupValidationError('ملف النسخة الاحتياطية غير صالح (لا يحتوي بيانات وصفية)');
  }
  const manifest: BackupManifest = JSON.parse(await fs.promises.readFile(manifestPath, 'utf-8'));
  if (!manifest.appVersion || !manifest.dbVersion) {
    await fs.promises.rm(extractDir, { recursive: true, force: true });
    throw new BackupValidationError('ملف النسخة الاحتياطية غير صالح (بيانات الإصدار مفقودة)');
  }

  const extractedDbPath = path.join(extractDir, 'data', 'database.db');
  if (!fs.existsSync(extractedDbPath)) {
    await fs.promises.rm(extractDir, { recursive: true, force: true });
    throw new BackupValidationError('ملف النسخة الاحتياطية غير صالح (قاعدة البيانات مفقودة)');
  }

  const preRestoreBackupPath = await createBackupZip(
    paths,
    currentAppVersion,
    currentDbVersion,
    `PreRestore_${timestampName()}`,
    hooks.checkpoint,
  );

  try {
    await hooks.beforeSwap();

    await fs.promises.mkdir(path.dirname(paths.dbFile), { recursive: true });
    await fs.promises.copyFile(extractedDbPath, paths.dbFile);
    for (const walExt of ['-wal', '-shm']) {
      await fs.promises.rm(paths.dbFile + walExt, { force: true });
    }

    await copyDirReplacing(path.join(extractDir, 'Attachments'), paths.attachments);
    await copyDirReplacing(path.join(extractDir, 'Documents'), paths.documents);
    await copyDirReplacing(path.join(extractDir, 'metadata'), paths.metadata);

    await hooks.afterSwap();
  } catch (err) {
    // Rollback: restore everything from the pre-restore backup just taken.
    const rollbackExtractDir = path.join(tempDir, `rollback-${Date.now()}`);
    await extractZip(preRestoreBackupPath, rollbackExtractDir);
    const rollbackDbPath = path.join(rollbackExtractDir, 'data', 'database.db');
    if (fs.existsSync(rollbackDbPath)) {
      await fs.promises.copyFile(rollbackDbPath, paths.dbFile);
    }
    await copyDirReplacing(path.join(rollbackExtractDir, 'Attachments'), paths.attachments);
    await copyDirReplacing(path.join(rollbackExtractDir, 'Documents'), paths.documents);
    await copyDirReplacing(path.join(rollbackExtractDir, 'metadata'), paths.metadata);
    await fs.promises.rm(rollbackExtractDir, { recursive: true, force: true });
    await hooks.afterSwap();
    await fs.promises.rm(extractDir, { recursive: true, force: true });
    throw new BackupRestoreError(
      `فشلت عملية الاستعادة وتم التراجع كاملاً إلى الحالة السابقة. السبب: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  await fs.promises.rm(extractDir, { recursive: true, force: true });
  return { manifest, preRestoreBackupPath };
}
