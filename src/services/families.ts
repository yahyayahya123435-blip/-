/** SERVER-ONLY. Families + family members. Reference module — later modules follow this shape. */
import { z } from 'zod';
import { getPrisma } from '../lib/db';
import { runWithAuditContext, type AuditActor } from '../lib/audit-context';
import { paginationInput, paginationSkipTake, genderEnum, relationshipEnum, housingTypeEnum, economicLevelEnum, filsAmount } from '../lib/validation';

export const createFamilyInput = z.object({
  familyCode: z.string().trim().min(1).max(50),
  headOfFamilyName: z.string().trim().min(2).max(150),
  headNationalId: z.string().trim().max(50).optional(),
  address: z.string().trim().max(300).optional(),
  city: z.string().trim().max(100).optional(),
  phone: z.string().trim().max(30).optional(),
  altPhone: z.string().trim().max(30).optional(),
  housingType: housingTypeEnum.optional(),
  monthlyIncomeFils: filsAmount.default(0),
  economicLevel: economicLevelEnum.optional(),
  notes: z.string().trim().max(2000).optional(),
});
export const updateFamilyInput = createFamilyInput.partial().extend({ id: z.string().min(1) });

export const listFamiliesInput = paginationInput.extend({
  economicLevel: economicLevelEnum.optional(),
  isActive: z.boolean().optional(),
});

export async function listFamilies(input: z.infer<typeof listFamiliesInput>) {
  const parsed = listFamiliesInput.parse(input);
  const prisma = getPrisma();
  const where = {
    ...(parsed.economicLevel ? { economicLevel: parsed.economicLevel } : {}),
    ...(parsed.isActive !== undefined ? { isActive: parsed.isActive } : {}),
    ...(parsed.search
      ? {
          OR: [
            { headOfFamilyName: { contains: parsed.search } },
            { familyCode: { contains: parsed.search } },
            { headNationalId: { contains: parsed.search } },
            { phone: { contains: parsed.search } },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.family.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      ...paginationSkipTake(parsed),
      include: { _count: { select: { members: true, beneficiaries: true } } },
    }),
    prisma.family.count({ where }),
  ]);
  return { rows, total, page: parsed.page, pageSize: parsed.pageSize };
}

export async function getFamily(id: string) {
  const prisma = getPrisma();
  const family = await prisma.family.findUniqueOrThrow({
    where: { id },
    include: { members: true, beneficiaries: true },
  });
  return family;
}

export async function createFamily(actor: AuditActor, input: z.infer<typeof createFamilyInput>) {
  const parsed = createFamilyInput.parse(input);
  return runWithAuditContext(actor, (tx) => tx.family.create({ data: parsed }));
}

export async function updateFamily(actor: AuditActor, input: z.infer<typeof updateFamilyInput>) {
  const parsed = updateFamilyInput.parse(input);
  const { id, ...data } = parsed;
  return runWithAuditContext(actor, (tx) => tx.family.update({ where: { id }, data }));
}

export async function deleteFamily(actor: AuditActor, id: string) {
  // Restrict FK on beneficiaries/etc. means this throws a safe FOREIGN_KEY
  // error (translated by app-error.ts) if the family still has dependents —
  // enforcing "soft delete where appropriate" by simply disallowing hard
  // delete of families with real history; use isActive=false instead.
  return runWithAuditContext(actor, (tx) => tx.family.delete({ where: { id } }));
}

export async function deactivateFamily(actor: AuditActor, id: string) {
  return runWithAuditContext(actor, (tx) => tx.family.update({ where: { id }, data: { isActive: false } }));
}

// ---- Family members ----

export const createFamilyMemberInput = z.object({
  familyId: z.string().min(1),
  fullName: z.string().trim().min(2).max(150),
  nationalId: z.string().trim().max(50).optional(),
  relationship: relationshipEnum,
  gender: genderEnum,
  birthDate: z.coerce.date().optional(),
  isDisabled: z.boolean().default(false),
  isStudent: z.boolean().default(false),
  healthStatus: z.string().trim().max(300).optional(),
  occupation: z.string().trim().max(150).optional(),
});
export const updateFamilyMemberInput = createFamilyMemberInput.partial().extend({ id: z.string().min(1) });

export async function listFamilyMembers(familyId: string) {
  const prisma = getPrisma();
  return prisma.familyMember.findMany({ where: { familyId }, orderBy: { createdAt: 'asc' } });
}

export async function createFamilyMember(actor: AuditActor, input: z.infer<typeof createFamilyMemberInput>) {
  const parsed = createFamilyMemberInput.parse(input);
  return runWithAuditContext(actor, (tx) => tx.familyMember.create({ data: parsed }));
}

export async function updateFamilyMember(actor: AuditActor, input: z.infer<typeof updateFamilyMemberInput>) {
  const parsed = updateFamilyMemberInput.parse(input);
  const { id, ...data } = parsed;
  return runWithAuditContext(actor, (tx) => tx.familyMember.update({ where: { id }, data }));
}

export async function deleteFamilyMember(actor: AuditActor, id: string) {
  return runWithAuditContext(actor, (tx) => tx.familyMember.delete({ where: { id } }));
}
