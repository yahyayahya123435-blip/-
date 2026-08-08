import { z } from 'zod';
import { handlePermitted } from './handler';
import {
  listBeneficiaries, getBeneficiary, createBeneficiary, updateBeneficiary, deleteBeneficiary,
  checkDuplicateBeneficiaries, listBeneficiariesInput, createBeneficiaryInput, updateBeneficiaryInput,
} from '../../src/services/beneficiaries';

const checkDuplicatesInput = z.object({
  fullName: z.string(),
  nationalId: z.string().optional(),
  phone: z.string().optional(),
  birthDate: z.coerce.date().optional(),
  familyId: z.string(),
  excludeId: z.string().optional(),
});

export function registerBeneficiaryHandlers(): void {
  handlePermitted<z.infer<typeof listBeneficiariesInput>>('beneficiaries:list', 'beneficiaries', 'view', async ({ payload }) =>
    listBeneficiaries(payload),
  );
  handlePermitted<{ id: string }>('beneficiaries:get', 'beneficiaries', 'view', async ({ payload }) => getBeneficiary(payload.id));
  handlePermitted<z.infer<typeof createBeneficiaryInput>>('beneficiaries:create', 'beneficiaries', 'create', async ({ user, payload }) =>
    createBeneficiary({ userId: user.id, username: user.username }, payload),
  );
  handlePermitted<z.infer<typeof updateBeneficiaryInput>>('beneficiaries:update', 'beneficiaries', 'update', async ({ user, payload }) =>
    updateBeneficiary({ userId: user.id, username: user.username }, payload),
  );
  handlePermitted<{ id: string }>('beneficiaries:delete', 'beneficiaries', 'delete', async ({ user, payload }) =>
    deleteBeneficiary({ userId: user.id, username: user.username }, payload.id),
  );
  handlePermitted<z.infer<typeof checkDuplicatesInput>>('beneficiaries:checkDuplicates', 'beneficiaries', 'view', async ({ payload }) =>
    checkDuplicateBeneficiaries(checkDuplicatesInput.parse(payload)),
  );
}
