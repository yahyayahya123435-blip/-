/**
 * Building and reading .gztransfer packages on the phone.
 *
 * Export produces exactly the format the desktop expects (see
 * src/transfer-format.ts, a copy of the desktop's module) and hands the file
 * to the OS share sheet. There is no upload, no server, and no background
 * sync: the file goes wherever the user sends it.
 *
 * Import accepts a desktop→mobile package so the field app can start with the
 * association's real family list instead of an empty database.
 */
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import JSZip from 'jszip';
import { getDatabase, getDeviceId, newId, nowIso, getMeta, setMeta } from '../db/client';
import { EXPORTABLE_TABLES, LOCAL_ONLY_COLUMNS } from '../db/schema';
import {
  TRANSFER_FORMAT_NAME, TRANSFER_SCHEMA_VERSION, MANIFEST_ENTRY, RECORDS_ENTRY,
  ATTACHMENTS_MANIFEST_ENTRY, buildTransferFileName, emptyTransferRecords,
  sanitizePackagedName, validateManifest,
  type TransferManifest, type TransferRecords, type TransferAttachmentEntry,
  type TransferEntity,
} from '../transfer-format';

const APP_VERSION = '1.0.0';
const LAST_EXPORT_KEY = 'lastExportAt';

export interface ExportResult {
  fileUri: string;
  fileName: string;
  recordCount: number;
  attachmentCount: number;
  fullExport: boolean;
}

/**
 * SQLite stores booleans as 0/1 and has no NULL/undefined distinction beyond
 * NULL. The desktop expects JSON with real booleans, so the few known boolean
 * columns are converted back on the way out.
 */
const BOOLEAN_COLUMNS = new Set(['isActive', 'isDisabled', 'isOrphan', 'isStudent']);

function toTransferRecord(row: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (LOCAL_ONLY_COLUMNS.has(key)) continue;
    output[key] = BOOLEAN_COLUMNS.has(key) ? value === 1 || value === true : value;
  }
  return output;
}

/**
 * Builds a package.
 *
 * `fullExport = false` sends only rows changed since the last successful
 * export (dirty = 1); `true` sends everything, which is the safe option after
 * a phone is replaced or an earlier file was lost.
 */
export async function exportTransferPackage(fullExport: boolean): Promise<ExportResult> {
  const db = await getDatabase();
  const deviceId = await getDeviceId();
  const sourceUser = (await getMeta('operatorName')) ?? null;

  const records = emptyTransferRecords();
  const counts: Record<string, number> = {};
  let recordCount = 0;

  for (const { table, entity } of EXPORTABLE_TABLES) {
    const rows = await db.getAllAsync<Record<string, unknown>>(
      fullExport ? `SELECT * FROM ${table}` : `SELECT * FROM ${table} WHERE dirty = 1`,
    );
    const mapped = rows.map(toTransferRecord);
    records[entity as TransferEntity] = mapped as TransferRecords[TransferEntity];
    counts[entity] = mapped.length;
    recordCount += mapped.length;
  }

  // Attachments belonging to the records being sent.
  const attachmentRows = await db.getAllAsync<{
    id: string; entityType: string; entityId: string; fileName: string;
    localPath: string; mimeType: string; sizeBytes: number; createdAt: string;
  }>(fullExport ? 'SELECT * FROM attachments' : 'SELECT * FROM attachments WHERE dirty = 1');

  const zip = new JSZip();
  const attachmentEntries: TransferAttachmentEntry[] = [];
  const attachmentsFolder = zip.folder('attachments');

  for (const row of attachmentRows) {
    const info = await FileSystem.getInfoAsync(row.localPath);
    if (!info.exists) continue; // the photo was deleted from the phone
    const base64 = await FileSystem.readAsStringAsync(row.localPath, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const packagedName = sanitizePackagedName(`${row.id}_${row.fileName}`) || `${row.id}.bin`;
    attachmentsFolder?.file(packagedName, base64, { base64: true });
    attachmentEntries.push({
      id: row.id,
      entityType: row.entityType,
      entityId: row.entityId,
      fileName: row.fileName,
      packagedName,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      createdAt: row.createdAt,
    });
  }

  const manifest: TransferManifest = {
    format: TRANSFER_FORMAT_NAME,
    schemaVersion: TRANSFER_SCHEMA_VERSION,
    direction: 'mobile-to-desktop',
    exportedAt: nowIso(),
    deviceId,
    deviceLabel: (await getMeta('deviceLabel')) ?? 'هاتف العمل الميداني',
    sourceUser,
    appVersion: APP_VERSION,
    counts,
    attachmentCount: attachmentEntries.length,
  };

  zip.file(MANIFEST_ENTRY, JSON.stringify(manifest, null, 2));
  zip.file(RECORDS_ENTRY, JSON.stringify(records));
  zip.file(ATTACHMENTS_MANIFEST_ENTRY, JSON.stringify(attachmentEntries));

  const base64Zip = await zip.generateAsync({ type: 'base64', compression: 'DEFLATE' });
  const fileName = buildTransferFileName();
  const fileUri = `${FileSystem.cacheDirectory}${fileName}`;
  await FileSystem.writeAsStringAsync(fileUri, base64Zip, {
    encoding: FileSystem.EncodingType.Base64,
  });

  // Only clear the dirty flags once the file actually exists on disk — a
  // failure above must leave the pending changes pending.
  await db.withTransactionAsync(async () => {
    for (const { table } of EXPORTABLE_TABLES) {
      await db.runAsync(`UPDATE ${table} SET dirty = 0 WHERE dirty = 1`);
    }
    await db.runAsync('UPDATE attachments SET dirty = 0 WHERE dirty = 1');
    await db.runAsync(
      'INSERT INTO export_log (id, fileName, exportedAt, recordCount, fullExport) VALUES (?, ?, ?, ?, ?)',
      newId(), fileName, nowIso(), recordCount, fullExport ? 1 : 0,
    );
  });
  await setMeta(LAST_EXPORT_KEY, nowIso());

  return {
    fileUri,
    fileName,
    recordCount,
    attachmentCount: attachmentEntries.length,
    fullExport,
  };
}

/** Hands the produced file to the OS share sheet (WhatsApp, Drive, cable…). */
export async function shareTransferPackage(fileUri: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('المشاركة غير متاحة على هذا الجهاز — انسخ الملف يدوياً من مجلد التطبيق');
  }
  await Sharing.shareAsync(fileUri, {
    mimeType: 'application/zip',
    dialogTitle: 'إرسال ملف النقل إلى الكمبيوتر',
  });
}

export interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
}

/**
 * Applies a desktop→mobile package: the association's family, member and
 * beneficiary list. Records arriving this way are marked `origin = 'desktop'`
 * and `dirty = 0`, so they are not echoed back in the next export unless the
 * field worker actually edits them.
 */
export async function importDesktopPackage(fileUri: string): Promise<ImportResult> {
  const base64 = await FileSystem.readAsStringAsync(fileUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const zip = await JSZip.loadAsync(base64, { base64: true });

  const manifestFile = zip.file(MANIFEST_ENTRY);
  if (!manifestFile) throw new Error('الملف المختار ليس ملف نقل صالحاً');
  const manifestCheck = validateManifest(JSON.parse(await manifestFile.async('string')));
  if (!manifestCheck.ok) throw new Error(manifestCheck.error);
  if (manifestCheck.manifest.direction !== 'desktop-to-mobile') {
    throw new Error('هذا الملف مُصدَّر من الهاتف، ولا يمكن استيراده هنا');
  }

  const recordsFile = zip.file(RECORDS_ENTRY);
  if (!recordsFile) throw new Error('ملف النقل لا يحتوي على سجلات');
  const records = JSON.parse(await recordsFile.async('string')) as Partial<TransferRecords>;

  const db = await getDatabase();
  let created = 0;
  let updated = 0;
  let skipped = 0;

  await db.withTransactionAsync(async () => {
    for (const { table, entity } of EXPORTABLE_TABLES) {
      const rows = records[entity as TransferEntity];
      if (!Array.isArray(rows)) continue;

      // Only the columns this phone's schema actually has.
      const columnInfo = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
      const knownColumns = new Set(columnInfo.map((c) => c.name));

      for (const row of rows as Record<string, unknown>[]) {
        const id = String(row.id ?? '');
        if (!id) { skipped += 1; continue; }

        const existing = await db.getFirstAsync<{ id: string; dirty: number }>(
          `SELECT id, dirty FROM ${table} WHERE id = ?`,
          id,
        );

        // Never clobber a local edit that has not been sent to the desktop yet.
        if (existing && existing.dirty === 1) { skipped += 1; continue; }

        const payload: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(row)) {
          if (!knownColumns.has(key)) continue;
          if (key === 'id') continue;
          payload[key] = typeof value === 'boolean' ? (value ? 1 : 0) : value ?? null;
        }
        payload.origin = 'desktop';
        payload.dirty = 0;
        if (!payload.createdAt) payload.createdAt = nowIso();
        if (!payload.updatedAt) payload.updatedAt = nowIso();

        const columns = Object.keys(payload);
        if (existing) {
          await db.runAsync(
            `UPDATE ${table} SET ${columns.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
            ...columns.map((c) => payload[c] as never),
            id,
          );
          updated += 1;
        } else {
          await db.runAsync(
            `INSERT INTO ${table} (id, ${columns.join(', ')}) VALUES (?, ${columns.map(() => '?').join(', ')})`,
            id,
            ...columns.map((c) => payload[c] as never),
          );
          created += 1;
        }
      }
    }
  });

  return { created, updated, skipped };
}

export async function getLastExportAt(): Promise<string | null> {
  return getMeta(LAST_EXPORT_KEY);
}
