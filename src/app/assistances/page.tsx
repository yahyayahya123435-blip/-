'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { DataTable, Pagination, type Column } from '@/components/ui/DataTable';
import { TextInput, TextArea, Select, Checkbox } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { useAuth } from '@/lib/client/auth-context';
import { apiInvoke, ApiError } from '@/lib/client/api';
import { filsToDinar, dinarInputToFils } from '@/lib/client/money';
import { AttachmentsPanel } from '@/components/shared/AttachmentsPanel';
import { ExportButtons } from '@/components/shared/ExportButtons';

interface AssistanceType {
  id: string;
  name: string;
  category: string;
  isActive: boolean;
}

interface CampaignOption {
  id: string;
  name: string;
  status: string;
}

interface InventoryItemOption {
  id: string;
  name: string;
  unit: string;
  quantity: number;
}

interface BeneficiaryResult {
  id: string;
  fullName: string;
  familyId: string;
  nationalId?: string | null;
  family?: { familyCode: string; headOfFamilyName: string };
}

interface Assistance {
  id: string;
  beneficiaryId: string;
  familyId: string;
  assistanceTypeId: string;
  campaignId?: string | null;
  amountFils: number;
  inventoryItemId?: string | null;
  quantity?: number | null;
  status: string;
  disbursedAt: string;
  notes?: string | null;
  beneficiary?: { fullName: string; nationalId?: string | null };
  family?: { familyCode: string; headOfFamilyName: string };
  assistanceType?: { name: string; category: string };
  campaign?: { name: string } | null;
  inventoryItem?: { name: string; unit: string } | null;
}

const STATUS_OPTIONS = [
  { value: 'معلقة', label: 'معلقة' },
  { value: 'موافق عليها', label: 'موافق عليها' },
  { value: 'مصروفة', label: 'مصروفة' },
  { value: 'مرفوضة', label: 'مرفوضة' },
];

const TYPE_CATEGORY_OPTIONS = [
  { value: 'نقدي', label: 'نقدي' },
  { value: 'عيني', label: 'عيني' },
];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function statusBadgeClass(status: string) {
  switch (status) {
    case 'مصروفة':
      return 'bg-brand-50 text-brand-700';
    case 'موافق عليها':
      return 'bg-blue-50 text-blue-700';
    case 'معلقة':
      return 'bg-yellow-50 text-yellow-700';
    case 'مرفوضة':
      return 'bg-red-50 text-red-700';
    default:
      return 'bg-gray-100 text-gray-500';
  }
}

function formatBeneficiaryLabel(b: BeneficiaryResult): string {
  return b.family ? `${b.fullName} — ${b.family.headOfFamilyName} (${b.family.familyCode})` : b.fullName;
}

type AssistanceFormState = {
  beneficiaryId: string;
  beneficiaryLabel: string;
  familyId: string;
  assistanceTypeId: string;
  campaignId: string;
  amount: string;
  status: string;
  disbursedAt: string;
  notes: string;
  inKind: boolean;
  inventoryItemId: string;
  quantity: string;
};

const emptyForm: AssistanceFormState = {
  beneficiaryId: '', beneficiaryLabel: '', familyId: '', assistanceTypeId: '', campaignId: '',
  amount: '', status: 'مصروفة', disbursedAt: todayStr(), notes: '',
  inKind: false, inventoryItemId: '', quantity: '',
};

export default function AssistancesPage() {
  const { can } = useAuth();
  const { notify } = useToast();
  const { confirm } = useConfirm();

  const [view, setView] = useState<'list' | 'detail'>('list');
  const [rows, setRows] = useState<Assistance[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pageSize = 20;

  const [types, setTypes] = useState<AssistanceType[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItemOption[]>([]);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<AssistanceFormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Assistance | null>(null);

  function loadList() {
    setLoading(true);
    setError(null);
    apiInvoke<{ rows: Assistance[]; total: number }>('assistances:list', { page, pageSize, status: statusFilter || undefined })
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

  useEffect(() => {
    apiInvoke<AssistanceType[]>('assistanceTypes:list').then(setTypes).catch(() => undefined);
    apiInvoke<{ rows: CampaignOption[] }>('campaigns:list', { status: 'مفتوحة', pageSize: 100 })
      .then((r) => setCampaigns(r.rows))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (formOpen && form.inKind && inventoryItems.length === 0) {
      apiInvoke<{ rows: InventoryItemOption[] }>('inventoryItems:list', { pageSize: 200 })
        .then((r) => setInventoryItems(r.rows))
        .catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formOpen, form.inKind]);

  function handleTypeCreated(t: AssistanceType) {
    setTypes((prev) => [...prev, t].sort((a, b) => a.name.localeCompare(b.name)));
  }

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setFormOpen(true);
  }

  function openEdit(a: Assistance) {
    setEditingId(a.id);
    setForm({
      beneficiaryId: a.beneficiaryId,
      beneficiaryLabel: a.beneficiary
        ? (a.family ? `${a.beneficiary.fullName} — ${a.family.headOfFamilyName} (${a.family.familyCode})` : a.beneficiary.fullName)
        : '',
      familyId: a.familyId,
      assistanceTypeId: a.assistanceTypeId,
      campaignId: a.campaignId ?? '',
      amount: filsToDinar(a.amountFils),
      status: a.status,
      disbursedAt: a.disbursedAt.slice(0, 10),
      notes: a.notes ?? '',
      inKind: !!a.inventoryItemId,
      inventoryItemId: a.inventoryItemId ?? '',
      quantity: a.quantity ? String(a.quantity) : '',
    });
    setFormOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.beneficiaryId || !form.familyId) {
      notify('الرجاء اختيار المستفيد', 'error');
      return;
    }
    if (!form.assistanceTypeId) {
      notify('الرجاء اختيار نوع المساعدة', 'error');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        beneficiaryId: form.beneficiaryId,
        familyId: form.familyId,
        assistanceTypeId: form.assistanceTypeId,
        campaignId: form.campaignId || undefined,
        amountFils: form.amount ? dinarInputToFils(form.amount) : 0,
        status: form.status,
        disbursedAt: form.disbursedAt,
        notes: form.notes || undefined,
        inventoryItemId: !editingId && form.inKind && form.inventoryItemId ? form.inventoryItemId : undefined,
        quantity: !editingId && form.inKind && form.quantity ? Number(form.quantity) : undefined,
      };
      if (editingId) {
        await apiInvoke('assistances:update', { id: editingId, ...payload });
        notify('تم تحديث المساعدة', 'success');
      } else {
        await apiInvoke('assistances:create', payload);
        notify('تمت إضافة المساعدة بنجاح', 'success');
      }
      setFormOpen(false);
      if (view === 'detail' && selectedId) {
        apiInvoke<Assistance>('assistances:get', { id: selectedId }).then(setDetail).catch(() => undefined);
      } else {
        loadList();
      }
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'تعذر حفظ المساعدة', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleReject(a: Assistance) {
    const ok = await confirm({
      title: 'رفض/إلغاء المساعدة',
      message: `هل أنت متأكد من رفض أو إلغاء هذه المساعدة؟ سيتم تغيير حالتها إلى "مرفوضة".`,
      danger: true,
      confirmLabel: 'رفض/إلغاء',
    });
    if (!ok) return;
    try {
      await apiInvoke('assistances:delete', { id: a.id });
      notify('تم رفض/إلغاء المساعدة', 'success');
      if (view === 'detail' && selectedId) {
        apiInvoke<Assistance>('assistances:get', { id: selectedId }).then(setDetail).catch(() => undefined);
      } else {
        loadList();
      }
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'تعذر تنفيذ العملية', 'error');
    }
  }

  function openDetail(a: Assistance) {
    setSelectedId(a.id);
    setView('detail');
  }

  useEffect(() => {
    if (view !== 'detail' || !selectedId) return;
    setDetail(null);
    apiInvoke<Assistance>('assistances:get', { id: selectedId })
      .then(setDetail)
      .catch((e) => notify(e instanceof Error ? e.message : 'تعذر تحميل بيانات المساعدة', 'error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, selectedId]);

  const columns: Column<Assistance>[] = [
    { key: 'beneficiary', header: 'المستفيد', render: (r) => r.beneficiary?.fullName ?? '—' },
    { key: 'assistanceType', header: 'نوع المساعدة', render: (r) => r.assistanceType?.name ?? '—' },
    { key: 'amountFils', header: 'المبلغ', render: (r) => `${filsToDinar(r.amountFils)} د.أ` },
    {
      key: 'status', header: 'الحالة',
      render: (r) => (
        <span className={'rounded px-2 py-0.5 text-xs ' + statusBadgeClass(r.status)}>{r.status}</span>
      ),
    },
    { key: 'disbursedAt', header: 'التاريخ', render: (r) => new Date(r.disbursedAt).toLocaleDateString('ar-JO') },
  ];

  if (view === 'detail') {
    return (
      <AppShell>
        <button className="btn-secondary mb-4" onClick={() => setView('list')}>
          ← رجوع لقائمة المساعدات
        </button>
        {!detail ? (
          <p className="text-sm text-gray-500">جارٍ التحميل...</p>
        ) : (
          <div className="space-y-6">
            <div className="card p-4">
              <div className="mb-3 flex items-center justify-between">
                <h1 className="text-lg font-bold">مساعدة: {detail.beneficiary?.fullName}</h1>
                <div className="flex gap-2">
                  {can('assistances', 'update') && (
                    <button className="btn-secondary" onClick={() => openEdit(detail)}>
                      تعديل
                    </button>
                  )}
                  {can('assistances', 'delete') && detail.status !== 'مرفوضة' && (
                    <button className="btn-danger" onClick={() => handleReject(detail)}>
                      رفض/إلغاء
                    </button>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                <div><span className="text-gray-500">المستفيد: </span>{detail.beneficiary?.fullName ?? '—'}</div>
                <div><span className="text-gray-500">الأسرة: </span>{detail.family ? `${detail.family.headOfFamilyName} (${detail.family.familyCode})` : '—'}</div>
                <div><span className="text-gray-500">نوع المساعدة: </span>{detail.assistanceType ? `${detail.assistanceType.name} (${detail.assistanceType.category})` : '—'}</div>
                <div><span className="text-gray-500">الحملة: </span>{detail.campaign?.name ?? 'بدون حملة'}</div>
                <div><span className="text-gray-500">المبلغ: </span>{filsToDinar(detail.amountFils)} د.أ</div>
                <div><span className="text-gray-500">الحالة: </span>{detail.status}</div>
                <div><span className="text-gray-500">تاريخ الصرف: </span>{new Date(detail.disbursedAt).toLocaleDateString('ar-JO')}</div>
                {detail.inventoryItem && (
                  <div><span className="text-gray-500">صرف عيني: </span>{detail.inventoryItem.name} × {detail.quantity} {detail.inventoryItem.unit}</div>
                )}
              </div>
              {detail.notes && <p className="mt-3 text-sm text-gray-600">ملاحظات: {detail.notes}</p>}
            </div>

            <ExportButtons
              buildSpec={() => ({
                orgName: 'جمعية غصون زهران الخيرية',
                title: 'مساعدة',
                recordNumber: detail.id,
                date: new Date().toLocaleDateString('ar-JO'),
                columns: ['المستفيد', 'نوع المساعدة', 'المبلغ', 'الحالة', 'التاريخ'],
                rows: [[
                  detail.beneficiary?.fullName ?? '',
                  detail.assistanceType?.name ?? '',
                  `${filsToDinar(detail.amountFils)} د.أ`,
                  detail.status,
                  new Date(detail.disbursedAt).toLocaleDateString('ar-JO'),
                ]],
              })}
            />

            <AttachmentsPanel entityType="assistances" entityId={detail.id} />
          </div>
        )}
        {formOpen && (
          <AssistanceFormModal
            form={form}
            setForm={setForm}
            types={types}
            campaigns={campaigns}
            inventoryItems={inventoryItems}
            onSubmit={handleSave}
            onClose={() => setFormOpen(false)}
            saving={saving}
            editing={!!editingId}
            onTypeCreated={handleTypeCreated}
          />
        )}
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">المساعدات</h1>
        {can('assistances', 'create') && (
          <button className="btn-primary" onClick={openCreate}>
            + إضافة مساعدة
          </button>
        )}
      </div>

      <div className="mb-4 flex gap-2">
        <Select
          className="max-w-xs"
          placeholder="كل الحالات"
          options={STATUS_OPTIONS}
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
          emptyTitle="لا توجد مساعدات مسجلة بعد"
          onRowClick={openDetail}
          actions={(row) => (
            <div className="flex gap-2">
              {can('assistances', 'update') && (
                <button className="text-xs text-brand-600 hover:underline" onClick={(e) => { e.stopPropagation(); openEdit(row); }}>
                  تعديل
                </button>
              )}
              {can('assistances', 'delete') && row.status !== 'مرفوضة' && (
                <button className="text-xs text-red-600 hover:underline" onClick={(e) => { e.stopPropagation(); handleReject(row); }}>
                  رفض/إلغاء
                </button>
              )}
            </div>
          )}
        />
        {!loading && !error && <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} />}
      </div>

      {formOpen && (
        <AssistanceFormModal
          form={form}
          setForm={setForm}
          types={types}
          campaigns={campaigns}
          inventoryItems={inventoryItems}
          onSubmit={handleSave}
          onClose={() => setFormOpen(false)}
          saving={saving}
          editing={!!editingId}
          onTypeCreated={handleTypeCreated}
        />
      )}
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

function AssistanceTypeField({
  types, value, onChange, onCreated,
}: {
  types: AssistanceType[];
  value: string;
  onChange: (id: string) => void;
  onCreated: (t: AssistanceType) => void;
}) {
  const { notify } = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('نقدي');
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const created = await apiInvoke<AssistanceType>('assistanceTypes:create', { name: name.trim(), category });
      notify('تمت إضافة نوع المساعدة', 'success');
      onCreated(created);
      onChange(created.id);
      setOpen(false);
      setName('');
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'تعذر إضافة نوع المساعدة', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <label className="label">نوع المساعدة <span className="text-red-500">*</span></label>
      <div className="flex gap-2">
        <Select
          className="flex-1"
          options={types.map((t) => ({ value: t.id, label: `${t.name} (${t.category})` }))}
          placeholder="اختر نوع المساعدة"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required
        />
        <button type="button" className="btn-secondary px-3" onClick={() => setOpen((o) => !o)}>
          +
        </button>
      </div>
      {open && (
        <div className="mt-2 flex items-end gap-2 rounded-md border border-gray-200 p-2">
          <TextInput label="اسم النوع" value={name} onChange={(e) => setName(e.target.value)} className="flex-1" />
          <Select label="التصنيف" options={TYPE_CATEGORY_OPTIONS} value={category} onChange={(e) => setCategory(e.target.value)} />
          <button type="button" className="btn-primary" disabled={saving} onClick={handleCreate}>
            {saving ? '...' : 'إضافة'}
          </button>
        </div>
      )}
    </div>
  );
}

function AssistanceFormModal({
  form, setForm, types, campaigns, inventoryItems, onSubmit, onClose, saving, editing, onTypeCreated,
}: {
  form: AssistanceFormState;
  setForm: (f: AssistanceFormState) => void;
  types: AssistanceType[];
  campaigns: CampaignOption[];
  inventoryItems: InventoryItemOption[];
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
  saving: boolean;
  editing: boolean;
  onTypeCreated: (t: AssistanceType) => void;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
      <div className="card max-h-[90vh] w-full max-w-2xl overflow-y-auto p-6">
        <h2 className="mb-4 text-lg font-bold">{editing ? 'تعديل المساعدة' : 'إضافة مساعدة جديدة'}</h2>
        <form onSubmit={onSubmit} className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="label">المستفيد <span className="text-red-500">*</span></label>
            <BeneficiaryPicker
              beneficiaryId={form.beneficiaryId}
              beneficiaryLabel={form.beneficiaryLabel}
              onSelect={(b) => setForm({
                ...form,
                beneficiaryId: b.id,
                familyId: b.familyId,
                beneficiaryLabel: formatBeneficiaryLabel(b),
              })}
              onClear={() => setForm({ ...form, beneficiaryId: '', familyId: '', beneficiaryLabel: '' })}
            />
          </div>

          <div className="col-span-2">
            <AssistanceTypeField
              types={types}
              value={form.assistanceTypeId}
              onChange={(id) => setForm({ ...form, assistanceTypeId: id })}
              onCreated={onTypeCreated}
            />
          </div>

          <Select
            label="الحملة"
            placeholder="بدون حملة"
            options={campaigns.map((c) => ({ value: c.id, label: c.name }))}
            value={form.campaignId}
            onChange={(e) => setForm({ ...form, campaignId: e.target.value })}
          />
          <TextInput
            label="المبلغ (د.أ)"
            type="number"
            step="0.01"
            min="0"
            required
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
          />
          <Select label="الحالة" options={STATUS_OPTIONS} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} />
          <TextInput
            label="تاريخ الصرف"
            type="date"
            required
            value={form.disbursedAt}
            onChange={(e) => setForm({ ...form, disbursedAt: e.target.value })}
          />

          <div className="col-span-2">
            <Checkbox
              label="مساعدة عينية من المخزون"
              checked={form.inKind}
              disabled={editing}
              onChange={(e) => setForm({ ...form, inKind: e.target.checked, inventoryItemId: '', quantity: '' })}
            />
            {editing && form.inKind && (
              <p className="mt-1 text-xs text-gray-400">لا يمكن تعديل تفاصيل الصرف العيني بعد الإنشاء</p>
            )}
          </div>

          {form.inKind && !editing && (
            <>
              <Select
                label="الصنف"
                placeholder="اختر صنفاً"
                options={inventoryItems.map((i) => ({ value: i.id, label: `${i.name} (${i.quantity} ${i.unit} متاح)` }))}
                value={form.inventoryItemId}
                onChange={(e) => setForm({ ...form, inventoryItemId: e.target.value })}
                required
              />
              <TextInput
                label="الكمية"
                type="number"
                min="1"
                step="1"
                required
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              />
            </>
          )}

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
