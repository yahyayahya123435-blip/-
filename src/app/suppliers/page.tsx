'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { TextInput, TextArea } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/lib/client/auth-context';
import { apiInvoke, ApiError } from '@/lib/client/api';

interface Supplier {
  id: string;
  name: string;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
  isActive: boolean;
}

type SupplierFormState = { name: string; phone: string; address: string; notes: string };

const emptyForm: SupplierFormState = { name: '', phone: '', address: '', notes: '' };

export default function SuppliersPage() {
  const { can } = useAuth();
  const { notify } = useToast();

  const [rows, setRows] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<SupplierFormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  function loadList() {
    setLoading(true);
    setError(null);
    apiInvoke<Supplier[]>('suppliers:list')
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

  function openEdit(supplier: Supplier) {
    setEditingId(supplier.id);
    setForm({
      name: supplier.name,
      phone: supplier.phone ?? '',
      address: supplier.address ?? '',
      notes: supplier.notes ?? '',
    });
    setFormOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        phone: form.phone || undefined,
        address: form.address || undefined,
        notes: form.notes || undefined,
      };
      if (editingId) {
        await apiInvoke('suppliers:update', { id: editingId, ...payload });
        notify('تم تحديث بيانات المورد', 'success');
      } else {
        await apiInvoke('suppliers:create', payload);
        notify('تمت إضافة المورد بنجاح', 'success');
      }
      setFormOpen(false);
      loadList();
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'تعذر حفظ البيانات', 'error');
    } finally {
      setSaving(false);
    }
  }

  const columns: Column<Supplier>[] = [
    { key: 'name', header: 'الاسم' },
    { key: 'phone', header: 'الهاتف', render: (r) => r.phone ?? '—' },
    { key: 'address', header: 'العنوان', render: (r) => r.address ?? '—' },
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
        <h1 className="text-xl font-bold">الموردون</h1>
        {can('inventory', 'create') && (
          <button className="btn-primary" onClick={openCreate}>
            + إضافة مورد
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
          emptyTitle="لا يوجد موردون مسجلون بعد"
          actions={(row) => (
            can('inventory', 'update') && (
              <button className="text-xs text-brand-600 hover:underline" onClick={(e) => { e.stopPropagation(); openEdit(row); }}>
                تعديل
              </button>
            )
          )}
        />
      </div>

      {formOpen && <SupplierFormModal form={form} setForm={setForm} onSubmit={handleSave} onClose={() => setFormOpen(false)} saving={saving} editing={!!editingId} />}
    </AppShell>
  );
}

function SupplierFormModal({
  form, setForm, onSubmit, onClose, saving, editing,
}: {
  form: SupplierFormState;
  setForm: (f: SupplierFormState) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
  saving: boolean;
  editing: boolean;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
      <div className="card w-full max-w-md p-6">
        <h2 className="mb-4 text-lg font-bold">{editing ? 'تعديل مورد' : 'إضافة مورد جديد'}</h2>
        <form onSubmit={onSubmit} className="space-y-4">
          <TextInput label="اسم المورد" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <TextInput label="الهاتف" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <TextInput label="العنوان" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          <TextArea label="ملاحظات" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={onClose}>إلغاء</button>
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'جارٍ الحفظ...' : 'حفظ'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
