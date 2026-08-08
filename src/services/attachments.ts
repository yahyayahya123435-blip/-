/**
 * SERVER-ONLY. File manager for record attachments. All paths are resolved
 * and verified to stay INSIDE the managed attachments root before any file
 * operation — the standard defense against path traversal / arbitrary file
 * access, since entityType/entityId/storedName ultimately influence paths.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { z } from 'zod';
import { getPrisma } from '../lib/db';
import { runWithAuditContext, type AuditActor } from '../lib/audit-context';
import { AppError } from '../lib/app-error';

const ALLOWED_EXTENSIONS = new Set([
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.jpg', '.jpeg', '.png', '.gif', '.txt', '.csv',
]);
const MIME_BY_EXT: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
};
const MAX_SIZE_BYTES = 25 * 1024 * 1024; // 25MB
const ENTITY_TYPES = new Set([
  'families', 'beneficiaries', 'assistances', 'donations', 'campaigns', 'social_assessments', 'field_visits',
]);

function assertWithin(root: string, target: string): void {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  if (resolvedTarget !== resolvedRoot && !resolvedTarget.startsWith(resolvedRoot + path.sep)) {
    throw new AppError('PATH_TRAVERSAL', 'مسار ملف غير صالح');
  }
}

function sanitizeSegment(segment: string): string {
  const cleaned = segment.replace(/[^a-zA-Z0-9_-]/g, '');
  if (!cleaned) throw new AppError('INVALID_INPUT', 'قيمة غير صالحة');
  return cleaned;
}

export const uploadAttachmentInput = z.object({
  entityType: z.string().min(1),
  entityId: z.string().min(1),
  sourcePath: z.string().min(1),
  originalFileName: z.string().min(1).max(255),
});

export async function uploadAttachment(
  actor: AuditActor,
  attachmentsDir: string,
  input: z.infer<typeof uploadAttachmentInput>,
) {
  const parsed = uploadAttachmentInput.parse(input);
  if (!ENTITY_TYPES.has(parsed.entityType)) {
    throw new AppError('INVALID_ENTITY_TYPE', 'نوع السجل غير صحيح');
  }
  const ext = path.extname(parsed.originalFileName).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new AppError('INVALID_FILE_TYPE', 'نوع الملف غير مسموح به');
  }

  const sourceStat = await fs.promises.stat(parsed.sourcePath).catch(() => null);
  if (!sourceStat || !sourceStat.isFile()) {
    throw new AppError('SOURCE_NOT_FOUND', 'الملف المصدر غير موجود');
  }
  if (sourceStat.size > MAX_SIZE_BYTES) {
    throw new AppError('FILE_TOO_LARGE', 'حجم الملف يتجاوز الحد المسموح (25 ميجابايت)');
  }

  const entityDir = path.join(attachmentsDir, sanitizeSegment(parsed.entityType), sanitizeSegment(parsed.entityId));
  assertWithin(attachmentsDir, entityDir);
  await fs.promises.mkdir(entityDir, { recursive: true });

  const storedName = `${crypto.randomUUID()}${ext}`;
  const destPath = path.join(entityDir, storedName);
  assertWithin(attachmentsDir, destPath);

  await fs.promises.copyFile(parsed.sourcePath, destPath);

  return runWithAuditContext(actor, (tx) =>
    tx.attachment.create({
      data: {
        fileName: parsed.originalFileName,
        storedName: path.join(sanitizeSegment(parsed.entityType), sanitizeSegment(parsed.entityId), storedName),
        entityType: parsed.entityType,
        entityId: parsed.entityId,
        mimeType: MIME_BY_EXT[ext] ?? 'application/octet-stream',
        sizeBytes: sourceStat.size,
        uploadedById: actor.userId ?? undefined,
      },
    }),
  );
}

export async function listAttachments(entityType: string, entityId: string) {
  const prisma = getPrisma();
  return prisma.attachment.findMany({ where: { entityType, entityId }, orderBy: { createdAt: 'desc' } });
}

export async function deleteAttachment(actor: AuditActor, attachmentsDir: string, id: string) {
  const prisma = getPrisma();
  const record = await prisma.attachment.findUniqueOrThrow({ where: { id } });
  const fullPath = path.join(attachmentsDir, record.storedName);
  assertWithin(attachmentsDir, fullPath);

  await runWithAuditContext(actor, (tx) => tx.attachment.delete({ where: { id } }));
  await fs.promises.unlink(fullPath).catch(() => undefined);
  return { success: true };
}

export function resolveAttachmentFullPath(attachmentsDir: string, storedName: string): string {
  const fullPath = path.join(attachmentsDir, storedName);
  assertWithin(attachmentsDir, fullPath);
  return fullPath;
}
