/**
 * SERVER-ONLY. Converts internal errors (Prisma errors, trigger ABORT
 * messages, zod validation errors, permission errors) into safe Arabic
 * messages for the renderer, while the full detail is written to Logs/.
 * Never let a raw error (stack trace, "PrismaClientKnownRequestError",
 * a SQL trigger message) reach the UI directly.
 */
import { Prisma } from '../../generated/prisma';
import { ZodError } from 'zod';
import { logger } from './logger';
import { PermissionDeniedError } from './permissions';

export class AppError extends Error {
  code: string;
  constructor(code: string, safeMessage: string) {
    super(safeMessage);
    this.code = code;
    this.name = 'AppError';
  }
}

const TRIGGER_MESSAGES: Record<string, string> = {
  INVALID_FAMILY: 'الأسرة المحددة غير موجودة',
  FAMILY_MISMATCH: 'بيانات الأسرة والمستفيد غير متطابقة',
  NEGATIVE_STOCK: 'الكمية المطلوبة تتجاوز الرصيد المتاح في المخزون',
  INVALID_ENUM: 'قيمة غير صحيحة لأحد الحقول',
  AUDIT_IMMUTABLE: 'سجل العمليات غير قابل للتعديل أو الحذف',
  IMMUTABLE_FIELD: 'لا يمكن تعديل هذا الحقل بعد إنشائه',
  DUPLICATE_IMPORT: 'تم استيراد هذا الملف مسبقاً ولن يتم تكراره',
};

/**
 * Models whose write can only fail one way at the database level, so a
 * generic constraint error can be translated precisely.
 *
 * This exists because Prisma's SQLite connector collapses EVERY trigger
 * `RAISE(ABORT, '...')` into P2003 "Foreign key constraint violated" and
 * discards the trigger's own message — verified against Prisma 5.22. So the
 * TRIGGER_MESSAGES lookup below never matches a Prisma-raised error, and
 * without this map an attempt to rewrite an audit row would be reported to
 * the user as "this record has related data".
 *
 * audit_logs qualifies because it has no foreign keys at all: the only
 * constraint that can reject a write to it is the immutability trigger.
 */
const UNAMBIGUOUS_CONSTRAINT_BY_MODEL: Record<string, { code: string; message: string }> = {
  AuditLog: { code: 'AUDIT_IMMUTABLE', message: TRIGGER_MESSAGES.AUDIT_IMMUTABLE },
};

export function toSafeError(error: unknown): AppError {
  if (error instanceof AppError) return error;

  if (error instanceof PermissionDeniedError) {
    logger.warn('permission denied', error);
    return new AppError('PERMISSION_DENIED', 'ليست لديك صلاحية لتنفيذ هذا الإجراء');
  }

  if (error instanceof ZodError) {
    logger.warn('validation error', error);
    return new AppError('VALIDATION_ERROR', 'البيانات المدخلة غير صحيحة، يرجى المراجعة');
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    logger.error('prisma known error', error);
    if (error.code === 'P2002') {
      return new AppError('UNIQUE_CONSTRAINT', 'يوجد سجل آخر بنفس القيمة الفريدة (تكرار)');
    }
    if (error.code === 'P2025') {
      return new AppError('NOT_FOUND', 'السجل المطلوب غير موجود');
    }
    if (error.code === 'P2003' || error.code === 'P2014') {
      const modelName = (error.meta as { modelName?: string } | undefined)?.modelName;
      const known = modelName ? UNAMBIGUOUS_CONSTRAINT_BY_MODEL[modelName] : undefined;
      if (known) return new AppError(known.code, known.message);

      // `field_name: 'foreign key'` is what the SQLite connector reports for a
      // trigger rejection, as opposed to a named column for a real foreign key
      // violation. Wording stays deliberately general in that case rather than
      // asserting a cause we cannot actually determine.
      const fieldName = (error.meta as { field_name?: string } | undefined)?.field_name;
      if (fieldName === 'foreign key') {
        return new AppError(
          'CONSTRAINT_VIOLATION',
          'تم رفض العملية لمخالفتها إحدى قواعد سلامة البيانات',
        );
      }
      return new AppError('FOREIGN_KEY', 'لا يمكن تنفيذ العملية لوجود بيانات مرتبطة بهذا السجل');
    }
    for (const [key, message] of Object.entries(TRIGGER_MESSAGES)) {
      if (error.message.includes(key)) {
        return new AppError(key, message);
      }
    }
    return new AppError('DB_ERROR', 'تعذر حفظ البيانات، يرجى المحاولة مرة أخرى');
  }

  if (error instanceof Error) {
    if (error.message === 'UNAUTHENTICATED') {
      return new AppError('UNAUTHENTICATED', 'انتهت الجلسة، يرجى تسجيل الدخول مرة أخرى');
    }
    for (const [key, message] of Object.entries(TRIGGER_MESSAGES)) {
      if (error.message.includes(key)) {
        logger.warn('trigger rejection', error);
        return new AppError(key, message);
      }
    }
    logger.error('unhandled error', error);
    return new AppError('UNKNOWN', 'حدث خطأ غير متوقع، يرجى المحاولة مرة أخرى');
  }

  logger.error('unhandled non-error thrown', error);
  return new AppError('UNKNOWN', 'حدث خطأ غير متوقع، يرجى المحاولة مرة أخرى');
}
