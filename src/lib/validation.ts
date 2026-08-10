/**
 * SERVER-ONLY. Shared zod primitives for service-layer input validation.
 * This is where the exhaustive "allowed enum values" list lives — the DB
 * triggers in constraints-and-context.sql only guard the highest-risk
 * fields; every field gets validated here before it ever reaches Prisma.
 */
import { z } from 'zod';

export const genderEnum = z.enum(['ذكر', 'أنثى']);
export const relationshipEnum = z.enum(['رب أسرة', 'زوجة', 'ابن', 'ابنة', 'أخرى']);
export const housingTypeEnum = z.enum(['ملك', 'إيجار', 'أخرى']);
export const economicLevelEnum = z.enum(['فقير جداً', 'فقير', 'متوسط', 'ميسور']);
export const maritalStatusEnum = z.enum(['أعزب', 'متزوج', 'مطلق', 'أرمل']);
export const needLevelEnum = z.enum(['شديد الحاجة', 'متوسط الحاجة', 'قليل الحاجة']);
export const fileStatusEnum = z.enum(['نشط', 'موقوف', 'مؤرشف']);
export const assistanceSourceEnum = z.enum(['مخزون', 'تبرع', 'ميزانية الجمعية', 'أخرى']);
export const beneficiaryCategoryEnum = z.enum(['يتيم', 'مسن', 'مريض', 'ذوي إعاقة', 'أخرى']);
export const beneficiaryStatusEnum = z.enum(['نشط', 'موقوف', 'مرفوض']);
export const assistanceCategoryEnum = z.enum(['نقدي', 'عيني']);
export const assistanceStatusEnum = z.enum(['معلقة', 'موافق عليها', 'مصروفة', 'مرفوضة']);
export const campaignStatusEnum = z.enum(['مخطط لها', 'مفتوحة', 'مغلقة']);
export const donorTypeEnum = z.enum(['فرد', 'مؤسسة']);
export const donationMethodEnum = z.enum(['كاش', 'تحويل بنكي', 'شيك']);
export const transactionTypeEnum = z.enum(['دخل', 'مصروف']);
export const stockOutReasonEnum = z.enum(['مساعدة', 'تالف', 'جرد', 'أخرى']);
export const fieldVisitStatusEnum = z.enum(['مجدولة', 'مكتملة', 'ملغاة']);
export const approvalStatusEnum = z.enum(['قيد الانتظار', 'موافق عليه', 'مرفوض']);
export const notificationLevelEnum = z.enum(['معلومة', 'تحذير', 'خطأ']);

// Money: always an integer number of fils. Rejects fractional/float input
// at the boundary so a float can never slip into a *_fils column.
export const filsAmount = z.number().int().min(0);

export const paginationInput = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(200).optional(),
});
export type PaginationInput = z.infer<typeof paginationInput>;

export function paginationSkipTake(input: PaginationInput) {
  return { skip: (input.page - 1) * input.pageSize, take: input.pageSize };
}
