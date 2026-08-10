/**
 * IPC for the initial 330-family register import and for filling in the two
 * fields that register deliberately leaves blank.
 *
 * Preview is a read-only permission; committing the import requires
 * families.create, so a Viewer can inspect what would happen but cannot
 * write. Nothing here mutates the database before `import:runLegacy`.
 */
import { z } from 'zod';
import { handlePermitted } from './handler';
import { getResourceRoot } from '../db-version';
import {
  previewLegacyImport, runLegacyImport, listIncompleteFamilies, completeFamilyData,
} from '../../src/services/legacy-import';

const incompleteQueryInput = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(200).optional(),
  missing: z.enum(['all', 'nationalId', 'bookCount']).default('all'),
});

const completeInput = z.object({
  patches: z
    .array(
      z.object({
        id: z.string().min(1),
        headNationalId: z.string().trim().max(50).nullable().optional(),
        familyBookMembersCount: z.number().int().min(0).max(100).nullable().optional(),
      }),
    )
    .min(1)
    .max(200),
});

export function registerImportHandlers(): void {
  handlePermitted('import:previewLegacy', 'families', 'view', async () =>
    previewLegacyImport(getResourceRoot()),
  );

  handlePermitted('import:runLegacy', 'families', 'create', async ({ user }) =>
    runLegacyImport({ userId: user.id, username: user.username }, getResourceRoot()),
  );

  handlePermitted<z.infer<typeof incompleteQueryInput>>(
    'families:listIncomplete', 'families', 'view', async ({ payload }) =>
      listIncompleteFamilies(incompleteQueryInput.parse(payload)),
  );

  handlePermitted<z.infer<typeof completeInput>>(
    'families:completeData', 'families', 'update', async ({ user, payload }) =>
      completeFamilyData({ userId: user.id, username: user.username }, completeInput.parse(payload).patches),
  );
}
