import { z } from 'zod';
import { handlePermitted } from './handler';
import * as svc from '../../src/services/donations';

export function registerDonationHandlers(): void {
  handlePermitted<z.infer<typeof svc.listDonorsInput>>('donors:list', 'donors', 'view', async ({ payload }) => svc.listDonors(payload));
  handlePermitted<{ id: string }>('donors:get', 'donors', 'view', async ({ payload }) => svc.getDonor(payload.id));
  handlePermitted<z.infer<typeof svc.donorInput>>('donors:create', 'donors', 'create', async ({ user, payload }) =>
    svc.createDonor({ userId: user.id, username: user.username }, payload),
  );
  handlePermitted<z.infer<typeof svc.updateDonorInput>>('donors:update', 'donors', 'update', async ({ user, payload }) =>
    svc.updateDonor({ userId: user.id, username: user.username }, payload),
  );
  handlePermitted<{ id: string }>('donors:delete', 'donors', 'delete', async ({ user, payload }) =>
    svc.deactivateDonor({ userId: user.id, username: user.username }, payload.id),
  );

  handlePermitted<z.infer<typeof svc.listDonationsInput>>('donations:list', 'donations', 'view', async ({ payload }) =>
    svc.listDonations(payload),
  );
  handlePermitted<{ id: string }>('donations:get', 'donations', 'view', async ({ payload }) => svc.getDonation(payload.id));
  handlePermitted<z.infer<typeof svc.createDonationInput>>('donations:create', 'donations', 'create', async ({ user, payload }) =>
    svc.createDonation({ userId: user.id, username: user.username }, payload),
  );
  handlePermitted<z.infer<typeof svc.updateDonationInput>>('donations:update', 'donations', 'update', async ({ user, payload }) =>
    svc.updateDonation({ userId: user.id, username: user.username }, payload),
  );
  handlePermitted<{ id: string }>('donations:delete', 'donations', 'delete', async ({ user, payload }) =>
    svc.deleteDonation({ userId: user.id, username: user.username }, payload.id),
  );

  handlePermitted<{ donationId?: string }>('receipts:list', 'donations', 'view', async ({ payload }) =>
    svc.listReceipts(payload?.donationId),
  );
  handlePermitted<{ id: string }>('receipts:get', 'donations', 'view', async ({ payload }) => svc.getReceipt(payload.id));
}
