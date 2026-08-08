'use client';

import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { DataTable, Pagination, type Column } from '@/components/ui/DataTable';
import { TextInput, TextArea, Select, Checkbox } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { useAuth } from '@/lib/client/auth-context';
import { apiInvoke, ApiError } from '@/lib/client/api';
import { filsToDinar, dinarInputToFils } from '@/lib/client/money';

interface Warehouse {
  id: string;
  name: string;
}

interface Supplier {
  id: string;
  name: string;
}

interface InventoryItem {
  id: string;
  warehouseId: string;
  name: string;
  unit: string;
  quantity: number;
  minQuantity: number;
  unitPriceFils: number;
  category?: string | null;
  isActive: boolean;
  warehouse?: { name: string };
}

interface StockInRow {
  id: string;
  quantity: number;
  unitPriceFils: number;
  totalFils: number;
  referenceNo?: string | null;
  receivedAt: string;
  notes?: string | null;
  supplier?: { name: string } | null;
}

interface StockOutRow {
  id: string;
  quantity: number;
  reason: string;
  issuedAt: string;
  notes?: string | null;
}

const REASON_OPTIONS = [
  { value: 'مساعدة', label: 'مساعدة' },
  { value: 'تالف', label: 'تالف' },
  { value: 'جرد', label: 'جرد' },
  { value: 'أخرى', label: 'أخرى' },
];

type ItemFormState = {
  warehouseId: string;
  name: string;
  unit: string;
  minQuantity: string;
  unitPriceFils: string;
  category: string;
};
const emptyItemForm: ItemFormState = { warehouseId: '', name: '', unit: '', minQuantity: '0', unitPriceFils: '', category: '' };

type StockInFormState = {
  supplierId: string;
  quantity: string;
  unitPriceFils: string;
  referenceNo: string;
  receivedAt: string;
  notes: string;
};

type StockOutFormState = {
  quantity: string;
  reason: string;
  issuedAt: string;
  notes: string;
};

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function InventoryPage() {
  const { can } = useAuth();
  const { notify } = useToast();
  const { confirm } = useConfirm();

  const [view, setView] = useState<'list' | 'detail'>('list');
  const [rows, setRows] = useState<InventoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pageSize = 20;

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ItemFormState>(emptyItemForm);
  const [saving, setSaving] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<InventoryItem | null>(null);
  const [stockInRows, setStockInRows] = useState<StockInRow[]>([]);
  const [stockOutRows, setStockOutRows] = useState<StockOutRow[]>([]);

  const [stockTarget, setStockTarget] = useState<InventoryItem | null>(null);
  const [stockInOpen, setStockInOpen] = useState(false);
  const [stockOutOpen, setStockOutOpen] = useState(false);
  const [stockInForm, setStockInForm] = useState<StockInFormState>({ supplierId: '', quantity: '', unitPriceFils: '', referenceNo: '', receivedAt: todayStr(), notes: '' });
  const [stockOutForm, setStockOutForm] = useState<StockOutFormState>({ quantity: '', reason: '', issuedAt: todayStr(), notes: '' });
  const [stockSaving, setStockSaving] = useState(false);

  const warehouseOptions = useMemo(() => warehouses.map((w) => ({ value: w.id, label: w.name })), [warehouses]);
  const supplierOptions = useMemo(() => suppliers.map((s) => ({ value: s.id, label: s.name })), [suppliers]);

  useEffect(() => {
    apiInvoke<Warehouse[]>('warehouses:list').then(setWarehouses).catch(() => undefined);
    apiInvoke<Supplier[]>('suppliers:list').then(setSuppliers).catch(() => undefined);
  }, []);

  function loadList() {
    setLoading(true);
    setError(null);
    apiInvoke<{ rows: InventoryItem[]; total: number }>('inventoryItems:list', {
      page, pageSize, search: search || undefined, lowStockOnly: lowStockOnly || undefined,
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
  }, [view, page, lowStockOnly]);

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    loadList();
  }

  function openCreate() {
    setEditingId(null);
    setForm(emptyItemForm);
    setFormOpen(true);
  }

  function openEdit(item: InventoryItem) {
    setEditingId(item.id);
    setForm({
      warehouseId: item.warehouseId,
      name: item.name,
      unit: item.unit,
      minQuantity: String(item.minQuantity),
      unitPriceFils: filsToDinar(item.unitPriceFils),
      category: item.category ?? '',
    });
    setFormOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        warehouseId: form.warehouseId,
        name: form.name,
        unit: form.unit,
        minQuantity: Number(form.minQuantity) || 0,
        unitPriceFils: form.unitPriceFils ? dinarInputToFils(form.unitPriceFils) : 0,
        category: form.category || undefined,
      };
      if (editingId) {
        await apiInvoke('inventoryItems:update', { id: editingId, ...payload });
        notify('تم تحديث بيانات الصنف', 'success');
      } else {
        await apiInvoke('inventoryItems:create', payload);
        notify('تمت إضافة الصنف بنجاح', 'success');
      }
      setFormOpen(false);
      loadList();
      if (view === 'detail' && selectedId && selectedId === editingId) loadDetail(selectedId);
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'تعذر حفظ البيانات', 'error');
    } finally {
      setSaving(false);
    }
  }

  function openDetail(item: InventoryItem) {
    setSelectedId(item.id);
    setView('detail');
  }

  function loadDetail(id: string) {
    apiInvoke<InventoryItem>('inventoryItems:get', { id }).then(setDetail).catch((e) => notify(e instanceof Error ? e.message : 'تعذر تحميل بيانات الصنف', 'error'));
    apiInvoke<{ rows: StockInRow[] }>('stockIn:list', { inventoryItemId: id }).then((res) => setStockInRows(res.rows)).catch(() => undefined);
    apiInvoke<{ rows: StockOutRow[] }>('stockOut:list', { inventoryItemId: id }).then((res) => setStockOutRows(res.rows)).catch(() => undefined);
  }

  useEffect(() => {
    if (view !== 'detail' || !selectedId) return;
    loadDetail(selectedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, selectedId]);

  function openStockIn(item: InventoryItem) {
    setStockTarget(item);
    setStockInForm({ supplierId: '', quantity: '', unitPriceFils: filsToDinar(item.unitPriceFils), referenceNo: '', receivedAt: todayStr(), notes: '' });
    setStockInOpen(true);
  }

  function openStockOut(item: InventoryItem) {
    setStockTarget(item);
    setStockOutForm({ quantity: '', reason: '', issuedAt: todayStr(), notes: '' });
    setStockOutOpen(true);
  }

  function refreshAfterStockChange() {
    loadList();
    if (view === 'detail' && selectedId) loadDetail(selectedId);
  }

  async function handleStockInSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stockTarget) return;
    const quantity = Number(stockInForm.quantity);
    if (!quantity || quantity <= 0) {
      notify('الرجاء إدخال كمية صحيحة أكبر من صفر', 'error');
      return;
    }
    setStockSaving(true);
    try {
      await apiInvoke('stockIn:create', {
        inventoryItemId: stockTarget.id,
        supplierId: stockInForm.supplierId || undefined,
        quantity,
        unitPriceFils: stockInForm.unitPriceFils ? dinarInputToFils(stockInForm.unitPriceFils) : 0,
        referenceNo: stockInForm.referenceNo || undefined,
        receivedAt: stockInForm.receivedAt,
        notes: stockInForm.notes || undefined,
      });
      notify('تم إدخال المخزون بنجاح', 'success');
      setStockInOpen(false);
      refreshAfterStockChange();
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'تعذر تنفيذ عملية الإدخال', 'error');
    } finally {
      setStockSaving(false);
    }
  }

  async function handleStockOutSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stockTarget) return;
    const quantity = Number(stockOutForm.quantity);
    if (!quantity || quantity <= 0) {
      notify('الرجاء إدخال كمية صحيحة أكبر من صفر', 'error');
      return;
    }
    if (!stockOutForm.reason) {
      notify('الرجاء اختيار سبب الإخراج', 'error');
      return;
    }
    const ok = await confirm({
      title: 'إخراج مخزون',
      message: `هل أنت متأكد من إخراج ${quantity} ${stockTarget.unit} من "${stockTarget.name}"؟ هذه العملية لا يمكن التراجع عنها.`,
      danger: true,
      confirmLabel: 'إخراج',
    });
    if (!ok) return;
    setStockSaving(true);
    try {
      await apiInvoke('stockOut:create', {
        inventoryItemId: stockTarget.id,
        quantity,
        reason: stockOutForm.reason,
        issuedAt: stockOutForm.issuedAt,
        notes: stockOutForm.notes || undefined,
      });
      notify('تم إخراج المخزون بنجاح', 'success');
      setStockOutOpen(false);
      refreshAfterStockChange();
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'تعذر تنفيذ عملية الإخراج', 'error');
    } finally {
      setStockSaving(false);
    }
  }

  const columns: Column<InventoryItem>[] = [
    { key: 'name', header: 'الصنف' },
    { key: 'warehouse', header: 'المستودع', render: (r) => r.warehouse?.name ?? '—' },
    {
      key: 'quantity', header: 'الكمية',
      render: (r) => {
        const low = r.quantity <= r.minQuantity;
        return (
          <span className={'rounded px-2 py-0.5 text-xs font-medium ' + (low ? 'bg-red-50 text-red-700' : 'text-gray-700')}>
            {r.quantity} {r.unit} {low && '⚠ منخفض'}
          </span>
        );
      },
    },
    { key: 'minQuantity', header: 'حد الطلب' },
    { key: 'unitPriceFils', header: 'السعر (د.أ)', render: (r) => filsToDinar(r.unitPriceFils) },
    { key: 'category', header: 'الفئة', render: (r) => r.category ?? '—' },
  ];

  if (view === 'detail') {
    const low = detail ? detail.quantity <= detail.minQuantity : false;
    return (
      <AppShell>
        <button className="btn-secondary mb-4" onClick={() => setView('list')}>
          ← رجوع لقائمة المخزون
        </button>
        {!detail ? (
          <p className="text-sm text-gray-500">جارٍ التحميل...</p>
        ) : (
          <div className="space-y-6">
            <div className="card p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h1 className="text-lg font-bold">{detail.name}</h1>
                <div className="flex gap-2">
                  {can('inventory', 'update') && (
                    <button className="btn-secondary" onClick={() => openEdit(detail)}>تعديل بيانات الصنف</button>
                  )}
                  {can('inventory', 'create') && (
                    <>
                      <button className="btn-secondary" onClick={() => openStockIn(detail)}>إدخال مخزون</button>
                      <button className="btn-secondary" onClick={() => openStockOut(detail)}>إخراج مخزون</button>
                    </>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                <div><span className="text-gray-500">المستودع: </span>{detail.warehouse?.name ?? '—'}</div>
                <div><span className="text-gray-500">الوحدة: </span>{detail.unit}</div>
                <div>
                  <span className="text-gray-500">الكمية الحالية: </span>
                  <span className={low ? 'font-bold text-red-600' : ''}>{detail.quantity}{low && ' ⚠ منخفض'}</span>
                </div>
                <div><span className="text-gray-500">حد الطلب: </span>{detail.minQuantity}</div>
                <div><span className="text-gray-500">سعر الوحدة: </span>{filsToDinar(detail.unitPriceFils)} د.أ</div>
                <div><span className="text-gray-500">الفئة: </span>{detail.category ?? '—'}</div>
              </div>
            </div>

            <div className="card p-4">
              <h2 className="mb-3 font-bold">سجل الإدخال ({stockInRows.length})</h2>
              {stockInRows.length === 0 ? (
                <p className="text-sm text-gray-500">لا يوجد سجل إدخال</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-sm">
                    <thead>
                      <tr className="border-b text-gray-500">
                        <th className="px-2 py-1">التاريخ</th>
                        <th className="px-2 py-1">الكمية</th>
                        <th className="px-2 py-1">سعر الوحدة</th>
                        <th className="px-2 py-1">الإجمالي</th>
                        <th className="px-2 py-1">المورد</th>
                        <th className="px-2 py-1">المرجع</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stockInRows.map((s) => (
                        <tr key={s.id} className="border-b border-gray-50">
                          <td className="px-2 py-1">{new Date(s.receivedAt).toLocaleDateString('ar-JO')}</td>
                          <td className="px-2 py-1">{s.quantity}</td>
                          <td className="px-2 py-1">{filsToDinar(s.unitPriceFils)}</td>
                          <td className="px-2 py-1">{filsToDinar(s.totalFils)}</td>
                          <td className="px-2 py-1">{s.supplier?.name ?? '—'}</td>
                          <td className="px-2 py-1">{s.referenceNo ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="card p-4">
              <h2 className="mb-3 font-bold">سجل الإخراج ({stockOutRows.length})</h2>
              {stockOutRows.length === 0 ? (
                <p className="text-sm text-gray-500">لا يوجد سجل إخراج</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-sm">
                    <thead>
                      <tr className="border-b text-gray-500">
                        <th className="px-2 py-1">التاريخ</th>
                        <th className="px-2 py-1">الكمية</th>
                        <th className="px-2 py-1">السبب</th>
                        <th className="px-2 py-1">ملاحظات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stockOutRows.map((s) => (
                        <tr key={s.id} className="border-b border-gray-50">
                          <td className="px-2 py-1">{new Date(s.issuedAt).toLocaleDateString('ar-JO')}</td>
                          <td className="px-2 py-1">{s.quantity}</td>
                          <td className="px-2 py-1">{s.reason}</td>
                          <td className="px-2 py-1">{s.notes ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
        {formOpen && (
          <ItemFormModal form={form} setForm={setForm} onSubmit={handleSave} onClose={() => setFormOpen(false)} saving={saving} editing={!!editingId} warehouseOptions={warehouseOptions} />
        )}
        {stockInOpen && stockTarget && (
          <StockInModal form={stockInForm} setForm={setStockInForm} onSubmit={handleStockInSubmit} onClose={() => setStockInOpen(false)} saving={stockSaving} item={stockTarget} supplierOptions={supplierOptions} />
        )}
        {stockOutOpen && stockTarget && (
          <StockOutModal form={stockOutForm} setForm={setStockOutForm} onSubmit={handleStockOutSubmit} onClose={() => setStockOutOpen(false)} saving={stockSaving} item={stockTarget} />
        )}
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">المخزون</h1>
        {can('inventory', 'create') && (
          <button className="btn-primary" onClick={openCreate}>
            + إضافة صنف
          </button>
        )}
      </div>

      <form onSubmit={handleSearchSubmit} className="mb-4 flex flex-wrap items-center gap-3">
        <TextInput placeholder="ابحث باسم الصنف..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
        <Checkbox label="المخزون المنخفض فقط" checked={lowStockOnly} onChange={(e) => { setPage(1); setLowStockOnly(e.target.checked); }} />
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
          emptyTitle="لا توجد أصناف مسجلة بعد"
          onRowClick={openDetail}
          actions={(row) => (
            <div className="flex gap-2">
              {can('inventory', 'update') && (
                <button className="text-xs text-brand-600 hover:underline" onClick={(e) => { e.stopPropagation(); openEdit(row); }}>
                  تعديل
                </button>
              )}
              {can('inventory', 'create') && (
                <>
                  <button className="text-xs text-brand-600 hover:underline" onClick={(e) => { e.stopPropagation(); openStockIn(row); }}>
                    إدخال
                  </button>
                  <button className="text-xs text-amber-600 hover:underline" onClick={(e) => { e.stopPropagation(); openStockOut(row); }}>
                    إخراج
                  </button>
                </>
              )}
            </div>
          )}
        />
        {!loading && !error && <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} />}
      </div>

      {formOpen && (
        <ItemFormModal form={form} setForm={setForm} onSubmit={handleSave} onClose={() => setFormOpen(false)} saving={saving} editing={!!editingId} warehouseOptions={warehouseOptions} />
      )}
      {stockInOpen && stockTarget && (
        <StockInModal form={stockInForm} setForm={setStockInForm} onSubmit={handleStockInSubmit} onClose={() => setStockInOpen(false)} saving={stockSaving} item={stockTarget} supplierOptions={supplierOptions} />
      )}
      {stockOutOpen && stockTarget && (
        <StockOutModal form={stockOutForm} setForm={setStockOutForm} onSubmit={handleStockOutSubmit} onClose={() => setStockOutOpen(false)} saving={stockSaving} item={stockTarget} />
      )}
    </AppShell>
  );
}

function ItemFormModal({
  form, setForm, onSubmit, onClose, saving, editing, warehouseOptions,
}: {
  form: ItemFormState;
  setForm: (f: ItemFormState) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
  saving: boolean;
  editing: boolean;
  warehouseOptions: { value: string; label: string }[];
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
      <div className="card max-h-[90vh] w-full max-w-2xl overflow-y-auto p-6">
        <h2 className="mb-4 text-lg font-bold">{editing ? 'تعديل صنف' : 'إضافة صنف جديد'}</h2>
        <form onSubmit={onSubmit} className="grid grid-cols-2 gap-4">
          <Select label="المستودع" required placeholder="اختر المستودع" options={warehouseOptions} value={form.warehouseId} onChange={(e) => setForm({ ...form, warehouseId: e.target.value })} />
          <TextInput label="اسم الصنف" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <TextInput label="الوحدة" required placeholder="قطعة / كرتون / كيلو" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
          <TextInput label="الفئة" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
          <TextInput label="حد الطلب الأدنى" type="number" min={0} value={form.minQuantity} onChange={(e) => setForm({ ...form, minQuantity: e.target.value })} />
          <TextInput label="سعر الوحدة (د.أ)" type="number" step="0.01" min={0} value={form.unitPriceFils} onChange={(e) => setForm({ ...form, unitPriceFils: e.target.value })} />
          <div className="col-span-2 flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={onClose}>إلغاء</button>
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'جارٍ الحفظ...' : 'حفظ'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function StockInModal({
  form, setForm, onSubmit, onClose, saving, item, supplierOptions,
}: {
  form: StockInFormState;
  setForm: (f: StockInFormState) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
  saving: boolean;
  item: InventoryItem;
  supplierOptions: { value: string; label: string }[];
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
      <div className="card w-full max-w-md p-6">
        <h2 className="mb-1 text-lg font-bold">إدخال مخزون</h2>
        <p className="mb-4 text-sm text-gray-500">{item.name} — الرصيد الحالي: {item.quantity} {item.unit}</p>
        <form onSubmit={onSubmit} className="space-y-4">
          <Select label="المورد" placeholder="بدون مورد" options={supplierOptions} value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: e.target.value })} />
          <TextInput label="الكمية" type="number" min={1} required value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
          <TextInput label="سعر الوحدة (د.أ)" type="number" step="0.01" min={0} value={form.unitPriceFils} onChange={(e) => setForm({ ...form, unitPriceFils: e.target.value })} />
          <TextInput label="رقم المرجع" value={form.referenceNo} onChange={(e) => setForm({ ...form, referenceNo: e.target.value })} />
          <TextInput label="تاريخ الاستلام" type="date" value={form.receivedAt} onChange={(e) => setForm({ ...form, receivedAt: e.target.value })} />
          <TextArea label="ملاحظات" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={onClose}>إلغاء</button>
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'جارٍ الحفظ...' : 'إدخال'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function StockOutModal({
  form, setForm, onSubmit, onClose, saving, item,
}: {
  form: StockOutFormState;
  setForm: (f: StockOutFormState) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
  saving: boolean;
  item: InventoryItem;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
      <div className="card w-full max-w-md p-6">
        <h2 className="mb-1 text-lg font-bold">إخراج مخزون</h2>
        <p className="mb-4 text-sm text-gray-500">{item.name} — الرصيد الحالي: {item.quantity} {item.unit}</p>
        <form onSubmit={onSubmit} className="space-y-4">
          <TextInput label="الكمية" type="number" min={1} required value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
          <Select label="السبب" required placeholder="اختر السبب" options={REASON_OPTIONS} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          <TextInput label="تاريخ الإخراج" type="date" value={form.issuedAt} onChange={(e) => setForm({ ...form, issuedAt: e.target.value })} />
          <TextArea label="ملاحظات" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={onClose}>إلغاء</button>
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'جارٍ الحفظ...' : 'إخراج'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
