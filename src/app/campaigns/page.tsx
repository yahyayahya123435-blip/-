'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { DataTable, Pagination, type Column } from '@/components/ui/DataTable';
import { TextInput, TextArea, Select } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { useAuth } from '@/lib/client/auth-context';
import { apiInvoke, ApiError } from '@/lib/client/api';
import { filsToDinar, dinarInputToFils } from '@/lib/client/money';
import { ExportButtons } from '@/components/shared/ExportButtons';

interface Campaign {
  id: string;
  name: string;
  description?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  targetAmountFils: number;
  status: string;
  _count?: { items: number; assistances: number };
}

interface CampaignItem {
  id: string;
  campaignId: string;
  beneficiaryId: string;
  plannedAmountFils: number;
  status: string;
  beneficiary?: { fullName: string; nationalId?: string | null };
}

interface BeneficiaryResult {
  id: string;
  fullName: string;
  familyId: string;
  nationalId?: string | null;
  family?: { familyCode: string; headOfFamilyName: string };
}

const CAMPAIGN_STATUS_OPTIONS = [
  { value: 'مخطط لها', label: 'مخطط لها' },
  { value: 'مفتوحة', label: 'مفتوحة' },
  { value: 'مغلقة', label: 'مغلقة' },
];

function statusBadgeClass(status: string) {
  switch (status) {
    case 'مفتوحة':
      return 'bg-brand-50 text-brand-700';
    case 'مخطط لها':
      return 'bg-yellow-50 text-yellow-700';
    case 'مغلقة':
      return 'bg-gray-100 text-gray-500';
    default:
      return 'bg-gray-100 text-gray-500';
  }
}

function formatBeneficiaryLabel(b: BeneficiaryResult): string {
  return b.family ? `${b.fullName} — ${b.family.headOfFamilyName} (${b.family.familyCode})` : b.fullName;
}

type CampaignFormState = {
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  targetAmount: string;
  status: string;
};

const emptyForm: CampaignFormState = {
  name: '', description: '', startDate: '', endDate: '', targetAmount: '', status: 'مفتوحة',
};

export default function CampaignsPage() {
  const { can } = useAuth();
  const { notify } = useToast();
  const { confirm } = useConfirm();

  const [view, setView] = useState<'list' | 'detail'>('list');
  const [rows, setRows] = useState<Campaign[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pageSize = 20;

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CampaignFormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Campaign | null>(null);

  function loadList() {
    setLoading(true);
    setError(null);
    apiInvoke<{ rows: Campaign[]; total: number }>('campaigns:list', {
      page, pageSize, search: search || undefined, status: statusFilter || undefined,
    })
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
  }, [view, page, statusFilter]);

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

  function openEdit(c: Campaign) {
    setEditingId(c.id);
    setForm({
      name: c.name,
      description: c.description ?? '',
      startDate: c.startDate ? c.startDate.slice(0, 10) : '',
      endDate: c.endDate ? c.endDate.slice(0, 10) : '',
      targetAmount: filsToDinar(c.targetAmountFils),
      status: c.status,
    });
    setFormOpen(true);
  }

  async function refreshDetail() {
    if (!selectedId) return;
    apiInvoke<Campaign>('campaigns:get', { id: selectedId }).then(setDetail).catch(() => undefined);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        description: form.description || undefined,
        startDate: form.startDate || undefined,
        endDate: form.endDate || undefined,
        targetAmountFils: form.targetAmount ? dinarInputToFils(form.targetAmount) : 0,
        status: form.status,
      };
      if (editingId) {
        await apiInvoke('campaigns:update', { id: editingId, ...payload });
        notify('تم تحديث الحملة', 'success');
      } else {
        await apiInvoke('campaigns:create', payload);
        notify('تمت إضافة الحملة بنجاح', 'success');
      }
      setFormOpen(false);
      if (view === 'detail') {
        refreshDetail();
      } else {
        loadList();
      }
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'تعذر حفظ الحملة', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleCloseCampaign(c: Campaign) {
    const ok = await confirm({
      title: 'إغلاق الحملة',
      message: `هل أنت متأكد من إغلاق حملة "${c.name}"؟ سيتم تغيير حالتها إلى "مغلقة".`,
      danger: true,
      confirmLabel: 'إغلاق الحملة',
    });
    if (!ok) return;
    try {
      await apiInvoke('campaigns:delete', { id: c.id });
      notify('تم إغلاق الحملة', 'success');
      if (view === 'detail') {
        refreshDetail();
      } else {
        loadList();
      }
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'تعذر تنفيذ العملية', 'error');
    }
  }

  function openDetail(c: Campaign) {
    setSelectedId(c.id);
    setView('detail');
  }

  useEffect(() => {
    if (view !== 'detail' || !selectedId) return;
    setDetail(null);
    apiInvoke<Campaign>('campaigns:get', { id: selectedId })
      .then(setDetail)
      .catch((e) => notify(e instanceof Error ? e.message : 'تعذر تحميل بيانات الحملة', 'error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, selectedId]);

  const columns: Column<Campaign>[] = [
    { key: 'name', header: 'اسم الحملة' },
    {
      key: 'status', header: 'الحالة',
      render: (r) => <span className={'rounded px-2 py-0.5 text-xs ' + statusBadgeClass(r.status)}>{r.status}</span>,
    },
    { key: 'targetAmountFils', header: 'المبلغ المستهدف', render: (r) => `${filsToDinar(r.targetAmountFils)} د.أ` },
    { key: 'startDate', header: 'تاريخ البدء', render: (r) => (r.startDate ? new Date(r.startDate).toLocaleDateString('ar-JO') : '—') },
    { key: 'endDate', header: 'تاريخ الانتهاء', render: (r) => (r.endDate ? new Date(r.endDate).toLocaleDateString('ar-JO') : '—') },
    { key: 'items', header: 'البنود', render: (r) => r._count?.items ?? 0 },
    { key: 'assistances', header: 'المساعدات', render: (r) => r._count?.assistances ?? 0 },
  ];

  if (view === 'detail') {
    return (
      <AppShell>
        <button className="btn-secondary mb-4" onClick={() => setView('list')}>
          ← رجوع لقائمة الحملات
        </button>
        {!detail ? (
          <p className="text-sm text-gray-500">جارٍ التحميل...</p>
        ) : (
          <div className="space-y-6">
            <div className="card p-4">
              <div className="mb-3 flex items-center justify-between">
                <h1 className="text-lg font-bold">{detail.name}</h1>
                <div className="flex gap-2">
                  {can('campaigns', 'update') && (
                    <button className="btn-secondary" onClick={() => openEdit(detail)}>
                      تعديل
                    </button>
                  )}
                  {can('campaigns', 'delete') && detail.status !== 'مغلقة' && (
                    <button className="btn-danger" onClick={() => handleCloseCampaign(detail)}>
                      إغلاق الحملة
                    </button>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                <div><span className="text-gray-500">الحالة: </span>{detail.status}</div>
                <div><span className="text-gray-500">المبلغ المستهدف: </span>{filsToDinar(detail.targetAmountFils)} د.أ</div>
                <div><span className="text-gray-500">تاريخ البدء: </span>{detail.startDate ? new Date(detail.startDate).toLocaleDateString('ar-JO') : '—'}</div>
                <div><span className="text-gray-500">تاريخ الانتهاء: </span>{detail.endDate ? new Date(detail.endDate).toLocaleDateString('ar-JO') : '—'}</div>
              </div>
              {detail.description && <p className="mt-3 text-sm text-gray-600">{detail.description}</p>}
            </div>

            <ExportButtons
              buildSpec={() => ({
                orgName: 'جمعية غصون زهران الخيرية',
                title: 'حملة',
                recordNumber: detail.id,
                date: new Date().toLocaleDateString('ar-JO'),
                columns: ['اسم الحملة', 'الحالة', 'المبلغ المستهدف', 'تاريخ البدء', 'تاريخ الانتهاء'],
                rows: [[
                  detail.name,
                  detail.status,
                  `${filsToDinar(detail.targetAmountFils)} د.أ`,
                  detail.startDate ? new Date(detail.startDate).toLocaleDateString('ar-JO') : '—',
                  detail.endDate ? new Date(detail.endDate).toLocaleDateString('ar-JO') : '—',
                ]],
                notes: detail.description ?? undefined,
              })}
            />

            <CampaignItemsPanel campaignId={detail.id} />
          </div>
        )}
        {formOpen && <CampaignFormModal form={form} setForm={setForm} onSubmit={handleSave} onClose={() => setFormOpen(false)} saving={saving} editing={!!editingId} />}
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">الحملات</h1>
        {can('campaigns', 'create') && (
          <button className="btn-primary" onClick={openCreate}>
            + إضافة حملة
          </button>
        )}
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <form onSubmit={handleSearchSubmit} className="flex gap-2">
          <TextInput placeholder="ابحث باسم الحملة..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
          <button type="submit" className="btn-secondary">بحث</button>
        </form>
        <Select
          className="max-w-xs"
          placeholder="كل الحالات"
          options={CAMPAIGN_STATUS_OPTIONS}
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
        />
      </div>

      <div className="card">
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          loading={loading}
          error={error}
          onRetry={loadList}
          emptyTitle="لا توجد حملات مسجلة بعد"
          onRowClick={openDetail}
          actions={(row) => (
            <div className="flex gap-2">
              {can('campaigns', 'update') && (
                <button className="text-xs text-brand-600 hover:underline" onClick={(e) => { e.stopPropagation(); openEdit(row); }}>
                  تعديل
                </button>
              )}
              {can('campaigns', 'delete') && row.status !== 'مغلقة' && (
                <button className="text-xs text-red-600 hover:underline" onClick={(e) => { e.stopPropagation(); handleCloseCampaign(row); }}>
                  إغلاق الحملة
                </button>
              )}
            </div>
          )}
        />
        {!loading && !error && <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} />}
      </div>

      {formOpen && <CampaignFormModal form={form} setForm={setForm} onSubmit={handleSave} onClose={() => setFormOpen(false)} saving={saving} editing={!!editingId} />}
    </AppShell>
  );
}

function BeneficiaryPicker({
  beneficiaryId, beneficiaryLabel, onSelect, onClear,
}: {
  beneficiaryId: string;
  beneficiaryLabel: string;
  onSelect: (b: BeneficiaryResult) => void;
  onClear: () => void;
}) {
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<BeneficiaryResult[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (term.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    const timer = setTimeout(() => {
      apiInvoke<{ rows: BeneficiaryResult[] }>('beneficiaries:list', { search: term, pageSize: 8 })
        .then((res) => setResults(res.rows))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [term]);

  if (beneficiaryId) {
    return (
      <div className="flex items-center justify-between rounded-md border border-gray-300 px-3 py-2 text-sm">
        <span>{beneficiaryLabel}</span>
        <button type="button" className="text-xs text-brand-600 hover:underline" onClick={onClear}>
          تغيير
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <TextInput placeholder="ابحث بالاسم أو رقم الهوية أو الهاتف..." value={term} onChange={(e) => setTerm(e.target.value)} />
      {searching && <p className="mt-1 text-xs text-gray-400">جارٍ البحث...</p>}
      {!searching && term.trim().length >= 2 && results.length === 0 && (
        <p className="mt-1 text-xs text-gray-400">لا توجد نتائج</p>
      )}
      {results.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-gray-200 bg-white shadow-lg">
          {results.map((b) => (
            <li key={b.id}>
              <button
                type="button"
                className="block w-full px-3 py-2 text-right text-sm hover:bg-gray-50"
                onClick={() => { onSelect(b); setTerm(''); setResults([]); }}
              >
                {formatBeneficiaryLabel(b)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CampaignItemsPanel({ campaignId }: { campaignId: string }) {
  const { can } = useAuth();
  const { notify } = useToast();
  const [items, setItems] = useState<CampaignItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [beneficiaryId, setBeneficiaryId] = useState('');
  const [beneficiaryLabel, setBeneficiaryLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);

  function load() {
    setLoading(true);
    apiInvoke<CampaignItem[]>('campaignItems:list', { campaignId })
      .then(setItems)
      .catch((e) => notify(e instanceof Error ? e.message : 'تعذر تحميل بنود الحملة', 'error'))
      .finally(() => setLoading(false));
  }

  useEffect(load, [campaignId]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!beneficiaryId) {
      notify('الرجاء اختيار المستفيد', 'error');
      return;
    }
    setSaving(true);
    try {
      await apiInvoke('campaignItems:create', {
        campaignId,
        beneficiaryId,
        plannedAmountFils: amount ? dinarInputToFils(amount) : 0,
      });
      notify('تمت إضافة البند', 'success');
      setBeneficiaryId('');
      setBeneficiaryLabel('');
      setAmount('');
      setAdding(false);
      load();
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'تعذر إضافة البند', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(item: CampaignItem) {
    const nextStatus = item.status === 'تم الصرف' ? 'مخطط' : 'تم الصرف';
    try {
      await apiInvoke('campaignItems:update', { id: item.id, status: nextStatus });
      notify('تم تحديث حالة البند', 'success');
      load();
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'تعذر تحديث البند', 'error');
    }
  }

  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-bold">بنود الحملة ({items.length})</h2>
        {can('campaigns', 'create') && (
          <button className="btn-secondary" onClick={() => setAdding((a) => !a)}>
            {adding ? 'إلغاء' : '+ إضافة بند'}
          </button>
        )}
      </div>

      {adding && (
        <form onSubmit={handleAdd} className="mb-4 grid grid-cols-2 gap-3 rounded-md border border-gray-200 p-3">
          <div className="col-span-2">
            <label className="label">المستفيد <span className="text-red-500">*</span></label>
            <BeneficiaryPicker
              beneficiaryId={beneficiaryId}
              beneficiaryLabel={beneficiaryLabel}
              onSelect={(b) => { setBeneficiaryId(b.id); setBeneficiaryLabel(formatBeneficiaryLabel(b)); }}
              onClear={() => { setBeneficiaryId(''); setBeneficiaryLabel(''); }}
            />
          </div>
          <TextInput label="المبلغ المخطط (د.أ)" type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <div className="col-span-2 flex justify-end">
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'جارٍ الحفظ...' : 'إضافة البند'}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">جارٍ التحميل...</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-gray-500">لا توجد بنود مسجلة بعد</p>
      ) : (
        <table className="w-full text-right text-sm">
          <thead>
            <tr className="border-b text-gray-500">
              <th className="px-2 py-1">المستفيد</th>
              <th className="px-2 py-1">المبلغ المخطط</th>
              <th className="px-2 py-1">الحالة</th>
              {can('campaigns', 'update') && <th className="px-2 py-1" />}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-gray-50">
                <td className="px-2 py-1">{item.beneficiary?.fullName ?? '—'}</td>
                <td className="px-2 py-1">{filsToDinar(item.plannedAmountFils)} د.أ</td>
                <td className="px-2 py-1">
                  <span className={'rounded px-2 py-0.5 text-xs ' + (item.status === 'تم الصرف' ? 'bg-brand-50 text-brand-700' : 'bg-yellow-50 text-yellow-700')}>
                    {item.status}
                  </span>
                </td>
                {can('campaigns', 'update') && (
                  <td className="px-2 py-1 text-left">
                    <button className="text-xs text-brand-600 hover:underline" onClick={() => toggleStatus(item)}>
                      {item.status === 'تم الصرف' ? 'إعادة إلى مخطط' : 'تعليم كمصروف'}
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function CampaignFormModal({
  form, setForm, onSubmit, onClose, saving, editing,
}: {
  form: CampaignFormState;
  setForm: (f: CampaignFormState) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
  saving: boolean;
  editing: boolean;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
      <div className="card max-h-[90vh] w-full max-w-2xl overflow-y-auto p-6">
        <h2 className="mb-4 text-lg font-bold">{editing ? 'تعديل الحملة' : 'إضافة حملة جديدة'}</h2>
        <form onSubmit={onSubmit} className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <TextInput label="اسم الحملة" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <TextInput label="تاريخ البدء" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          <TextInput label="تاريخ الانتهاء" type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
          <TextInput label="المبلغ المستهدف (د.أ)" type="number" step="0.01" min="0" value={form.targetAmount} onChange={(e) => setForm({ ...form, targetAmount: e.target.value })} />
          <Select label="الحالة" options={CAMPAIGN_STATUS_OPTIONS} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} />
          <div className="col-span-2">
            <TextArea label="الوصف" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
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
