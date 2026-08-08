import { z } from 'zod';
import { handlePermitted } from './handler';
import * as svc from '../../src/services/assistances';

export function registerAssistanceHandlers(): void {
  handlePermitted('assistanceTypes:list', 'assistances', 'view', async () => svc.listAssistanceTypes());
  handlePermitted<z.infer<typeof svc.assistanceTypeInput>>('assistanceTypes:create', 'assistances', 'create', async ({ user, payload }) =>
    svc.createAssistanceType({ userId: user.id, username: user.username }, payload),
  );
  handlePermitted<{ id: string } & Partial<z.infer<typeof svc.assistanceTypeInput>>>(
    'assistanceTypes:update', 'assistances', 'update', async ({ user, payload }) => {
      const { id, ...rest } = payload;
      return svc.updateAssistanceType({ userId: user.id, username: user.username }, id, rest);
    },
  );

  handlePermitted<z.infer<typeof svc.listAssistancesInput>>('assistances:list', 'assistances', 'view', async ({ payload }) =>
    svc.listAssistances(payload),
  );
  handlePermitted<{ id: string }>('assistances:get', 'assistances', 'view', async ({ payload }) => svc.getAssistance(payload.id));
  handlePermitted<z.infer<typeof svc.createAssistanceInput>>('assistances:create', 'assistances', 'create', async ({ user, payload }) =>
    svc.createAssistance({ userId: user.id, username: user.username }, payload),
  );
  handlePermitted<z.infer<typeof svc.updateAssistanceInput>>('assistances:update', 'assistances', 'update', async ({ user, payload }) =>
    svc.updateAssistance({ userId: user.id, username: user.username }, payload),
  );
  handlePermitted<{ id: string }>('assistances:delete', 'assistances', 'delete', async ({ user, payload }) =>
    svc.deleteAssistance({ userId: user.id, username: user.username }, payload.id),
  );

  handlePermitted<z.infer<typeof svc.listCampaignsInput>>('campaigns:list', 'campaigns', 'view', async ({ payload }) =>
    svc.listCampaigns(payload),
  );
  handlePermitted<{ id: string }>('campaigns:get', 'campaigns', 'view', async ({ payload }) => svc.getCampaign(payload.id));
  handlePermitted<z.infer<typeof svc.createCampaignInput>>('campaigns:create', 'campaigns', 'create', async ({ user, payload }) =>
    svc.createCampaign({ userId: user.id, username: user.username }, payload),
  );
  handlePermitted<z.infer<typeof svc.updateCampaignInput>>('campaigns:update', 'campaigns', 'update', async ({ user, payload }) =>
    svc.updateCampaign({ userId: user.id, username: user.username }, payload),
  );
  handlePermitted<{ id: string }>('campaigns:delete', 'campaigns', 'delete', async ({ user, payload }) =>
    svc.deleteCampaign({ userId: user.id, username: user.username }, payload.id),
  );

  handlePermitted<{ campaignId: string }>('campaignItems:list', 'campaigns', 'view', async ({ payload }) =>
    svc.listCampaignItems(payload.campaignId),
  );
  handlePermitted<z.infer<typeof svc.createCampaignItemInput>>('campaignItems:create', 'campaigns', 'create', async ({ user, payload }) =>
    svc.createCampaignItem({ userId: user.id, username: user.username }, payload),
  );
  handlePermitted<z.infer<typeof svc.updateCampaignItemInput>>('campaignItems:update', 'campaigns', 'update', async ({ user, payload }) =>
    svc.updateCampaignItem({ userId: user.id, username: user.username }, payload),
  );
  handlePermitted<{ id: string }>('campaignItems:delete', 'campaigns', 'delete', async ({ user, payload }) =>
    svc.deleteCampaignItem({ userId: user.id, username: user.username }, payload.id),
  );
}
