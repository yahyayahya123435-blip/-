'use client';

import { useEffect, useRef, useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { DataTable, Pagination, type Column } from '@/components/ui/DataTable';
import { TextInput, Select, TextArea } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/lib/client/auth-context';
import { apiInvoke, ApiError } from '@/lib/client/api';
import { filsToDinar, dinarInputToFils } from '@/lib/client/money';
import { AttachmentsPanel } from '@/components/shared/AttachmentsPanel';
import { ExportButtons } from '@/components/shared/ExportButtons';

interface DonorRef {
  id: string;
  name: string;
}

interface Receipt {
  id: string;
  receiptNo: string;
  amountFils: number;
  issuedAt: string;
}

interface Donation {
  id: string;
  donorId: string;
  donor: DonorRef;
  amountFils: number;
  donationType: string;
  method?: string | null;
  donatedAt: string;
  notes?: string | null;
  receipts?: Receipt[];
}

const DONATION_TYPE_OPTIONS = [
  { value: 'نقدي', label: 'نقدي' },
  { value: 'عيني', label: 'عيني' },
];
const METHOD_OPTIONS = [
  { value: 'كاش', label: 'كاش' },
  { value: 'تحويل بنكي', label: 'تحويل بنكي' },
  { value: 'شيك', label: 'شيك' },
];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

type DonationFormState = {
  donorId: string;
  donorName: string;
  amount: string;
  donationType: string;
  method: string;
  donatedAt: string;
  notes: string;
};

function emptyForm(): DonationFormState {
  return { donorId: '', donorName: '', amount: '', donationType: 'نقدي', method: '', donatedAt: today(), notes: '' };
}

export default function DonationsPage() {
  const { can } = useAuth();
  const { notify } = useToast();

  const [view, setView] = useState<'list' | 'detail'>('list');
  const [rows, setRows] = useState<Donation[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pageSize = 20;

  const [donorFilter, setDonorFilter] = useState<DonorRef | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<DonationFormState>(emptyForm());
  const [saving, setSaving] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Donation | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  function loadList() {
    setLoading(true);
    setError(null);
    apiInvoke<{ rows: Donation[]; total: number }>('donations:list', { page, pageSize, donorId: donorFilter?.id || undefined })
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
  }, [view, page, donorFilter]);

  function openCreate() {
    setForm(emptyForm());
    setFormOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.donorId) {
      notify('يرجى اختيار المتبرع', 'error');
      return;
    }
    setSaving(true);
    try {
      await apiInvoke('donations:create', {
        donorId: form.donorId,
        amountFils: dinarInputToFils(form.amount),
        donationType: form.donationType,
        method: form.method || undefined,
        donatedAt: form.donatedAt,
        notes: form.notes || undefined,
      });
      notify('تمت إضافة التبرع بنجاح، وتم إصدار الإيصال تلقائياً', 'success');
      setFormOpen(false);
      if (view === 'list') loadList();
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'تعذر حفظ البيانات', 'error');
    } finally {
      setSaving(false);
    }
  }

  function openDetail(donation: Donation) {
    setSelectedId(donation.id);
    setView('detail');
  }

  useEffect(() => {
    if (view !== 'detail' || !selectedId) return;
    apiInvoke<Donation>('donations:get', { id: selectedId })
      .then((d) => {
        setDetail(d);
        setReceipt(d.receipts && d.receipts.length > 0 ? d.receipts[0] : null);
      })
      .catch((e) => notify(e instanceof Error ? e.message : 'تعذر تحميل بيانات التبرع', 'error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, selectedId]);

  const columns: Column<Donation>[] = [
    { key: 'donor', header: 'المتبرع', render: (r) => r.donor?.name ?? '—' },
    { key: 'amountFils', header: 'المبلغ', render: (r) => `${filsToDinar(r.amountFils)} د.أ` },
    { key: 'donationType', header: 'النوع' },
    { key: 'method', header: 'طريقة الدفع', render: (r) => r.method ?? '—' },
    { key: 'donatedAt', header: 'التاريخ', render: (r) => new Date(r.donatedAt).toLocaleDateString('ar-JO') },
  ];

  if (view === 'detail') {
    return (
      <AppShell>
        <button className="btn-secondary mb-4" onClick={() => setView('list')}>
          ← رجوع لقائمة التبرعات
        </button>
        {!detail ? (
          <p className="text-sm text-gray-500">جارٍ التحميل...</p>
        ) : (
          <div className="space-y-6">
            <div className="card p-4">
              <h1 className="mb-3 text-lg font-bold">تبرع من {detail.donor?.name}</h1>
              <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                <div><span className="text-gray-500">المبلغ: </span>{filsToDinar(detail.amountFils)} د.أ</div>
                <div><span className="text-gray-500">النوع: </span>{detail.donationType}</div>
                <div><span className="text-gray-500">طريقة الدفع: </span>{detail.method ?? '—'}</div>
                <div><span className="text-gray-500">التاريخ: </span>{new Date(detail.donatedAt).toLocaleDateString('ar-JO')}</div>
              </div>
              {detail.notes && <p className="mt-3 text-sm text-gray-600">ملاحظات: {detail.notes}</p>}
            </div>

            <div className="card p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-bold">إيصال التبرع</h2>
                {receipt && (
                  <ExportButtons
                    buildSpec={() => ({
                      orgName: 'جمعية غصون زهران الخيرية',
                      title: 'إيصال تبرع',
                      recordNumber: receipt.receiptNo,
                      date: new Date(receipt.issuedAt).toLocaleDateString('ar-JO'),
                      columns: ['البند', 'القيمة'],
                      rows: [
                        ['رقم الإيصال', receipt.receiptNo],
                        ['المتبرع', detail.donor?.name ?? '—'],
                        ['المبلغ', `${filsToDinar(receipt.amountFils)} د.أ`],
                        ['نوع التبرع', detail.donationType],
                        ['طريقة الدفع', detail.method ?? '—'],
                        ['تاريخ التبرع', new Date(detail.donatedAt).toLocaleDateString('ar-JO')],
                        ['تاريخ إصدار الإيصال', new Date(receipt.issuedAt).toLocaleDateString('ar-JO')],
                      ],
                      notes: detail.notes ?? undefined,
                    })}
                  />
                )}
              </div>
              {!receipt ? (
                <p className="text-sm text-gray-500">لا يوجد إيصال مرتبط بهذا التبرع</p>
              ) : (
                <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-3">
                  <div><span className="text-gray-500">رقم الإيصال: </span>{receipt.receiptNo}</div>
                  <div><span className="text-gray-500">المبلغ: </span>{filsToDinar(receipt.amountFils)} د.أ</div>
                  <div><span className="text-gray-500">تاريخ الإصدار: </span>{new Date(receipt.issuedAt).toLocaleDateString('ar-JO')}</div>
                </div>
              )}
            </div>

            <AttachmentsPanel entityType="donations" entityId={detail.id} />
          </div>
        )}
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">التبرعات</h1>
        {can('donations', 'create') && (
          <button className="btn-primary" onClick={openCreate}>
            + إضافة تبرع
          </button>
        )}
      </div>

      <div className="mb-4 flex items-center gap-2">
        <DonorPicker
          value={donorFilter?.name ?? ''}
          placeholder="تصفية حسب المتبرع..."
          onSelect={(donor) => {
            setPage(1);
            setDonorFilter(donor);
          }}
        />
        {donorFilter && (
          <button className="btn-secondary" onClick={() => { setPage(1); setDonorFilter(null); }}>
            مسح التصفية
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
          emptyTitle="لا توجد تبرعات مسجلة بعد"
          onRowClick={openDetail}
        />
        {!loading && !error && <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} />}
      </div>

      {formOpen && <DonationFormModal form={form} setForm={setForm} onSubmit={handleSave} onClose={() => setFormOpen(false)} saving={saving} />}
    </AppShell>
  );
}

function DonorPicker({
  value, placeholder, onSelect,
}: { value: string; placeholder: string; onSelect: (donor: DonorRef) => void }) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<DonorRef[]>([]);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setQuery(value), [value]);

  function handleChange(v: string) {
    setQuery(v);
    setOpen(true);
    if (timer.current) clearTimeout(timer.current);
    if (v.trim().length < 2) {
      setResults([]);
      return;
    }
    timer.current = setTimeout(() => {
      apiInvoke<{ rows: DonorRef[] }>('donors:list', { page: 1, pageSize: 8, search: v.trim() })
        .then((res) => setResults(res.rows))
        .catch(() => setResults([]));
    }, 300);
  }

  return (
    <div className="relative w-72">
      <TextInput
        placeholder={placeholder}
        value={query}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && results.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-gray-200 bg-white text-sm shadow-lg">
          {results.map((d) => (
            <li key={d.id}>
              <button
                type="button"
                className="block w-full px-3 py-2 text-right hover:bg-gray-50"
                onMouseDown={() => {
                  onSelect(d);
                  setQuery(d.name);
                  setOpen(false);
                }}
              >
                {d.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DonationFormModal({
  form, setForm, onSubmit, onClose, saving,
}: {
  form: DonationFormState;
  setForm: (f: DonationFormState) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
  saving: boolean;
}) {
  const { notify } = useToast();
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickName, setQuickName] = useState('');
  const [quickPhone, setQuickPhone] = useState('');
  const [quickSaving, setQuickSaving] = useState(false);

  async function handleQuickAdd(e: React.FormEvent) {
    e.preventDefault();
    setQuickSaving(true);
    try {
      const donor = await apiInvoke<DonorRef>('donors:create', { name: quickName, phone: quickPhone || undefined });
      notify('تمت إضافة المتبرع بنجاح', 'success');
      setForm({ ...form, donorId: donor.id, donorName: donor.name });
      setQuickAddOpen(false);
      setQuickName('');
      setQuickPhone('');
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'تعذر إضافة المتبرع', 'error');
    } finally {
      setQuickSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
      <div className="card max-h-[90vh] w-full max-w-2xl overflow-y-auto p-6">
        <h2 className="mb-4 text-lg font-bold">إضافة تبرع جديد</h2>
        <form onSubmit={onSubmit} className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="label">المتبرع <span className="text-red-500">*</span></label>
            <div className="flex items-center gap-2">
              <DonorPicker
                value={form.donorName}
                placeholder="ابحث عن متبرع..."
                onSelect={(donor) => setForm({ ...form, donorId: donor.id, donorName: donor.name })}
              />
              <button type="button" className="btn-secondary" onClick={() => setQuickAddOpen((o) => !o)}>
                + إضافة متبرع جديد
              </button>
            </div>
            {form.donorId && <p className="mt-1 text-xs text-brand-700">تم اختيار: {form.donorName}</p>}
            {quickAddOpen && (
              <div className="mt-3 rounded-md border border-gray-200 p-3">
                <form onSubmit={handleQuickAdd} className="grid grid-cols-2 gap-3">
                  <TextInput label="اسم المتبرع" required value={quickName} onChange={(e) => setQuickName(e.target.value)} />
                  <TextInput label="الهاتف" value={quickPhone} onChange={(e) => setQuickPhone(e.target.value)} />
                  <div className="col-span-2 flex justify-end gap-2">
                    <button type="button" className="btn-secondary" onClick={() => setQuickAddOpen(false)}>إلغاء</button>
                    <button type="submit" className="btn-primary" disabled={quickSaving}>{quickSaving ? 'جارٍ الحفظ...' : 'حفظ المتبرع'}</button>
                  </div>
                </form>
              </div>
            )}
          </div>

          <TextInput label="المبلغ (د.أ)" type="number" step="0.01" min="0" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          <Select label="نوع التبرع" options={DONATION_TYPE_OPTIONS} value={form.donationType} onChange={(e) => setForm({ ...form, donationType: e.target.value })} />
          <Select label="طريقة الدفع" placeholder="اختر" options={METHOD_OPTIONS} value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })} />
          <TextInput label="تاريخ التبرع" type="date" required value={form.donatedAt} onChange={(e) => setForm({ ...form, donatedAt: e.target.value })} />
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
