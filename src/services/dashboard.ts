/** SERVER-ONLY. Dashboard aggregates (real SQLite data only, no placeholder numbers) + global search. */
import { z } from 'zod';
import { getPrisma } from '../lib/db';

export async function dashboardSummary() {
  const prisma = getPrisma();
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [
    familiesCount,
    beneficiariesCount,
    activeCampaignsCount,
    lowStockItems,
    monthlyDonationsAgg,
    monthlyAssistancesAgg,
    pendingApprovalsCount,
    recentAssistances,
  ] = await Promise.all([
    prisma.family.count({ where: { isActive: true } }),
    prisma.beneficiary.count({ where: { isActive: true } }),
    prisma.campaign.count({ where: { status: 'مفتوحة' } }),
    prisma.$queryRawUnsafe<{ count: number }[]>(
      `SELECT COUNT(*) as count FROM inventory_items WHERE quantity <= minQuantity`,
    ),
    prisma.donation.aggregate({ where: { donatedAt: { gte: startOfMonth } }, _sum: { amountFils: true } }),
    prisma.assistance.aggregate({ where: { disbursedAt: { gte: startOfMonth } }, _sum: { amountFils: true } }),
    prisma.approval.count({ where: { status: 'قيد الانتظار' } }),
    prisma.assistance.findMany({
      orderBy: { disbursedAt: 'desc' },
      take: 5,
      include: { beneficiary: { select: { fullName: true } }, assistanceType: { select: { name: true } } },
    }),
  ]);

  return {
    familiesCount,
    beneficiariesCount,
    activeCampaignsCount,
    lowStockItemsCount: Number(lowStockItems[0]?.count ?? 0),
    monthlyDonationsFils: monthlyDonationsAgg._sum.amountFils ?? 0,
    monthlyAssistancesFils: monthlyAssistancesAgg._sum.amountFils ?? 0,
    pendingApprovalsCount,
    recentAssistances,
  };
}

export const globalSearchInput = z.object({ query: z.string().trim().min(1).max(200) });

export async function globalSearch(input: z.infer<typeof globalSearchInput>) {
  const { query } = globalSearchInput.parse(input);
  const prisma = getPrisma();
  const [families, beneficiaries, donors] = await Promise.all([
    prisma.family.findMany({
      where: { OR: [{ headOfFamilyName: { contains: query } }, { familyCode: { contains: query } }, { phone: { contains: query } }] },
      take: 10,
    }),
    prisma.beneficiary.findMany({
      where: { OR: [{ fullName: { contains: query } }, { nationalId: { contains: query } }, { phone: { contains: query } }] },
      take: 10,
      include: { family: { select: { familyCode: true } } },
    }),
    prisma.donor.findMany({
      where: { OR: [{ name: { contains: query } }, { phone: { contains: query } }] },
      take: 10,
    }),
  ]);
  return { families, beneficiaries, donors };
}
