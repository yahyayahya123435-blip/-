'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/client/auth-context';
import { TextInput } from '@/components/ui/Field';

export default function LoginPage() {
  const { loading, hasAnyUser, user, login } = useAuth();
  const router = useRouter();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (hasAnyUser === false) router.replace('/setup');
    else if (user) router.replace('/dashboard');
  }, [loading, hasAnyUser, user, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(username, password);
      router.replace('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ غير متوقع');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="card w-full max-w-sm p-8">
        <h1 className="mb-1 text-center text-xl font-bold text-brand-700">جمعية غصون زهران الخيرية</h1>
        <p className="mb-6 text-center text-sm text-gray-500">تسجيل الدخول</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <TextInput label="اسم المستخدم" required autoFocus value={username} onChange={(e) => setUsername(e.target.value)} />
          <TextInput label="كلمة المرور" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" className="btn-primary w-full" disabled={submitting}>
            {submitting ? 'جارٍ الدخول...' : 'دخول'}
          </button>
        </form>
      </div>
    </div>
  );
}
