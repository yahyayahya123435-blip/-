'use client';

/**
 * "النقل من الهاتف" — importing a .gztransfer package produced by the field
 * app, and exporting the family list back to it.
 *
 * The preview is the whole point of this screen: the operator sees exactly
 * how many records are new, updated, unchanged, in conflict or broken, and
 * the database is not touched until "اعتماد الاستيراد" is pressed.
 */

import { useCallback, useEffect, useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { LoadingState } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { useAuth } from '@/lib/client/auth-context';
import { apiInvoke, ApiError } from '@/lib/client/api';

type RowStatus = 'new' | 'updated' | 'unchanged' | 'conflict' | 'error';

interface Counts {
  new: number;
  updated: number;
  unchanged: number;
  conflict: number;
  error: number;
}

interface RowPlan {
  entity: string;
  id: string;
  label: string;
  status: RowStatus;
  reason?: string;
}

interface Preview {
  fileName: string;
  checksum: string;
  manifest: {
    exportedAt: string;
    deviceId: string;
    deviceLabel?: string;
    sourceUser: string | null;
    appVersion: string;
    schemaVersion: number;
  };
  alreadyImported: boolean;
  importedAt: string | null;
  counts: Counts;
  perEntity: Record<string, Counts>;
  attachmentCount: number;
  rows: RowPlan[];
  totalRecords: number;
}

interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  attachmentsImported: number;
}

interface Batch {
  id: string;
  kind: string;
  sourceName: string;
  deviceId: string | null;
  sourceUser: string | null;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  errorCount: number;
  importedBy: string | null;
  importedAt: string;
}

const ENTITY_LABELS: Record<string, string> = {
  families: 'الأسر',
  familyMembers: 'أفراد الأسرة',
  beneficiaries: 'المستفيدون',
  socialAssessments: 'البحث الاجتماعي',
  fieldVisits: 'الزيارات الميدانية',
  assistances: 'المساعدات',
};

const STATUS_LABELS: Record<RowStatus, string> = {
  new: 'جديد',
  updated: 'معدّل',
  unchanged: 'بدون تغيير',
  conflict: 'متعارض',
  error: 'خطأ',
};

const STATUS_CLASSES: Record<RowStatus, string> = {
  new: 'bg-green-50 text-green-700',
  updated: 'bg-blue-50 text-blue-700',
  unchanged: 'bg-gray-100 text-gray-600',
  conflict: 'bg-amber-50 text-amber-800',
  error: 'bg-red-50 text-red-700',
};

export default function TransferPage() {
  const { can } = useAuth();
  const { notify } = useToast();
  const { confirm } = useConfirm();

  const [preview, setPreview] = useState<Preview | null>(null);
  const [filePath, setFilePath] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [history, setHistory] = useState<Batch[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      setHistory(await apiInvoke<Batch[]>('transfer:history', { limit: 25 }));
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  async function handlePick() {
    setPicking(true);
    setResult(null);
    try {
      const res = await apiInvoke<
        { canceled: true } | { canceled: false; filePath: string; preview: Preview }
      >('transfer:pickAndPreview');
      if (res.canceled) return;
      setFilePath(res.filePath);
      setPreview(res.preview);
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'تعذر قراءة ملف النقل', 'error');
      setPreview(null);
      setFilePath(null);
    } finally {
      setPicking(false);
    }
  }

  async function handleCommit() {
    if (!preview || !filePath) return;
    const ok = await confirm({
      title: 'اعتماد الاستيراد',
      message:
        `سيتم إضافة ${preview.counts.new} سجلاً جديداً وتحديث ${preview.counts.updated} سجلاً` +
        (preview.counts.conflict > 0
          ? `، مع تجاهل ${preview.counts.conflict} سجلاً متعارضاً (النسخة المحفوظة أحدث).`
          : '.') +
        ' هل تريد المتابعة؟',
      confirmLabel: 'اعتماد الاستيراد',
    });
    if (!ok) return;

    setCommitting(true);
    try {
      const res = await apiInvoke<ImportResult>('transfer:commit', { filePath });
      setResult(res);
      notify(`تم استيراد ${res.created + res.updated} سجلاً من الهاتف`, 'success');
      setPreview(null);
      setFilePath(null);
      await loadHistory();
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'تعذر تنفيذ الاستيراد', 'error');
    } finally {
      setCommitting(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      const { filePath: out } = await apiInvoke<{ filePath: string }>('transfer:exportForMobile');
      notify('تم إنشاء ملف النقل إلى الهاتف داخل مجلد المستندات', 'success');
      await apiInvoke('transfer:revealFile', { filePath: out }).catch(() => undefined);
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'تعذر إنشاء ملف النقل', 'error');
    } finally {
      setExporting(false);
    }
  }

  const canImport = can('transfer', 'create');
  const blocked = preview?.alreadyImported || (preview ? preview.counts.new + preview.counts.updated === 0 : true);

  return (
    <AppShell>
      <div className="mb-4">
        <h1 className="text-xl font-bold">النقل اليدوي بين الهاتف والكمبيوتر</h1>
        <p className="text-sm text-gray-500">
          لا يوجد اتصال مباشر أو مزامنة تلقائية — يتم النقل عبر ملف واحد يُنقل يدوياً.
        </p>
      </div>

      <section className="card mb-4 p-5">
        <h2 className="mb-1 text-base font-bold text-gray-800">استيراد من الهاتف</h2>
        <p className="mb-4 text-sm text-gray-500">
          اختر ملف <span className="font-mono">.gztransfer</span> المُصدَّر من تطبيق العمل الميداني.
          لن تتغير قاعدة البيانات قبل اعتماد الاستيراد.
        </p>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" onClick={handlePick} disabled={picking || !can('transfer', 'view')}>
            {picking ? 'جارٍ القراءة...' : 'اختيار ملف النقل'}
          </button>
          <button className="btn-secondary" onClick={handleExport} disabled={exporting || !can('transfer', 'export')}>
            {exporting ? 'جارٍ التصدير...' : 'تصدير بيانات الأسر إلى الهاتف'}
          </button>
        </div>

        {result && (
          <div className="mt-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
            تم إنشاء {result.created} سجلاً، وتحديث {result.updated}، وتخطي {result.skipped}
            {result.attachmentsImported > 0 ? `، واستيراد ${result.attachmentsImported} مرفقاً` : ''}.
          </div>
        )}
      </section>

      {preview && (
        <section className="card mb-4">
          <div className="border-b border-gray-100 px-5 py-4">
            <h2 className="text-base font-bold text-gray-800">معاينة ملف النقل</h2>
            <p className="mt-1 text-sm text-gray-500">
              <span className="font-mono">{preview.fileName}</span> — من جهاز{' '}
              {preview.manifest.deviceLabel ?? preview.manifest.deviceId.slice(0, 8)}
              {preview.manifest.sourceUser ? ` بواسطة ${preview.manifest.sourceUser}` : ''} بتاريخ{' '}
              {preview.manifest.exportedAt.slice(0, 16).replace('T', ' ')}
            </p>
            {preview.alreadyImported && (
              <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
                تم استيراد هذا الملف مسبقاً
                {preview.importedAt ? ` بتاريخ ${preview.importedAt.slice(0, 10)}` : ''}. لن يتم تكراره.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 p-5 md:grid-cols-5">
            <Stat label="سجلات جديدة" value={preview.counts.new} className="text-green-700" />
            <Stat label="سجلات معدّلة" value={preview.counts.updated} className="text-blue-700" />
            <Stat label="بدون تغيير" value={preview.counts.unchanged} className="text-gray-600" />
            <Stat label="متعارضة" value={preview.counts.conflict} className="text-amber-700" />
            <Stat label="أخطاء" value={preview.counts.error} className="text-red-700" />
          </div>

          <div className="overflow-x-auto border-t border-gray-100">
            <table className="w-full text-right text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-gray-500">
                  <th className="px-3 py-2 font-medium">القسم</th>
                  <th className="px-3 py-2 font-medium">جديد</th>
                  <th className="px-3 py-2 font-medium">معدّل</th>
                  <th className="px-3 py-2 font-medium">بدون تغيير</th>
                  <th className="px-3 py-2 font-medium">متعارض</th>
                  <th className="px-3 py-2 font-medium">خطأ</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(preview.perEntity).map(([entity, counts]) => (
                  <tr key={entity} className="border-b border-gray-100">
                    <td className="px-3 py-2">{ENTITY_LABELS[entity] ?? entity}</td>
                    <td className="px-3 py-2">{counts.new}</td>
                    <td className="px-3 py-2">{counts.updated}</td>
                    <td className="px-3 py-2">{counts.unchanged}</td>
                    <td className="px-3 py-2">{counts.conflict}</td>
                    <td className="px-3 py-2">{counts.error}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {preview.rows.some((r) => r.status === 'conflict' || r.status === 'error') && (
            <div className="border-t border-gray-100 p-5">
              <h3 className="mb-2 text-sm font-bold text-gray-700">السجلات التي تحتاج مراجعة</h3>
              <ul className="space-y-1 text-sm">
                {preview.rows
                  .filter((r) => r.status === 'conflict' || r.status === 'error')
                  .slice(0, 20)
                  .map((r) => (
                    <li key={`${r.entity}-${r.id}`} className="flex flex-wrap items-center gap-2">
                      <span className={'rounded px-2 py-0.5 text-xs ' + STATUS_CLASSES[r.status]}>
                        {STATUS_LABELS[r.status]}
                      </span>
                      <span className="text-gray-700">{ENTITY_LABELS[r.entity] ?? r.entity} — {r.label}</span>
                      {r.reason && <span className="text-xs text-gray-500">({r.reason})</span>}
                    </li>
                  ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 px-5 py-4">
            <span className="text-sm text-gray-500">
              {preview.attachmentCount > 0 ? `${preview.attachmentCount} مرفقاً في الملف` : 'لا توجد مرفقات'}
            </span>
            <div className="flex gap-2">
              <button className="btn-secondary" onClick={() => { setPreview(null); setFilePath(null); }}>
                إلغاء
              </button>
              <button className="btn-primary" onClick={handleCommit} disabled={committing || blocked || !canImport}>
                {committing ? 'جارٍ الاستيراد...' : 'اعتماد الاستيراد'}
              </button>
            </div>
          </div>
        </section>
      )}

      <section className="card">
        <div className="border-b border-gray-100 px-5 py-4">
          <h2 className="text-base font-bold text-gray-800">سجل عمليات الاستيراد</h2>
        </div>
        {historyLoading ? (
          <LoadingState />
        ) : history.length === 0 ? (
          <p className="p-5 text-sm text-gray-500">لم يتم تنفيذ أي عملية استيراد بعد.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-gray-500">
                  <th className="px-3 py-2 font-medium">التاريخ</th>
                  <th className="px-3 py-2 font-medium">الملف</th>
                  <th className="px-3 py-2 font-medium">النوع</th>
                  <th className="px-3 py-2 font-medium">أُنشئ</th>
                  <th className="px-3 py-2 font-medium">حُدّث</th>
                  <th className="px-3 py-2 font-medium">تُخطي</th>
                  <th className="px-3 py-2 font-medium">بواسطة</th>
                </tr>
              </thead>
              <tbody>
                {history.map((b) => (
                  <tr key={b.id} className="border-b border-gray-100">
                    <td className="px-3 py-2">{b.importedAt.slice(0, 16).replace('T', ' ')}</td>
                    <td className="px-3 py-2 font-mono text-xs">{b.sourceName}</td>
                    <td className="px-3 py-2">
                      {b.kind === 'legacy_families' ? 'سجل المنتسبين' : 'نقل من الهاتف'}
                    </td>
                    <td className="px-3 py-2">{b.createdCount}</td>
                    <td className="px-3 py-2">{b.updatedCount}</td>
                    <td className="px-3 py-2">{b.skippedCount}</td>
                    <td className="px-3 py-2">{b.importedBy ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AppShell>
  );
}

function Stat({ label, value, className }: { label: string; value: number; className: string }) {
  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <div className={'text-2xl font-bold ' + className}>{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  );
}
