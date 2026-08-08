import { handlePermitted } from './handler';
import { getSettings, updateSettings, updateSettingsInput } from '../../src/services/settings';
import { z } from 'zod';

export function registerSettingsHandlers(): void {
  handlePermitted('settings:get', 'settings', 'view', async () => getSettings());

  handlePermitted<z.infer<typeof updateSettingsInput>>('settings:update', 'settings', 'update', async ({ user, payload }) =>
    updateSettings({ userId: user.id, username: user.username }, payload),
  );
}
