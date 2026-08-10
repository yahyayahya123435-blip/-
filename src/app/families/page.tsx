'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
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
  wifeName?: string | null;
  headNationalId?: string | null;
  familyBookMembersCount?: number | null;
  phone?: string | null;
  altPhone?: string | null;
  city?: string | null;
  regionId?: string | null;
  region?: { id: string; name: string } | null;
  neighborhood?: string | null;
  address?: string | null;
  maritalStatus?: string | null;
  housingType?: string | null;
  incomeSource?: string | null;
  monthlyIncomeFils: number;
  monthlyExpensesFils?: number;
  healthStatus?: string | null;
  needLevel?: string | null;
  economicLevel?: string | null;
  fileStatus?: string | null;
  registeredAt?: string | null;
  sourceSystem?: string | null;
  legacySourceRefs?: string | null;
  legacyOccurrences?: number | null;
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
  birthDate?: string | null;
  age?: number | null;
  maritalStatus?: string | null;
  educationLevel?: string | null;
  isDisabled: boolean;
  disabilityType?: string | null;
  isOrphan: boolean;
  isStudent: boolean;
  occupation?: string | null;
  healthStatus?: string | null;
}

interface Region {
  id: string;
  name: string;
}

interface DuplicateFamily {
  id: string;
  familyCode: string;
  headOfFamilyName: string;
  wifeName?: string | null;
  headNationalId?: string | null;
  phone?: string | null;
  city?: string | null;
  strong: boolean;
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
  birthDate: string;
  maritalStatus: string;
  educationLevel: string;
  occupation: string;
  healthStatus: string;
  disabilityType: string;
  isDisabled: boolean;
  isOrphan: boolean;
  isStudent: boolean;
};
const emptyMemberForm: MemberFormState = {
  fullName: '', nationalId: '', relationship: '', gender: '', birthDate: '', maritalStatus: '',
  educationLevel: '', occupation: '', healthStatus: '', disabilityType: '',
  isDisabled: false, isOrphan: false, isStudent: false,
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
const NEED_LEVEL_OPTIONS = [
  { value: 'شديد الحاجة', label: 'شديد الحاجة' },
  { value: 'متوسط الحاجة', label: 'متوسط الحاجة' },
  { value: 'قليل الحاجة', label: 'قليل الحاجة' },
];
const MARITAL_OPTIONS = [
  { value: 'أعزب', label: 'أعزب' },
  { value: 'متزوج', label: 'متزوج' },
  { value: 'مطلق', label: 'مطلق' },
  { value: 'أرمل', label: 'أرمل' },
];
const FILE_STATUS_OPTIONS = [
  { value: 'نشط', label: 'نشط' },
  { value: 'موقوف', label: 'موقوف' },
  { value: 'مؤرشف', label: 'مؤرشف' },
];

type FamilyFormState = {
  familyCode: string;
  headOfFamilyName: string;
  wifeName: string;
  headNationalId: string;
  familyBookMembersCount: string;
  phone: string;
  altPhone: string;
  city: string;
  regionId: string;
  neighborhood: string;
  address: string;
  maritalStatus: string;
  housingType: string;
  incomeSource: string;
  economicLevel: string;
  needLevel: string;
  fileStatus: string;
  healthStatus: string;
  monthlyIncome: string;
  monthlyExpenses: string;
  notes: string;
};

const emptyForm: FamilyFormState = {
  familyCode: '', headOfFamilyName: '', wifeName: '', headNationalId: '', familyBookMembersCount: '',
  phone: '', altPhone: '', city: '', regionId: '', neighborhood: '', address: '',
  maritalStatus: '', housingType: '', incomeSource: '', economicLevel: '', needLevel: '',
  fileStatus: 'نشط', healthStatus: '', monthlyIncome: '', monthlyExpenses: '', notes: '',
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
  const [incompleteOnly, setIncompleteOnly] = useState(false);
  const [regionFilter, setRegionFilter] = useState('');
  const [regions, setRegions] = useState<Region[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pageSize = 20;

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FamilyFormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [duplicates, setDuplicates] = useState<DuplicateFamily[]>([]);

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
    apiInvoke<{ rows: Family[]; total: number }>('families:list', {
      page,
      pageSize,
      search: search || undefined,
      incompleteOnly: incompleteOnly || undefined,
      regionId: regionFilter || undefined,
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
  }, [view, page, incompleteOnly, regionFilter]);

  useEffect(() => {
    apiInvoke<Region[]>('regions:list').then(setRegions).catch(() => setRegions([]));
  }, []);

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    loadList();
  }

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setDuplicates([]);
    setFormOpen(true);
  }

  function openEdit(family: Family) {
    setEditingId(family.id);
    setForm({
      familyCode: family.familyCode,
      headOfFamilyName: family.headOfFamilyName,
      wifeName: family.wifeName ?? '',
      headNationalId: family.headNationalId ?? '',
      familyBookMembersCount:
        family.familyBookMembersCount === null || family.familyBookMembersCount === undefined
          ? ''
          : String(family.familyBookMembersCount),
      phone: family.phone ?? '',
      altPhone: family.altPhone ?? '',
      city: family.city ?? '',
      regionId: family.regionId ?? '',
      neighborhood: family.neighborhood ?? '',
      address: family.address ?? '',
      maritalStatus: family.maritalStatus ?? '',
      housingType: family.housingType ?? '',
      incomeSource: family.incomeSource ?? '',
      economicLevel: family.economicLevel ?? '',
      needLevel: family.needLevel ?? '',
      fileStatus: family.fileStatus ?? 'نشط',
      healthStatus: family.healthStatus ?? '',
      monthlyIncome: family.monthlyIncomeFils ? (family.monthlyIncomeFils / 1000).toString() : '',
      monthlyExpenses: family.monthlyExpensesFils ? (family.monthlyExpensesFils / 1000).toString() : '',
      notes: family.notes ?? '',
    });
    setDuplicates([]);
    setFormOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();

    // Warn about possible duplicates once, then let a second submit through:
    // legitimate repeats (two families with the same common name) must not be
    // blocked outright, and nothing is ever merged without the user saying so.
    if (duplicates.length === 0) {
      try {
        const found = await apiInvoke<DuplicateFamily[]>('families:checkDuplicates', {
          headOfFamilyName: form.headOfFamilyName,
          headNationalId: form.headNationalId || undefined,
          phone: form.phone || undefined,
          excludeId: editingId || undefined,
        });
        if (found.length > 0) {
          setDuplicates(found);
          return;
        }
      } catch {
        // A failed duplicate lookup must never block saving the record.
      }
    }

    setSaving(true);
    try {
      const bookCount = form.familyBookMembersCount.trim();
      const payload = {
        familyCode: form.familyCode,
        headOfFamilyName: form.headOfFamilyName,
        wifeName: form.wifeName || undefined,
        headNationalId: form.headNationalId || undefined,
        familyBookMembersCount: bookCount === '' ? undefined : Number(bookCount),
        phone: form.phone || undefined,
        altPhone: form.altPhone || undefined,
        city: form.city || undefined,
        regionId: form.regionId || undefined,
        neighborhood: form.neighborhood || undefined,
        address: form.address || undefined,
        maritalStatus: form.maritalStatus || undefined,
        housingType: form.housingType || undefined,
        incomeSource: form.incomeSource || undefined,
        economicLevel: form.economicLevel || undefined,
        needLevel: form.needLevel || undefined,
        fileStatus: form.fileStatus || 'نشط',
        healthStatus: form.healthStatus || undefined,
        monthlyIncomeFils: form.monthlyIncome ? dinarInputToFils(form.monthlyIncome) : 0,
        monthlyExpensesFils: form.monthlyExpenses ? dinarInputToFils(form.monthlyExpenses) : 0,
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
      setDuplicates([]);
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
      birthDate: member.birthDate ? member.birthDate.slice(0, 10) : '',
      maritalStatus: member.maritalStatus ?? '',
      educationLevel: member.educationLevel ?? '',
      occupation: member.occupation ?? '',
      healthStatus: member.healthStatus ?? '',
      disabilityType: member.disabilityType ?? '',
      isDisabled: member.isDisabled,
      isOrphan: member.isOrphan,
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
        birthDate: memberForm.birthDate || undefined,
        maritalStatus: memberForm.maritalStatus || undefined,
        educationLevel: memberForm.educationLevel || undefined,
        occupation: memberForm.occupation || undefined,
        healthStatus: memberForm.healthStatus || undefined,
        disabilityType: memberForm.disabilityType || undefined,
        isDisabled: memberForm.isDisabled,
        isOrphan: memberForm.isOrphan,
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
    { key: 'wifeName', header: 'اسم الزوجة', render: (r) => r.wifeName ?? '—' },
    { key: 'phone', header: 'الهاتف', render: (r) => r.phone ?? '—' },
    { key: 'region', header: 'المنطقة', render: (r) => r.region?.name ?? r.city ?? '—' },
    { key: 'needLevel', header: 'درجة الاحتياج', render: (r) => r.needLevel ?? '—' },
    { key: 'members', header: 'الأفراد', render: (r) => r._count?.members ?? 0 },
    { key: 'beneficiaries', header: 'المستفيدون', render: (r) => r._count?.beneficiaries ?? 0 },
    {
      key: 'completeness',
      header: 'اكتمال البيانات',
      render: (r) =>
        !r.headNationalId || r.familyBookMembersCount === null || r.familyBookMembersCount === undefined ? (
          <span className="rounded bg-amber-50 px-2 py-0.5 text-xs text-amber-700">بيانات ناقصة</span>
        ) : (
          <span className="rounded bg-green-50 px-2 py-0.5 text-xs text-green-700">مكتملة</span>
        ),
    },
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
                <div><span className="text-gray-500">اسم الزوجة: </span>{detail.wifeName ?? '—'}</div>
                <div><span className="text-gray-500">الرقم الوطني: </span>{detail.headNationalId ?? '—'}</div>
                <div><span className="text-gray-500">أفراد دفتر العائلة: </span>{detail.familyBookMembersCount ?? '—'}</div>
                <div><span className="text-gray-500">الهاتف: </span>{detail.phone ?? '—'}</div>
                <div><span className="text-gray-500">المنطقة: </span>{detail.region?.name ?? '—'}</div>
                <div><span className="text-gray-500">الحي: </span>{detail.neighborhood ?? '—'}</div>
                <div><span className="text-gray-500">المدينة: </span>{detail.city ?? '—'}</div>
                <div><span className="text-gray-500">العنوان: </span>{detail.address ?? '—'}</div>
                <div><span className="text-gray-500">الحالة الاجتماعية: </span>{detail.maritalStatus ?? '—'}</div>
                <div><span className="text-gray-500">وضع السكن: </span>{detail.housingType ?? '—'}</div>
                <div><span className="text-gray-500">مصدر الدخل: </span>{detail.incomeSource ?? '—'}</div>
                <div><span className="text-gray-500">المستوى الاقتصادي: </span>{detail.economicLevel ?? '—'}</div>
                <div><span className="text-gray-500">درجة الاحتياج: </span>{detail.needLevel ?? '—'}</div>
                <div><span className="text-gray-500">الحالة الصحية: </span>{detail.healthStatus ?? '—'}</div>
                <div><span className="text-gray-500">حالة الملف: </span>{detail.fileStatus ?? '—'}</div>
                <div><span className="text-gray-500">تاريخ التسجيل: </span>{detail.registeredAt ? detail.registeredAt.slice(0, 10) : '—'}</div>
                <div><span className="text-gray-500">الدخل الشهري: </span>{filsToDinar(detail.monthlyIncomeFils)} د.أ</div>
                <div><span className="text-gray-500">المصاريف الشهرية: </span>{filsToDinar(detail.monthlyExpensesFils ?? 0)} د.أ</div>
                <div><span className="text-gray-500">المصدر: </span>{detail.sourceSystem ?? '—'}</div>
              </div>
              {detail.legacySourceRefs && (
                <p className="mt-3 text-xs text-gray-500">
                  مرجع السجل القديم: {detail.legacySourceRefs}
                  {detail.legacyOccurrences && detail.legacyOccurrences > 1
                    ? ` (ظهر ${detail.legacyOccurrences} مرات في السجلات الأصلية)`
                    : ''}
                </p>
              )}
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
                      <th className="px-2 py-1">العمر</th>
                      <th className="px-2 py-1">ذوي إعاقة</th>
                      <th className="px-2 py-1">يتيم</th>
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
                        <td className="px-2 py-1">{m.age ?? '—'}</td>
                        <td className="px-2 py-1">{m.isDisabled ? 'نعم' : '—'}</td>
                        <td className="px-2 py-1">{m.isOrphan ? 'نعم' : '—'}</td>
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
        {formOpen && <FamilyFormModal form={form} setForm={setForm} onSubmit={handleSave} onClose={() => { setFormOpen(false); setDuplicates([]); }} saving={saving} editing={!!editingId} regions={regions} duplicates={duplicates} />}
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
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">الأسر</h1>
        <div className="flex flex-wrap gap-2">
          <Link className="btn-secondary" href="/families/incomplete">
            استكمال البيانات الناقصة
          </Link>
          {can('families', 'create') && (
            <button className="btn-primary" onClick={openCreate}>
              + إضافة أسرة
            </button>
          )}
        </div>
      </div>

      <form onSubmit={handleSearchSubmit} className="mb-4 flex flex-wrap items-end gap-2">
        <TextInput placeholder="ابحث بالاسم، الرمز، رقم الهوية أو الهاتف..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
        <Select
          placeholder="كل المناطق"
          options={regions.map((r) => ({ value: r.id, label: r.name }))}
          value={regionFilter}
          onChange={(e) => { setRegionFilter(e.target.value); setPage(1); }}
        />
        <button type="submit" className="btn-secondary">بحث</button>
        <label className="flex items-center gap-2 pb-2 text-sm text-gray-700">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
            checked={incompleteOnly}
            onChange={(e) => { setIncompleteOnly(e.target.checked); setPage(1); }}
          />
          بيانات ناقصة فقط
        </label>
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

      {formOpen && <FamilyFormModal form={form} setForm={setForm} onSubmit={handleSave} onClose={() => { setFormOpen(false); setDuplicates([]); }} saving={saving} editing={!!editingId} regions={regions} duplicates={duplicates} />}
    </AppShell>
  );
}

function FamilyFormModal({
  form, setForm, onSubmit, onClose, saving, editing, regions, duplicates,
}: {
  form: FamilyFormState;
  setForm: (f: FamilyFormState) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
  saving: boolean;
  editing: boolean;
  regions: Region[];
  duplicates: DuplicateFamily[];
}) {
  const hasStrongMatch = duplicates.some((d) => d.strong);
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
      <div className="card max-h-[90vh] w-full max-w-3xl overflow-y-auto p-6">
        <h2 className="mb-4 text-lg font-bold">{editing ? 'تعديل بيانات الأسرة' : 'إضافة أسرة جديدة'}</h2>

        {duplicates.length > 0 && (
          <div className={'mb-4 rounded-md p-3 text-sm ' + (hasStrongMatch ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-800')}>
            <p className="mb-2 font-medium">
              {hasStrongMatch
                ? 'تحذير قوي: يوجد سجل بنفس الرقم الوطني'
                : 'تنبيه: توجد سجلات مشابهة قد تكون مكررة'}
            </p>
            <ul className="space-y-1">
              {duplicates.map((d) => (
                <li key={d.id}>
                  {d.familyCode} — {d.headOfFamilyName}
                  {d.headNationalId ? ` — ${d.headNationalId}` : ''}
                  {d.phone ? ` — ${d.phone}` : ''}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs">راجع السجلات أعلاه، ثم اضغط حفظ مرة أخرى للمتابعة رغم التشابه.</p>
          </div>
        )}

        <form onSubmit={onSubmit} className="grid grid-cols-2 gap-4">
          <TextInput label="رمز الأسرة" required value={form.familyCode} onChange={(e) => setForm({ ...form, familyCode: e.target.value })} />
          <TextInput label="اسم رب الأسرة / المنتسب" required value={form.headOfFamilyName} onChange={(e) => setForm({ ...form, headOfFamilyName: e.target.value })} />
          <TextInput label="اسم الزوجة" value={form.wifeName} onChange={(e) => setForm({ ...form, wifeName: e.target.value })} />
          <TextInput label="الرقم الوطني" value={form.headNationalId} onChange={(e) => setForm({ ...form, headNationalId: e.target.value })} />
          <TextInput label="عدد الأفراد في دفتر العائلة" type="number" min={0} max={100} value={form.familyBookMembersCount} onChange={(e) => setForm({ ...form, familyBookMembersCount: e.target.value })} />
          <TextInput label="الهاتف" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <TextInput label="هاتف بديل" value={form.altPhone} onChange={(e) => setForm({ ...form, altPhone: e.target.value })} />
          <Select label="المنطقة" placeholder="بدون منطقة" options={regions.map((r) => ({ value: r.id, label: r.name }))} value={form.regionId} onChange={(e) => setForm({ ...form, regionId: e.target.value })} />
          <TextInput label="الحي" value={form.neighborhood} onChange={(e) => setForm({ ...form, neighborhood: e.target.value })} />
          <TextInput label="المدينة" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          <Select label="الحالة الاجتماعية" placeholder="اختر" options={MARITAL_OPTIONS} value={form.maritalStatus} onChange={(e) => setForm({ ...form, maritalStatus: e.target.value })} />
          <Select label="وضع السكن" placeholder="اختر" options={HOUSING_OPTIONS} value={form.housingType} onChange={(e) => setForm({ ...form, housingType: e.target.value })} />
          <TextInput label="مصدر الدخل" value={form.incomeSource} onChange={(e) => setForm({ ...form, incomeSource: e.target.value })} />
          <TextInput label="متوسط الدخل الشهري (د.أ)" type="number" step="0.01" value={form.monthlyIncome} onChange={(e) => setForm({ ...form, monthlyIncome: e.target.value })} />
          <TextInput label="المصاريف الشهرية (د.أ)" type="number" step="0.01" value={form.monthlyExpenses} onChange={(e) => setForm({ ...form, monthlyExpenses: e.target.value })} />
          <Select label="المستوى الاقتصادي" placeholder="اختر" options={ECONOMIC_OPTIONS} value={form.economicLevel} onChange={(e) => setForm({ ...form, economicLevel: e.target.value })} />
          <Select label="درجة الاحتياج" placeholder="اختر" options={NEED_LEVEL_OPTIONS} value={form.needLevel} onChange={(e) => setForm({ ...form, needLevel: e.target.value })} />
          <Select label="حالة الملف" options={FILE_STATUS_OPTIONS} value={form.fileStatus} onChange={(e) => setForm({ ...form, fileStatus: e.target.value })} />
          <div className="col-span-2">
            <TextInput label="الحالة الصحية" value={form.healthStatus} onChange={(e) => setForm({ ...form, healthStatus: e.target.value })} />
          </div>
          <div className="col-span-2">
            <TextInput label="العنوان" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
          <div className="col-span-2">
            <TextArea label="ملاحظات" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
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
      <div className="card max-h-[90vh] w-full max-w-2xl overflow-y-auto p-6">
        <h2 className="mb-4 text-lg font-bold">{editing ? 'تعديل بيانات الفرد' : 'إضافة فرد جديد'}</h2>
        <form onSubmit={onSubmit} className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <TextInput label="الاسم الكامل" required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
          </div>
          <TextInput label="الرقم الوطني" value={form.nationalId} onChange={(e) => setForm({ ...form, nationalId: e.target.value })} />
          <Select label="صلة القرابة" required placeholder="اختر" options={RELATIONSHIP_OPTIONS} value={form.relationship} onChange={(e) => setForm({ ...form, relationship: e.target.value })} />
          <Select label="الجنس" required placeholder="اختر" options={GENDER_OPTIONS} value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })} />
          <TextInput label="تاريخ الميلاد" type="date" value={form.birthDate} onChange={(e) => setForm({ ...form, birthDate: e.target.value })} />
          <Select label="الحالة الاجتماعية" placeholder="اختر" options={MARITAL_OPTIONS} value={form.maritalStatus} onChange={(e) => setForm({ ...form, maritalStatus: e.target.value })} />
          <TextInput label="الدراسة" value={form.educationLevel} onChange={(e) => setForm({ ...form, educationLevel: e.target.value })} />
          <TextInput label="العمل" value={form.occupation} onChange={(e) => setForm({ ...form, occupation: e.target.value })} />
          <TextInput label="الحالة الصحية" value={form.healthStatus} onChange={(e) => setForm({ ...form, healthStatus: e.target.value })} />
          <TextInput label="نوع الإعاقة (إن وجدت)" value={form.disabilityType} onChange={(e) => setForm({ ...form, disabilityType: e.target.value })} />
          <div className="col-span-2 flex flex-wrap gap-6">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500" checked={form.isDisabled} onChange={(e) => setForm({ ...form, isDisabled: e.target.checked })} />
              من ذوي الإعاقة
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500" checked={form.isOrphan} onChange={(e) => setForm({ ...form, isOrphan: e.target.checked })} />
              يتيم/يتيمة
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
