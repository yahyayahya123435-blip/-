'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { DataTable, Pagination, type Column } from '@/components/ui/DataTable';
import { TextInput, TextArea, Select } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { useAuth } from '@/lib/client/auth-context';
import { apiInvoke, ApiError } from '@/lib/client/api';
import { AttachmentsPanel } from '@/components/shared/AttachmentsPanel';
import { ExportButtons } from '@/components/shared/ExportButtons';

interface FamilyRef {
  familyCode: string;
  headOfFamilyName: string;
}

interface FamilyOption {
  id: string;
  familyCode: string;
  headOfFamilyName: string;
}

interface Beneficiary {
  id: string;
  familyId: string;
  fullName: string;
  nationalId?: string | null;
  phone?: string | null;
  birthDate?: string | null;
  gender?: string | null;
  category?: string | null;
  status: string;
  notes?: string | null;
  family?: FamilyRef | null;
}

interface DuplicateMatch {
  id: string;
  fullName: string;
  family?: FamilyRef | null;
}

const GENDER_OPTIONS = [
  { value: 'ذكر', label: 'ذكر' },
  { value: 'أنثى', label: 'أنثى' },
];
const CATEGORY_OPTIONS = [
  { value: 'يتيم', label: 'يتيم' },
  { value: 'مسن', label: 'مسن' },
  { value: 'مريض', label: 'مريض' },
  { value: 'ذوي إعاقة', label: 'ذوي إعاقة' },
  { value: 'أخرى', label: 'أخرى' },
];
const STATUS_OPTIONS = [
  { value: 'نشط', label: 'نشط' },
  { value: 'موقوف', label: 'موقوف' },
  { value: 'مرفوض', label: 'مرفوض' },
];

type BeneficiaryFormState = {
  familyId: string;
  familyLabel: string;
  fullName: string;
  nationalId: string;
  phone: string;
  birthDate: string;
  gender: string;
  category: string;
  status: string;
  notes: string;
};

const emptyForm: BeneficiaryFormState = {
  familyId: '', familyLabel: '', fullName: '', nationalId: '', phone: '', birthDate: '',
  gender: '', category: '', status: 'نشط', notes: '',
};

export default function BeneficiariesPage() {
  const { can } = useAuth();
  const { notify } = useToast();
  const { confirm } = useConfirm();

  const [view, setView] = useState<'list' | 'detail'>('list');
  const [rows, setRows] = useState<Beneficiary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pageSize = 20;

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<BeneficiaryFormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [duplicates, setDuplicates] = useState<DuplicateMatch[]>([]);
  const [dupChecked, setDupChecked] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Beneficiary | null>(null);

  function loadList() {
    setLoading(true);
    setError(null);
    apiInvoke<{ rows: Beneficiary[]; total: number }>('beneficiaries:list', { page, pageSize, search: search || undefined })
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
    setDuplicates([]);
    setDupChecked(false);
    setFormOpen(true);
  }

  function openEdit(beneficiary: Beneficiary) {
    setEditingId(beneficiary.id);
    setForm({
      familyId: beneficiary.familyId,
      familyLabel: beneficiary.family ? `${beneficiary.family.headOfFamilyName} (${beneficiary.family.familyCode})` : '',
      fullName: beneficiary.fullName,
      nationalId: beneficiary.nationalId ?? '',
      phone: beneficiary.phone ?? '',
      birthDate: beneficiary.birthDate ? beneficiary.birthDate.slice(0, 10) : '',
      gender: beneficiary.gender ?? '',
      category: beneficiary.category ?? '',
      status: beneficiary.status ?? 'نشط',
      notes: beneficiary.notes ?? '',
    });
    setDuplicates([]);
    setDupChecked(false);
    setFormOpen(true);
  }

  function updateForm(patch: Partial<BeneficiaryFormState>) {
    setForm((f) => ({ ...f, ...patch }));
    setDupChecked(false);
    setDuplicates([]);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.familyId) {
      notify('يرجى اختيار الأسرة', 'error');
      return;
    }
    setSaving(true);
    try {
      if (!dupChecked) {
        const dups = await apiInvoke<DuplicateMatch[]>('beneficiaries:checkDuplicates', {
          fullName: form.fullName,
          nationalId: form.nationalId || undefined,
          phone: form.phone || undefined,
          birthDate: form.birthDate || undefined,
          familyId: form.familyId,
          excludeId: editingId ?? undefined,
        });
        if (dups.length > 0) {
          setDuplicates(dups);
          setDupChecked(true);
          setSaving(false);
          return;
        }
      }
      const payload = {
        familyId: form.familyId,
        fullName: form.fullName,
        nationalId: form.nationalId || undefined,
        phone: form.phone || undefined,
        birthDate: form.birthDate || undefined,
        gender: form.gender || undefined,
        category: form.category || undefined,
        status: form.status || 'نشط',
        notes: form.notes || undefined,
      };
      if (editingId) {
        await apiInvoke('beneficiaries:update', { id: editingId, ...payload });
        notify('تم تحديث بيانات المستفيد', 'success');
      } else {
        await apiInvoke('beneficiaries:create', payload);
        notify('تمت إضافة المستفيد بنجاح', 'success');
      }
      setFormOpen(false);
      loadList();
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'تعذر حفظ البيانات', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate(beneficiary: Beneficiary) {
    const ok = await confirm({
      title: 'إيقاف المستفيد',
      message: `هل أنت متأكد من إيقاف المستفيد "${beneficiary.fullName}"؟ يمكن التراجع لاحقاً من التعديل.`,
      danger: true,
      confirmLabel: 'إيقاف',
    });
    if (!ok) return;
    try {
      await apiInvoke('beneficiaries:delete', { id: beneficiary.id });
      notify('تم إيقاف المستفيد', 'success');
      loadList();
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'تعذر تنفيذ العملية', 'error');
    }
  }

  function openDetail(beneficiary: Beneficiary) {
    setSelectedId(beneficiary.id);
    setView('detail');
  }

  useEffect(() => {
    if (view !== 'detail' || !selectedId) return;
    apiInvoke<Beneficiary>('beneficiaries:get', { id: selectedId })
      .then(setDetail)
      .catch((e) => notify(e instanceof Error ? e.message : 'تعذر تحميل بيانات المستفيد', 'error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, selectedId]);

  const columns: Column<Beneficiary>[] = [
    { key: 'fullName', header: 'الاسم' },
    { key: 'nationalId', header: 'رقم الهوية', render: (r) => r.nationalId ?? '—' },
    { key: 'phone', header: 'الهاتف', render: (r) => r.phone ?? '—' },
    { key: 'category', header: 'الفئة', render: (r) => r.category ?? '—' },
    {
      key: 'family', header: 'الأسرة',
      render: (r) => (r.family ? `${r.family.headOfFamilyName} (${r.family.familyCode})` : '—'),
    },
    {
      key: 'status', header: 'الحالة',
      render: (r) => (
        <span className={'rounded px-2 py-0.5 text-xs ' + (r.status === 'نشط' ? 'bg-brand-50 text-brand-700' : 'bg-gray-100 text-gray-500')}>
          {r.status}
        </span>
      ),
    },
  ];

  if (view === 'detail') {
    return (
      <AppShell>
        <button className="btn-secondary mb-4" onClick={() => setView('list')}>
          ← رجوع لقائمة المستفيدين
        </button>
        {!detail ? (
          <p className="text-sm text-gray-500">جارٍ التحميل...</p>
        ) : (
          <div className="space-y-6">
            <div className="card p-4">
              <div className="mb-3 flex items-center justify-between">
                <h1 className="text-lg font-bold">{detail.fullName}</h1>
                {can('beneficiaries', 'update') && (
                  <button className="btn-secondary" onClick={() => openEdit(detail)}>
                    تعديل بيانات المستفيد
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                <div><span className="text-gray-500">رقم الهوية: </span>{detail.nationalId ?? '—'}</div>
                <div><span className="text-gray-500">الهاتف: </span>{detail.phone ?? '—'}</div>
                <div><span className="text-gray-500">تاريخ الميلاد: </span>{detail.birthDate ? detail.birthDate.slice(0, 10) : '—'}</div>
                <div><span className="text-gray-500">الجنس: </span>{detail.gender ?? '—'}</div>
                <div><span className="text-gray-500">الفئة: </span>{detail.category ?? '—'}</div>
                <div><span className="text-gray-500">الحالة: </span>{detail.status}</div>
                <div><span className="text-gray-500">الأسرة: </span>{detail.family ? `${detail.family.headOfFamilyName} (${detail.family.familyCode})` : '—'}</div>
              </div>
              {detail.notes && <p className="mt-3 text-sm text-gray-600">ملاحظات: {detail.notes}</p>}
            </div>

            <div className="flex justify-end">
              <ExportButtons
                buildSpec={() => ({
                  orgName: 'جمعية غصون زهران الخيرية',
                  title: 'بيانات المستفيد',
                  recordNumber: detail.nationalId ?? undefined,
                  date: new Date().toISOString().slice(0, 10),
                  columns: ['الاسم', 'رقم الهوية', 'الفئة', 'الحالة'],
                  rows: [[detail.fullName, detail.nationalId ?? '—', detail.category ?? '—', detail.status]],
                })}
              />
            </div>

            <AttachmentsPanel entityType="beneficiaries" entityId={detail.id} />
          </div>
        )}
        {formOpen && (
          <BeneficiaryFormModal
            form={form}
            updateForm={updateForm}
            onSubmit={handleSave}
            onClose={() => setFormOpen(false)}
            saving={saving}
            editing={!!editingId}
            duplicates={duplicates}
          />
        )}
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">المستفيدون</h1>
        {can('beneficiaries', 'create') && (
          <button className="btn-primary" onClick={openCreate}>
            + إضافة مستفيد
          </button>
        )}
      </div>

      <form onSubmit={handleSearchSubmit} className="mb-4 flex gap-2">
        <TextInput placeholder="ابحث بالاسم، رقم الهوية أو الهاتف..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
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
          emptyTitle="لا يوجد مستفيدون مسجلون بعد"
          onRowClick={openDetail}
          actions={(row) => (
            <div className="flex gap-2">
              <button className="text-xs text-brand-600 hover:underline" onClick={(e) => { e.stopPropagation(); openDetail(row); }}>
                عرض
              </button>
              {can('beneficiaries', 'update') && (
                <button className="text-xs text-brand-600 hover:underline" onClick={(e) => { e.stopPropagation(); openEdit(row); }}>
                  تعديل
                </button>
              )}
              {can('beneficiaries', 'delete') && row.status !== 'موقوف' && (
                <button className="text-xs text-red-600 hover:underline" onClick={(e) => { e.stopPropagation(); handleDeactivate(row); }}>
                  إيقاف
                </button>
              )}
            </div>
          )}
        />
        {!loading && !error && <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} />}
      </div>

      {formOpen && (
        <BeneficiaryFormModal
          form={form}
          updateForm={updateForm}
          onSubmit={handleSave}
          onClose={() => setFormOpen(false)}
          saving={saving}
          editing={!!editingId}
          duplicates={duplicates}
        />
      )}
    </AppShell>
  );
}

function FamilyPicker({
  familyId, familyLabel, onPick, onClear,
}: {
  familyId: string;
  familyLabel: string;
  onPick: (id: string, label: string) => void;
  onClear: () => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FamilyOption[]>([]);
  const [searching, setSearching] = useState(false);

  async function handleSearch() {
    setSearching(true);
    try {
      const res = await apiInvoke<{ rows: FamilyOption[] }>('families:list', { page: 1, pageSize: 10, search: query || undefined });
      setResults(res.rows);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="col-span-2">
      <label className="label">
        الأسرة <span className="text-red-500">*</span>
      </label>
      {familyId ? (
        <div className="flex items-center justify-between rounded border border-gray-200 px-3 py-2 text-sm">
          <span>{familyLabel}</span>
          <button type="button" className="text-xs text-brand-600 hover:underline" onClick={onClear}>
            تغيير
          </button>
        </div>
      ) : (
        <div>
          <div className="flex gap-2">
            <TextInput
              placeholder="ابحث برمز الأسرة أو اسم رب الأسرة..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSearch(); } }}
            />
            <button type="button" className="btn-secondary" onClick={handleSearch} disabled={searching}>
              {searching ? '...' : 'بحث'}
            </button>
          </div>
          {results.length > 0 && (
            <ul className="mt-2 max-h-40 overflow-y-auto rounded border border-gray-200 text-sm">
              {results.map((f) => (
                <li key={f.id}>
                  <button
                    type="button"
                    className="block w-full px-3 py-2 text-right hover:bg-gray-50"
                    onClick={() => { onPick(f.id, `${f.headOfFamilyName} (${f.familyCode})`); setResults([]); setQuery(''); }}
                  >
                    {f.headOfFamilyName} ({f.familyCode})
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function BeneficiaryFormModal({
  form, updateForm, onSubmit, onClose, saving, editing, duplicates,
}: {
  form: BeneficiaryFormState;
  updateForm: (patch: Partial<BeneficiaryFormState>) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
  saving: boolean;
  editing: boolean;
  duplicates: DuplicateMatch[];
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
      <div className="card max-h-[90vh] w-full max-w-2xl overflow-y-auto p-6">
        <h2 className="mb-4 text-lg font-bold">{editing ? 'تعديل بيانات المستفيد' : 'إضافة مستفيد جديد'}</h2>
        <form onSubmit={onSubmit} className="grid grid-cols-2 gap-4">
          <FamilyPicker
            familyId={form.familyId}
            familyLabel={form.familyLabel}
            onPick={(id, label) => updateForm({ familyId: id, familyLabel: label })}
            onClear={() => updateForm({ familyId: '', familyLabel: '' })}
          />
          <TextInput label="الاسم الكامل" required value={form.fullName} onChange={(e) => updateForm({ fullName: e.target.value })} />
          <TextInput label="رقم الهوية" value={form.nationalId} onChange={(e) => updateForm({ nationalId: e.target.value })} />
          <TextInput label="الهاتف" value={form.phone} onChange={(e) => updateForm({ phone: e.target.value })} />
          <TextInput label="تاريخ الميلاد" type="date" value={form.birthDate} onChange={(e) => updateForm({ birthDate: e.target.value })} />
          <Select label="الجنس" placeholder="اختر" options={GENDER_OPTIONS} value={form.gender} onChange={(e) => updateForm({ gender: e.target.value })} />
          <Select label="الفئة" placeholder="اختر" options={CATEGORY_OPTIONS} value={form.category} onChange={(e) => updateForm({ category: e.target.value })} />
          <Select label="الحالة" options={STATUS_OPTIONS} value={form.status} onChange={(e) => updateForm({ status: e.target.value })} />
          <div className="col-span-2">
            <TextArea label="ملاحظات" value={form.notes} onChange={(e) => updateForm({ notes: e.target.value })} />
          </div>

          {duplicates.length > 0 && (
            <div className="col-span-2 rounded border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-800">
              <p className="mb-1 font-medium">قد يكون هذا المستفيد مكرراً:</p>
              <ul className="list-disc pr-4">
                {duplicates.map((d) => (
                  <li key={d.id}>
                    {d.fullName} — أسرة {d.family?.headOfFamilyName ?? '—'} ({d.family?.familyCode ?? '—'})
                  </li>
                ))}
              </ul>
              <p className="mt-1">اضغط &quot;حفظ رغم ذلك&quot; للمتابعة، أو راجع البيانات أعلاه وعدّلها.</p>
            </div>
          )}

          <div className="col-span-2 flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={onClose}>إلغاء</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'جارٍ الحفظ...' : duplicates.length > 0 ? 'حفظ رغم ذلك' : 'حفظ'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
