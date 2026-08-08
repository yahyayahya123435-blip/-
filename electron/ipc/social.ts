import { z } from 'zod';
import { handlePermitted } from './handler';
import * as svc from '../../src/services/social';

export function registerSocialHandlers(): void {
  handlePermitted<z.infer<typeof svc.listAssessmentsInput>>('socialAssessments:list', 'social_assessments', 'view', async ({ payload }) =>
    svc.listAssessments(payload),
  );
  handlePermitted<{ id: string }>('socialAssessments:get', 'social_assessments', 'view', async ({ payload }) => svc.getAssessment(payload.id));
  handlePermitted<z.infer<typeof svc.createAssessmentInput>>('socialAssessments:create', 'social_assessments', 'create', async ({ user, payload }) =>
    svc.createAssessment({ userId: user.id, username: user.username }, payload),
  );
  handlePermitted<z.infer<typeof svc.updateAssessmentInput>>('socialAssessments:update', 'social_assessments', 'update', async ({ user, payload }) =>
    svc.updateAssessment({ userId: user.id, username: user.username }, payload),
  );
  handlePermitted<{ id: string }>('socialAssessments:delete', 'social_assessments', 'delete', async ({ user, payload }) =>
    svc.deleteAssessment({ userId: user.id, username: user.username }, payload.id),
  );

  handlePermitted<z.infer<typeof svc.listFieldVisitsInput>>('fieldVisits:list', 'field_visits', 'view', async ({ payload }) =>
    svc.listFieldVisits(payload),
  );
  handlePermitted<{ id: string }>('fieldVisits:get', 'field_visits', 'view', async ({ payload }) => svc.getFieldVisit(payload.id));
  handlePermitted<z.infer<typeof svc.createFieldVisitInput>>('fieldVisits:create', 'field_visits', 'create', async ({ user, payload }) =>
    svc.createFieldVisit({ userId: user.id, username: user.username }, payload),
  );
  handlePermitted<z.infer<typeof svc.updateFieldVisitInput>>('fieldVisits:update', 'field_visits', 'update', async ({ user, payload }) =>
    svc.updateFieldVisit({ userId: user.id, username: user.username }, payload),
  );
  handlePermitted<{ id: string }>('fieldVisits:delete', 'field_visits', 'delete', async ({ user, payload }) =>
    svc.deleteFieldVisit({ userId: user.id, username: user.username }, payload.id),
  );
}
