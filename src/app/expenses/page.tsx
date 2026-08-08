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

interface ExpenseCategory {
  id: string;
  name: string;
}

interface Transaction {
  id: string;
  amountFils: number;
  categoryId?: string | null;
  category?: { name: string } | null;
  description?: string | null;
  transactionAt: string;
}

interface Summary {
  totalIncomeFils: number;
  totalExpenseFils: number;
  netFils: number;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

type ExpenseFormState = {
  amount: string;
  categoryId: string;
  description: string;
  transactionAt: string;
};

function emptyForm(): ExpenseFormState {
  return { amount: '', categoryId: '', description: '', transactionAt: today() };
}

export default function ExpensesPage() {
  const { can } = useAuth();
  const { notify } = useToast();
  const { confirm } = useConfirm();

  const [rows, setRows] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pageSize = 20;

  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const [summary, setSummary] = useState<Summary | null>(null);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ExpenseFormState>(emptyForm());
  const [saving, setSaving] = useState(false);

  function loadList() {
    setLoading(true);
    setError(null);
    apiInvoke<{ rows: Transaction[]; total: number }>('transactions:list', {
      type: 'مصروف',
      page,
      pageSize,
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
    })
      .then((res) => {
        setRows(res.rows);
        setTotal(res.total);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'حدث خطأ غير متوقع'))
      .finally(() => setLoading(false));
  }

  function loadSummary() {
    apiInvoke<Summary>('accounting:summary', {
      fromDate: fromDate ? new Date(fromDate) : undefined,
      toDate: toDate ? new Date(toDate) : undefined,
    })
      .then(setSummary)
      .catch((e) => notify(e instanceof Error ? e.message : 'تعذر تحميل الملخص المالي', 'error'));
  }

  function loadCategories() {
    apiInvoke<ExpenseCategory[]>('expenseCategories:list').then(setCategories).catch(() => undefined);
  }

  useEffect(() => {
    loadCategories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadList();
    loadSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  function handleFilterSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    loadList();
    loadSummary();
  }

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm());
    setFormOpen(true);
  }

  function openEdit(tx: Transaction) {
    setEditingId(tx.id);
    setForm({
      amount: (tx.amountFils / 1000).toString(),
      categoryId: tx.categoryId ?? '',
      description: tx.description ?? '',
      transactionAt: new Date(tx.transactionAt).toISOString().slice(0, 10),
    });
    setFormOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        type: 'مصروف' as const,
        amountFils: dinarInputToFils(form.amount),
        categoryId: form.categoryId || undefined,
        description: form.description || undefined,
        transactionAt: form.transactionAt,
      };
      if (editingId) {
        await apiInvoke('transactions:update', { id: editingId, ...payload });
        notify('تم تحديث المصروف', 'success');
      } else {
        await apiInvoke('transactions:create', payload);
        notify('تمت إضافة المصروف بنجاح', 'success');
      }
      setFormOpen(false);
      loadList();
      loadSummary();
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'تعذر حفظ البيانات', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(tx: Transaction) {
    const ok = await confirm({
      title: 'حذف المصروف',
      message: 'هل أنت متأكد من حذف هذا المصروف؟ لا يمكن التراجع عن هذا الإجراء.',
      danger: true,
      confirmLabel: 'حذف',
    });
    if (!ok) return;
    try {
      await apiInvoke('transactions:delete', { id: tx.id });
      notify('تم حذف المصروف', 'success');
      loadList();
      loadSummary();
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'تعذر تنفيذ العملية', 'error');
    }
  }

  async function handleQuickAddCategory(name: string) {
    try {
      const category = await apiInvoke<ExpenseCategory>('expenseCategories:create', { name });
      notify('تمت إضافة التصنيف بنجاح', 'success');
      setCategories((c) => [...c, category].sort((a, b) => a.name.localeCompare(b.name, 'ar')));
      setForm((f) => ({ ...f, categoryId: category.id }));
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'تعذر إضافة التصنيف', 'error');
    }
  }

  const columns: Column<Transaction>[] = [
    { key: 'amountFils', header: 'المبلغ', render: (r) => `${filsToDinar(r.amountFils)} د.أ` },
    { key: 'category', header: 'التصنيف', render: (r) => r.category?.name ?? '—' },
    { key: 'description', header: 'الوصف', render: (r) => r.description ?? '—' },
    { key: 'transactionAt', header: 'التاريخ', render: (r) => new Date(r.transactionAt).toLocaleDateString('ar-JO') },
  ];

  return (
    <AppShell>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">المصروفات</h1>
        {can('accounting', 'create') && (
          <button className="btn-primary" onClick={openCreate}>
            + إضافة مصروف
          </button>
        )}
      </div>

      {summary && (
        <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="card p-4">
            <div className="text-sm text-gray-500">الدخل</div>
            <div className="mt-1 text-xl font-bold text-brand-700">{filsToDinar(summary.totalIncomeFils)} د.أ</div>
          </div>
          <div className="card p-4">
            <div className="text-sm text-gray-500">المصروفات</div>
            <div className="mt-1 text-xl font-bold text-red-600">{filsToDinar(summary.totalExpenseFils)} د.أ</div>
          </div>
          <div className="card p-4">
            <div className="text-sm text-gray-500">الصافي</div>
            <div className={'mt-1 text-xl font-bold ' + (summary.netFils >= 0 ? 'text-brand-700' : 'text-red-600')}>
              {filsToDinar(summary.netFils)} د.أ
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleFilterSubmit} className="mb-4 flex flex-wrap items-end gap-2">
        <TextInput label="من تاريخ" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        <TextInput label="إلى تاريخ" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        <button type="submit" className="btn-secondary">تصفية</button>
        {(fromDate || toDate) && (
          <button
            type="button"
            className="btn-secondary"
            onClick={() => { setFromDate(''); setToDate(''); setPage(1); setTimeout(() => { loadList(); loadSummary(); }, 0); }}
          >
            مسح
          </button>
        )}
      </form>

      <div className="card">
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          loading={loading}
          error={error}
          onRetry={loadList}
          emptyTitle="لا توجد مصروفات مسجلة بعد"
          actions={(row) => (
            <div className="flex gap-2">
              {can('accounting', 'update') && (
                <button className="text-xs text-brand-600 hover:underline" onClick={(e) => { e.stopPropagation(); openEdit(row); }}>
                  تعديل
                </button>
              )}
              {can('accounting', 'delete') && (
                <button className="text-xs text-red-600 hover:underline" onClick={(e) => { e.stopPropagation(); handleDelete(row); }}>
                  حذف
                </button>
              )}
            </div>
          )}
        />
        {!loading && !error && <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} />}
      </div>

      {formOpen && (
        <ExpenseFormModal
          form={form}
          setForm={setForm}
          categories={categories}
          onQuickAddCategory={handleQuickAddCategory}
          onSubmit={handleSave}
          onClose={() => setFormOpen(false)}
          saving={saving}
          editing={!!editingId}
        />
      )}
    </AppShell>
  );
}

function ExpenseFormModal({
  form, setForm, categories, onQuickAddCategory, onSubmit, onClose, saving, editing,
}: {
  form: ExpenseFormState;
  setForm: (f: ExpenseFormState) => void;
  categories: ExpenseCategory[];
  onQuickAddCategory: (name: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
  saving: boolean;
  editing: boolean;
}) {
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickName, setQuickName] = useState('');

  function handleQuickAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!quickName.trim()) return;
    onQuickAddCategory(quickName.trim());
    setQuickName('');
    setQuickAddOpen(false);
  }

  const categoryOptions = categories.map((c) => ({ value: c.id, label: c.name }));

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
      <div className="card max-h-[90vh] w-full max-w-lg overflow-y-auto p-6">
        <h2 className="mb-4 text-lg font-bold">{editing ? 'تعديل مصروف' : 'إضافة مصروف جديد'}</h2>
        <form onSubmit={onSubmit} className="space-y-4">
          <TextInput label="المبلغ (د.أ)" type="number" step="0.01" min="0" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />

          <div>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Select label="التصنيف" placeholder="بدون تصنيف" options={categoryOptions} value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} />
              </div>
              <button type="button" className="btn-secondary" onClick={() => setQuickAddOpen((o) => !o)}>+</button>
            </div>
            {quickAddOpen && (
              <div className="mt-2 flex gap-2">
                <TextInput placeholder="اسم التصنيف الجديد" value={quickName} onChange={(e) => setQuickName(e.target.value)} className="flex-1" />
                <button type="button" className="btn-secondary" onClick={handleQuickAdd}>إضافة</button>
              </div>
            )}
          </div>

          <TextInput label="تاريخ العملية" type="date" required value={form.transactionAt} onChange={(e) => setForm({ ...form, transactionAt: e.target.value })} />
          <TextArea label="الوصف" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />

          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={onClose}>إلغاء</button>
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'جارٍ الحفظ...' : 'حفظ'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
