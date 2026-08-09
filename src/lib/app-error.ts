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
    if (error.code === 'P2003' || error.code === 'P2014') {
      return new AppError('FOREIGN_KEY', 'لا يمكن تنفيذ العملية لوجود بيانات مرتبطة بهذا السجل');
    }
    if (error.code === 'P2025') {
      return new AppError('NOT_FOUND', 'السجل المطلوب غير موجود');
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
