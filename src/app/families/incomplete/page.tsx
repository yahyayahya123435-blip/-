'use client';

/**
 * "استكمال البيانات الناقصة" — a fast keyboard-friendly grid for filling in the
 * two fields the imported register deliberately left blank: the head of
 * family's national ID and the family-book member count.
 *
 * Built for throughput rather than for browsing: the whole visible page is
 * edited inline and saved in one request, and a row disappears from the list
 * once it has nothing left missing.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/layout/AppShell';
import { Pagination } from '@/components/ui/DataTable';
import { TextInput, Select } from '@/components/ui/Field';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/lib/client/auth-context';
import { apiInvoke, ApiError } from '@/lib/client/api';

interface IncompleteFamily {
  id: string;
  familyCode: string;
  headOfFamilyName: string;
  wifeName: string | null;
  headNationalId: string | null;
  familyBookMembersCount: number | null;
  phone: string | null;
  legacySourceRefs: string | null;
}

interface ListResult {
  rows: IncompleteFamily[];
  total: number;
  page: number;
  pageSize: number;
}

type MissingFilter = 'all' | 'nationalId' | 'bookCount';

const MISSING_OPTIONS = [
  { value: 'all', label: 'ينقصها أي بيان' },
  { value: 'nationalId', label: 'ينقصها الرقم الوطني' },
  { value: 'bookCount', label: 'ينقصها عدد أفراد دفتر العائلة' },
];

const PAGE_SIZE = 25;

/** Local edits keyed by family id — only what the operator actually typed. */
type Draft = Record<string, { nationalId?: string; bookCount?: string }>;

export default function IncompleteFamiliesPage() {
  const { can } = useAuth();
  const { notify } = useToast();

  const [data, setData] = useState<ListResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [missing, setMissing] = useState<MissingFilter>('all');
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [draft, setDraft] = useState<Draft>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiInvoke<ListResult>('families:listIncomplete', {
        page,
        pageSize: PAGE_SIZE,
        missing,
        search: appliedSearch || undefined,
      });
      setData(result);
      setDraft({});
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر تحميل القائمة');
    } finally {
      setLoading(false);
    }
  }, [page, missing, appliedSearch]);

  useEffect(() => {
    void load();
  }, [load]);

  function setField(id: string, field: 'nationalId' | 'bookCount', value: string) {
    setDraft((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  }

  const pendingCount = Object.values(draft).filter(
    (d) => (d.nationalId ?? '').trim() !== '' || (d.bookCount ?? '').trim() !== '',
  ).length;

  async function handleSave() {
    const patches = Object.entries(draft)
      .map(([id, values]) => {
        const nationalId = (values.nationalId ?? '').trim();
        const bookCountText = (values.bookCount ?? '').trim();
        const bookCount = bookCountText === '' ? null : Number(bookCountText);
        return {
          id,
          headNationalId: nationalId || undefined,
          familyBookMembersCount:
            bookCount !== null && Number.isInteger(bookCount) && bookCount >= 0 ? bookCount : undefined,
        };
      })
      .filter((p) => p.headNationalId !== undefined || p.familyBookMembersCount !== undefined);

    if (patches.length === 0) {
      notify('لا توجد تعديلات للحفظ', 'info');
      return;
    }

    setSaving(true);
    try {
      const { updated } = await apiInvoke<{ updated: number }>('families:completeData', { patches });
      notify(`تم حفظ بيانات ${updated} أسرة`, 'success');
      await load();
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'تعذر حفظ البيانات', 'error');
    } finally {
      setSaving(false);
    }
  }

  const editable = can('families', 'update');

  return (
    <AppShell>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">استكمال البيانات الناقصة</h1>
          <p className="text-sm text-gray-500">
            الأسر التي ما زال ينقصها الرقم الوطني أو عدد الأفراد في دفتر العائلة.
          </p>
        </div>
        <Link className="btn-secondary" href="/families">
          العودة إلى الأسر
        </Link>
      </div>

      <form
        className="mb-4 flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setAppliedSearch(search);
        }}
      >
        <TextInput
          placeholder="ابحث بالاسم أو رمز الأسرة..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <Select
          options={MISSING_OPTIONS}
          value={missing}
          onChange={(e) => {
            setMissing(e.target.value as MissingFilter);
            setPage(1);
          }}
        />
        <button type="submit" className="btn-secondary">بحث</button>
      </form>

      <div className="card">
        {loading && <LoadingState />}
        {!loading && error && <ErrorState message={error} onRetry={load} />}
        {!loading && !error && data && data.rows.length === 0 && (
          <EmptyState
            title="لا توجد بيانات ناقصة"
            description="كل الأسر المطابقة لهذا الفلتر مكتملة."
          />
        )}

        {!loading && !error && data && data.rows.length > 0 && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-right text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-gray-500">
                    <th className="px-3 py-2 font-medium">الرمز</th>
                    <th className="px-3 py-2 font-medium">اسم رب الأسرة</th>
                    <th className="px-3 py-2 font-medium">اسم الزوجة</th>
                    <th className="px-3 py-2 font-medium">الرقم الوطني</th>
                    <th className="px-3 py-2 font-medium">عدد أفراد دفتر العائلة</th>
                    <th className="px-3 py-2 font-medium">المرجع الأصلي</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row) => (
                    <tr key={row.id} className="border-b border-gray-100">
                      <td className="px-3 py-2 font-mono text-xs">{row.familyCode}</td>
                      <td className="px-3 py-2">{row.headOfFamilyName}</td>
                      <td className="px-3 py-2 text-gray-600">{row.wifeName || '—'}</td>
                      <td className="px-3 py-2">
                        {row.headNationalId ? (
                          <span className="text-gray-700">{row.headNationalId}</span>
                        ) : (
                          <input
                            className="input py-1"
                            inputMode="numeric"
                            disabled={!editable}
                            placeholder="—"
                            value={draft[row.id]?.nationalId ?? ''}
                            onChange={(e) => setField(row.id, 'nationalId', e.target.value)}
                          />
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {row.familyBookMembersCount !== null ? (
                          <span className="text-gray-700">{row.familyBookMembersCount}</span>
                        ) : (
                          <input
                            className="input w-24 py-1"
                            type="number"
                            min={0}
                            max={100}
                            disabled={!editable}
                            placeholder="—"
                            value={draft[row.id]?.bookCount ?? ''}
                            onChange={(e) => setField(row.id, 'bookCount', e.target.value)}
                          />
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-500">{row.legacySourceRefs || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 px-3 py-3">
              <span className="text-sm text-gray-600">
                {pendingCount > 0 ? `${pendingCount} صف غير محفوظ` : 'لا توجد تعديلات غير محفوظة'}
              </span>
              <button
                className="btn-primary"
                disabled={!editable || saving || pendingCount === 0}
                onClick={handleSave}
              >
                {saving ? 'جارٍ الحفظ...' : 'حفظ التعديلات'}
              </button>
            </div>

            <Pagination
              page={data.page}
              pageSize={data.pageSize}
              total={data.total}
              onPageChange={setPage}
            />
          </>
        )}
      </div>
    </AppShell>
  );
}
