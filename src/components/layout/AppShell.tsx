'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/client/auth-context';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { LoadingState } from '@/components/ui/States';

export function AppShell({ children }: { children: React.ReactNode }) {
  const { loading, hasAnyUser, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (hasAnyUser === false) {
      router.replace('/setup');
    } else if (!user) {
      router.replace('/login');
    }
  }, [loading, hasAnyUser, user, router]);

  if (loading || !user) {
    return (
      <div className="flex h-screen items-center justify-center">
        <LoadingState label="جارٍ التحقق من الجلسة..." />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
