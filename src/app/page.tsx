'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/client/auth-context';
import { LoadingState } from '@/components/ui/States';

export default function RootPage() {
  const { loading, hasAnyUser, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (hasAnyUser === false) router.replace('/setup');
    else if (!user) router.replace('/login');
    else router.replace('/dashboard');
  }, [loading, hasAnyUser, user, router]);

  return (
    <div className="flex h-screen items-center justify-center">
      <LoadingState />
    </div>
  );
}
