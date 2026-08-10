/** SERVER-ONLY. Social assessments + field visits. */
import { z } from 'zod';
import { getPrisma } from '../lib/db';
import { runWithAuditContext, type AuditActor } from '../lib/audit-context';
import {
  paginationInput, paginationSkipTake, fieldVisitStatusEnum, housingTypeEnum,
  needLevelEnum, filsAmount,
} from '../lib/validation';

/** Small non-negative headcount, e.g. children/orphans/students in a household. */
const householdCount = z.number().int().min(0).max(100);

export const createAssessmentInput = z.object({
  familyId: z.string().min(1),
  beneficiaryId: z.string().optional(),
  researcherId: z.string().optional(),
  assessmentDate: z.coerce.date().default(() => new Date()),
  monthlyIncomeFils: filsAmount.default(0),
  monthlyExpensesFils: filsAmount.default(0),
  economicLevel: z.string().max(50).optional(),
  housingCondition: z.string().max(300).optional(),
  housingOwnership: housingTypeEnum.optional(),
  roomsCount: z.number().int().min(0).max(50).optional(),
  healthCondition: z.string().max(300).optional(),
  chronicDiseases: z.string().max(1000).optional(),
  disabilities: z.string().max(1000).optional(),
  childrenCount: householdCount.optional(),
  orphansCount: householdCount.optional(),
  studentsCount: householdCount.optional(),
  unemployedCount: householdCount.optional(),
  financialObligations: z.string().max(2000).optional(),
  basicNeeds: z.string().max(2000).optional(),
  needLevel: needLevelEnum.optional(),
  educationLevel: z.string().max(300).optional(),
  recommendation: z.string().max(2000).optional(),
  score: z.number().int().min(0).max(100).optional(),
  notes: z.string().max(2000).optional(),
});
export const updateAssessmentInput = createAssessmentInput.partial().extend({ id: z.string().min(1) });
export const listAssessmentsInput = paginationInput.extend({ familyId: z.string().optional() });

export async function listAssessments(input: z.infer<typeof listAssessmentsInput>) {
  const parsed = listAssessmentsInput.parse(input);
  const prisma = getPrisma();
  const where = { ...(parsed.familyId ? { familyId: parsed.familyId } : {}) };
  const [rows, total] = await Promise.all([
    prisma.socialAssessment.findMany({
      where, orderBy: { assessmentDate: 'desc' }, ...paginationSkipTake(parsed),
      include: { family: { select: { familyCode: true, headOfFamilyName: true } } },
    }),
    prisma.socialAssessment.count({ where }),
  ]);
  return { rows, total, page: parsed.page, pageSize: parsed.pageSize };
}

export async function getAssessment(id: string) {
  const prisma = getPrisma();
  return prisma.socialAssessment.findUniqueOrThrow({ where: { id }, include: { family: true, beneficiary: true } });
}

export async function createAssessment(actor: AuditActor, input: z.infer<typeof createAssessmentInput>) {
  const parsed = createAssessmentInput.parse(input);
  return runWithAuditContext(actor, (tx) => tx.socialAssessment.create({ data: parsed }));
}

export async function updateAssessment(actor: AuditActor, input: z.infer<typeof updateAssessmentInput>) {
  const parsed = updateAssessmentInput.parse(input);
  const { id, ...data } = parsed;
  return runWithAuditContext(actor, (tx) => tx.socialAssessment.update({ where: { id }, data }));
}

export async function deleteAssessment(actor: AuditActor, id: string) {
  return runWithAuditContext(actor, (tx) => tx.socialAssessment.delete({ where: { id } }));
}

// ---- Field visits ----

export const createFieldVisitInput = z.object({
  familyId: z.string().min(1),
  beneficiaryId: z.string().optional(),
  userId: z.string().optional(),
  visitDate: z.coerce.date().default(() => new Date()),
  purpose: z.string().max(300).optional(),
  findings: z.string().max(2000).optional(),
  recommendation: z.string().max(2000).optional(),
  notes: z.string().max(2000).optional(),
  status: fieldVisitStatusEnum.default('مكتملة'),
  nextVisitAt: z.coerce.date().optional(),
});
export const updateFieldVisitInput = createFieldVisitInput.partial().extend({ id: z.string().min(1) });
export const listFieldVisitsInput = paginationInput.extend({ familyId: z.string().optional() });

export async function listFieldVisits(input: z.infer<typeof listFieldVisitsInput>) {
  const parsed = listFieldVisitsInput.parse(input);
  const prisma = getPrisma();
  const where = { ...(parsed.familyId ? { familyId: parsed.familyId } : {}) };
  const [rows, total] = await Promise.all([
    prisma.fieldVisit.findMany({
      where, orderBy: { visitDate: 'desc' }, ...paginationSkipTake(parsed),
      include: {
        family: { select: { familyCode: true, headOfFamilyName: true } },
        beneficiary: { select: { fullName: true } },
        user: { select: { fullName: true } },
      },
    }),
    prisma.fieldVisit.count({ where }),
  ]);
  return { rows, total, page: parsed.page, pageSize: parsed.pageSize };
}

export async function getFieldVisit(id: string) {
  const prisma = getPrisma();
  return prisma.fieldVisit.findUniqueOrThrow({
    where: { id },
    include: { family: true, beneficiary: true, user: true },
  });
}

export async function createFieldVisit(actor: AuditActor, input: z.infer<typeof createFieldVisitInput>) {
  const parsed = createFieldVisitInput.parse(input);
  return runWithAuditContext(actor, (tx) => tx.fieldVisit.create({ data: parsed }));
}

export async function updateFieldVisit(actor: AuditActor, input: z.infer<typeof updateFieldVisitInput>) {
  const parsed = updateFieldVisitInput.parse(input);
  const { id, ...data } = parsed;
  return runWithAuditContext(actor, (tx) => tx.fieldVisit.update({ where: { id }, data }));
}

export async function deleteFieldVisit(actor: AuditActor, id: string) {
  return runWithAuditContext(actor, (tx) => tx.fieldVisit.delete({ where: { id } }));
}
