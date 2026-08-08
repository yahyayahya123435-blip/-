'use client';

import { useAuth } from '@/lib/client/auth-context';
import { useRouter } from 'next/navigation';

export function TopBar() {
  const { user, logout } = useAuth();
  const router = useRouter();

  return (
    <header className="flex h-14 items-center justify-between border-b border-gray-200 bg-white px-4">
      <div className="text-sm text-gray-500">مرحباً، {user?.fullName}</div>
      <button
        className="btn-secondary"
        onClick={async () => {
          await logout();
          router.replace('/login');
        }}
      >
        تسجيل الخروج
      </button>
    </header>
  );
}
