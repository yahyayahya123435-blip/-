'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/client/auth-context';
import { TextInput } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';

export default function SetupPage() {
  const { loading, hasAnyUser, setup } = useAuth();
  const router = useRouter();
  const { notify } = useToast();

  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && hasAnyUser === true) router.replace('/login');
  }, [loading, hasAnyUser, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError('كلمتا المرور غير متطابقتين');
      return;
    }
    if (password.length < 8) {
      setError('كلمة المرور يجب أن تكون 8 أحرف على الأقل');
      return;
    }
    setSubmitting(true);
    try {
      await setup(fullName, username, password);
      notify('تم إنشاء حساب المدير العام بنجاح', 'success');
      // First run continues straight into the register import — it is the
      // next thing a new installation needs, and the wizard itself is
      // read-only until the operator confirms.
      router.replace('/import');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ غير متوقع');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="card w-full max-w-md p-8">
        <h1 className="mb-1 text-center text-xl font-bold text-brand-700">جمعية غصون زهران الخيرية</h1>
        <p className="mb-6 text-center text-sm text-gray-500">إعداد أول مرة — إنشاء حساب المدير العام</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <TextInput label="الاسم الكامل" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
          <TextInput label="اسم المستخدم" required value={username} onChange={(e) => setUsername(e.target.value)} />
          <TextInput label="كلمة المرور" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          <TextInput label="تأكيد كلمة المرور" type="password" required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" className="btn-primary w-full" disabled={submitting}>
            {submitting ? 'جارٍ الإنشاء...' : 'إنشاء الحساب والمتابعة'}
          </button>
        </form>
      </div>
    </div>
  );
}
