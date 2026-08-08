'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { DataTable, Pagination, type Column } from '@/components/ui/DataTable';
import { TextInput, Select } from '@/components/ui/Field';
import { LoadingState, ErrorState } from '@/components/ui/States';
import { useAuth } from '@/lib/client/auth-context';
import { apiInvoke } from '@/lib/client/api';
import { filsToDinar } from '@/lib/client/money';

interface DashboardSummary {
  familiesCount: number;
  beneficiariesCount: number;
  activeCampaignsCount: number;
  lowStockItemsCount: number;
  monthlyDonationsFils: number;
  monthlyAssistancesFils: number;
  pendingApprovalsCount: number;
}

interface AccountingSummary {
  totalIncomeFils: number;
  totalExpenseFils: number;
  netFils: number;
}

interface AuditLogRow {
  id: string;
  userId: string | null;
  username: string | null;
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  tableName: string;
  recordId: string;
  createdAt: string;
}

function StatCard({ label, value, icon }: { label: string; value: string | number; icon: string }) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <span className="text-2xl">{icon}</span>
        <span className="text-2xl font-bold text-gray-800">{value}</span>
      </div>
      <div className="mt-2 text-sm text-gray-500">{label}</div>
    </div>
  );
}

const ACTION_OPTIONS = [
  { value: 'INSERT', label: 'إضافة' },
  { value: 'UPDATE', label: 'تعديل' },
  { value: 'DELETE', label: 'حذف' },
];

function GeneralSummarySection() {
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    setError(null);
    apiInvoke<DashboardSummary>('dashboard:summary')
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'حدث خطأ غير متوقع'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!data) return null;

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      <StatCard label="الأسر النشطة" value={data.familiesCount} icon="👪" />
      <StatCard label="المستفيدون النشطون" value={data.beneficiariesCount} icon="🧑‍🤝‍🧑" />
      <StatCard label="الحملات المفتوحة" value={data.activeCampaignsCount} icon="📢" />
      <StatCard label="أصناف منخفضة المخزون" value={data.lowStockItemsCount} icon="⚠️" />
      <StatCard label="تبرعات هذا الشهر" value={`${filsToDinar(data.monthlyDonationsFils)} د.أ`} icon="💰" />
      <StatCard label="مساعدات هذا الشهر" value={`${filsToDinar(data.monthlyAssistancesFils)} د.أ`} icon="🎁" />
      <StatCard label="موافقات قيد الانتظار" value={data.pendingApprovalsCount} icon="⏳" />
    </div>
  );
}

function FinancialSummarySection() {
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [data, setData] = useState<AccountingSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    setError(null);
    apiInvoke<AccountingSummary>('accounting:summary', {
      fromDate: fromDate ? new Date(fromDate) : undefined,
      toDate: toDate ? new Date(toDate) : undefined,
    })
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'حدث خطأ غير متوقع'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  function handleFilterSubmit(e: React.FormEvent) {
    e.preventDefault();
    load();
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleFilterSubmit} className="flex flex-wrap items-end gap-2">
        <TextInput label="من تاريخ" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        <TextInput label="إلى تاريخ" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        <button type="submit" className="btn-secondary">تطبيق</button>
      </form>

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        data && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <StatCard label="إجمالي الدخل" value={`${filsToDinar(data.totalIncomeFils)} د.أ`} icon="📈" />
            <StatCard label="إجمالي المصروفات" value={`${filsToDinar(data.totalExpenseFils)} د.أ`} icon="📉" />
            <StatCard label="الصافي" value={`${filsToDinar(data.netFils)} د.أ`} icon="⚖️" />
          </div>
        )
      )}
    </div>
  );
}

function AuditLogSection() {
  const [rows, setRows] = useState<AuditLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [tableName, setTableName] = useState('');
  const [action, setAction] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pageSize = 20;

  function loadList() {
    setLoading(true);
    setError(null);
    apiInvoke<{ rows: AuditLogRow[]; total: number }>('auditLogs:list', {
      page,
      pageSize,
      tableName: tableName || undefined,
      action: action || undefined,
    })
      .then((res) => {
        setRows(res.rows);
        setTotal(res.total);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'حدث خطأ غير متوقع'))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  function handleFilterSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    loadList();
  }

  const columns: Column<AuditLogRow>[] = [
    {
      key: 'action', header: 'العملية',
      render: (r) => (r.action === 'INSERT' ? 'إضافة' : r.action === 'UPDATE' ? 'تعديل' : 'حذف'),
    },
    { key: 'tableName', header: 'الجدول' },
    { key: 'recordId', header: 'معرّف السجل' },
    { key: 'username', header: 'المستخدم', render: (r) => r.username ?? 'النظام' },
    { key: 'createdAt', header: 'التاريخ والوقت', render: (r) => new Date(r.createdAt).toLocaleString('ar-JO') },
  ];

  return (
    <div className="space-y-4">
      <form onSubmit={handleFilterSubmit} className="flex flex-wrap items-end gap-2">
        <TextInput label="اسم الجدول" placeholder="مثال: families" value={tableName} onChange={(e) => setTableName(e.target.value)} />
        <Select label="نوع العملية" placeholder="الكل" options={ACTION_OPTIONS} value={action} onChange={(e) => setAction(e.target.value)} />
        <button type="submit" className="btn-secondary">تصفية</button>
      </form>

      <div className="card">
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          loading={loading}
          error={error}
          onRetry={loadList}
          emptyTitle="لا توجد سجلات تدقيق مطابقة"
        />
        {!loading && !error && <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} />}
      </div>
    </div>
  );
}

export default function ReportsPage() {
  const { can } = useAuth();

  return (
    <AppShell>
      <h1 className="mb-6 text-xl font-bold">التقارير</h1>

      <div className="space-y-8">
        <section>
          <h2 className="mb-3 font-bold">ملخص عام</h2>
          <GeneralSummarySection />
        </section>

        <section>
          <h2 className="mb-3 font-bold">الملخص المالي</h2>
          <FinancialSummarySection />
        </section>

        {can('users', 'view') && (
          <section>
            <h2 className="mb-3 font-bold">سجل التدقيق</h2>
            <AuditLogSection />
          </section>
        )}
      </div>
    </AppShell>
  );
}
