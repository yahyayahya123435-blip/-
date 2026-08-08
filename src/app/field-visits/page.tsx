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

interface FieldVisit {
  id: string;
  familyId: string;
  visitDate: string;
  purpose?: string | null;
  findings?: string | null;
  status: string;
  nextVisitAt?: string | null;
  family?: FamilyRef | null;
  user?: { fullName: string } | null;
}

const STATUS_OPTIONS = [
  { value: 'مجدولة', label: 'مجدولة' },
  { value: 'مكتملة', label: 'مكتملة' },
  { value: 'ملغاة', label: 'ملغاة' },
];

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

type FieldVisitFormState = {
  familyId: string;
  familyLabel: string;
  visitDate: string;
  purpose: string;
  findings: string;
  status: string;
  nextVisitAt: string;
};

const emptyForm: FieldVisitFormState = {
  familyId: '', familyLabel: '', visitDate: todayStr(), purpose: '', findings: '', status: 'مكتملة', nextVisitAt: '',
};

export default function FieldVisitsPage() {
  const { can } = useAuth();
  const { notify } = useToast();
  const { confirm } = useConfirm();

  const [view, setView] = useState<'list' | 'detail'>('list');
  const [rows, setRows] = useState<FieldVisit[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pageSize = 20;

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FieldVisitFormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<FieldVisit | null>(null);

  function loadList() {
    setLoading(true);
    setError(null);
    apiInvoke<{ rows: FieldVisit[]; total: number }>('fieldVisits:list', { page, pageSize })
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

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setFormOpen(true);
  }

  function openEdit(visit: FieldVisit) {
    setEditingId(visit.id);
    setForm({
      familyId: visit.familyId,
      familyLabel: visit.family ? `${visit.family.headOfFamilyName} (${visit.family.familyCode})` : '',
      visitDate: visit.visitDate ? visit.visitDate.slice(0, 10) : todayStr(),
      purpose: visit.purpose ?? '',
      findings: visit.findings ?? '',
      status: visit.status ?? 'مكتملة',
      nextVisitAt: visit.nextVisitAt ? visit.nextVisitAt.slice(0, 10) : '',
    });
    setFormOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.familyId) {
      notify('يرجى اختيار الأسرة', 'error');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        familyId: form.familyId,
        visitDate: form.visitDate || undefined,
        purpose: form.purpose || undefined,
        findings: form.findings || undefined,
        status: form.status || 'مكتملة',
        nextVisitAt: form.nextVisitAt || undefined,
      };
      if (editingId) {
        await apiInvoke('fieldVisits:update', { id: editingId, ...payload });
        notify('تم تحديث الزيارة الميدانية', 'success');
      } else {
        await apiInvoke('fieldVisits:create', payload);
        notify('تمت إضافة الزيارة الميدانية بنجاح', 'success');
      }
      setFormOpen(false);
      loadList();
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'تعذر حفظ البيانات', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(visit: FieldVisit) {
    const ok = await confirm({
      title: 'حذف الزيارة الميدانية',
      message: 'هل أنت متأكد من حذف هذه الزيارة الميدانية؟',
      danger: true,
      confirmLabel: 'حذف',
    });
    if (!ok) return;
    try {
      await apiInvoke('fieldVisits:delete', { id: visit.id });
      notify('تم حذف الزيارة الميدانية', 'success');
      loadList();
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'تعذر تنفيذ العملية', 'error');
    }
  }

  function openDetail(visit: FieldVisit) {
    setSelectedId(visit.id);
    setView('detail');
  }

  useEffect(() => {
    if (view !== 'detail' || !selectedId) return;
    apiInvoke<FieldVisit>('fieldVisits:get', { id: selectedId })
      .then(setDetail)
      .catch((e) => notify(e instanceof Error ? e.message : 'تعذر تحميل بيانات الزيارة الميدانية', 'error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, selectedId]);

  const columns: Column<FieldVisit>[] = [
    {
      key: 'family', header: 'الأسرة',
      render: (r) => (r.family ? `${r.family.headOfFamilyName} (${r.family.familyCode})` : '—'),
    },
    { key: 'visitDate', header: 'تاريخ الزيارة', render: (r) => r.visitDate.slice(0, 10) },
    { key: 'purpose', header: 'الغرض', render: (r) => r.purpose ?? '—' },
    {
      key: 'status', header: 'الحالة',
      render: (r) => (
        <span className={'rounded px-2 py-0.5 text-xs ' + (r.status === 'مكتملة' ? 'bg-brand-50 text-brand-700' : r.status === 'ملغاة' ? 'bg-red-50 text-red-600' : 'bg-gray-100 text-gray-500')}>
          {r.status}
        </span>
      ),
    },
    { key: 'nextVisitAt', header: 'الزيارة القادمة', render: (r) => (r.nextVisitAt ? r.nextVisitAt.slice(0, 10) : '—') },
  ];

  if (view === 'detail') {
    return (
      <AppShell>
        <button className="btn-secondary mb-4" onClick={() => setView('list')}>
          ← رجوع لقائمة الزيارات الميدانية
        </button>
        {!detail ? (
          <p className="text-sm text-gray-500">جارٍ التحميل...</p>
        ) : (
          <div className="space-y-6">
            <div className="card p-4">
              <div className="mb-3 flex items-center justify-between">
                <h1 className="text-lg font-bold">
                  زيارة ميدانية — {detail.family ? `${detail.family.headOfFamilyName} (${detail.family.familyCode})` : '—'}
                </h1>
                {can('field_visits', 'update') && (
                  <button className="btn-secondary" onClick={() => openEdit(detail)}>
                    تعديل
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                <div><span className="text-gray-500">تاريخ الزيارة: </span>{detail.visitDate.slice(0, 10)}</div>
                <div><span className="text-gray-500">الغرض: </span>{detail.purpose ?? '—'}</div>
                <div><span className="text-gray-500">الحالة: </span>{detail.status}</div>
                <div><span className="text-gray-500">الزيارة القادمة: </span>{detail.nextVisitAt ? detail.nextVisitAt.slice(0, 10) : '—'}</div>
                <div><span className="text-gray-500">القائم بالزيارة: </span>{detail.user?.fullName ?? '—'}</div>
              </div>
              {detail.findings && <p className="mt-3 text-sm text-gray-600">النتائج: {detail.findings}</p>}
            </div>

            <div className="flex justify-end">
              <ExportButtons
                buildSpec={() => ({
                  orgName: 'جمعية غصون زهران الخيرية',
                  title: 'تقرير الزيارة الميدانية',
                  date: new Date().toISOString().slice(0, 10),
                  columns: ['الأسرة', 'تاريخ الزيارة', 'الغرض', 'الحالة'],
                  rows: [[
                    detail.family ? `${detail.family.headOfFamilyName} (${detail.family.familyCode})` : '—',
                    detail.visitDate.slice(0, 10),
                    detail.purpose ?? '—',
                    detail.status,
                  ]],
                  notes: detail.findings ?? undefined,
                })}
              />
            </div>

            <AttachmentsPanel entityType="field_visits" entityId={detail.id} />
          </div>
        )}
        {formOpen && <FieldVisitFormModal form={form} setForm={setForm} onSubmit={handleSave} onClose={() => setFormOpen(false)} saving={saving} editing={!!editingId} />}
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">الزيارات الميدانية</h1>
        {can('field_visits', 'create') && (
          <button className="btn-primary" onClick={openCreate}>
            + إضافة زيارة ميدانية
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
          emptyTitle="لا توجد زيارات ميدانية مسجلة بعد"
          onRowClick={openDetail}
          actions={(row) => (
            <div className="flex gap-2">
              {can('field_visits', 'update') && (
                <button className="text-xs text-brand-600 hover:underline" onClick={(e) => { e.stopPropagation(); openEdit(row); }}>
                  تعديل
                </button>
              )}
              {can('field_visits', 'delete') && (
                <button className="text-xs text-red-600 hover:underline" onClick={(e) => { e.stopPropagation(); handleDelete(row); }}>
                  حذف
                </button>
              )}
            </div>
          )}
        />
        {!loading && !error && <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} />}
      </div>

      {formOpen && <FieldVisitFormModal form={form} setForm={setForm} onSubmit={handleSave} onClose={() => setFormOpen(false)} saving={saving} editing={!!editingId} />}
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

function FieldVisitFormModal({
  form, setForm, onSubmit, onClose, saving, editing,
}: {
  form: FieldVisitFormState;
  setForm: (f: FieldVisitFormState) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
  saving: boolean;
  editing: boolean;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
      <div className="card max-h-[90vh] w-full max-w-2xl overflow-y-auto p-6">
        <h2 className="mb-4 text-lg font-bold">{editing ? 'تعديل الزيارة الميدانية' : 'إضافة زيارة ميدانية جديدة'}</h2>
        <form onSubmit={onSubmit} className="grid grid-cols-2 gap-4">
          <FamilyPicker
            familyId={form.familyId}
            familyLabel={form.familyLabel}
            onPick={(id, label) => setForm({ ...form, familyId: id, familyLabel: label })}
            onClear={() => setForm({ ...form, familyId: '', familyLabel: '' })}
          />
          <TextInput label="تاريخ الزيارة" type="date" required value={form.visitDate} onChange={(e) => setForm({ ...form, visitDate: e.target.value })} />
          <Select label="الحالة" options={STATUS_OPTIONS} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} />
          <TextInput label="تاريخ الزيارة القادمة" type="date" value={form.nextVisitAt} onChange={(e) => setForm({ ...form, nextVisitAt: e.target.value })} />
          <div className="col-span-2">
            <TextInput label="الغرض من الزيارة" value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} />
          </div>
          <div className="col-span-2">
            <TextArea label="النتائج" value={form.findings} onChange={(e) => setForm({ ...form, findings: e.target.value })} />
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
