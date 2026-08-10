/**
 * SERVER-ONLY. Reference data every installation needs before anyone can log
 * in: roles, module×action permissions, lookup values, default settings.
 *
 * This runs at every startup, not just the first one — every statement is an
 * upsert, so it is a no-op on an established database and it repairs a
 * missing role after an upgrade adds one. It seeds NO business data: no
 * families, beneficiaries, donations or demo records of any kind.
 *
 * It is deliberately callable from both electron/main.ts and prisma/seed.ts
 * so the packaged app and the dev CLI can never drift apart. Skipping it in
 * the packaged app is what previously made a fresh install fail at the Setup
 * screen with ROLE_NOT_SEEDED — there was no 'Super Admin' role to attach.
 */
import type { PrismaClient } from '../../generated/prisma';

export const MODULES = [
  'families', 'family_members', 'beneficiaries', 'social_assessments', 'field_visits',
  'assistances', 'campaigns', 'inventory', 'donors', 'donations', 'accounting',
  'reports', 'documents', 'users', 'backup', 'settings', 'transfer',
] as const;

export const ACTIONS = ['view', 'create', 'update', 'delete', 'export', 'approve'] as const;

interface RoleSpec {
  name: string;
  description: string;
  isSystem: boolean;
  modules: readonly string[] | 'ALL';
  /** When set, the role only ever gets these actions on its modules. */
  actions?: readonly (typeof ACTIONS)[number][];
}

const ROLES: RoleSpec[] = [
  {
    name: 'Super Admin',
    description: 'صلاحيات كاملة على كل النظام',
    isSystem: true,
    modules: 'ALL',
  },
  {
    name: 'مدير الجمعية',
    description: 'إدارة كل الوحدات بما فيها المستخدمون',
    isSystem: true,
    modules: MODULES,
  },
  {
    name: 'موظف إدخال بيانات',
    description: 'إدخال وتعديل الأسر والمستفيدين والمساعدات',
    isSystem: true,
    modules: ['families', 'family_members', 'beneficiaries', 'assistances', 'campaigns', 'reports', 'documents'],
    actions: ['view', 'create', 'update', 'export'],
  },
  {
    name: 'باحث اجتماعي',
    description: 'البحث الاجتماعي والزيارات الميدانية',
    isSystem: true,
    modules: ['families', 'family_members', 'beneficiaries', 'social_assessments', 'field_visits', 'documents', 'transfer'],
    actions: ['view', 'create', 'update', 'export'],
  },
  {
    name: 'أمين مستودع',
    description: 'إدارة المستودعات والمخزون والموردين',
    isSystem: true,
    modules: ['inventory', 'reports', 'documents'],
    actions: ['view', 'create', 'update', 'export'],
  },
  {
    name: 'محاسب',
    description: 'إدارة التبرعات والحسابات المالية',
    isSystem: true,
    modules: ['donors', 'donations', 'accounting', 'reports', 'documents'],
    actions: ['view', 'create', 'update', 'export'],
  },
  {
    name: 'مطّلع',
    description: 'اطلاع على التقارير فقط بدون أي تعديل',
    isSystem: true,
    modules: ['reports', 'families', 'beneficiaries'],
    actions: ['view'],
  },
];

const LOOKUPS: Record<string, string[]> = {
  housing_type: ['ملك', 'إيجار', 'أخرى'],
  economic_level: ['فقير جداً', 'فقير', 'متوسط', 'ميسور'],
  need_level: ['شديد الحاجة', 'متوسط الحاجة', 'قليل الحاجة'],
  marital_status: ['أعزب', 'متزوج', 'مطلق', 'أرمل'],
  file_status: ['نشط', 'موقوف', 'مؤرشف'],
  relationship: ['رب أسرة', 'زوجة', 'ابن', 'ابنة', 'أخرى'],
  beneficiary_category: ['يتيم', 'مسن', 'مريض', 'ذوي إعاقة', 'أخرى'],
  assistance_category: ['نقدي', 'عيني'],
  assistance_source: ['مخزون', 'تبرع', 'ميزانية الجمعية', 'أخرى'],
  donation_method: ['كاش', 'تحويل بنكي', 'شيك'],
};

/** The assistance kinds listed in the requirement; all editable afterwards. */
const ASSISTANCE_TYPES: { name: string; category: 'نقدي' | 'عيني' }[] = [
  { name: 'طرود غذائية', category: 'عيني' },
  { name: 'مساعدات مالية', category: 'نقدي' },
  { name: 'كسوة', category: 'عيني' },
  { name: 'بطانيات', category: 'عيني' },
  { name: 'صوبات', category: 'عيني' },
  { name: 'أدوية', category: 'عيني' },
  { name: 'وجبات', category: 'عيني' },
  { name: 'كفالات', category: 'نقدي' },
  { name: 'مساعدات طارئة', category: 'نقدي' },
  { name: 'أخرى', category: 'عيني' },
];

const EXPENSE_CATEGORIES = [
  'مصاريف تشغيلية', 'رواتب', 'إيجارات', 'مشتريات مخزون',
  'مساعدات نقدية', 'مصاريف حملات', 'أخرى',
];

const DEFAULT_SETTINGS: Record<string, string> = {
  org_name: 'جمعية غصون زهران الخيرية',
  org_phone: '',
  org_address: '',
  org_email: '',
  org_logo_path: '',
  currency_code: 'JOD',
  currency_label: 'دينار أردني',
  document_footer: 'جمعية غصون زهران الخيرية',
  backup_directory: '',
};

export interface SeedSummary {
  roles: number;
  permissions: number;
  lookups: number;
  assistanceTypes: number;
  expenseCategories: number;
}

export async function seedCoreData(prisma: PrismaClient): Promise<SeedSummary> {
  const permissionRows = MODULES.flatMap((module) => ACTIONS.map((action) => ({ module, action })));
  for (const p of permissionRows) {
    await prisma.permission.upsert({
      where: { module_action: { module: p.module, action: p.action } },
      update: {},
      create: p,
    });
  }
  const allPermissions = await prisma.permission.findMany();

  for (const role of ROLES) {
    const dbRole = await prisma.role.upsert({
      where: { name: role.name },
      update: { description: role.description, isSystem: role.isSystem },
      create: { name: role.name, description: role.description, isSystem: role.isSystem },
    });

    const grantedModules = role.modules === 'ALL' ? MODULES : role.modules;
    const grantedActions = role.actions ?? ACTIONS;
    const granted = allPermissions.filter(
      (p) =>
        grantedModules.includes(p.module) &&
        (grantedActions as readonly string[]).includes(p.action),
    );

    for (const perm of granted) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: dbRole.id, permissionId: perm.id } },
        update: {},
        create: { roleId: dbRole.id, permissionId: perm.id },
      });
    }
  }

  let lookupCount = 0;
  for (const [category, values] of Object.entries(LOOKUPS)) {
    for (const [index, value] of values.entries()) {
      await prisma.lookupValue.upsert({
        where: { category_value: { category, value } },
        update: { sortOrder: index },
        create: { category, value, sortOrder: index },
      });
      lookupCount += 1;
    }
  }

  for (const type of ASSISTANCE_TYPES) {
    await prisma.assistanceType.upsert({
      where: { name: type.name },
      update: {},
      create: type,
    });
  }

  for (const name of EXPENSE_CATEGORIES) {
    await prisma.expenseCategory.upsert({ where: { name }, update: {}, create: { name } });
  }

  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await prisma.setting.upsert({ where: { key }, update: {}, create: { key, value } });
  }

  return {
    roles: ROLES.length,
    permissions: permissionRows.length,
    lookups: lookupCount,
    assistanceTypes: ASSISTANCE_TYPES.length,
    expenseCategories: EXPENSE_CATEGORIES.length,
  };
}
