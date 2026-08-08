'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { LoadingState, ErrorState } from '@/components/ui/States';
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
  recentAssistances: { id: string; amountFils: number; beneficiary: { fullName: string }; assistanceType: { name: string }; disbursedAt: string }[];
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

export default function DashboardPage() {
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

  return (
    <AppShell>
      <h1 className="mb-6 text-xl font-bold">الرئيسية</h1>
      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        data && (
          <>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <StatCard label="الأسر النشطة" value={data.familiesCount} icon="👪" />
              <StatCard label="المستفيدون النشطون" value={data.beneficiariesCount} icon="🧑‍🤝‍🧑" />
              <StatCard label="الحملات المفتوحة" value={data.activeCampaignsCount} icon="📢" />
              <StatCard label="أصناف منخفضة المخزون" value={data.lowStockItemsCount} icon="⚠️" />
              <StatCard label="تبرعات هذا الشهر" value={`${filsToDinar(data.monthlyDonationsFils)} د.أ`} icon="💰" />
              <StatCard label="مساعدات هذا الشهر" value={`${filsToDinar(data.monthlyAssistancesFils)} د.أ`} icon="🎁" />
              <StatCard label="موافقات قيد الانتظار" value={data.pendingApprovalsCount} icon="⏳" />
            </div>

            <div className="card mt-6 p-4">
              <h2 className="mb-3 font-bold">آخر المساعدات المصروفة</h2>
              {data.recentAssistances.length === 0 ? (
                <p className="text-sm text-gray-500">لا توجد مساعدات مسجلة بعد</p>
              ) : (
                <table className="w-full text-right text-sm">
                  <thead>
                    <tr className="border-b text-gray-500">
                      <th className="px-2 py-1">المستفيد</th>
                      <th className="px-2 py-1">نوع المساعدة</th>
                      <th className="px-2 py-1">المبلغ</th>
                      <th className="px-2 py-1">التاريخ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentAssistances.map((a) => (
                      <tr key={a.id} className="border-b border-gray-50">
                        <td className="px-2 py-1">{a.beneficiary.fullName}</td>
                        <td className="px-2 py-1">{a.assistanceType.name}</td>
                        <td className="px-2 py-1">{filsToDinar(a.amountFils)} د.أ</td>
                        <td className="px-2 py-1">{new Date(a.disbursedAt).toLocaleDateString('ar-JO')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )
      )}
    </AppShell>
  );
}
