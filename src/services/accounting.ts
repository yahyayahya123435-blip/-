/** SERVER-ONLY. Expense categories, transactions (income/expense ledger), summary reports. */
import { z } from 'zod';
import { getPrisma } from '../lib/db';
import { runWithAuditContext, type AuditActor } from '../lib/audit-context';
import { paginationInput, paginationSkipTake, transactionTypeEnum, filsAmount } from '../lib/validation';

export const expenseCategoryInput = z.object({ name: z.string().trim().min(2).max(150) });

export async function listExpenseCategories() {
  return getPrisma().expenseCategory.findMany({ orderBy: { name: 'asc' } });
}
export async function createExpenseCategory(actor: AuditActor, input: z.infer<typeof expenseCategoryInput>) {
  const parsed = expenseCategoryInput.parse(input);
  return runWithAuditContext(actor, (tx) => tx.expenseCategory.create({ data: parsed }));
}

export const createTransactionInput = z.object({
  type: transactionTypeEnum,
  amountFils: filsAmount,
  categoryId: z.string().optional(),
  description: z.string().max(500).optional(),
  transactionAt: z.coerce.date().default(() => new Date()),
});
export const updateTransactionInput = createTransactionInput.partial().extend({ id: z.string().min(1) });
export const listTransactionsInput = paginationInput.extend({
  type: transactionTypeEnum.optional(),
  categoryId: z.string().optional(),
  fromDate: z.coerce.date().optional(),
  toDate: z.coerce.date().optional(),
});

export async function listTransactions(input: z.infer<typeof listTransactionsInput>) {
  const parsed = listTransactionsInput.parse(input);
  const prisma = getPrisma();
  const where = {
    ...(parsed.type ? { type: parsed.type } : {}),
    ...(parsed.categoryId ? { categoryId: parsed.categoryId } : {}),
    ...(parsed.fromDate || parsed.toDate
      ? { transactionAt: { ...(parsed.fromDate ? { gte: parsed.fromDate } : {}), ...(parsed.toDate ? { lte: parsed.toDate } : {}) } }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.transaction.findMany({
      where, orderBy: { transactionAt: 'desc' }, ...paginationSkipTake(parsed),
      include: { category: { select: { name: true } } },
    }),
    prisma.transaction.count({ where }),
  ]);
  return { rows, total, page: parsed.page, pageSize: parsed.pageSize };
}

export async function createTransaction(actor: AuditActor, input: z.infer<typeof createTransactionInput>) {
  const parsed = createTransactionInput.parse(input);
  return runWithAuditContext(actor, (tx) => tx.transaction.create({ data: { ...parsed, referenceType: 'manual' } }));
}

export async function updateTransaction(actor: AuditActor, input: z.infer<typeof updateTransactionInput>) {
  const parsed = updateTransactionInput.parse(input);
  const { id, ...data } = parsed;
  return runWithAuditContext(actor, (tx) => tx.transaction.update({ where: { id }, data }));
}

export async function deleteTransaction(actor: AuditActor, id: string) {
  return runWithAuditContext(actor, (tx) => tx.transaction.delete({ where: { id } }));
}

export async function accountingSummary(input: { fromDate?: Date; toDate?: Date }) {
  const prisma = getPrisma();
  const where = {
    ...(input.fromDate || input.toDate
      ? { transactionAt: { ...(input.fromDate ? { gte: input.fromDate } : {}), ...(input.toDate ? { lte: input.toDate } : {}) } }
      : {}),
  };
  const [incomeAgg, expenseAgg] = await Promise.all([
    prisma.transaction.aggregate({ where: { ...where, type: 'دخل' }, _sum: { amountFils: true } }),
    prisma.transaction.aggregate({ where: { ...where, type: 'مصروف' }, _sum: { amountFils: true } }),
  ]);
  const totalIncomeFils = incomeAgg._sum.amountFils ?? 0;
  const totalExpenseFils = expenseAgg._sum.amountFils ?? 0;
  return { totalIncomeFils, totalExpenseFils, netFils: totalIncomeFils - totalExpenseFils };
}
