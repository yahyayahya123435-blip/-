'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { DataTable, Pagination, type Column } from '@/components/ui/DataTable';
import { TextInput, Select, TextArea } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { useAuth } from '@/lib/client/auth-context';
import { apiInvoke, ApiError } from '@/lib/client/api';
import { filsToDinar, dinarInputToFils } from '@/lib/client/money';

interface Family {
  id: string;
  familyCode: string;
  headOfFamilyName: string;
  headNationalId?: string | null;
  phone?: string | null;
  city?: string | null;
  housingType?: string | null;
  monthlyIncomeFils: number;
  economicLevel?: string | null;
  notes?: string | null;
  isActive: boolean;
  _count?: { members: number; beneficiaries: number };
}

interface FamilyMember {
  id: string;
  fullName: string;
  nationalId?: string | null;
  relationship: string;
  gender: string;
  isDisabled: boolean;
  isStudent: boolean;
}

const RELATIONSHIP_OPTIONS = [
  { value: 'رب أسرة', label: 'رب أسرة' },
  { value: 'زوجة', label: 'زوجة' },
  { value: 'ابن', label: 'ابن' },
  { value: 'ابنة', label: 'ابنة' },
  { value: 'أخرى', label: 'أخرى' },
];
const GENDER_OPTIONS = [
  { value: 'ذكر', label: 'ذكر' },
  { value: 'أنثى', label: 'أنثى' },
];

type MemberFormState = {
  fullName: string;
  nationalId: string;
  relationship: string;
  gender: string;
  isDisabled: boolean;
  isStudent: boolean;
};
const emptyMemberForm: MemberFormState = {
  fullName: '', nationalId: '', relationship: '', gender: '', isDisabled: false, isStudent: false,
};

interface Beneficiary {
  id: string;
  fullName: string;
  category?: string | null;
  status: string;
}

const HOUSING_OPTIONS = [
  { value: 'ملك', label: 'ملك' },
  { value: 'إيجار', label: 'إيجار' },
  { value: 'أخرى', label: 'أخرى' },
];
const ECONOMIC_OPTIONS = [
  { value: 'فقير جداً', label: 'فقير جداً' },
  { value: 'فقير', label: 'فقير' },
  { value: 'متوسط', label: 'متوسط' },
  { value: 'ميسور', label: 'ميسور' },
];

type FamilyFormState = {
  familyCode: string;
  headOfFamilyName: string;
  headNationalId: string;
  phone: string;
  city: string;
  address: string;
  housingType: string;
  economicLevel: string;
  monthlyIncome: string;
  notes: string;
};

const emptyForm: FamilyFormState = {
  familyCode: '', headOfFamilyName: '', headNationalId: '', phone: '', city: '', address: '',
  housingType: '', economicLevel: '', monthlyIncome: '', notes: '',
};

export default function FamiliesPage() {
  const { can } = useAuth();
  const { notify } = useToast();
  const { confirm } = useConfirm();

  const [view, setView] = useState<'list' | 'detail'>('list');
  const [rows, setRows] = useState<Family[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pageSize = 20;

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FamilyFormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Family | null>(null);
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>([]);

  const [memberFormOpen, setMemberFormOpen] = useState(false);
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [memberForm, setMemberForm] = useState<MemberFormState>(emptyMemberForm);
  const [savingMember, setSavingMember] = useState(false);

  function loadList() {
    setLoading(true);
    setError(null);
    apiInvoke<{ rows: Family[]; total: number }>('families:list', { page, pageSize, search: search || undefined })
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

  function openEdit(family: Family) {
    setEditingId(family.id);
    setForm({
      familyCode: family.familyCode,
      headOfFamilyName: family.headOfFamilyName,
      headNationalId: family.headNationalId ?? '',
      phone: family.phone ?? '',
      city: family.city ?? '',
      address: '',
      housingType: family.housingType ?? '',
      economicLevel: family.economicLevel ?? '',
      monthlyIncome: family.monthlyIncomeFils ? (family.monthlyIncomeFils / 1000).toString() : '',
      notes: family.notes ?? '',
    });
    setFormOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        familyCode: form.familyCode,
        headOfFamilyName: form.headOfFamilyName,
        headNationalId: form.headNationalId || undefined,
        phone: form.phone || undefined,
        city: form.city || undefined,
        address: form.address || undefined,
        housingType: form.housingType || undefined,
        economicLevel: form.economicLevel || undefined,
        monthlyIncomeFils: form.monthlyIncome ? dinarInputToFils(form.monthlyIncome) : 0,
        notes: form.notes || undefined,
      };
      if (editingId) {
        await apiInvoke('families:update', { id: editingId, ...payload });
        notify('تم تحديث بيانات الأسرة', 'success');
      } else {
        await apiInvoke('families:create', payload);
        notify('تمت إضافة الأسرة بنجاح', 'success');
      }
      setFormOpen(false);
      loadList();
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'تعذر حفظ البيانات', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate(family: Family) {
    const ok = await confirm({
      title: 'تعطيل الأسرة',
      message: `هل أنت متأكد من تعطيل أسرة "${family.headOfFamilyName}"؟ يمكن التراجع لاحقاً من التعديل.`,
      danger: true,
      confirmLabel: 'تعطيل',
    });
    if (!ok) return;
    try {
      await apiInvoke('families:update', { id: family.id, isActive: false });
      notify('تم تعطيل الأسرة', 'success');
      loadList();
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'تعذر تنفيذ العملية', 'error');
    }
  }

  function openDetail(family: Family) {
    setSelectedId(family.id);
    setView('detail');
  }

  useEffect(() => {
    if (view !== 'detail' || !selectedId) return;
    apiInvoke<Family & { members: FamilyMember[]; beneficiaries: Beneficiary[] }>('families:get', { id: selectedId })
      .then((f) => {
        setDetail(f);
        setMembers(f.members ?? []);
        setBeneficiaries(f.beneficiaries ?? []);
      })
      .catch((e) => notify(e instanceof Error ? e.message : 'تعذر تحميل بيانات الأسرة', 'error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, selectedId]);

  function reloadMembers() {
    if (!selectedId) return;
    apiInvoke<FamilyMember[]>('familyMembers:list', { familyId: selectedId })
      .then(setMembers)
      .catch((e) => notify(e instanceof Error ? e.message : 'تعذر تحميل أفراد الأسرة', 'error'));
  }

  function openAddMember() {
    setEditingMemberId(null);
    setMemberForm(emptyMemberForm);
    setMemberFormOpen(true);
  }

  function openEditMember(member: FamilyMember) {
    setEditingMemberId(member.id);
    setMemberForm({
      fullName: member.fullName,
      nationalId: member.nationalId ?? '',
      relationship: member.relationship,
      gender: member.gender,
      isDisabled: member.isDisabled,
      isStudent: member.isStudent,
    });
    setMemberFormOpen(true);
  }

  async function handleSaveMember(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedId) return;
    setSavingMember(true);
    try {
      const payload = {
        fullName: memberForm.fullName,
        nationalId: memberForm.nationalId || undefined,
        relationship: memberForm.relationship,
        gender: memberForm.gender,
        isDisabled: memberForm.isDisabled,
        isStudent: memberForm.isStudent,
      };
      if (editingMemberId) {
        await apiInvoke('familyMembers:update', { id: editingMemberId, ...payload });
        notify('تم تحديث بيانات الفرد', 'success');
      } else {
        await apiInvoke('familyMembers:create', { familyId: selectedId, ...payload });
        notify('تمت إضافة الفرد بنجاح', 'success');
      }
      setMemberFormOpen(false);
      reloadMembers();
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'تعذر حفظ بيانات الفرد', 'error');
    } finally {
      setSavingMember(false);
    }
  }

  async function handleDeleteMember(member: FamilyMember) {
    const ok = await confirm({ title: 'حذف فرد', message: `هل تريد حذف "${member.fullName}" من أفراد الأسرة؟`, danger: true, confirmLabel: 'حذف' });
    if (!ok) return;
    try {
      await apiInvoke('familyMembers:delete', { id: member.id });
      notify('تم حذف الفرد', 'success');
      reloadMembers();
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'تعذر حذف الفرد', 'error');
    }
  }

  const columns: Column<Family>[] = [
    { key: 'familyCode', header: 'الرمز' },
    { key: 'headOfFamilyName', header: 'رب الأسرة' },
    { key: 'phone', header: 'الهاتف', render: (r) => r.phone ?? '—' },
    { key: 'city', header: 'المدينة', render: (r) => r.city ?? '—' },
    { key: 'economicLevel', header: 'المستوى الاقتصادي', render: (r) => r.economicLevel ?? '—' },
    { key: 'members', header: 'الأفراد', render: (r) => r._count?.members ?? 0 },
    { key: 'beneficiaries', header: 'المستفيدون', render: (r) => r._count?.beneficiaries ?? 0 },
    {
      key: 'isActive', header: 'الحالة',
      render: (r) => (
        <span className={'rounded px-2 py-0.5 text-xs ' + (r.isActive ? 'bg-brand-50 text-brand-700' : 'bg-gray-100 text-gray-500')}>
          {r.isActive ? 'نشطة' : 'معطلة'}
        </span>
      ),
    },
  ];

  if (view === 'detail') {
    return (
      <AppShell>
        <button className="btn-secondary mb-4" onClick={() => setView('list')}>
          ← رجوع لقائمة الأسر
        </button>
        {!detail ? (
          <p className="text-sm text-gray-500">جارٍ التحميل...</p>
        ) : (
          <div className="space-y-6">
            <div className="card p-4">
              <div className="mb-3 flex items-center justify-between">
                <h1 className="text-lg font-bold">{detail.headOfFamilyName} ({detail.familyCode})</h1>
                {can('families', 'update') && (
                  <button className="btn-secondary" onClick={() => openEdit(detail)}>
                    تعديل بيانات الأسرة
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                <div><span className="text-gray-500">الهاتف: </span>{detail.phone ?? '—'}</div>
                <div><span className="text-gray-500">المدينة: </span>{detail.city ?? '—'}</div>
                <div><span className="text-gray-500">نوع السكن: </span>{detail.housingType ?? '—'}</div>
                <div><span className="text-gray-500">المستوى الاقتصادي: </span>{detail.economicLevel ?? '—'}</div>
                <div><span className="text-gray-500">الدخل الشهري: </span>{filsToDinar(detail.monthlyIncomeFils)} د.أ</div>
              </div>
              {detail.notes && <p className="mt-3 text-sm text-gray-600">ملاحظات: {detail.notes}</p>}
            </div>

            <div className="card p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-bold">أفراد الأسرة ({members.length})</h2>
                {can('family_members', 'create') && (
                  <button className="btn-secondary" onClick={openAddMember}>
                    + إضافة فرد
                  </button>
                )}
              </div>
              {members.length === 0 ? (
                <p className="text-sm text-gray-500">لا يوجد أفراد مسجلون</p>
              ) : (
                <table className="w-full text-right text-sm">
                  <thead>
                    <tr className="border-b text-gray-500">
                      <th className="px-2 py-1">الاسم</th>
                      <th className="px-2 py-1">صلة القرابة</th>
                      <th className="px-2 py-1">الجنس</th>
                      <th className="px-2 py-1">ذوي إعاقة</th>
                      <th className="px-2 py-1">طالب</th>
                      <th className="px-2 py-1" />
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((m) => (
                      <tr key={m.id} className="border-b border-gray-50">
                        <td className="px-2 py-1">{m.fullName}</td>
                        <td className="px-2 py-1">{m.relationship}</td>
                        <td className="px-2 py-1">{m.gender}</td>
                        <td className="px-2 py-1">{m.isDisabled ? 'نعم' : '—'}</td>
                        <td className="px-2 py-1">{m.isStudent ? 'نعم' : '—'}</td>
                        <td className="px-2 py-1 text-left">
                          <div className="flex justify-end gap-2">
                            {can('family_members', 'update') && (
                              <button className="text-xs text-brand-600 hover:underline" onClick={() => openEditMember(m)}>
                                تعديل
                              </button>
                            )}
                            {can('family_members', 'delete') && (
                              <button className="text-xs text-red-600 hover:underline" onClick={() => handleDeleteMember(m)}>
                                حذف
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="card p-4">
              <h2 className="mb-3 font-bold">المستفيدون ({beneficiaries.length})</h2>
              {beneficiaries.length === 0 ? (
                <p className="text-sm text-gray-500">لا يوجد مستفيدون مسجلون</p>
              ) : (
                <table className="w-full text-right text-sm">
                  <thead><tr className="border-b text-gray-500"><th className="px-2 py-1">الاسم</th><th className="px-2 py-1">الفئة</th><th className="px-2 py-1">الحالة</th></tr></thead>
                  <tbody>
                    {beneficiaries.map((b) => (
                      <tr key={b.id} className="border-b border-gray-50">
                        <td className="px-2 py-1">{b.fullName}</td>
                        <td className="px-2 py-1">{b.category ?? '—'}</td>
                        <td className="px-2 py-1">{b.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
        {formOpen && <FamilyFormModal form={form} setForm={setForm} onSubmit={handleSave} onClose={() => setFormOpen(false)} saving={saving} editing={!!editingId} />}
        {memberFormOpen && (
          <MemberFormModal
            form={memberForm}
            setForm={setMemberForm}
            onSubmit={handleSaveMember}
            onClose={() => setMemberFormOpen(false)}
            saving={savingMember}
            editing={!!editingMemberId}
          />
        )}
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">الأسر</h1>
        {can('families', 'create') && (
          <button className="btn-primary" onClick={openCreate}>
            + إضافة أسرة
          </button>
        )}
      </div>

      <form onSubmit={handleSearchSubmit} className="mb-4 flex gap-2">
        <TextInput placeholder="ابحث بالاسم، الرمز، رقم الهوية أو الهاتف..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
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
          emptyTitle="لا توجد أسر مسجلة بعد"
          onRowClick={openDetail}
          actions={(row) => (
            <div className="flex gap-2">
              {can('families', 'update') && (
                <button className="text-xs text-brand-600 hover:underline" onClick={(e) => { e.stopPropagation(); openEdit(row); }}>
                  تعديل
                </button>
              )}
              {can('families', 'delete') && row.isActive && (
                <button className="text-xs text-red-600 hover:underline" onClick={(e) => { e.stopPropagation(); handleDeactivate(row); }}>
                  تعطيل
                </button>
              )}
            </div>
          )}
        />
        {!loading && !error && <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} />}
      </div>

      {formOpen && <FamilyFormModal form={form} setForm={setForm} onSubmit={handleSave} onClose={() => setFormOpen(false)} saving={saving} editing={!!editingId} />}
    </AppShell>
  );
}

function FamilyFormModal({
  form, setForm, onSubmit, onClose, saving, editing,
}: {
  form: FamilyFormState;
  setForm: (f: FamilyFormState) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
  saving: boolean;
  editing: boolean;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
      <div className="card max-h-[90vh] w-full max-w-2xl overflow-y-auto p-6">
        <h2 className="mb-4 text-lg font-bold">{editing ? 'تعديل بيانات الأسرة' : 'إضافة أسرة جديدة'}</h2>
        <form onSubmit={onSubmit} className="grid grid-cols-2 gap-4">
          <TextInput label="رمز الأسرة" required value={form.familyCode} onChange={(e) => setForm({ ...form, familyCode: e.target.value })} />
          <TextInput label="اسم رب الأسرة" required value={form.headOfFamilyName} onChange={(e) => setForm({ ...form, headOfFamilyName: e.target.value })} />
          <TextInput label="رقم الهوية" value={form.headNationalId} onChange={(e) => setForm({ ...form, headNationalId: e.target.value })} />
          <TextInput label="الهاتف" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <TextInput label="المدينة" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          <Select label="نوع السكن" placeholder="اختر" options={HOUSING_OPTIONS} value={form.housingType} onChange={(e) => setForm({ ...form, housingType: e.target.value })} />
          <Select label="المستوى الاقتصادي" placeholder="اختر" options={ECONOMIC_OPTIONS} value={form.economicLevel} onChange={(e) => setForm({ ...form, economicLevel: e.target.value })} />
          <TextInput label="الدخل الشهري (د.أ)" type="number" step="0.01" value={form.monthlyIncome} onChange={(e) => setForm({ ...form, monthlyIncome: e.target.value })} />
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

function MemberFormModal({
  form, setForm, onSubmit, onClose, saving, editing,
}: {
  form: MemberFormState;
  setForm: (f: MemberFormState) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
  saving: boolean;
  editing: boolean;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
      <div className="card w-full max-w-lg p-6">
        <h2 className="mb-4 text-lg font-bold">{editing ? 'تعديل بيانات الفرد' : 'إضافة فرد جديد'}</h2>
        <form onSubmit={onSubmit} className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <TextInput label="الاسم الكامل" required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
          </div>
          <TextInput label="رقم الهوية" value={form.nationalId} onChange={(e) => setForm({ ...form, nationalId: e.target.value })} />
          <Select label="صلة القرابة" required placeholder="اختر" options={RELATIONSHIP_OPTIONS} value={form.relationship} onChange={(e) => setForm({ ...form, relationship: e.target.value })} />
          <Select label="الجنس" required placeholder="اختر" options={GENDER_OPTIONS} value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })} />
          <div className="col-span-2 flex gap-6">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500" checked={form.isDisabled} onChange={(e) => setForm({ ...form, isDisabled: e.target.checked })} />
              من ذوي الإعاقة
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500" checked={form.isStudent} onChange={(e) => setForm({ ...form, isStudent: e.target.checked })} />
              طالب/طالبة
            </label>
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
