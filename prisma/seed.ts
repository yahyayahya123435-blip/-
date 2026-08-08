/**
 * Seeds roles + module×action permissions + lookup tables only.
 * NEVER seeds demo business data (families/beneficiaries/donations/etc.)
 * unless SEED_DEMO_DATA=true is explicitly set — and even then, only for
 * local development, never for the final shipped build.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const MODULES = [
  'families', 'family_members', 'beneficiaries', 'social_assessments', 'field_visits',
  'assistances', 'campaigns', 'inventory', 'donors', 'donations', 'accounting',
  'reports', 'documents', 'users', 'backup', 'settings',
] as const;

const ACTIONS = ['view', 'create', 'update', 'delete', 'export', 'approve'] as const;

const ROLES: { name: string; description: string; isSystem: boolean; modules: string[] | 'ALL' }[] = [
  { name: 'Super Admin', description: 'صلاحيات كاملة على كل النظام', isSystem: true, modules: 'ALL' },
  { name: 'مدير الجمعية', description: 'إدارة كل الوحدات عدا إدارة المستخدمين والنظام', isSystem: true,
    modules: MODULES.filter((m) => m !== 'users').concat(['users']) },
  { name: 'موظف إداري', description: 'إدارة الأسر والمستفيدين والمساعدات والحملات', isSystem: true,
    modules: ['families', 'family_members', 'beneficiaries', 'assistances', 'campaigns', 'reports', 'documents'] },
  { name: 'موظف ميداني', description: 'البحث الاجتماعي والزيارات الميدانية', isSystem: true,
    modules: ['families', 'family_members', 'beneficiaries', 'social_assessments', 'field_visits'] },
  { name: 'أمين مستودع', description: 'إدارة المستودعات والمخزون والموردين', isSystem: true,
    modules: ['inventory', 'reports'] },
  { name: 'أمين صندوق', description: 'إدارة التبرعات والحسابات المالية', isSystem: true,
    modules: ['donors', 'donations', 'accounting', 'reports', 'documents'] },
  { name: 'مستخدم تقارير', description: 'اطلاع على التقارير فقط', isSystem: true, modules: ['reports'] },
];

const LOOKUPS: Record<string, string[]> = {
  housing_type: ['ملك', 'إيجار', 'أخرى'],
  economic_level: ['فقير جداً', 'فقير', 'متوسط', 'ميسور'],
  relationship: ['رب أسرة', 'زوجة', 'ابن', 'ابنة', 'أخرى'],
  beneficiary_category: ['يتيم', 'مسن', 'مريض', 'ذوي إعاقة', 'أخرى'],
  assistance_category: ['نقدي', 'عيني'],
  donation_method: ['كاش', 'تحويل بنكي', 'شيك'],
};

async function main() {
  // Permissions: module × action
  const permissionRows = MODULES.flatMap((module) =>
    ACTIONS.map((action) => ({ module, action })),
  );
  for (const p of permissionRows) {
    await prisma.permission.upsert({
      where: { module_action: { module: p.module, action: p.action } },
      update: {},
      create: p,
    });
  }
  const allPermissions = await prisma.permission.findMany();

  // Roles + role_permissions
  for (const role of ROLES) {
    const dbRole = await prisma.role.upsert({
      where: { name: role.name },
      update: { description: role.description, isSystem: role.isSystem },
      create: { name: role.name, description: role.description, isSystem: role.isSystem },
    });

    const grantedModules = role.modules === 'ALL' ? MODULES : role.modules;
    const grantedPermissions = allPermissions.filter((p) => grantedModules.includes(p.module));

    for (const perm of grantedPermissions) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: dbRole.id, permissionId: perm.id } },
        update: {},
        create: { roleId: dbRole.id, permissionId: perm.id },
      });
    }
  }

  // Lookup values
  for (const [category, values] of Object.entries(LOOKUPS)) {
    for (const [index, value] of values.entries()) {
      await prisma.lookupValue.upsert({
        where: { category_value: { category, value } },
        update: { sortOrder: index },
        create: { category, value, sortOrder: index },
      });
    }
  }

  // Default settings
  const defaultSettings: Record<string, string> = {
    org_name: 'جمعية غصون زهران الخيرية',
    org_phone: '',
    org_address: '',
    org_email: '',
    currency_label: 'دينار أردني',
  };
  for (const [key, value] of Object.entries(defaultSettings)) {
    await prisma.setting.upsert({ where: { key }, update: {}, create: { key, value } });
  }

  console.log(`Seeded ${ROLES.length} roles, ${permissionRows.length} permissions, ${Object.keys(LOOKUPS).length} lookup categories.`);

  if (process.env.SEED_DEMO_DATA === 'true') {
    console.warn('SEED_DEMO_DATA=true — seeding demo business data (development only, never for final build).');
    await seedDemoData();
  }
}

async function seedDemoData() {
  const family = await prisma.family.create({
    data: {
      familyCode: 'DEMO-0001',
      headOfFamilyName: 'أسرة تجريبية',
      city: 'عمّان',
      economicLevel: 'فقير',
    },
  });
  await prisma.beneficiary.create({
    data: { familyId: family.id, fullName: 'مستفيد تجريبي', category: 'يتيم' },
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
