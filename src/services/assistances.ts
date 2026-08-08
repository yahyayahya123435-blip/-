/** SERVER-ONLY. Assistance types, assistances, campaigns, campaign items. */
import { z } from 'zod';
import { getPrisma } from '../lib/db';
import { runWithAuditContext, type AuditActor } from '../lib/audit-context';
import { paginationInput, paginationSkipTake, assistanceCategoryEnum, assistanceStatusEnum, campaignStatusEnum, filsAmount } from '../lib/validation';
import { AppError } from '../lib/app-error';

// ---- Assistance types ----

export const assistanceTypeInput = z.object({
  name: z.string().trim().min(2).max(150),
  category: assistanceCategoryEnum,
  isActive: z.boolean().default(true),
});

export async function listAssistanceTypes() {
  const prisma = getPrisma();
  return prisma.assistanceType.findMany({ orderBy: { name: 'asc' } });
}

export async function createAssistanceType(actor: AuditActor, input: z.infer<typeof assistanceTypeInput>) {
  const parsed = assistanceTypeInput.parse(input);
  return runWithAuditContext(actor, (tx) => tx.assistanceType.create({ data: parsed }));
}

export async function updateAssistanceType(actor: AuditActor, id: string, input: Partial<z.infer<typeof assistanceTypeInput>>) {
  return runWithAuditContext(actor, (tx) => tx.assistanceType.update({ where: { id }, data: input }));
}

// ---- Assistances ----

export const createAssistanceInput = z.object({
  beneficiaryId: z.string().min(1),
  familyId: z.string().min(1),
  assistanceTypeId: z.string().min(1),
  campaignId: z.string().optional(),
  amountFils: filsAmount.default(0),
  inventoryItemId: z.string().optional(),
  quantity: z.number().int().positive().optional(),
  status: assistanceStatusEnum.default('مصروفة'),
  approvedById: z.string().optional(),
  disbursedAt: z.coerce.date().default(() => new Date()),
  notes: z.string().max(2000).optional(),
});
export const updateAssistanceInput = createAssistanceInput.partial().extend({ id: z.string().min(1) });
export const listAssistancesInput = paginationInput.extend({
  familyId: z.string().optional(),
  beneficiaryId: z.string().optional(),
  status: assistanceStatusEnum.optional(),
  campaignId: z.string().optional(),
});

export async function listAssistances(input: z.infer<typeof listAssistancesInput>) {
  const parsed = listAssistancesInput.parse(input);
  const prisma = getPrisma();
  const where = {
    ...(parsed.familyId ? { familyId: parsed.familyId } : {}),
    ...(parsed.beneficiaryId ? { beneficiaryId: parsed.beneficiaryId } : {}),
    ...(parsed.status ? { status: parsed.status } : {}),
    ...(parsed.campaignId ? { campaignId: parsed.campaignId } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.assistance.findMany({
      where, orderBy: { disbursedAt: 'desc' }, ...paginationSkipTake(parsed),
      include: {
        beneficiary: { select: { fullName: true } },
        family: { select: { familyCode: true, headOfFamilyName: true } },
        assistanceType: { select: { name: true, category: true } },
      },
    }),
    prisma.assistance.count({ where }),
  ]);
  return { rows, total, page: parsed.page, pageSize: parsed.pageSize };
}

export async function getAssistance(id: string) {
  const prisma = getPrisma();
  return prisma.assistance.findUniqueOrThrow({
    where: { id },
    include: { beneficiary: true, family: true, assistanceType: true, campaign: true, inventoryItem: true },
  });
}

/**
 * In-kind assistances (inventoryItemId + quantity set) decrement stock via a
 * stock_out row in the SAME transaction as the assistance insert. The
 * negative-stock trigger (trg_stock_out_not_exceeding_available) is the
 * final guard, but we check first here too for a friendlier error path.
 */
export async function createAssistance(actor: AuditActor, input: z.infer<typeof createAssistanceInput>) {
  const parsed = createAssistanceInput.parse(input);
  return runWithAuditContext(actor, async (tx) => {
    const beneficiary = await tx.beneficiary.findUniqueOrThrow({ where: { id: parsed.beneficiaryId } });
    if (beneficiary.familyId !== parsed.familyId) {
      throw new AppError('FAMILY_MISMATCH', 'بيانات الأسرة والمستفيد غير متطابقة');
    }

    if (parsed.inventoryItemId && parsed.quantity) {
      const item = await tx.inventoryItem.findUniqueOrThrow({ where: { id: parsed.inventoryItemId } });
      if (item.quantity < parsed.quantity) {
        throw new AppError('NEGATIVE_STOCK', 'الكمية المطلوبة تتجاوز الرصيد المتاح في المخزون');
      }
      await tx.stockOut.create({
        data: { inventoryItemId: parsed.inventoryItemId, quantity: parsed.quantity, reason: 'مساعدة' },
      });
      await tx.inventoryItem.update({
        where: { id: parsed.inventoryItemId },
        data: { quantity: { decrement: parsed.quantity } },
      });
    }

    return tx.assistance.create({ data: parsed });
  });
}

export async function updateAssistance(actor: AuditActor, input: z.infer<typeof updateAssistanceInput>) {
  const parsed = updateAssistanceInput.parse(input);
  const { id, ...data } = parsed;
  // Inventory-affecting fields are immutable after creation to keep stock
  // movements auditable and simple; status/notes/approval fields may change.
  const { inventoryItemId: _i, quantity: _q, ...safeData } = data;
  return runWithAuditContext(actor, (tx) => tx.assistance.update({ where: { id }, data: safeData }));
}

export async function deleteAssistance(actor: AuditActor, id: string) {
  return runWithAuditContext(actor, (tx) => tx.assistance.update({ where: { id }, data: { status: 'مرفوضة' } }));
}

// ---- Campaigns ----

export const createCampaignInput = z.object({
  name: z.string().trim().min(2).max(200),
  description: z.string().max(2000).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  targetAmountFils: filsAmount.default(0),
  status: campaignStatusEnum.default('مفتوحة'),
});
export const updateCampaignInput = createCampaignInput.partial().extend({ id: z.string().min(1) });
export const listCampaignsInput = paginationInput.extend({ status: campaignStatusEnum.optional() });

export async function listCampaigns(input: z.infer<typeof listCampaignsInput>) {
  const parsed = listCampaignsInput.parse(input);
  const prisma = getPrisma();
  const where = {
    ...(parsed.status ? { status: parsed.status } : {}),
    ...(parsed.search ? { name: { contains: parsed.search } } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.campaign.findMany({
      where, orderBy: { createdAt: 'desc' }, ...paginationSkipTake(parsed),
      include: { _count: { select: { items: true, assistances: true } } },
    }),
    prisma.campaign.count({ where }),
  ]);
  return { rows, total, page: parsed.page, pageSize: parsed.pageSize };
}

export async function getCampaign(id: string) {
  const prisma = getPrisma();
  return prisma.campaign.findUniqueOrThrow({ where: { id }, include: { items: { include: { beneficiary: true } }, assistances: true } });
}

export async function createCampaign(actor: AuditActor, input: z.infer<typeof createCampaignInput>) {
  const parsed = createCampaignInput.parse(input);
  return runWithAuditContext(actor, (tx) => tx.campaign.create({ data: parsed }));
}

export async function updateCampaign(actor: AuditActor, input: z.infer<typeof updateCampaignInput>) {
  const parsed = updateCampaignInput.parse(input);
  const { id, ...data } = parsed;
  return runWithAuditContext(actor, (tx) => tx.campaign.update({ where: { id }, data }));
}

export async function deleteCampaign(actor: AuditActor, id: string) {
  return runWithAuditContext(actor, (tx) => tx.campaign.update({ where: { id }, data: { status: 'مغلقة' } }));
}

// ---- Campaign items ----

export const createCampaignItemInput = z.object({
  campaignId: z.string().min(1),
  beneficiaryId: z.string().min(1),
  plannedAmountFils: filsAmount.default(0),
  status: z.enum(['مخطط', 'تم الصرف']).default('مخطط'),
});
export const updateCampaignItemInput = createCampaignItemInput.partial().extend({ id: z.string().min(1) });

export async function listCampaignItems(campaignId: string) {
  const prisma = getPrisma();
  return prisma.campaignItem.findMany({ where: { campaignId }, include: { beneficiary: true } });
}

export async function createCampaignItem(actor: AuditActor, input: z.infer<typeof createCampaignItemInput>) {
  const parsed = createCampaignItemInput.parse(input);
  return runWithAuditContext(actor, (tx) => tx.campaignItem.create({ data: parsed }));
}

export async function updateCampaignItem(actor: AuditActor, input: z.infer<typeof updateCampaignItemInput>) {
  const parsed = updateCampaignItemInput.parse(input);
  const { id, ...data } = parsed;
  return runWithAuditContext(actor, (tx) => tx.campaignItem.update({ where: { id }, data }));
}

export async function deleteCampaignItem(actor: AuditActor, id: string) {
  return runWithAuditContext(actor, (tx) => tx.campaignItem.delete({ where: { id } }));
}
