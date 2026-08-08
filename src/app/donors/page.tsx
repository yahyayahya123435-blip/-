'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { DataTable, Pagination, type Column } from '@/components/ui/DataTable';
import { TextInput, Select, TextArea } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { useAuth } from '@/lib/client/auth-context';
import { apiInvoke, ApiError } from '@/lib/client/api';
import { filsToDinar } from '@/lib/client/money';

interface Donor {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  donorType: string;
  notes?: string | null;
  isActive: boolean;
}

interface Donation {
  id: string;
  amountFils: number;
  donationType: string;
  method?: string | null;
  donatedAt: string;
}

const DONOR_TYPE_OPTIONS = [
  { value: 'فرد', label: 'فرد' },
  { value: 'مؤسسة', label: 'مؤسسة' },
];

type DonorFormState = {
  name: string;
  phone: string;
  email: string;
  address: string;
  donorType: string;
  notes: string;
};

const emptyForm: DonorFormState = { name: '', phone: '', email: '', address: '', donorType: 'فرد', notes: '' };

export default function DonorsPage() {
  const { can } = useAuth();
  const { notify } = useToast();
  const { confirm } = useConfirm();

  const [view, setView] = useState<'list' | 'detail'>('list');
  const [rows, setRows] = useState<Donor[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pageSize = 20;

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<DonorFormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Donor | null>(null);
  const [donations, setDonations] = useState<Donation[]>([]);

  function loadList() {
    setLoading(true);
    setError(null);
    apiInvoke<{ rows: Donor[]; total: number }>('donors:list', { page, pageSize, search: search || undefined })
      .then((res) => {
        setRows(res.rows);
        setTotal(res.total);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'حدث خطأ غير متوقع'))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (view === 'list') loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, page]);

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    loadList();
  }

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setFormOpen(true);
  }

  function openEdit(donor: Donor) {
    setEditingId(donor.id);
    setForm({
      name: donor.name,
      phone: donor.phone ?? '',
      email: donor.email ?? '',
      address: donor.address ?? '',
      donorType: donor.donorType,
      notes: donor.notes ?? '',
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
        email: form.email || undefined,
        address: form.address || undefined,
        donorType: form.donorType,
        notes: form.notes || undefined,
      };
      if (editingId) {
        await apiInvoke('donors:update', { id: editingId, ...payload });
        notify('تم تحديث بيانات المتبرع', 'success');
        if (view === 'detail' && selectedId === editingId) loadDetail(editingId);
      } else {
        await apiInvoke('donors:create', payload);
        notify('تمت إضافة المتبرع بنجاح', 'success');
      }
      setFormOpen(false);
      if (view === 'list') loadList();
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'تعذر حفظ البيانات', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate(donor: Donor) {
    const ok = await confirm({
      title: 'إيقاف المتبرع',
      message: `هل أنت متأكد من إيقاف المتبرع "${donor.name}"؟`,
      danger: true,
      confirmLabel: 'إيقاف',
    });
    if (!ok) return;
    try {
      await apiInvoke('donors:delete', { id: donor.id });
      notify('تم إيقاف المتبرع', 'success');
      if (view === 'detail' && selectedId === donor.id) loadDetail(donor.id);
      else loadList();
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'تعذر تنفيذ العملية', 'error');
    }
  }

  function loadDetail(id: string) {
    apiInvoke<Donor & { donations: Donation[] }>('donors:get', { id })
      .then((d) => {
        setDetail(d);
        setDonations(d.donations ?? []);
      })
      .catch((e) => notify(e instanceof Error ? e.message : 'تعذر تحميل بيانات المتبرع', 'error'));
  }

  function openDetail(donor: Donor) {
    setSelectedId(donor.id);
    setView('detail');
  }

  useEffect(() => {
    if (view !== 'detail' || !selectedId) return;
    loadDetail(selectedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, selectedId]);

  const columns: Column<Donor>[] = [
    { key: 'name', header: 'الاسم' },
    { key: 'phone', header: 'الهاتف', render: (r) => r.phone ?? '—' },
    { key: 'email', header: 'البريد الإلكتروني', render: (r) => r.email ?? '—' },
    { key: 'donorType', header: 'النوع' },
    {
      key: 'isActive', header: 'الحالة',
      render: (r) => (
        <span className={'rounded px-2 py-0.5 text-xs ' + (r.isActive ? 'bg-brand-50 text-brand-700' : 'bg-gray-100 text-gray-500')}>
          {r.isActive ? 'نشط' : 'موقوف'}
        </span>
      ),
    },
  ];

  const donationColumns: Column<Donation>[] = [
    { key: 'amountFils', header: 'المبلغ', render: (d) => `${filsToDinar(d.amountFils)} د.أ` },
    { key: 'donationType', header: 'النوع' },
    { key: 'method', header: 'طريقة الدفع', render: (d) => d.method ?? '—' },
    { key: 'donatedAt', header: 'التاريخ', render: (d) => new Date(d.donatedAt).toLocaleDateString('ar-JO') },
  ];

  if (view === 'detail') {
    return (
      <AppShell>
        <button className="btn-secondary mb-4" onClick={() => setView('list')}>
          ← رجوع لقائمة المتبرعين
        </button>
        {!detail ? (
          <p className="text-sm text-gray-500">جارٍ التحميل...</p>
        ) : (
          <div className="space-y-6">
            <div className="card p-4">
              <div className="mb-3 flex items-center justify-between">
                <h1 className="text-lg font-bold">{detail.name}</h1>
                <div className="flex gap-2">
                  {can('donors', 'update') && (
                    <button className="btn-secondary" onClick={() => openEdit(detail)}>
                      تعديل بيانات المتبرع
                    </button>
                  )}
                  {can('donors', 'delete') && detail.isActive && (
                    <button className="btn-danger" onClick={() => handleDeactivate(detail)}>
                      إيقاف
                    </button>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                <div><span className="text-gray-500">النوع: </span>{detail.donorType}</div>
                <div><span className="text-gray-500">الهاتف: </span>{detail.phone ?? '—'}</div>
                <div><span className="text-gray-500">البريد الإلكتروني: </span>{detail.email ?? '—'}</div>
                <div><span className="text-gray-500">العنوان: </span>{detail.address ?? '—'}</div>
                <div>
                  <span className="text-gray-500">الحالة: </span>
                  <span className={detail.isActive ? 'text-brand-700' : 'text-gray-500'}>{detail.isActive ? 'نشط' : 'موقوف'}</span>
                </div>
              </div>
              {detail.notes && <p className="mt-3 text-sm text-gray-600">ملاحظات: {detail.notes}</p>}
            </div>

            <div className="card p-4">
              <h2 className="mb-3 font-bold">تبرعات هذا المتبرع ({donations.length})</h2>
              <DataTable columns={donationColumns} rows={donations} rowKey={(d) => d.id} emptyTitle="لا توجد تبرعات مسجلة بعد" />
            </div>
          </div>
        )}
        {formOpen && <DonorFormModal form={form} setForm={setForm} onSubmit={handleSave} onClose={() => setFormOpen(false)} saving={saving} editing={!!editingId} />}
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">المتبرعون</h1>
        {can('donors', 'create') && (
          <button className="btn-primary" onClick={openCreate}>
            + إضافة متبرع
          </button>
        )}
      </div>

      <form onSubmit={handleSearchSubmit} className="mb-4 flex gap-2">
        <TextInput placeholder="ابحث بالاسم أو الهاتف..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
        <button type="submit" className="btn-secondary">بحث</button>
      </form>

      <div className="card">
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          loading={loading}
          error={error}
          onRetry={loadList}
          emptyTitle="لا يوجد متبرعون مسجلون بعد"
          onRowClick={openDetail}
          actions={(row) => (
            <div className="flex gap-2">
              {can('donors', 'update') && (
                <button className="text-xs text-brand-600 hover:underline" onClick={(e) => { e.stopPropagation(); openEdit(row); }}>
                  تعديل
                </button>
              )}
              {can('donors', 'delete') && row.isActive && (
                <button className="text-xs text-red-600 hover:underline" onClick={(e) => { e.stopPropagation(); handleDeactivate(row); }}>
                  إيقاف
                </button>
              )}
            </div>
          )}
        />
        {!loading && !error && <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} />}
      </div>

      {formOpen && <DonorFormModal form={form} setForm={setForm} onSubmit={handleSave} onClose={() => setFormOpen(false)} saving={saving} editing={!!editingId} />}
    </AppShell>
  );
}

function DonorFormModal({
  form, setForm, onSubmit, onClose, saving, editing,
}: {
  form: DonorFormState;
  setForm: (f: DonorFormState) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
  saving: boolean;
  editing: boolean;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
      <div className="card max-h-[90vh] w-full max-w-2xl overflow-y-auto p-6">
        <h2 className="mb-4 text-lg font-bold">{editing ? 'تعديل بيانات المتبرع' : 'إضافة متبرع جديد'}</h2>
        <form onSubmit={onSubmit} className="grid grid-cols-2 gap-4">
          <TextInput label="الاسم" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Select label="نوع المتبرع" options={DONOR_TYPE_OPTIONS} value={form.donorType} onChange={(e) => setForm({ ...form, donorType: e.target.value })} />
          <TextInput label="الهاتف" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <TextInput label="البريد الإلكتروني" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <div className="col-span-2">
            <TextInput label="العنوان" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
          <div className="col-span-2">
            <TextArea label="ملاحظات" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <div className="col-span-2 flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={onClose}>إلغاء</button>
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'جارٍ الحفظ...' : 'حفظ'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
