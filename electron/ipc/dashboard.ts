import { z } from 'zod';
import { handlePermitted } from './handler';
import { dashboardSummary, globalSearch, globalSearchInput } from '../../src/services/dashboard';

export function registerDashboardHandlers(): void {
  handlePermitted('dashboard:summary', 'reports', 'view', async () => dashboardSummary());
  handlePermitted<z.infer<typeof globalSearchInput>>('search:global', 'reports', 'view', async ({ payload }) =>
    globalSearch(payload),
  );
}
