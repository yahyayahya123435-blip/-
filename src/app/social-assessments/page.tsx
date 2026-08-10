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
import { dinarInputToFils } from '@/lib/client/money';

/** Optional integer field: blank stays blank rather than becoming 0. */
function textToNum(text: string): number | undefined {
  const trimmed = text.trim();
  if (trimmed === '') return undefined;
  const value = Number(trimmed);
  return Number.isInteger(value) && value >= 0 ? value : undefined;
}

function numToText(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value);
}

interface FamilyRef {
  familyCode: string;
  headOfFamilyName: string;
}

interface FamilyOption {
  id: string;
  familyCode: string;
  headOfFamilyName: string;
}

interface BeneficiaryOption {
  id: string;
  fullName: string;
}

interface Assessment {
  id: string;
  familyId: string;
  beneficiaryId?: string | null;
  assessmentDate: string;
  monthlyIncomeFils?: number;
  monthlyExpensesFils?: number;
  economicLevel?: string | null;
  housingCondition?: string | null;
  housingOwnership?: string | null;
  roomsCount?: number | null;
  healthCondition?: string | null;
  chronicDiseases?: string | null;
  disabilities?: string | null;
  childrenCount?: number | null;
  orphansCount?: number | null;
  studentsCount?: number | null;
  unemployedCount?: number | null;
  financialObligations?: string | null;
  basicNeeds?: string | null;
  needLevel?: string | null;
  educationLevel?: string | null;
  recommendation?: string | null;
  score?: number | null;
  notes?: string | null;
  family?: FamilyRef | null;
  beneficiary?: { fullName: string } | null;
}

const ECONOMIC_OPTIONS = [
  { value: 'فقير جداً', label: 'فقير جداً' },
  { value: 'فقير', label: 'فقير' },
  { value: 'متوسط', label: 'متوسط' },
  { value: 'ميسور', label: 'ميسور' },
];

const OWNERSHIP_OPTIONS = [
  { value: 'ملك', label: 'ملك' },
  { value: 'إيجار', label: 'إيجار' },
  { value: 'أخرى', label: 'أخرى' },
];
const NEED_LEVEL_OPTIONS = [
  { value: 'شديد الحاجة', label: 'شديد الحاجة' },
  { value: 'متوسط الحاجة', label: 'متوسط الحاجة' },
  { value: 'قليل الحاجة', label: 'قليل الحاجة' },
];

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

type AssessmentFormState = {
  familyId: string;
  familyLabel: string;
  beneficiaryId: string;
  assessmentDate: string;
  monthlyIncome: string;
  monthlyExpenses: string;
  economicLevel: string;
  housingCondition: string;
  housingOwnership: string;
  roomsCount: string;
  healthCondition: string;
  chronicDiseases: string;
  disabilities: string;
  childrenCount: string;
  orphansCount: string;
  studentsCount: string;
  unemployedCount: string;
  financialObligations: string;
  basicNeeds: string;
  needLevel: string;
  educationLevel: string;
  recommendation: string;
  score: string;
  notes: string;
};

const emptyForm: AssessmentFormState = {
  familyId: '', familyLabel: '', beneficiaryId: '', assessmentDate: todayStr(),
  monthlyIncome: '', monthlyExpenses: '', economicLevel: '',
  housingCondition: '', housingOwnership: '', roomsCount: '',
  healthCondition: '', chronicDiseases: '', disabilities: '',
  childrenCount: '', orphansCount: '', studentsCount: '', unemployedCount: '',
  financialObligations: '', basicNeeds: '', needLevel: '',
  educationLevel: '', recommendation: '', score: '', notes: '',
};

export default function SocialAssessmentsPage() {
  const { can } = useAuth();
  const { notify } = useToast();
  const { confirm } = useConfirm();

  const [view, setView] = useState<'list' | 'detail'>('list');
  const [rows, setRows] = useState<Assessment[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pageSize = 20;

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<AssessmentFormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Assessment | null>(null);

  function loadList() {
    setLoading(true);
    setError(null);
    apiInvoke<{ rows: Assessment[]; total: number }>('socialAssessments:list', { page, pageSize })
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

  function openEdit(assessment: Assessment) {
    setEditingId(assessment.id);
    setForm({
      familyId: assessment.familyId,
      familyLabel: assessment.family ? `${assessment.family.headOfFamilyName} (${assessment.family.familyCode})` : '',
      beneficiaryId: assessment.beneficiaryId ?? '',
      assessmentDate: assessment.assessmentDate ? assessment.assessmentDate.slice(0, 10) : todayStr(),
      monthlyIncome: assessment.monthlyIncomeFils ? (assessment.monthlyIncomeFils / 1000).toString() : '',
      monthlyExpenses: assessment.monthlyExpensesFils ? (assessment.monthlyExpensesFils / 1000).toString() : '',
      economicLevel: assessment.economicLevel ?? '',
      housingCondition: assessment.housingCondition ?? '',
      housingOwnership: assessment.housingOwnership ?? '',
      roomsCount: numToText(assessment.roomsCount),
      healthCondition: assessment.healthCondition ?? '',
      chronicDiseases: assessment.chronicDiseases ?? '',
      disabilities: assessment.disabilities ?? '',
      childrenCount: numToText(assessment.childrenCount),
      orphansCount: numToText(assessment.orphansCount),
      studentsCount: numToText(assessment.studentsCount),
      unemployedCount: numToText(assessment.unemployedCount),
      financialObligations: assessment.financialObligations ?? '',
      basicNeeds: assessment.basicNeeds ?? '',
      needLevel: assessment.needLevel ?? '',
      educationLevel: assessment.educationLevel ?? '',
      recommendation: assessment.recommendation ?? '',
      score: assessment.score !== null && assessment.score !== undefined ? String(assessment.score) : '',
      notes: assessment.notes ?? '',
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
        beneficiaryId: form.beneficiaryId || undefined,
        assessmentDate: form.assessmentDate || undefined,
        monthlyIncomeFils: form.monthlyIncome ? dinarInputToFils(form.monthlyIncome) : 0,
        monthlyExpensesFils: form.monthlyExpenses ? dinarInputToFils(form.monthlyExpenses) : 0,
        economicLevel: form.economicLevel || undefined,
        housingCondition: form.housingCondition || undefined,
        housingOwnership: form.housingOwnership || undefined,
        roomsCount: textToNum(form.roomsCount),
        healthCondition: form.healthCondition || undefined,
        chronicDiseases: form.chronicDiseases || undefined,
        disabilities: form.disabilities || undefined,
        childrenCount: textToNum(form.childrenCount),
        orphansCount: textToNum(form.orphansCount),
        studentsCount: textToNum(form.studentsCount),
        unemployedCount: textToNum(form.unemployedCount),
        financialObligations: form.financialObligations || undefined,
        basicNeeds: form.basicNeeds || undefined,
        needLevel: form.needLevel || undefined,
        educationLevel: form.educationLevel || undefined,
        recommendation: form.recommendation || undefined,
        score: form.score ? Number(form.score) : undefined,
        notes: form.notes || undefined,
      };
      if (editingId) {
        await apiInvoke('socialAssessments:update', { id: editingId, ...payload });
        notify('تم تحديث البحث الاجتماعي', 'success');
      } else {
        await apiInvoke('socialAssessments:create', payload);
        notify('تمت إضافة البحث الاجتماعي بنجاح', 'success');
      }
      setFormOpen(false);
      loadList();
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'تعذر حفظ البيانات', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(assessment: Assessment) {
    const ok = await confirm({
      title: 'حذف البحث الاجتماعي',
      message: `هل أنت متأكد من حذف هذا البحث الاجتماعي؟`,
      danger: true,
      confirmLabel: 'حذف',
    });
    if (!ok) return;
    try {
      await apiInvoke('socialAssessments:delete', { id: assessment.id });
      notify('تم حذف البحث الاجتماعي', 'success');
      loadList();
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'تعذر تنفيذ العملية', 'error');
    }
  }

  function openDetail(assessment: Assessment) {
    setSelectedId(assessment.id);
    setView('detail');
  }

  useEffect(() => {
    if (view !== 'detail' || !selectedId) return;
    apiInvoke<Assessment>('socialAssessments:get', { id: selectedId })
      .then(setDetail)
      .catch((e) => notify(e instanceof Error ? e.message : 'تعذر تحميل بيانات البحث الاجتماعي', 'error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, selectedId]);

  const columns: Column<Assessment>[] = [
    {
      key: 'family', header: 'الأسرة',
      render: (r) => (r.family ? `${r.family.headOfFamilyName} (${r.family.familyCode})` : '—'),
    },
    { key: 'assessmentDate', header: 'التاريخ', render: (r) => r.assessmentDate.slice(0, 10) },
    { key: 'economicLevel', header: 'المستوى الاقتصادي', render: (r) => r.economicLevel ?? '—' },
    { key: 'score', header: 'الدرجة', render: (r) => (r.score ?? '—') },
  ];

  if (view === 'detail') {
    return (
      <AppShell>
        <button className="btn-secondary mb-4" onClick={() => setView('list')}>
          ← رجوع لقائمة البحوث الاجتماعية
        </button>
        {!detail ? (
          <p className="text-sm text-gray-500">جارٍ التحميل...</p>
        ) : (
          <div className="space-y-6">
            <div className="card p-4">
              <div className="mb-3 flex items-center justify-between">
                <h1 className="text-lg font-bold">
                  بحث اجتماعي — {detail.family ? `${detail.family.headOfFamilyName} (${detail.family.familyCode})` : '—'}
                </h1>
                {can('social_assessments', 'update') && (
                  <button className="btn-secondary" onClick={() => openEdit(detail)}>
                    تعديل
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                <div><span className="text-gray-500">التاريخ: </span>{detail.assessmentDate.slice(0, 10)}</div>
                <div><span className="text-gray-500">المستفيد: </span>{detail.beneficiary?.fullName ?? '—'}</div>
                <div><span className="text-gray-500">المستوى الاقتصادي: </span>{detail.economicLevel ?? '—'}</div>
                <div><span className="text-gray-500">الدرجة: </span>{detail.score ?? '—'}</div>
                <div><span className="text-gray-500">حالة السكن: </span>{detail.housingCondition ?? '—'}</div>
                <div><span className="text-gray-500">الحالة الصحية: </span>{detail.healthCondition ?? '—'}</div>
                <div><span className="text-gray-500">المستوى التعليمي: </span>{detail.educationLevel ?? '—'}</div>
              </div>
              {detail.recommendation && <p className="mt-3 text-sm text-gray-600">التوصية: {detail.recommendation}</p>}
              {detail.notes && <p className="mt-3 text-sm text-gray-600">ملاحظات: {detail.notes}</p>}
            </div>

            <div className="flex justify-end">
              <ExportButtons
                buildSpec={() => ({
                  orgName: 'جمعية غصون زهران الخيرية',
                  title: 'تقرير البحث الاجتماعي',
                  date: new Date().toISOString().slice(0, 10),
                  columns: ['الأسرة', 'التاريخ', 'المستوى الاقتصادي', 'الدرجة'],
                  rows: [[
                    detail.family ? `${detail.family.headOfFamilyName} (${detail.family.familyCode})` : '—',
                    detail.assessmentDate.slice(0, 10),
                    detail.economicLevel ?? '—',
                    detail.score ?? '—',
                  ]],
                  notes: detail.recommendation ?? undefined,
                })}
              />
            </div>

            <AttachmentsPanel entityType="social_assessments" entityId={detail.id} />
          </div>
        )}
        {formOpen && <AssessmentFormModal form={form} setForm={setForm} onSubmit={handleSave} onClose={() => setFormOpen(false)} saving={saving} editing={!!editingId} />}
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">البحث الاجتماعي</h1>
        {can('social_assessments', 'create') && (
          <button className="btn-primary" onClick={openCreate}>
            + إضافة بحث اجتماعي
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
          emptyTitle="لا توجد بحوث اجتماعية مسجلة بعد"
          onRowClick={openDetail}
          actions={(row) => (
            <div className="flex gap-2">
              {can('social_assessments', 'update') && (
                <button className="text-xs text-brand-600 hover:underline" onClick={(e) => { e.stopPropagation(); openEdit(row); }}>
                  تعديل
                </button>
              )}
              {can('social_assessments', 'delete') && (
                <button className="text-xs text-red-600 hover:underline" onClick={(e) => { e.stopPropagation(); handleDelete(row); }}>
                  حذف
                </button>
              )}
            </div>
          )}
        />
        {!loading && !error && <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} />}
      </div>

      {formOpen && <AssessmentFormModal form={form} setForm={setForm} onSubmit={handleSave} onClose={() => setFormOpen(false)} saving={saving} editing={!!editingId} />}
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

function AssessmentFormModal({
  form, setForm, onSubmit, onClose, saving, editing,
}: {
  form: AssessmentFormState;
  setForm: (f: AssessmentFormState) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
  saving: boolean;
  editing: boolean;
}) {
  const [beneficiaryOptions, setBeneficiaryOptions] = useState<BeneficiaryOption[]>([]);

  useEffect(() => {
    if (!form.familyId) {
      setBeneficiaryOptions([]);
      return;
    }
    apiInvoke<{ rows: BeneficiaryOption[] }>('beneficiaries:list', { familyId: form.familyId, page: 1, pageSize: 50 })
      .then((res) => setBeneficiaryOptions(res.rows))
      .catch(() => setBeneficiaryOptions([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.familyId]);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
      <div className="card max-h-[90vh] w-full max-w-2xl overflow-y-auto p-6">
        <h2 className="mb-4 text-lg font-bold">{editing ? 'تعديل البحث الاجتماعي' : 'إضافة بحث اجتماعي جديد'}</h2>
        <form onSubmit={onSubmit} className="grid grid-cols-2 gap-4">
          <FamilyPicker
            familyId={form.familyId}
            familyLabel={form.familyLabel}
            onPick={(id, label) => setForm({ ...form, familyId: id, familyLabel: label, beneficiaryId: '' })}
            onClear={() => setForm({ ...form, familyId: '', familyLabel: '', beneficiaryId: '' })}
          />
          <Select
            label="المستفيد (اختياري)"
            placeholder="بدون"
            options={beneficiaryOptions.map((b) => ({ value: b.id, label: b.fullName }))}
            value={form.beneficiaryId}
            onChange={(e) => setForm({ ...form, beneficiaryId: e.target.value })}
            disabled={!form.familyId}
          />
          <TextInput label="تاريخ البحث" type="date" required value={form.assessmentDate} onChange={(e) => setForm({ ...form, assessmentDate: e.target.value })} />
          <TextInput label="الدخل الشهري (د.أ)" type="number" step="0.01" value={form.monthlyIncome} onChange={(e) => setForm({ ...form, monthlyIncome: e.target.value })} />
          <TextInput label="المصاريف الشهرية (د.أ)" type="number" step="0.01" value={form.monthlyExpenses} onChange={(e) => setForm({ ...form, monthlyExpenses: e.target.value })} />
          <Select label="المستوى الاقتصادي" placeholder="اختر" options={ECONOMIC_OPTIONS} value={form.economicLevel} onChange={(e) => setForm({ ...form, economicLevel: e.target.value })} />
          <Select label="ملكية السكن" placeholder="اختر" options={OWNERSHIP_OPTIONS} value={form.housingOwnership} onChange={(e) => setForm({ ...form, housingOwnership: e.target.value })} />
          <TextInput label="وضع السكن" value={form.housingCondition} onChange={(e) => setForm({ ...form, housingCondition: e.target.value })} />
          <TextInput label="عدد الغرف" type="number" min={0} value={form.roomsCount} onChange={(e) => setForm({ ...form, roomsCount: e.target.value })} />
          <TextInput label="الحالة الصحية" value={form.healthCondition} onChange={(e) => setForm({ ...form, healthCondition: e.target.value })} />
          <TextInput label="الأمراض المزمنة" value={form.chronicDiseases} onChange={(e) => setForm({ ...form, chronicDiseases: e.target.value })} />
          <TextInput label="الإعاقات" value={form.disabilities} onChange={(e) => setForm({ ...form, disabilities: e.target.value })} />
          <TextInput label="عدد الأطفال" type="number" min={0} value={form.childrenCount} onChange={(e) => setForm({ ...form, childrenCount: e.target.value })} />
          <TextInput label="عدد الأيتام" type="number" min={0} value={form.orphansCount} onChange={(e) => setForm({ ...form, orphansCount: e.target.value })} />
          <TextInput label="عدد الطلاب" type="number" min={0} value={form.studentsCount} onChange={(e) => setForm({ ...form, studentsCount: e.target.value })} />
          <TextInput label="عدد العاطلين عن العمل" type="number" min={0} value={form.unemployedCount} onChange={(e) => setForm({ ...form, unemployedCount: e.target.value })} />
          <Select label="درجة الاحتياج" placeholder="اختر" options={NEED_LEVEL_OPTIONS} value={form.needLevel} onChange={(e) => setForm({ ...form, needLevel: e.target.value })} />
          <TextInput label="المستوى التعليمي" value={form.educationLevel} onChange={(e) => setForm({ ...form, educationLevel: e.target.value })} />
          <TextInput label="الدرجة (0-100)" type="number" min={0} max={100} value={form.score} onChange={(e) => setForm({ ...form, score: e.target.value })} />
          <div className="col-span-2">
            <TextArea label="الالتزامات المالية" value={form.financialObligations} onChange={(e) => setForm({ ...form, financialObligations: e.target.value })} />
          </div>
          <div className="col-span-2">
            <TextArea label="الاحتياجات الأساسية" value={form.basicNeeds} onChange={(e) => setForm({ ...form, basicNeeds: e.target.value })} />
          </div>
          <div className="col-span-2">
            <TextArea label="توصية الباحث" value={form.recommendation} onChange={(e) => setForm({ ...form, recommendation: e.target.value })} />
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
