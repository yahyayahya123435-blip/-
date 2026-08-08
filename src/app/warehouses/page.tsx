'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { TextInput } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/lib/client/auth-context';
import { apiInvoke, ApiError } from '@/lib/client/api';

interface Warehouse {
  id: string;
  name: string;
  location?: string | null;
  isActive: boolean;
}

type WarehouseFormState = { name: string; location: string };

const emptyForm: WarehouseFormState = { name: '', location: '' };

export default function WarehousesPage() {
  const { can } = useAuth();
  const { notify } = useToast();

  const [rows, setRows] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<WarehouseFormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  function loadList() {
    setLoading(true);
    setError(null);
    apiInvoke<Warehouse[]>('warehouses:list')
      .then(setRows)
      .catch((e) => setError(e instanceof Error ? e.message : 'حدث خطأ غير متوقع'))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadList();
  }, []);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setFormOpen(true);
  }

  function openEdit(warehouse: Warehouse) {
    setEditingId(warehouse.id);
    setForm({ name: warehouse.name, location: warehouse.location ?? '' });
    setFormOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { name: form.name, location: form.location || undefined };
      if (editingId) {
        await apiInvoke('warehouses:update', { id: editingId, ...payload });
        notify('تم تحديث بيانات المستودع', 'success');
      } else {
        await apiInvoke('warehouses:create', payload);
        notify('تمت إضافة المستودع بنجاح', 'success');
      }
      setFormOpen(false);
      loadList();
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'تعذر حفظ البيانات', 'error');
    } finally {
      setSaving(false);
    }
  }

  const columns: Column<Warehouse>[] = [
    { key: 'name', header: 'الاسم' },
    { key: 'location', header: 'الموقع', render: (r) => r.location ?? '—' },
    {
      key: 'isActive', header: 'الحالة',
      render: (r) => (
        <span className={'rounded px-2 py-0.5 text-xs ' + (r.isActive ? 'bg-brand-50 text-brand-700' : 'bg-gray-100 text-gray-500')}>
          {r.isActive ? 'نشط' : 'معطل'}
        </span>
      ),
    },
  ];

  return (
    <AppShell>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">المستودعات</h1>
        {can('inventory', 'create') && (
          <button className="btn-primary" onClick={openCreate}>
            + إضافة مستودع
          </button>
        )}
      </div>

      <div className="card">
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          loading={loading}
          error={error}
          onRetry={loadList}
          emptyTitle="لا توجد مستودعات مسجلة بعد"
          actions={(row) => (
            can('inventory', 'update') && (
              <button className="text-xs text-brand-600 hover:underline" onClick={(e) => { e.stopPropagation(); openEdit(row); }}>
                تعديل
              </button>
            )
          )}
        />
      </div>

      {formOpen && <WarehouseFormModal form={form} setForm={setForm} onSubmit={handleSave} onClose={() => setFormOpen(false)} saving={saving} editing={!!editingId} />}
    </AppShell>
  );
}

function WarehouseFormModal({
  form, setForm, onSubmit, onClose, saving, editing,
}: {
  form: WarehouseFormState;
  setForm: (f: WarehouseFormState) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
  saving: boolean;
  editing: boolean;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
      <div className="card w-full max-w-md p-6">
        <h2 className="mb-4 text-lg font-bold">{editing ? 'تعديل مستودع' : 'إضافة مستودع جديد'}</h2>
        <form onSubmit={onSubmit} className="space-y-4">
          <TextInput label="اسم المستودع" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <TextInput label="الموقع" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={onClose}>إلغاء</button>
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'جارٍ الحفظ...' : 'حفظ'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
