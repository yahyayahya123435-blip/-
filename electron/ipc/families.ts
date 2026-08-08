import { z } from 'zod';
import { handlePermitted } from './handler';
import {
  listFamilies, getFamily, createFamily, updateFamily, deleteFamily,
  listFamiliesInput, createFamilyInput, updateFamilyInput,
  listFamilyMembers, createFamilyMember, updateFamilyMember, deleteFamilyMember,
  createFamilyMemberInput, updateFamilyMemberInput,
} from '../../src/services/families';

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
