/**
 * The .gztransfer package format — the ONLY channel between the Windows app
 * and the Android field app. There is no network sync, no cloud, and no
 * direct device connection: a file is produced on one side and carried to the
 * other by hand.
 *
 * This module is pure TypeScript with no Node or Prisma imports, because the
 * mobile app ships a copy of it (mobile/src/transfer-format.ts). Keep it that
 * way — anything platform-specific belongs in the caller.
 *
 * ── Package layout (a ZIP archive) ───────────────────────────────────────────
 *   manifest.json          format, schema version, device, user, counts
 *   records.json           the records themselves, grouped by entity
 *   attachments/manifest.json   one entry per attached file
 *   attachments/<file>     the attachment bytes, flat, sanitized names
 *
 * ── Identity and conflicts ───────────────────────────────────────────────────
 * Records created on the phone carry a UUID as their primary key, so they can
 * be inserted on the desktop with the same id and never collide with a
 * desktop-generated cuid. `updatedAt` decides who wins: a package record newer
 * than the stored row is an update, an older one is reported as a conflict and
 * skipped rather than silently overwriting fresher desktop data.
 *
 * Whole packages are deduplicated by the SHA-256 of the file, recorded as
 * import_batches.sourceKey, so importing the same file twice is refused.
 */

export const TRANSFER_FORMAT_NAME = 'GZ_TRANSFER';
export const TRANSFER_SCHEMA_VERSION = 1;
export const TRANSFER_FILE_EXTENSION = '.gztransfer';

export const MANIFEST_ENTRY = 'manifest.json';
export const RECORDS_ENTRY = 'records.json';
export const ATTACHMENTS_DIR = 'attachments';
export const ATTACHMENTS_MANIFEST_ENTRY = 'attachments/manifest.json';

/** Direction of travel. Desktop refuses to import a package it produced. */
export type TransferDirection = 'mobile-to-desktop' | 'desktop-to-mobile';

export interface TransferManifest {
  format: typeof TRANSFER_FORMAT_NAME;
  schemaVersion: number;
  direction: TransferDirection;
  exportedAt: string;
  /** Stable per-installation id, so the desktop can tell devices apart. */
  deviceId: string;
  deviceLabel?: string;
  /** Who entered the data on the source device. */
  sourceUser: string | null;
  appVersion: string;
  counts: Record<string, number>;
  attachmentCount: number;
}

/** Entities a package may carry, in dependency order — parents first. */
export const TRANSFER_ENTITIES = [
  'families',
  'familyMembers',
  'beneficiaries',
  'socialAssessments',
  'fieldVisits',
  'assistances',
] as const;

export type TransferEntity = (typeof TRANSFER_ENTITIES)[number];

/** Every transferred record carries at least these. */
export interface TransferRecordBase {
  id: string;
  createdAt: string;
  updatedAt: string;
  [field: string]: unknown;
}

export type TransferRecords = Record<TransferEntity, TransferRecordBase[]>;

export interface TransferAttachmentEntry {
  id: string;
  entityType: string;
  entityId: string;
  fileName: string;
  /** Name inside attachments/ — flat, no separators. */
  packagedName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface TransferPackageContent {
  manifest: TransferManifest;
  records: TransferRecords;
  attachments: TransferAttachmentEntry[];
}

export function emptyTransferRecords(): TransferRecords {
  return {
    families: [],
    familyMembers: [],
    beneficiaries: [],
    socialAssessments: [],
    fieldVisits: [],
    assistances: [],
  };
}

/** Arabic label per entity, used in both apps' preview screens. */
export const TRANSFER_ENTITY_LABELS: Record<TransferEntity, string> = {
  families: 'الأسر',
  familyMembers: 'أفراد الأسرة',
  beneficiaries: 'المستفيدون',
  socialAssessments: 'البحث الاجتماعي',
  fieldVisits: 'الزيارات الميدانية',
  assistances: 'المساعدات',
};

/** Per-record outcome of a dry-run import. */
export type TransferRowStatus = 'new' | 'updated' | 'unchanged' | 'conflict' | 'error';

export interface TransferRowPlan {
  entity: TransferEntity;
  id: string;
  label: string;
  status: TransferRowStatus;
  /** Why it is a conflict or an error, in Arabic, for the preview table. */
  reason?: string;
}

export interface TransferPreviewCounts {
  new: number;
  updated: number;
  unchanged: number;
  conflict: number;
  error: number;
}

export function emptyPreviewCounts(): TransferPreviewCounts {
  return { new: 0, updated: 0, unchanged: 0, conflict: 0, error: 0 };
}

/**
 * Filenames inside the archive are attacker-controlled once a package leaves
 * the device, so they are reduced to a safe flat name before ever touching
 * the filesystem. Any path separator, traversal segment or unusual character
 * is dropped rather than escaped.
 */
export function sanitizePackagedName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, '');
  const withoutLeadingDots = cleaned.replace(/^\.+/, '');
  return withoutLeadingDots.slice(0, 120);
}

/** Builds the conventional file name for a new package. */
export function buildTransferFileName(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp =
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `_${pad(date.getHours())}${pad(date.getMinutes())}`;
  return `GZ_Transfer_${stamp}${TRANSFER_FILE_EXTENSION}`;
}

/**
 * Structural validation of a parsed manifest. Deliberately strict about the
 * format name and forward-compatible only downwards: a package written by a
 * newer schema version is rejected rather than half-understood.
 */
export function validateManifest(value: unknown): { ok: true; manifest: TransferManifest } | { ok: false; error: string } {
  if (typeof value !== 'object' || value === null) {
    return { ok: false, error: 'ملف النقل لا يحتوي على بيانات تعريف صالحة' };
  }
  const m = value as Partial<TransferManifest>;
  if (m.format !== TRANSFER_FORMAT_NAME) {
    return { ok: false, error: 'هذا الملف ليس ملف نقل خاصاً بنظام غصون زهران' };
  }
  if (typeof m.schemaVersion !== 'number' || !Number.isInteger(m.schemaVersion)) {
    return { ok: false, error: 'إصدار صيغة ملف النقل غير معروف' };
  }
  if (m.schemaVersion > TRANSFER_SCHEMA_VERSION) {
    return {
      ok: false,
      error: `ملف النقل بإصدار ${m.schemaVersion} أحدث من إصدار البرنامج (${TRANSFER_SCHEMA_VERSION}) — حدّث البرنامج أولاً`,
    };
  }
  if (typeof m.deviceId !== 'string' || m.deviceId.length === 0) {
    return { ok: false, error: 'ملف النقل لا يحتوي على معرّف الجهاز' };
  }
  if (typeof m.exportedAt !== 'string') {
    return { ok: false, error: 'ملف النقل لا يحتوي على تاريخ التصدير' };
  }
  return { ok: true, manifest: value as TransferManifest };
}
