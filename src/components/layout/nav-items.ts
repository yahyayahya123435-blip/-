export interface NavItem {
  href: string;
  label: string;
  icon: string;
  module: string;
}

export const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'الرئيسية', icon: '🏠', module: 'reports' },
  { href: '/families', label: 'الأسر', icon: '👪', module: 'families' },
  { href: '/beneficiaries', label: 'المستفيدون', icon: '🧑‍🤝‍🧑', module: 'beneficiaries' },
  { href: '/social-assessments', label: 'البحث الاجتماعي', icon: '📋', module: 'social_assessments' },
  { href: '/field-visits', label: 'الزيارات الميدانية', icon: '🚗', module: 'field_visits' },
  { href: '/assistances', label: 'المساعدات', icon: '🎁', module: 'assistances' },
  { href: '/campaigns', label: 'الحملات', icon: '📢', module: 'campaigns' },
  { href: '/warehouses', label: 'المستودعات', icon: '🏬', module: 'inventory' },
  { href: '/inventory', label: 'المخزون', icon: '📦', module: 'inventory' },
  { href: '/donors', label: 'المتبرعون', icon: '🤝', module: 'donors' },
  { href: '/donations', label: 'التبرعات', icon: '💰', module: 'donations' },
  { href: '/expenses', label: 'المصروفات', icon: '🧾', module: 'accounting' },
  { href: '/suppliers', label: 'الموردون', icon: '🚚', module: 'inventory' },
  { href: '/reports', label: 'التقارير', icon: '📊', module: 'reports' },
  { href: '/documents', label: 'المستندات', icon: '📁', module: 'documents' },
  { href: '/users', label: 'المستخدمون والصلاحيات', icon: '🔐', module: 'users' },
  { href: '/import', label: 'استيراد سجل المنتسبين', icon: '📥', module: 'families' },
  { href: '/transfer', label: 'النقل من الهاتف', icon: '📱', module: 'transfer' },
  { href: '/backup', label: 'النسخ الاحتياطي', icon: '💾', module: 'backup' },
  { href: '/settings', label: 'الإعدادات', icon: '⚙️', module: 'settings' },
];
