/**
 * SERVER-ONLY. One-time import of the association's existing member register
 * ("المنتسبين_جاهز_للاستيراد.xlsx", shipped as resources/seed/families-330.xlsx).
 *
 * Ground rules, taken straight from the requirement and enforced here rather
 * than left to the caller:
 *   - The sheet is the authority for names. They are stored verbatim.
 *   - National ID and family-book member count are left NULL. Nothing in this
 *     file invents, derives or defaults either one.
 *   - "عدد مرات الظهور" and "مراجع القيود الأصلية" are preserved on the family
 *     as source metadata so the trail back to the paper registers survives.
 *   - Running the import twice is a no-op: it is keyed on a fixed sourceKey in
 *     import_batches, and every row additionally carries a unique
 *     legacyReference, so even a partially-applied run cannot duplicate a family.
 */
import fs from 'node:fs';
import path from 'node:path';
import { getPrisma } from '../lib/db';
import { runWithAuditContext, type AuditActor } from '../lib/audit-context';
import { AppError } from '../lib/app-error';
import { readXlsxSheet } from '../lib/xlsx-reader';

/** Fixed key for the bundled register — the sole reason a second run is a no-op. */
export const LEGACY_IMPORT_SOURCE_KEY = 'legacy-families-xlsx:v1';
export const LEGACY_IMPORT_KIND = 'legacy_families';
export const LEGACY_SOURCE_LABEL = 'استيراد أولي';

/** Row 4 holds the headers; data starts at row 5 (rows 1-2 are a title block). */
const HEADER_ROW = 4;
const FIRST_DATA_ROW = 5;

const COLUMN = {
  sequence: 1, // تسلسل
  headOfFamilyName: 2, // اسم رب الأسرة / المنتسب
  wifeName: 3, // اسم الزوجة
  nationalId: 4, // الرقم الوطني — expected blank
  bookMembersCount: 5, // عدد الأفراد في دفتر العائلة — expected blank
  occurrences: 6, // عدد مرات الظهور
  sourceRefs: 7, // مراجع القيود الأصلية
} as const;

export interface LegacyFamilyRow {
  sequence: number;
  legacyReference: string;
  headOfFamilyName: string;
  wifeName: string | null;
  occurrences: number | null;
  sourceRefs: string | null;
}

export interface LegacySheetReadResult {
  rows: LegacyFamilyRow[];
  errors: { row: number; message: string }[];
}

/** Resolves the bundled register inside the repo (dev) or resources/ (packaged). */
export function getBundledLegacySheetPath(resourceRoot: string): string {
  return path.join(resourceRoot, 'resources', 'seed', 'families-330.xlsx');
}

type SheetRow = (string | undefined)[];

function cellText(row: SheetRow | undefined, column: number): string {
  return (row?.[column] ?? '').trim();
}

function cellInteger(row: SheetRow | undefined, column: number): number | null {
  const text = cellText(row, column);
  if (!text) return null;
  const parsed = Number(text);
  return Number.isInteger(parsed) ? parsed : null;
}

export async function readLegacySheet(filePath: string): Promise<LegacySheetReadResult> {
  if (!fs.existsSync(filePath)) {
    throw new AppError('IMPORT_FILE_MISSING', 'ملف الاستيراد غير موجود في مجلد البرنامج');
  }

  const sheet = await readXlsxSheet(filePath, 0);

  const headerCell = cellText(sheet.rows[HEADER_ROW], COLUMN.headOfFamilyName);
  if (!headerCell.includes('رب الأسرة')) {
    throw new AppError(
      'IMPORT_FILE_INVALID',
      'تنسيق ملف الاستيراد غير متوقع — يجب أن يكون صف العناوين هو الصف الرابع',
    );
  }

  const rows: LegacyFamilyRow[] = [];
  const errors: { row: number; message: string }[] = [];
  const seenSequences = new Set<number>();

  for (let rowNumber = FIRST_DATA_ROW; rowNumber < sheet.rows.length; rowNumber += 1) {
    const row = sheet.rows[rowNumber];
    const headOfFamilyName = cellText(row, COLUMN.headOfFamilyName);
    const sequenceText = cellText(row, COLUMN.sequence);

    // Fully blank trailing rows are normal padding, not an error.
    if (!headOfFamilyName && !sequenceText) continue;

    if (!headOfFamilyName) {
      errors.push({ row: rowNumber, message: 'اسم رب الأسرة فارغ' });
      continue;
    }
    const sequence = cellInteger(row, COLUMN.sequence);
    if (sequence === null) {
      errors.push({ row: rowNumber, message: 'رقم التسلسل غير صحيح' });
      continue;
    }
    if (seenSequences.has(sequence)) {
      errors.push({ row: rowNumber, message: `رقم التسلسل ${sequence} مكرر داخل الملف` });
      continue;
    }
    seenSequences.add(sequence);

    const wifeName = cellText(row, COLUMN.wifeName);
    const sourceRefs = cellText(row, COLUMN.sourceRefs);

    rows.push({
      sequence,
      legacyReference: `${LEGACY_IMPORT_SOURCE_KEY}#${sequence}`,
      headOfFamilyName,
      wifeName: wifeName || null,
      occurrences: cellInteger(row, COLUMN.occurrences),
      sourceRefs: sourceRefs || null,
    });
  }

  return { rows, errors };
}

export interface LegacyImportPreview {
  alreadyImported: boolean;
  importedAt: string | null;
  importedBy: string | null;
  fileName: string;
  totalRows: number;
  toCreate: number;
  alreadyPresent: number;
  errors: { row: number; message: string }[];
  /** First few rows, so the operator can eyeball the parse before committing. */
  sample: LegacyFamilyRow[];
}

/**
 * Reads and diffs the sheet against the database WITHOUT writing anything.
 * The wizard shows this first; nothing is inserted until the operator confirms.
 */
export async function previewLegacyImport(resourceRoot: string): Promise<LegacyImportPreview> {
  const filePath = getBundledLegacySheetPath(resourceRoot);
  const { rows, errors } = await readLegacySheet(filePath);
  const prisma = getPrisma();

  const batch = await prisma.importBatch.findUnique({
    where: { sourceKey: LEGACY_IMPORT_SOURCE_KEY },
  });

  const existing = await prisma.family.findMany({
    where: { legacyReference: { in: rows.map((r) => r.legacyReference) } },
    select: { legacyReference: true },
  });
  const existingRefs = new Set(existing.map((e) => e.legacyReference));

  return {
    alreadyImported: batch !== null,
    importedAt: batch?.importedAt.toISOString() ?? null,
    importedBy: batch?.importedBy ?? null,
    fileName: path.basename(filePath),
    totalRows: rows.length,
    toCreate: rows.filter((r) => !existingRefs.has(r.legacyReference)).length,
    alreadyPresent: rows.filter((r) => existingRefs.has(r.legacyReference)).length,
    errors,
    sample: rows.slice(0, 10),
  };
}

export interface LegacyImportResult {
  created: number;
  skipped: number;
  errors: number;
  batchId: string;
}

/**
 * Allocates internal file codes (GZ-0001...) for the imported families,
 * skipping any code a manually created family already occupies.
 */
function buildCodeAllocator(taken: Set<string>): () => string {
  let next = 1;
  return () => {
    for (;;) {
      const code = `GZ-${String(next).padStart(4, '0')}`;
      next += 1;
      if (!taken.has(code)) {
        taken.add(code);
        return code;
      }
    }
  };
}

export async function runLegacyImport(
  actor: AuditActor,
  resourceRoot: string,
): Promise<LegacyImportResult> {
  const prisma = getPrisma();

  const alreadyRun = await prisma.importBatch.findUnique({
    where: { sourceKey: LEGACY_IMPORT_SOURCE_KEY },
  });
  if (alreadyRun) {
    throw new AppError(
      'DUPLICATE_IMPORT',
      'تم استيراد ملف العائلات مسبقاً بتاريخ ' +
        alreadyRun.importedAt.toISOString().slice(0, 10) +
        ' — لن يتم تكرار الاستيراد',
    );
  }

  const filePath = getBundledLegacySheetPath(resourceRoot);
  const { rows, errors } = await readLegacySheet(filePath);

  const existingCodes = await prisma.family.findMany({ select: { familyCode: true } });
  const allocateCode = buildCodeAllocator(new Set(existingCodes.map((f) => f.familyCode)));

  // Everything below happens in ONE transaction: either all 330 families and
  // the batch record land together, or the database is untouched.
  return runWithAuditContext(actor, async (tx) => {
    const present = await tx.family.findMany({
      where: { legacyReference: { in: rows.map((r) => r.legacyReference) } },
      select: { legacyReference: true },
    });
    const presentRefs = new Set(present.map((p) => p.legacyReference));

    let created = 0;
    for (const row of rows) {
      if (presentRefs.has(row.legacyReference)) continue;
      await tx.family.create({
        data: {
          familyCode: allocateCode(),
          headOfFamilyName: row.headOfFamilyName,
          wifeName: row.wifeName,
          // headNationalId and familyBookMembersCount stay NULL on purpose:
          // the register does not carry them and they are never invented.
          sourceSystem: LEGACY_SOURCE_LABEL,
          legacyReference: row.legacyReference,
          legacySourceRefs: row.sourceRefs,
          legacyOccurrences: row.occurrences,
        },
      });
      created += 1;
    }

    const batch = await tx.importBatch.create({
      data: {
        kind: LEGACY_IMPORT_KIND,
        sourceKey: LEGACY_IMPORT_SOURCE_KEY,
        sourceName: path.basename(filePath),
        createdCount: created,
        skippedCount: rows.length - created,
        errorCount: errors.length,
        summary: JSON.stringify({ families: created, sheetRows: rows.length, parseErrors: errors }),
        importedById: actor.userId,
        importedBy: actor.username,
      },
    });

    return {
      created,
      skipped: rows.length - created,
      errors: errors.length,
      batchId: batch.id,
    };
  });
}

// ---- Completing the deliberately-blank fields -------------------------------

export interface IncompleteFamiliesQuery {
  page: number;
  pageSize: number;
  search?: string;
  /** all = either field missing; nationalId / bookCount = that field only. */
  missing: 'all' | 'nationalId' | 'bookCount';
}

/**
 * Families still missing a national ID and/or a family-book member count —
 * the working list for filling in what the register did not carry. Backs both
 * the dedicated completion screen and the "بيانات ناقصة" filter on the
 * families list.
 */
export async function listIncompleteFamilies(input: IncompleteFamiliesQuery) {
  const prisma = getPrisma();

  const missingNationalId = { OR: [{ headNationalId: null }, { headNationalId: '' }] };
  const missingBookCount = { familyBookMembersCount: null };
  const missingClause =
    input.missing === 'nationalId'
      ? missingNationalId
      : input.missing === 'bookCount'
        ? missingBookCount
        : { OR: [missingNationalId, missingBookCount] };

  const where = {
    AND: [
      missingClause,
      ...(input.search
        ? [
            {
              OR: [
                { headOfFamilyName: { contains: input.search } },
                { familyCode: { contains: input.search } },
                { wifeName: { contains: input.search } },
              ],
            },
          ]
        : []),
    ],
  };

  const [rows, total] = await Promise.all([
    prisma.family.findMany({
      where,
      orderBy: { familyCode: 'asc' },
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
      select: {
        id: true,
        familyCode: true,
        headOfFamilyName: true,
        wifeName: true,
        headNationalId: true,
        familyBookMembersCount: true,
        phone: true,
        legacySourceRefs: true,
      },
    }),
    prisma.family.count({ where }),
  ]);

  return { rows, total, page: input.page, pageSize: input.pageSize };
}

export interface CompleteFamilyPatch {
  id: string;
  headNationalId?: string | null;
  familyBookMembersCount?: number | null;
}

/**
 * Saves the national ID / member count for several families at once, in one
 * transaction, so a half-finished batch never lands. Blank values are left
 * alone rather than written as NULL — this screen only ever fills gaps.
 */
export async function completeFamilyData(actor: AuditActor, patches: CompleteFamilyPatch[]) {
  return runWithAuditContext(actor, async (tx) => {
    let updated = 0;
    for (const patch of patches) {
      const data: Record<string, unknown> = {};
      const nationalId = patch.headNationalId?.trim();
      if (nationalId) data.headNationalId = nationalId;
      if (typeof patch.familyBookMembersCount === 'number') {
        data.familyBookMembersCount = patch.familyBookMembersCount;
      }
      if (Object.keys(data).length === 0) continue;
      await tx.family.update({ where: { id: patch.id }, data });
      updated += 1;
    }
    return { updated };
  });
}
