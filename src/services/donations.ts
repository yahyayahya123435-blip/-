/** SERVER-ONLY. Donors, donations, receipts. */
import { z } from 'zod';
import { getPrisma } from '../lib/db';
import { runWithAuditContext, type AuditActor } from '../lib/audit-context';
import { paginationInput, paginationSkipTake, donorTypeEnum, donationMethodEnum, filsAmount } from '../lib/validation';
import { AppError } from '../lib/app-error';

// ---- Donors ----

export const donorInput = z.object({
  name: z.string().trim().min(2).max(150),
  phone: z.string().max(30).optional(),
  email: z.string().email().max(150).optional().or(z.literal('')),
  address: z.string().max(300).optional(),
  donorType: donorTypeEnum.default('فرد'),
  notes: z.string().max(2000).optional(),
});
export const updateDonorInput = donorInput.partial().extend({ id: z.string().min(1) });
export const listDonorsInput = paginationInput;

export async function listDonors(input: z.infer<typeof listDonorsInput>) {
  const parsed = listDonorsInput.parse(input);
  const prisma = getPrisma();
  const where = parsed.search
    ? { OR: [{ name: { contains: parsed.search } }, { phone: { contains: parsed.search } }] }
    : {};
  const [rows, total] = await Promise.all([
    prisma.donor.findMany({ where, orderBy: { createdAt: 'desc' }, ...paginationSkipTake(parsed) }),
    prisma.donor.count({ where }),
  ]);
  return { rows, total, page: parsed.page, pageSize: parsed.pageSize };
}

export async function getDonor(id: string) {
  return getPrisma().donor.findUniqueOrThrow({ where: { id }, include: { donations: true } });
}

export async function createDonor(actor: AuditActor, input: z.infer<typeof donorInput>) {
  const parsed = donorInput.parse(input);
  return runWithAuditContext(actor, (tx) => tx.donor.create({ data: parsed }));
}
export async function updateDonor(actor: AuditActor, input: z.infer<typeof updateDonorInput>) {
  const parsed = updateDonorInput.parse(input);
  const { id, ...data } = parsed;
  return runWithAuditContext(actor, (tx) => tx.donor.update({ where: { id }, data }));
}
export async function deactivateDonor(actor: AuditActor, id: string) {
  return runWithAuditContext(actor, (tx) => tx.donor.update({ where: { id }, data: { isActive: false } }));
}

// ---- Donations (+ auto receipt + linked income transaction) ----

export const createDonationInput = z.object({
  donorId: z.string().min(1),
  amountFils: filsAmount,
  donationType: assistanceCategoryLike(),
  method: donationMethodEnum.optional(),
  donatedAt: z.coerce.date().default(() => new Date()),
  notes: z.string().max(2000).optional(),
});
function assistanceCategoryLike() {
  return z.enum(['نقدي', 'عيني']).default('نقدي');
}
export const updateDonationInput = createDonationInput.partial().extend({ id: z.string().min(1) });
export const listDonationsInput = paginationInput.extend({ donorId: z.string().optional() });

export async function listDonations(input: z.infer<typeof listDonationsInput>) {
  const parsed = listDonationsInput.parse(input);
  const prisma = getPrisma();
  const where = { ...(parsed.donorId ? { donorId: parsed.donorId } : {}) };
  const [rows, total] = await Promise.all([
    prisma.donation.findMany({
      where, orderBy: { donatedAt: 'desc' }, ...paginationSkipTake(parsed),
      include: { donor: { select: { name: true } }, receipts: true },
    }),
    prisma.donation.count({ where }),
  ]);
  return { rows, total, page: parsed.page, pageSize: parsed.pageSize };
}

export async function getDonation(id: string) {
  return getPrisma().donation.findUniqueOrThrow({ where: { id }, include: { donor: true, receipts: true } });
}

async function nextReceiptNo(tx: any): Promise<string> {
  const count = await tx.receipt.count();
  const year = new Date().getFullYear();
  return `RCPT-${year}-${String(count + 1).padStart(5, '0')}`;
}

export async function createDonation(actor: AuditActor, input: z.infer<typeof createDonationInput>) {
  const parsed = createDonationInput.parse(input);
  return runWithAuditContext(actor, async (tx) => {
    const donation = await tx.donation.create({ data: parsed });
    const receiptNo = await nextReceiptNo(tx);
    await tx.receipt.create({
      data: { donationId: donation.id, receiptNo, amountFils: parsed.amountFils, issuedAt: parsed.donatedAt },
    });
    await tx.transaction.create({
      data: {
        type: 'دخل',
        amountFils: parsed.amountFils,
        description: `تبرع - إيصال ${receiptNo}`,
        referenceType: 'donation',
        referenceId: donation.id,
        transactionAt: parsed.donatedAt,
      },
    });
    return donation;
  });
}

export async function updateDonation(actor: AuditActor, input: z.infer<typeof updateDonationInput>) {
  const parsed = updateDonationInput.parse(input);
  const { id, ...data } = parsed;
  return runWithAuditContext(actor, (tx) => tx.donation.update({ where: { id }, data }));
}

export async function deleteDonation(_actor: AuditActor, _id: string): Promise<never> {
  // Financial records are never hard-deleted; a correcting entry is the
  // expected workflow. Kept as an explicit "not supported" to avoid orphaning
  // receipts/transactions silently.
  throw new AppError('DONATIONS_NOT_HARD_DELETABLE', 'لا يمكن حذف التبرعات نهائياً، يمكن تعديل بياناتها فقط');
}

export async function listReceipts(donationId?: string) {
  const prisma = getPrisma();
  return prisma.receipt.findMany({
    where: donationId ? { donationId } : undefined,
    orderBy: { issuedAt: 'desc' },
    include: { donation: { include: { donor: true } } },
  });
}

export async function getReceipt(id: string) {
  return getPrisma().receipt.findUniqueOrThrow({ where: { id }, include: { donation: { include: { donor: true } } } });
}
