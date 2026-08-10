/** SERVER-ONLY. Families + family members. Reference module — later modules follow this shape. */
import { z } from 'zod';
import { getPrisma } from '../lib/db';
import { runWithAuditContext, type AuditActor } from '../lib/audit-context';
import {
  paginationInput, paginationSkipTake, genderEnum, relationshipEnum, housingTypeEnum,
  economicLevelEnum, maritalStatusEnum, needLevelEnum, fileStatusEnum, filsAmount,
} from '../lib/validation';

export const createFamilyInput = z.object({
  familyCode: z.string().trim().min(1).max(50),
  headOfFamilyName: z.string().trim().min(2).max(150),
  wifeName: z.string().trim().max(150).optional(),
  headNationalId: z.string().trim().max(50).optional(),
  familyBookMembersCount: z.number().int().min(0).max(100).optional(),
  address: z.string().trim().max(300).optional(),
  city: z.string().trim().max(100).optional(),
  regionId: z.string().min(1).optional(),
  neighborhood: z.string().trim().max(150).optional(),
  phone: z.string().trim().max(30).optional(),
  altPhone: z.string().trim().max(30).optional(),
  maritalStatus: maritalStatusEnum.optional(),
  housingType: housingTypeEnum.optional(),
  incomeSource: z.string().trim().max(200).optional(),
  monthlyIncomeFils: filsAmount.default(0),
  monthlyExpensesFils: filsAmount.default(0),
  healthStatus: z.string().trim().max(500).optional(),
  needLevel: needLevelEnum.optional(),
  economicLevel: economicLevelEnum.optional(),
  fileStatus: fileStatusEnum.default('نشط'),
  responsibleUserId: z.string().min(1).optional(),
  notes: z.string().trim().max(2000).optional(),
});
export const updateFamilyInput = createFamilyInput.partial().extend({ id: z.string().min(1) });

export const listFamiliesInput = paginationInput.extend({
  economicLevel: economicLevelEnum.optional(),
  needLevel: needLevelEnum.optional(),
  fileStatus: fileStatusEnum.optional(),
  regionId: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
  /** "بيانات ناقصة" — families still missing a national ID or member count. */
  incompleteOnly: z.boolean().optional(),
});

export async function listFamilies(input: z.infer<typeof listFamiliesInput>) {
  const parsed = listFamiliesInput.parse(input);
  const prisma = getPrisma();
  const where = {
    ...(parsed.economicLevel ? { economicLevel: parsed.economicLevel } : {}),
    ...(parsed.needLevel ? { needLevel: parsed.needLevel } : {}),
    ...(parsed.fileStatus ? { fileStatus: parsed.fileStatus } : {}),
    ...(parsed.regionId ? { regionId: parsed.regionId } : {}),
    ...(parsed.isActive !== undefined ? { isActive: parsed.isActive } : {}),
    ...(parsed.incompleteOnly
      ? {
          OR: [
            { headNationalId: null },
            { headNationalId: '' },
            { familyBookMembersCount: null },
          ],
        }
      : {}),
    ...(parsed.search
      ? {
          AND: [
            {
              OR: [
                { headOfFamilyName: { contains: parsed.search } },
                { wifeName: { contains: parsed.search } },
                { familyCode: { contains: parsed.search } },
                { headNationalId: { contains: parsed.search } },
                { phone: { contains: parsed.search } },
              ],
            },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.family.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      ...paginationSkipTake(parsed),
      include: {
        region: { select: { id: true, name: true } },
        _count: { select: { members: true, beneficiaries: true } },
      },
    }),
    prisma.family.count({ where }),
  ]);
  return { rows, total, page: parsed.page, pageSize: parsed.pageSize };
}

export async function getFamily(id: string) {
  const prisma = getPrisma();
  const family = await prisma.family.findUniqueOrThrow({
    where: { id },
    include: { members: true, beneficiaries: true, region: true },
  });
  return family;
}

/**
 * Duplicate detection for families, mirroring the beneficiary check: an exact
 * national-ID match is the strong signal, name/phone matches are soft ones.
 * Returned as warnings for the UI to confirm past — nothing is merged
 * automatically and legitimate repeats are never blocked outright.
 */
export async function checkDuplicateFamilies(input: {
  headOfFamilyName: string;
  headNationalId?: string;
  phone?: string;
  excludeId?: string;
}) {
  const prisma = getPrisma();
  const orConditions: Record<string, unknown>[] = [{ headOfFamilyName: input.headOfFamilyName }];
  if (input.headNationalId) orConditions.push({ headNationalId: input.headNationalId });
  if (input.phone) orConditions.push({ phone: input.phone });

  const matches = await prisma.family.findMany({
    where: {
      OR: orConditions,
      ...(input.excludeId ? { id: { not: input.excludeId } } : {}),
    },
    select: {
      id: true, familyCode: true, headOfFamilyName: true, wifeName: true,
      headNationalId: true, phone: true, city: true,
    },
    take: 10,
  });

  return matches.map((m) => ({
    ...m,
    // A national ID collision is the one match strong enough to warrant
    // blocking-style wording in the UI; the rest are advisory.
    strong: Boolean(input.headNationalId && m.headNationalId === input.headNationalId),
  }));
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
  maritalStatus: maritalStatusEnum.optional(),
  educationLevel: z.string().trim().max(150).optional(),
  isDisabled: z.boolean().default(false),
  disabilityType: z.string().trim().max(150).optional(),
  isOrphan: z.boolean().default(false),
  isStudent: z.boolean().default(false),
  healthStatus: z.string().trim().max(300).optional(),
  occupation: z.string().trim().max(150).optional(),
  monthlyIncomeFils: filsAmount.default(0),
  notes: z.string().trim().max(1000).optional(),
});
export const updateFamilyMemberInput = createFamilyMemberInput.partial().extend({ id: z.string().min(1) });

/** Whole years elapsed, or null when no birth date was recorded. */
function ageInYears(birthDate: Date | null): number | null {
  if (!birthDate) return null;
  const now = new Date();
  let age = now.getFullYear() - birthDate.getFullYear();
  const monthDelta = now.getMonth() - birthDate.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < birthDate.getDate())) age -= 1;
  return age >= 0 ? age : null;
}

export async function listFamilyMembers(familyId: string) {
  const prisma = getPrisma();
  const members = await prisma.familyMember.findMany({
    where: { familyId },
    orderBy: { createdAt: 'asc' },
  });
  // "العمر المحسوب" is derived, never stored — a stored age silently rots.
  return members.map((m) => ({ ...m, age: ageInYears(m.birthDate) }));
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

// ---- Regions ("المنطقة") ----

export const createRegionInput = z.object({
  name: z.string().trim().min(2).max(120),
  notes: z.string().trim().max(500).optional(),
});
export const updateRegionInput = createRegionInput.partial().extend({
  id: z.string().min(1),
  isActive: z.boolean().optional(),
});

export async function listRegions() {
  const prisma = getPrisma();
  return prisma.region.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { families: true } } },
  });
}

export async function createRegion(actor: AuditActor, input: z.infer<typeof createRegionInput>) {
  const parsed = createRegionInput.parse(input);
  return runWithAuditContext(actor, (tx) => tx.region.create({ data: parsed }));
}

export async function updateRegion(actor: AuditActor, input: z.infer<typeof updateRegionInput>) {
  const parsed = updateRegionInput.parse(input);
  const { id, ...data } = parsed;
  return runWithAuditContext(actor, (tx) => tx.region.update({ where: { id }, data }));
}
