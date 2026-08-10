/**
 * Single source of truth for every IPC channel name in the app. Used both
 * to register ipcMain.handle() in the main process and to build the
 * preload allowlist, so a channel typo fails loudly instead of silently
 * exposing (or blocking) something unintended.
 *
 * Extended incrementally as each module's IPC handlers are added.
 */
export const AUTH_CHANNELS = [
  'auth:hasAnyUser',
  'auth:setup',
  'auth:login',
  'auth:logout',
  'auth:me',
  'auth:changePassword',
] as const;

export const USER_CHANNELS = [
  'users:list',
  'users:create',
  'users:update',
  'users:setActive',
  'users:resetPassword',
  'roles:list',
  'roles:permissions',
  'loginAttempts:list',
] as const;

export const FAMILY_CHANNELS = [
  'families:list',
  'families:get',
  'families:create',
  'families:update',
  'families:delete',
  'families:checkDuplicates',
  'familyMembers:list',
  'familyMembers:create',
  'familyMembers:update',
  'familyMembers:delete',
  'regions:list',
  'regions:create',
  'regions:update',
] as const;

export const IMPORT_CHANNELS = [
  'import:previewLegacy',
  'import:runLegacy',
  'families:listIncomplete',
  'families:completeData',
] as const;

export const TRANSFER_CHANNELS = [
  'transfer:pickAndPreview',
  'transfer:commit',
  'transfer:exportForMobile',
  'transfer:history',
  'transfer:revealFile',
] as const;

export const BENEFICIARY_CHANNELS = [
  'beneficiaries:list',
  'beneficiaries:get',
  'beneficiaries:create',
  'beneficiaries:update',
  'beneficiaries:delete',
  'beneficiaries:checkDuplicates',
] as const;

export const SOCIAL_CHANNELS = [
  'socialAssessments:list',
  'socialAssessments:get',
  'socialAssessments:create',
  'socialAssessments:update',
  'socialAssessments:delete',
  'fieldVisits:list',
  'fieldVisits:get',
  'fieldVisits:create',
  'fieldVisits:update',
  'fieldVisits:delete',
] as const;

export const ASSISTANCE_CHANNELS = [
  'assistanceTypes:list',
  'assistanceTypes:create',
  'assistanceTypes:update',
  'assistances:list',
  'assistances:get',
  'assistances:create',
  'assistances:update',
  'assistances:delete',
  'campaigns:list',
  'campaigns:get',
  'campaigns:create',
  'campaigns:update',
  'campaigns:delete',
  'campaignItems:list',
  'campaignItems:create',
  'campaignItems:update',
  'campaignItems:delete',
] as const;

export const INVENTORY_CHANNELS = [
  'warehouses:list',
  'warehouses:create',
  'warehouses:update',
  'inventoryItems:list',
  'inventoryItems:get',
  'inventoryItems:create',
  'inventoryItems:update',
  'suppliers:list',
  'suppliers:create',
  'suppliers:update',
  'stockIn:list',
  'stockIn:create',
  'stockOut:list',
  'stockOut:create',
] as const;

export const DONATION_CHANNELS = [
  'donors:list',
  'donors:get',
  'donors:create',
  'donors:update',
  'donors:delete',
  'donations:list',
  'donations:get',
  'donations:create',
  'donations:update',
  'donations:delete',
  'receipts:get',
  'receipts:list',
] as const;

export const ACCOUNTING_CHANNELS = [
  'expenseCategories:list',
  'expenseCategories:create',
  'transactions:list',
  'transactions:create',
  'transactions:update',
  'transactions:delete',
  'accounting:summary',
] as const;

export const DASHBOARD_CHANNELS = ['dashboard:summary', 'search:global'] as const;

export const REPORTS_CHANNELS = ['reports:run'] as const;

export const DOCUMENT_CHANNELS = [
  'documents:generatePdf',
  'documents:generateDocx',
  'documents:generateXlsx',
  'documents:openInFolder',
] as const;

export const ATTACHMENT_CHANNELS = [
  'attachments:list',
  'attachments:pickAndUpload',
  'attachments:delete',
  'attachments:openInFolder',
] as const;

export const BACKUP_CHANNELS = [
  'backup:create',
  'backup:list',
  'backup:restore',
] as const;

export const SETTINGS_CHANNELS = ['settings:get', 'settings:update'] as const;

export const AUDIT_CHANNELS = ['auditLogs:list'] as const;

export const ALL_CHANNELS: readonly string[] = [
  ...AUTH_CHANNELS,
  ...USER_CHANNELS,
  ...FAMILY_CHANNELS,
  ...IMPORT_CHANNELS,
  ...TRANSFER_CHANNELS,
  ...BENEFICIARY_CHANNELS,
  ...SOCIAL_CHANNELS,
  ...ASSISTANCE_CHANNELS,
  ...INVENTORY_CHANNELS,
  ...DONATION_CHANNELS,
  ...ACCOUNTING_CHANNELS,
  ...DASHBOARD_CHANNELS,
  ...REPORTS_CHANNELS,
  ...DOCUMENT_CHANNELS,
  ...ATTACHMENT_CHANNELS,
  ...BACKUP_CHANNELS,
  ...SETTINGS_CHANNELS,
  ...AUDIT_CHANNELS,
];
