'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { TextInput } from '@/components/ui/Field';
import { LoadingState, ErrorState } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/lib/client/auth-context';
import { apiInvoke, ApiError } from '@/lib/client/api';

type SettingsFormState = {
  org_name: string;
  org_phone: string;
  org_address: string;
  org_email: string;
  currency_label: string;
};

const emptyForm: SettingsFormState = {
  org_name: '',
  org_phone: '',
  org_address: '',
  org_email: '',
  currency_label: '',
};

export default function SettingsPage() {
  const { can } = useAuth();
  const { notify } = useToast();
  const canEdit = can('settings', 'update');

  const [form, setForm] = useState<SettingsFormState>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function load() {
    setLoading(true);
    setError(null);
    apiInvoke<Record<string, string>>('settings:get')
      .then((data) =>
        setForm({
          org_name: data.org_name ?? '',
          org_phone: data.org_phone ?? '',
          org_address: data.org_address ?? '',
          org_email: data.org_email ?? '',
          currency_label: data.currency_label ?? '',
        }),
      )
      .catch((e) => setError(e instanceof Error ? e.message : 'حدث خطأ غير متوقع'))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!canEdit) return;
    setSaving(true);
    try {
      const updated = await apiInvoke<Record<string, string>>('settings:update', { ...form });
      setForm({
        org_name: updated.org_name ?? '',
        org_phone: updated.org_phone ?? '',
        org_address: updated.org_address ?? '',
        org_email: updated.org_email ?? '',
        currency_label: updated.currency_label ?? '',
      });
      notify('تم حفظ الإعدادات بنجاح', 'success');
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'تعذر حفظ الإعدادات', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <div className="mb-4">
        <h1 className="text-xl font-bold">الإعدادات</h1>
      </div>

      <div className="card max-w-2xl p-6">
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : (
          <form onSubmit={handleSave} className="space-y-4">
            {!canEdit && <p className="text-sm text-gray-500">لا تملك صلاحية تعديل الإعدادات، يمكنك عرضها فقط.</p>}
            <TextInput
              label="اسم الجمعية"
              required
              disabled={!canEdit}
              value={form.org_name}
              onChange={(e) => setForm({ ...form, org_name: e.target.value })}
            />
            <TextInput
              label="الهاتف"
              disabled={!canEdit}
              value={form.org_phone}
              onChange={(e) => setForm({ ...form, org_phone: e.target.value })}
            />
            <TextInput
              label="العنوان"
              disabled={!canEdit}
              value={form.org_address}
              onChange={(e) => setForm({ ...form, org_address: e.target.value })}
            />
            <TextInput
              label="البريد الإلكتروني"
              type="email"
              disabled={!canEdit}
              value={form.org_email}
              onChange={(e) => setForm({ ...form, org_email: e.target.value })}
            />
            <TextInput
              label="تسمية العملة"
              disabled={!canEdit}
              value={form.currency_label}
              onChange={(e) => setForm({ ...form, currency_label: e.target.value })}
            />
            {canEdit && (
              <div className="flex justify-end">
                <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'جارٍ الحفظ...' : 'حفظ'}</button>
              </div>
            )}
          </form>
        )}
      </div>
    </AppShell>
  );
}
