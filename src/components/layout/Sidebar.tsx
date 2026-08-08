'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/client/auth-context';
import { NAV_ITEMS } from './nav-items';

export function Sidebar() {
  const pathname = usePathname();
  const { can } = useAuth();

  return (
    <aside className="flex h-full w-64 flex-col border-l border-gray-200 bg-white">
      <div className="border-b border-gray-100 p-4 text-center">
        <div className="text-lg font-bold text-brand-700">جمعية غصون زهران</div>
        <div className="text-xs text-gray-500">الخيرية</div>
      </div>
      <nav className="flex-1 overflow-y-auto p-2">
        {NAV_ITEMS.filter((item) => can(item.module, 'view')).map((item) => {
          const active = pathname === item.href || pathname?.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              className={
                'mb-1 flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ' +
                (active ? 'bg-brand-50 font-medium text-brand-700' : 'text-gray-600 hover:bg-gray-50')
              }
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
