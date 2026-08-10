'use client';

/**
 * Import Wizard for the association's member register (330 families).
 *
 * Three explicit steps — review the file, confirm, see the result. Nothing is
 * written to the database until "اعتماد الاستيراد" is pressed, and the button
 * disappears once the register has been imported, because the import is
 * refused server-side on a second run anyway.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/layout/AppShell';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { LoadingState, ErrorState } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { useAuth } from '@/lib/client/auth-context';
import { apiInvoke, ApiError } from '@/lib/client/api';

interface SampleRow {
  sequence: number;
  headOfFamilyName: string;
  wifeName: string | null;
  occurrences: number | null;
  sourceRefs: string | null;
}

interface ImportPreview {
  alreadyImported: boolean;
  importedAt: string | null;
  importedBy: string | null;
  fileName: string;
  totalRows: number;
  toCreate: number;
  alreadyPresent: number;
  errors: { row: number; message: string }[];
  sample: SampleRow[];
}

interface ImportResult {
  created: number;
  skipped: number;
  errors: number;
  batchId: string;
}

const SAMPLE_COLUMNS: Column<SampleRow>[] = [
  { key: 'sequence', header: 'تسلسل' },
  { key: 'headOfFamilyName', header: 'اسم رب الأسرة / المنتسب' },
  { key: 'wifeName', header: 'اسم الزوجة', render: (r) => r.wifeName || '—' },
  { key: 'occurrences', header: 'عدد مرات الظهور', render: (r) => r.occurrences ?? '—' },
  { key: 'sourceRefs', header: 'مراجع القيود الأصلية', render: (r) => r.sourceRefs || '—' },
];

export default function ImportPage() {
  const { can } = useAuth();
  const { notify } = useToast();
  const { confirm } = useConfirm();

  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPreview(await apiInvoke<ImportPreview>('import:previewLegacy'));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر قراءة ملف الاستيراد');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleImport() {
    if (!preview) return;
    const ok = await confirm({
      title: 'اعتماد الاستيراد',
      message: `سيتم إنشاء ${preview.toCreate} أسرة في قاعدة البيانات. الرقم الوطني وعدد الأفراد في دفتر العائلة سيبقيان فارغين لاستكمالهما لاحقاً. هل تريد المتابعة؟`,
      confirmLabel: 'اعتماد الاستيراد',
    });
    if (!ok) return;

    setRunning(true);
    try {
      const res = await apiInvoke<ImportResult>('import:runLegacy');
      setResult(res);
      notify(`تم استيراد ${res.created} أسرة بنجاح`, 'success');
      await load();
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'تعذر تنفيذ الاستيراد', 'error');
    } finally {
      setRunning(false);
    }
  }

  return (
    <AppShell>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">استيراد سجل المنتسبين</h1>
      </div>

      {loading && <LoadingState label="جارٍ قراءة ملف الاستيراد..." />}
      {!loading && error && <ErrorState message={error} onRetry={load} />}

      {!loading && !error && preview && (
        <div className="space-y-4">
          <section className="card p-5">
            <h2 className="mb-1 text-base font-bold text-gray-800">1. مراجعة الملف</h2>
            <p className="mb-4 text-sm text-gray-500">
              الملف المرفق مع البرنامج: <span className="font-mono">{preview.fileName}</span>
            </p>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatCard label="عدد السجلات في الملف" value={preview.totalRows} />
              <StatCard label="سيتم إنشاؤها" value={preview.toCreate} tone="good" />
              <StatCard label="موجودة مسبقاً (لن تتكرر)" value={preview.alreadyPresent} />
              <StatCard label="أخطاء في القراءة" value={preview.errors.length} tone={preview.errors.length ? 'bad' : undefined} />
            </div>

            {preview.alreadyImported && (
              <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
                تم تنفيذ هذا الاستيراد مسبقاً
                {preview.importedAt ? ` بتاريخ ${preview.importedAt.slice(0, 10)}` : ''}
                {preview.importedBy ? ` بواسطة ${preview.importedBy}` : ''}. لن يتم تكراره.
              </p>
            )}

            {preview.errors.length > 0 && (
              <ul className="mt-4 space-y-1 rounded-md bg-red-50 p-3 text-sm text-red-700">
                {preview.errors.slice(0, 10).map((e) => (
                  <li key={e.row}>الصف {e.row}: {e.message}</li>
                ))}
              </ul>
            )}
          </section>

          <section className="card">
            <div className="border-b border-gray-100 px-5 py-4">
              <h2 className="text-base font-bold text-gray-800">2. عينة من البيانات</h2>
              <p className="text-sm text-gray-500">
                أول {preview.sample.length} سجلات كما ستُقرأ من الملف. الأسماء تُحفظ كما هي دون تعديل.
              </p>
            </div>
            <DataTable
              columns={SAMPLE_COLUMNS}
              rows={preview.sample}
              rowKey={(r) => String(r.sequence)}
              emptyTitle="لا توجد سجلات في الملف"
            />
          </section>

          <section className="card p-5">
            <h2 className="mb-1 text-base font-bold text-gray-800">3. اعتماد الاستيراد</h2>
            <p className="mb-4 text-sm text-gray-500">
              لن تتغير قاعدة البيانات قبل الضغط على زر الاعتماد. يتم الاستيراد داخل عملية واحدة،
              فإما أن تُحفظ كل السجلات أو لا يُحفظ أي منها.
            </p>

            {result && (
              <div className="mb-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
                تم إنشاء {result.created} أسرة، وتم تخطي {result.skipped} سجلاً موجوداً مسبقاً.{' '}
                <Link href="/families/incomplete" className="underline">
                  استكمال البيانات الناقصة
                </Link>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <button
                className="btn-primary"
                disabled={running || preview.alreadyImported || preview.toCreate === 0 || !can('families', 'create')}
                onClick={handleImport}
              >
                {running ? 'جارٍ الاستيراد...' : 'اعتماد الاستيراد'}
              </button>
              <Link className="btn-secondary" href="/families/incomplete">
                شاشة استكمال البيانات الناقصة
              </Link>
            </div>

            {!can('families', 'create') && (
              <p className="mt-3 text-sm text-gray-500">ليست لديك صلاحية تنفيذ الاستيراد.</p>
            )}
          </section>
        </div>
      )}
    </AppShell>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone?: 'good' | 'bad' }) {
  const toneClass =
    tone === 'good' ? 'text-green-700' : tone === 'bad' ? 'text-red-700' : 'text-gray-800';
  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <div className={'text-2xl font-bold ' + toneClass}>{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  );
}
