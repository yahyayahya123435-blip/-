/** SERVER-ONLY. */
import { z } from 'zod';
import { getPrisma } from '../lib/db';
import { runWithAuditContext, type AuditActor } from '../lib/audit-context';
import { paginationInput, paginationSkipTake, genderEnum, beneficiaryCategoryEnum, beneficiaryStatusEnum } from '../lib/validation';

export const beneficiaryFields = z.object({
  familyId: z.string().min(1),
  fullName: z.string().trim().min(2).max(150),
  nationalId: z.string().trim().max(50).optional(),
  phone: z.string().trim().max(30).optional(),
  birthDate: z.coerce.date().optional(),
  gender: genderEnum.optional(),
  category: beneficiaryCategoryEnum.optional(),
  status: beneficiaryStatusEnum.default('نشط'),
  notes: z.string().trim().max(2000).optional(),
});
export const createBeneficiaryInput = beneficiaryFields;
export const updateBeneficiaryInput = beneficiaryFields.partial().extend({ id: z.string().min(1) });

export const listBeneficiariesInput = paginationInput.extend({
  familyId: z.string().optional(),
  category: beneficiaryCategoryEnum.optional(),
  status: beneficiaryStatusEnum.optional(),
});

export async function listBeneficiaries(input: z.infer<typeof listBeneficiariesInput>) {
  const parsed = listBeneficiariesInput.parse(input);
  const prisma = getPrisma();
  const where = {
    ...(parsed.familyId ? { familyId: parsed.familyId } : {}),
    ...(parsed.category ? { category: parsed.category } : {}),
    ...(parsed.status ? { status: parsed.status } : {}),
    ...(parsed.search
      ? { OR: [
          { fullName: { contains: parsed.search } },
          { nationalId: { contains: parsed.search } },
          { phone: { contains: parsed.search } },
        ] }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.beneficiary.findMany({
      where, orderBy: { createdAt: 'desc' }, ...paginationSkipTake(parsed),
      include: { family: { select: { familyCode: true, headOfFamilyName: true } } },
    }),
    prisma.beneficiary.count({ where }),
  ]);
  return { rows, total, page: parsed.page, pageSize: parsed.pageSize };
}

export async function getBeneficiary(id: string) {
  const prisma = getPrisma();
  return prisma.beneficiary.findUniqueOrThrow({ where: { id }, include: { family: true, assessments: true, assistances: true } });
}

/**
 * Duplicate detection is a WARNING, never a hard block: matches by name,
 * national id, phone, or (birthDate + family) are surfaced to the caller so
 * the UI can ask the user to confirm before saving.
 */
export async function checkDuplicateBeneficiaries(input: {
  fullName: string; nationalId?: string; phone?: string; birthDate?: Date; familyId: string; excludeId?: string;
}) {
  const prisma = getPrisma();
  const orConditions: Record<string, unknown>[] = [{ fullName: input.fullName }];
  if (input.nationalId) orConditions.push({ nationalId: input.nationalId });
  if (input.phone) orConditions.push({ phone: input.phone });
  if (input.birthDate) orConditions.push({ birthDate: input.birthDate, familyId: input.familyId });

  return prisma.beneficiary.findMany({
    where: {
      OR: orConditions,
      ...(input.excludeId ? { id: { not: input.excludeId } } : {}),
    },
    include: { family: { select: { familyCode: true, headOfFamilyName: true } } },
    take: 10,
  });
}

export async function createBeneficiary(actor: AuditActor, input: z.infer<typeof createBeneficiaryInput>) {
  const parsed = createBeneficiaryInput.parse(input);
  return runWithAuditContext(actor, (tx) => tx.beneficiary.create({ data: parsed }));
}

export async function updateBeneficiary(actor: AuditActor, input: z.infer<typeof updateBeneficiaryInput>) {
  const parsed = updateBeneficiaryInput.parse(input);
  const { id, ...data } = parsed;
  return runWithAuditContext(actor, (tx) => tx.beneficiary.update({ where: { id }, data }));
}

export async function deleteBeneficiary(actor: AuditActor, id: string) {
  return runWithAuditContext(actor, (tx) => tx.beneficiary.update({ where: { id }, data: { isActive: false, status: 'موقوف' } }));
}
