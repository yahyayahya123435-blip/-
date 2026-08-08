import { registerAuthHandlers } from './auth';
import { registerFamilyHandlers } from './families';
import { registerBeneficiaryHandlers } from './beneficiaries';
import { registerSocialHandlers } from './social';
import { registerAssistanceHandlers } from './assistances';
import { registerInventoryHandlers } from './inventory';
import { registerDonationHandlers } from './donations';
import { registerAccountingHandlers } from './accounting';
import { registerDashboardHandlers } from './dashboard';
import { registerUserHandlers } from './users';
import { registerSettingsHandlers } from './settings';
import { registerAuditHandlers } from './audit';
import { registerAttachmentHandlers } from './attachments';
import { registerDocumentHandlers } from './documents';
import { registerBackupHandlers } from './backup';

export function registerAllIpcHandlers(): void {
  registerAuthHandlers();
  registerUserHandlers();
  registerFamilyHandlers();
  registerBeneficiaryHandlers();
  registerSocialHandlers();
  registerAssistanceHandlers();
  registerInventoryHandlers();
  registerDonationHandlers();
  registerAccountingHandlers();
  registerDashboardHandlers();
  registerSettingsHandlers();
  registerAuditHandlers();
  registerAttachmentHandlers();
  registerDocumentHandlers();
  registerBackupHandlers();
}
