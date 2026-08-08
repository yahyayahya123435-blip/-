import { z } from 'zod';
import { handlePermitted } from './handler';
import * as svc from '../../src/services/accounting';

export function registerAccountingHandlers(): void {
  handlePermitted('expenseCategories:list', 'accounting', 'view', async () => svc.listExpenseCategories());
  handlePermitted<z.infer<typeof svc.expenseCategoryInput>>('expenseCategories:create', 'accounting', 'create', async ({ user, payload }) =>
    svc.createExpenseCategory({ userId: user.id, username: user.username }, payload),
  );

  handlePermitted<z.infer<typeof svc.listTransactionsInput>>('transactions:list', 'accounting', 'view', async ({ payload }) =>
    svc.listTransactions(payload),
  );
  handlePermitted<z.infer<typeof svc.createTransactionInput>>('transactions:create', 'accounting', 'create', async ({ user, payload }) =>
    svc.createTransaction({ userId: user.id, username: user.username }, payload),
  );
  handlePermitted<z.infer<typeof svc.updateTransactionInput>>('transactions:update', 'accounting', 'update', async ({ user, payload }) =>
    svc.updateTransaction({ userId: user.id, username: user.username }, payload),
  );
  handlePermitted<{ id: string }>('transactions:delete', 'accounting', 'delete', async ({ user, payload }) =>
    svc.deleteTransaction({ userId: user.id, username: user.username }, payload.id),
  );

  handlePermitted<{ fromDate?: Date; toDate?: Date }>('accounting:summary', 'accounting', 'view', async ({ payload }) =>
    svc.accountingSummary(payload ?? {}),
  );
}
