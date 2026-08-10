/**
 * SERVER-ONLY. The desktop half of the manual phone↔PC transfer.
 *
 * Reading a package NEVER touches the database. `previewTransferPackage`
 * opens the archive, validates it, and reports exactly what committing would
 * do — how many records are new, updated, unchanged, in conflict or broken.
 * Only `commitTransferPackage` writes, and it does so inside a single
 * transaction: the whole package lands or none of it does.
 *
 * Three things are refused rather than guessed at:
 *   - a package whose SHA-256 is already in import_batches (re-import),
 *   - a record older than the row it would overwrite (stale phone data),
 *   - a record whose parent (family/beneficiary) is neither in the package
 *     nor already in the database.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import archiver from 'archiver';
import unzipper from 'unzipper';
import type { Prisma } from '../../generated/prisma';
import { getPrisma } from '../lib/db';
import { runWithAuditContext, type AuditActor } from '../lib/audit-context';
import { AppError } from '../lib/app-error';
import {
  TRANSFER_ENTITIES, TRANSFER_FORMAT_NAME, TRANSFER_SCHEMA_VERSION,
  MANIFEST_ENTRY, RECORDS_ENTRY, ATTACHMENTS_MANIFEST_ENTRY,
  emptyPreviewCounts, emptyTransferRecords, sanitizePackagedName, validateManifest,
  buildTransferFileName,
  type TransferEntity, type TransferManifest, type TransferPreviewCounts,
  type TransferRecordBase, type TransferRecords, type TransferRowPlan,
  type TransferAttachmentEntry,
} from '../lib/transfer-format';

export const TRANSFER_IMPORT_KIND = 'mobile_transfer';
const MOBILE_SOURCE_LABEL = 'الهاتف';
const MAX_PACKAGE_BYTES = 200 * 1024 * 1024;

export interface TransferPaths {
  attachments: string;
  metadata: string;
}

// ── Reading ──────────────────────────────────────────────────────────────────

interface ParsedPackage {
  manifest: TransferManifest;
  records: TransferRecords;
  attachments: TransferAttachmentEntry[];
  checksum: string;
  fileName: string;
  /** Attachment bytes, keyed by packagedName. */
  attachmentBuffers: Map<string, Buffer>;
}

async function sha256File(filePath: string): Promise<string> {
  const hash = crypto.createHash('sha256');
  await new Promise<void>((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve());
  });
  return hash.digest('hex');
}

function parseJson<T>(buffer: Buffer, what: string): T {
  try {
    return JSON.parse(buffer.toString('utf-8')) as T;
  } catch {
    throw new AppError('TRANSFER_INVALID', `تعذر قراءة ${what} داخل ملف النقل`);
  }
}

async function parsePackage(filePath: string): Promise<ParsedPackage> {
  const stat = await fs.promises.stat(filePath).catch(() => null);
  if (!stat || !stat.isFile()) {
    throw new AppError('TRANSFER_NOT_FOUND', 'ملف النقل غير موجود');
  }
  if (stat.size > MAX_PACKAGE_BYTES) {
    throw new AppError('TRANSFER_TOO_LARGE', 'حجم ملف النقل يتجاوز الحد المسموح (200 ميجابايت)');
  }

  const directory = await unzipper.Open.file(filePath).catch(() => null);
  if (!directory) {
    throw new AppError('TRANSFER_INVALID', 'ملف النقل تالف أو ليس ملفاً مضغوطاً صالحاً');
  }

  const entries = new Map(directory.files.map((f) => [f.path.replace(/^\.?\//, ''), f]));

  const manifestEntry = entries.get(MANIFEST_ENTRY);
  if (!manifestEntry) {
    throw new AppError('TRANSFER_INVALID', 'ملف النقل لا يحتوي على manifest.json');
  }
  const manifestCheck = validateManifest(parseJson<unknown>(await manifestEntry.buffer(), 'بيانات التعريف'));
  if (!manifestCheck.ok) {
    throw new AppError('TRANSFER_INVALID', manifestCheck.error);
  }
  const manifest = manifestCheck.manifest;

  if (manifest.direction === 'desktop-to-mobile') {
    throw new AppError(
      'TRANSFER_WRONG_DIRECTION',
      'هذا الملف مُصدَّر من الكمبيوتر إلى الهاتف، ولا يمكن استيراده هنا',
    );
  }

  const recordsEntry = entries.get(RECORDS_ENTRY);
  if (!recordsEntry) {
    throw new AppError('TRANSFER_INVALID', 'ملف النقل لا يحتوي على records.json');
  }
  const rawRecords = parseJson<Partial<TransferRecords>>(await recordsEntry.buffer(), 'السجلات');

  const records = emptyTransferRecords();
  for (const entity of TRANSFER_ENTITIES) {
    const list = rawRecords[entity];
    if (list === undefined) continue;
    if (!Array.isArray(list)) {
      throw new AppError('TRANSFER_INVALID', `قسم "${entity}" داخل ملف النقل غير صالح`);
    }
    records[entity] = list as TransferRecordBase[];
  }

  let attachments: TransferAttachmentEntry[] = [];
  const attachmentsManifest = entries.get(ATTACHMENTS_MANIFEST_ENTRY);
  if (attachmentsManifest) {
    const parsed = parseJson<TransferAttachmentEntry[]>(await attachmentsManifest.buffer(), 'قائمة المرفقات');
    attachments = Array.isArray(parsed) ? parsed : [];
  }

  // Read attachment bytes now, while the archive is open. Packages are
  // field-sized (a handful of photos), so this stays well inside memory.
  const attachmentBuffers = new Map<string, Buffer>();
  for (const entry of attachments) {
    const safeName = sanitizePackagedName(entry.packagedName ?? '');
    if (!safeName) continue;
    const file = entries.get(`attachments/${safeName}`);
    if (file) attachmentBuffers.set(safeName, await file.buffer());
  }

  return {
    manifest,
    records,
    attachments,
    checksum: await sha256File(filePath),
    fileName: path.basename(filePath),
    attachmentBuffers,
  };
}

// ── Planning ─────────────────────────────────────────────────────────────────

/** Prisma delegate per entity, and the label shown in the preview table. */
const ENTITY_MODEL: Record<TransferEntity, string> = {
  families: 'family',
  familyMembers: 'familyMember',
  beneficiaries: 'beneficiary',
  socialAssessments: 'socialAssessment',
  fieldVisits: 'fieldVisit',
  assistances: 'assistance',
};

function recordLabel(entity: TransferEntity, record: TransferRecordBase): string {
  const named = record as { headOfFamilyName?: string; fullName?: string; purpose?: string };
  return (
    named.headOfFamilyName ??
    named.fullName ??
    named.purpose ??
    String(record.id).slice(0, 8)
  );
}

/** Parent references that must resolve for a record to be insertable. */
const PARENT_REFERENCES: Partial<Record<TransferEntity, { field: string; entity: TransferEntity }[]>> = {
  familyMembers: [{ field: 'familyId', entity: 'families' }],
  beneficiaries: [{ field: 'familyId', entity: 'families' }],
  socialAssessments: [{ field: 'familyId', entity: 'families' }],
  fieldVisits: [{ field: 'familyId', entity: 'families' }],
  assistances: [
    { field: 'familyId', entity: 'families' },
    { field: 'beneficiaryId', entity: 'beneficiaries' },
  ],
};

export interface TransferPreview {
  fileName: string;
  checksum: string;
  manifest: TransferManifest;
  alreadyImported: boolean;
  importedAt: string | null;
  counts: TransferPreviewCounts;
  perEntity: Record<TransferEntity, TransferPreviewCounts>;
  attachmentCount: number;
  /** Capped sample for the preview table — conflicts and errors first. */
  rows: TransferRowPlan[];
  totalRecords: number;
}

interface PlanResult {
  plans: TransferRowPlan[];
  /** ids to actually write, per entity, with their resolved operation. */
  actions: Map<TransferEntity, { record: TransferRecordBase; operation: 'create' | 'update' }[]>;
}

async function planImport(parsed: ParsedPackage): Promise<PlanResult> {
  const prisma = getPrisma();
  const plans: TransferRowPlan[] = [];
  const actions = new Map<TransferEntity, { record: TransferRecordBase; operation: 'create' | 'update' }[]>();

  // Ids that will exist once the package is applied — a child may reference a
  // parent that is arriving in the very same package.
  const willExist: Record<TransferEntity, Set<string>> = {
    families: new Set(),
    familyMembers: new Set(),
    beneficiaries: new Set(),
    socialAssessments: new Set(),
    fieldVisits: new Set(),
    assistances: new Set(),
  };

  for (const entity of TRANSFER_ENTITIES) {
    const rows = parsed.records[entity];
    const ids = rows.map((r) => String(r.id));
    const modelName = ENTITY_MODEL[entity];
    const allowedFields = allowedFieldsFor(modelName);
    const delegate = (prisma as unknown as Record<string, {
      findMany: (args: unknown) => Promise<Record<string, unknown>[]>;
    }>)[modelName];

    const existing = ids.length
      ? await delegate.findMany({ where: { id: { in: ids } } })
      : [];
    const existingById = new Map(existing.map((e) => [String(e.id), e]));
    for (const id of existingById.keys()) willExist[entity].add(id);

    const entityActions: { record: TransferRecordBase; operation: 'create' | 'update' }[] = [];

    for (const record of rows) {
      const id = String(record.id ?? '');
      const label = recordLabel(entity, record);

      if (!id) {
        plans.push({ entity, id: '—', label, status: 'error', reason: 'السجل بدون معرّف' });
        continue;
      }
      const updatedAt = new Date(String(record.updatedAt ?? ''));
      if (Number.isNaN(updatedAt.getTime())) {
        plans.push({ entity, id, label, status: 'error', reason: 'تاريخ التعديل غير صالح' });
        continue;
      }

      // Parents must resolve, either already stored or arriving in this package.
      const missingParent = (PARENT_REFERENCES[entity] ?? []).find((ref) => {
        const parentId = record[ref.field];
        if (parentId === null || parentId === undefined || parentId === '') return false;
        return !willExist[ref.entity].has(String(parentId));
      });
      if (missingParent) {
        plans.push({
          entity, id, label, status: 'error',
          reason: `السجل المرتبط (${missingParent.entity}) غير موجود في الملف ولا في قاعدة البيانات`,
        });
        continue;
      }

      const stored = existingById.get(id);
      if (!stored) {
        plans.push({ entity, id, label, status: 'new' });
        entityActions.push({ record, operation: 'create' });
        willExist[entity].add(id);
        continue;
      }

      const storedUpdatedAt = stored.updatedAt as Date;
      if (updatedAt.getTime() > storedUpdatedAt.getTime()) {
        plans.push({ entity, id, label, status: 'updated' });
        entityActions.push({ record, operation: 'update' });
        continue;
      }

      // The package is not newer. That is only a conflict if it actually
      // disagrees with what is stored. Comparing values rather than trusting
      // the clock matters because importing a record stamps the desktop row
      // with the import time — so a later full export from the phone would
      // otherwise report every previously-imported record as a conflict.
      if (sameValues(record, stored, allowedFields)) {
        plans.push({ entity, id, label, status: 'unchanged' });
        continue;
      }
      plans.push({
        entity, id, label, status: 'conflict',
        reason: 'النسخة المحفوظة في الكمبيوتر أحدث من نسخة الهاتف — لن يتم استبدالها',
      });
    }

    actions.set(entity, entityActions);
  }

  return { plans, actions };
}

/** Normalizes a stored/packaged value so Date and ISO string compare equal. */
function normalizeForCompare(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (value === undefined) return null;
  return value;
}

/**
 * True when the packaged record agrees with the stored row on every column
 * the package is allowed to set. `createdAt`/`updatedAt` are excluded: they
 * are bookkeeping, not content, and the desktop restamps updatedAt on import.
 */
function sameValues(
  record: TransferRecordBase,
  stored: Record<string, unknown>,
  allowedFields: Set<string>,
): boolean {
  for (const field of allowedFields) {
    if (field === 'id' || field === 'createdAt' || field === 'updatedAt') continue;
    if (PROTECTED_FIELDS.has(field)) continue;
    if (!(field in record)) continue;
    const packaged = normalizeForCompare(record[field]);
    const current = normalizeForCompare(stored[field]);
    if (JSON.stringify(packaged) !== JSON.stringify(current)) return false;
  }
  return true;
}

function tallyCounts(plans: TransferRowPlan[]): TransferPreviewCounts {
  const counts = emptyPreviewCounts();
  for (const plan of plans) counts[plan.status] += 1;
  return counts;
}

export async function previewTransferPackage(filePath: string): Promise<TransferPreview> {
  const parsed = await parsePackage(filePath);
  const prisma = getPrisma();

  const batch = await prisma.importBatch.findUnique({ where: { sourceKey: parsed.checksum } });
  const { plans } = await planImport(parsed);

  const perEntity = {} as Record<TransferEntity, TransferPreviewCounts>;
  for (const entity of TRANSFER_ENTITIES) {
    perEntity[entity] = tallyCounts(plans.filter((p) => p.entity === entity));
  }

  // Surface problems first — that is what the operator needs to read.
  const priority: Record<TransferRowPlan['status'], number> = {
    error: 0, conflict: 1, updated: 2, new: 3, unchanged: 4,
  };
  const rows = [...plans].sort((a, b) => priority[a.status] - priority[b.status]).slice(0, 100);

  return {
    fileName: parsed.fileName,
    checksum: parsed.checksum,
    manifest: parsed.manifest,
    alreadyImported: batch !== null,
    importedAt: batch?.importedAt.toISOString() ?? null,
    counts: tallyCounts(plans),
    perEntity,
    attachmentCount: parsed.attachments.length,
    rows,
    totalRecords: plans.length,
  };
}

// ── Committing ───────────────────────────────────────────────────────────────

/**
 * Fields the desktop owns and a phone package must never dictate. familyCode
 * is desktop-assigned, and the legacy/import provenance columns belong to the
 * register import.
 */
const PROTECTED_FIELDS = new Set([
  'familyCode', 'legacyReference', 'legacySourceRefs', 'legacyOccurrences', 'sourceSystem',
]);

const DATE_FIELDS = new Set([
  'createdAt', 'updatedAt', 'birthDate', 'assessmentDate', 'visitDate',
  'nextVisitAt', 'disbursedAt', 'registeredAt',
]);

/**
 * Converts a JSON record into Prisma input: ISO strings back into Dates,
 * protected columns dropped, and anything the schema does not know about
 * discarded rather than passed through.
 */
function toPrismaData(
  entity: TransferEntity,
  record: TransferRecordBase,
  allowedFields: Set<string>,
): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (key === 'id') continue;
    if (PROTECTED_FIELDS.has(key)) continue;
    if (!allowedFields.has(key)) continue;
    if (value === undefined) continue;
    if (DATE_FIELDS.has(key) && typeof value === 'string') {
      const date = new Date(value);
      data[key] = Number.isNaN(date.getTime()) ? null : date;
      continue;
    }
    data[key] = value;
  }
  return data;
}

/**
 * Column names per entity, taken from Prisma's runtime model metadata so the
 * allow-list cannot drift away from the schema.
 */
function allowedFieldsFor(modelName: string): Set<string> {
  const dmmf = (getPrisma() as unknown as {
    _runtimeDataModel: { models: Record<string, { fields: { name: string; kind: string }[] }> };
  })._runtimeDataModel;
  const model = dmmf.models[modelName[0].toUpperCase() + modelName.slice(1)];
  if (!model) return new Set();
  return new Set(model.fields.filter((f) => f.kind === 'scalar' || f.kind === 'enum').map((f) => f.name));
}

export interface TransferImportResult {
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  attachmentsImported: number;
  batchId: string;
  storedFile: string;
}

export async function commitTransferPackage(
  actor: AuditActor,
  filePath: string,
  paths: TransferPaths,
): Promise<TransferImportResult> {
  const parsed = await parsePackage(filePath);
  const prisma = getPrisma();

  const existingBatch = await prisma.importBatch.findUnique({ where: { sourceKey: parsed.checksum } });
  if (existingBatch) {
    throw new AppError(
      'DUPLICATE_IMPORT',
      `تم استيراد ملف النقل هذا مسبقاً بتاريخ ${existingBatch.importedAt.toISOString().slice(0, 10)} — لن يتم تكراره`,
    );
  }

  const { plans, actions } = await planImport(parsed);
  const counts = tallyCounts(plans);

  // Keep a copy of the package before writing anything, so the import is
  // reproducible and auditable even if the phone's copy is deleted.
  const storedDir = path.join(paths.metadata, 'transfers');
  await fs.promises.mkdir(storedDir, { recursive: true });
  const storedFile = path.join(storedDir, `${parsed.checksum.slice(0, 12)}_${sanitizePackagedName(parsed.fileName)}`);
  await fs.promises.copyFile(filePath, storedFile);

  const attachmentsWritten: string[] = [];

  try {
    const result = await runWithAuditContext(actor, async (tx) => {
      let created = 0;
      let updated = 0;

      for (const entity of TRANSFER_ENTITIES) {
        const modelName = ENTITY_MODEL[entity];
        const allowed = allowedFieldsFor(modelName);
        const delegate = (tx as unknown as Record<string, {
          create: (args: unknown) => Promise<unknown>;
          update: (args: unknown) => Promise<unknown>;
        }>)[modelName];

        for (const action of actions.get(entity) ?? []) {
          const data = toPrismaData(entity, action.record, allowed);
          if (action.operation === 'create') {
            await delegate.create({
              data: {
                ...data,
                id: String(action.record.id),
                ...(entity === 'families' ? { sourceSystem: MOBILE_SOURCE_LABEL } : {}),
                ...(entity === 'families'
                  ? { familyCode: await allocateFamilyCode(tx) }
                  : {}),
              },
            });
            created += 1;
          } else {
            await delegate.update({ where: { id: String(action.record.id) }, data });
            updated += 1;
          }
        }
      }

      // Attachments: files first (rolled back below on failure), rows inside
      // the same transaction as everything else.
      let attachmentsImported = 0;
      for (const entry of parsed.attachments) {
        const safeName = sanitizePackagedName(entry.packagedName ?? '');
        const buffer = safeName ? parsed.attachmentBuffers.get(safeName) : undefined;
        if (!buffer) continue;

        const existing = await tx.attachment.findUnique({ where: { id: entry.id } });
        if (existing) continue;

        const entityDir = path.join(
          paths.attachments,
          entry.entityType.replace(/[^a-zA-Z0-9_-]/g, ''),
          entry.entityId.replace(/[^a-zA-Z0-9_-]/g, ''),
        );
        const destPath = path.join(entityDir, safeName);
        const resolvedRoot = path.resolve(paths.attachments);
        if (!path.resolve(destPath).startsWith(resolvedRoot + path.sep)) {
          throw new AppError('PATH_TRAVERSAL', 'مسار مرفق غير صالح داخل ملف النقل');
        }

        await fs.promises.mkdir(entityDir, { recursive: true });
        await fs.promises.writeFile(destPath, buffer);
        attachmentsWritten.push(destPath);

        await tx.attachment.create({
          data: {
            id: entry.id,
            fileName: entry.fileName,
            storedName: path.relative(paths.attachments, destPath),
            entityType: entry.entityType,
            entityId: entry.entityId,
            mimeType: entry.mimeType,
            sizeBytes: buffer.length,
            uploadedById: actor.userId ?? undefined,
          },
        });
        attachmentsImported += 1;
      }

      const batch = await tx.importBatch.create({
        data: {
          kind: TRANSFER_IMPORT_KIND,
          sourceKey: parsed.checksum,
          sourceName: parsed.fileName,
          deviceId: parsed.manifest.deviceId,
          sourceUser: parsed.manifest.sourceUser,
          schemaVersion: String(parsed.manifest.schemaVersion),
          createdCount: created,
          updatedCount: updated,
          skippedCount: counts.unchanged + counts.conflict,
          errorCount: counts.error,
          summary: JSON.stringify({
            counts,
            attachments: attachmentsImported,
            device: parsed.manifest.deviceLabel ?? parsed.manifest.deviceId,
          }),
          storedFile,
          importedById: actor.userId,
          importedBy: actor.username,
        },
      });

      return {
        created,
        updated,
        skipped: counts.unchanged + counts.conflict,
        errors: counts.error,
        attachmentsImported,
        batchId: batch.id,
        storedFile,
      };
    });

    return result;
  } catch (err) {
    // The transaction rolled the rows back; take the files with it so a
    // failed import leaves no orphaned attachments behind.
    await Promise.all(attachmentsWritten.map((p) => fs.promises.unlink(p).catch(() => undefined)));
    await fs.promises.unlink(storedFile).catch(() => undefined);
    throw err;
  }
}

/** Next free GZ-#### code, computed inside the import transaction. */
async function allocateFamilyCode(tx: Prisma.TransactionClient): Promise<string> {
  const last = await tx.family.findFirst({
    where: { familyCode: { startsWith: 'GZ-' } },
    orderBy: { familyCode: 'desc' },
    select: { familyCode: true },
  });
  const lastNumber = last ? Number(last.familyCode.slice(3)) : 0;
  const next = Number.isFinite(lastNumber) ? lastNumber + 1 : 1;
  return `GZ-${String(next).padStart(4, '0')}`;
}

// ── Exporting reference data to the phone ────────────────────────────────────

export interface ExportForMobileOptions {
  deviceId: string;
  appVersion: string;
  sourceUser: string | null;
  outputDir: string;
}

/**
 * Builds a desktop→mobile package so the field app starts with the real
 * family and beneficiary list instead of an empty database. Carries reference
 * data only — no donations, inventory or accounting ever leaves the office
 * machine.
 */
export async function exportForMobile(options: ExportForMobileOptions): Promise<string> {
  const prisma = getPrisma();

  const [families, familyMembers, beneficiaries] = await Promise.all([
    prisma.family.findMany({ where: { isActive: true } }),
    prisma.familyMember.findMany({ where: { family: { isActive: true } } }),
    prisma.beneficiary.findMany({ where: { isActive: true } }),
  ]);

  const records = emptyTransferRecords();
  records.families = families as unknown as TransferRecordBase[];
  records.familyMembers = familyMembers as unknown as TransferRecordBase[];
  records.beneficiaries = beneficiaries as unknown as TransferRecordBase[];

  const manifest: TransferManifest = {
    format: TRANSFER_FORMAT_NAME,
    schemaVersion: TRANSFER_SCHEMA_VERSION,
    direction: 'desktop-to-mobile',
    exportedAt: new Date().toISOString(),
    deviceId: options.deviceId,
    deviceLabel: 'جهاز المكتب',
    sourceUser: options.sourceUser,
    appVersion: options.appVersion,
    counts: {
      families: families.length,
      familyMembers: familyMembers.length,
      beneficiaries: beneficiaries.length,
    },
    attachmentCount: 0,
  };

  await fs.promises.mkdir(options.outputDir, { recursive: true });
  const outPath = path.join(options.outputDir, buildTransferFileName());

  await new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(outPath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    output.on('close', () => resolve());
    archive.on('error', reject);
    archive.pipe(output);
    archive.append(JSON.stringify(manifest, null, 2), { name: MANIFEST_ENTRY });
    archive.append(JSON.stringify(records), { name: RECORDS_ENTRY });
    archive.append(JSON.stringify([]), { name: ATTACHMENTS_MANIFEST_ENTRY });
    void archive.finalize();
  });

  return outPath;
}

/** Import history, newest first — shown on the transfer screen. */
export async function listImportBatches(limit = 25) {
  const prisma = getPrisma();
  return prisma.importBatch.findMany({ orderBy: { importedAt: 'desc' }, take: limit });
}
