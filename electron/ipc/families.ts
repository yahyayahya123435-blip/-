import { z } from 'zod';
import { handlePermitted } from './handler';
import {
  listFamilies, getFamily, createFamily, updateFamily, deleteFamily, checkDuplicateFamilies,
  listFamiliesInput, createFamilyInput, updateFamilyInput,
  listFamilyMembers, createFamilyMember, updateFamilyMember, deleteFamilyMember,
  createFamilyMemberInput, updateFamilyMemberInput,
  listRegions, createRegion, updateRegion, createRegionInput, updateRegionInput,
} from '../../src/services/families';

const checkDuplicatesInput = z.object({
  headOfFamilyName: z.string().trim().min(1).max(150),
  headNationalId: z.string().trim().max(50).optional(),
  phone: z.string().trim().max(30).optional(),
  excludeId: z.string().min(1).optional(),
});

export function registerFamilyHandlers(): void {
  handlePermitted<z.infer<typeof listFamiliesInput>>('families:list', 'families', 'view', async ({ payload }) =>
    listFamilies(payload),
  );
  handlePermitted<{ id: string }>('families:get', 'families', 'view', async ({ payload }) => getFamily(payload.id));
  handlePermitted<z.infer<typeof createFamilyInput>>('families:create', 'families', 'create', async ({ user, payload }) =>
    createFamily({ userId: user.id, username: user.username }, payload),
  );
  handlePermitted<z.infer<typeof updateFamilyInput>>('families:update', 'families', 'update', async ({ user, payload }) =>
    updateFamily({ userId: user.id, username: user.username }, payload),
  );
  handlePermitted<{ id: string }>('families:delete', 'families', 'delete', async ({ user, payload }) =>
    deleteFamily({ userId: user.id, username: user.username }, payload.id),
  );
  handlePermitted<z.infer<typeof checkDuplicatesInput>>(
    'families:checkDuplicates', 'families', 'view', async ({ payload }) =>
      checkDuplicateFamilies(checkDuplicatesInput.parse(payload)),
  );

  handlePermitted('regions:list', 'families', 'view', async () => listRegions());
  handlePermitted<z.infer<typeof createRegionInput>>('regions:create', 'settings', 'create', async ({ user, payload }) =>
    createRegion({ userId: user.id, username: user.username }, payload),
  );
  handlePermitted<z.infer<typeof updateRegionInput>>('regions:update', 'settings', 'update', async ({ user, payload }) =>
    updateRegion({ userId: user.id, username: user.username }, payload),
  );

  handlePermitted<{ familyId: string }>('familyMembers:list', 'family_members', 'view', async ({ payload }) =>
    listFamilyMembers(payload.familyId),
  );
  handlePermitted<z.infer<typeof createFamilyMemberInput>>(
    'familyMembers:create', 'family_members', 'create', async ({ user, payload }) =>
      createFamilyMember({ userId: user.id, username: user.username }, payload),
  );
  handlePermitted<z.infer<typeof updateFamilyMemberInput>>(
    'familyMembers:update', 'family_members', 'update', async ({ user, payload }) =>
      updateFamilyMember({ userId: user.id, username: user.username }, payload),
  );
  handlePermitted<{ id: string }>('familyMembers:delete', 'family_members', 'delete', async ({ user, payload }) =>
    deleteFamilyMember({ userId: user.id, username: user.username }, payload.id),
  );
}
