'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { useAuth } from '@/lib/client/auth-context';
import { apiInvoke, ApiError } from '@/lib/client/api';

interface BackupEntry {
  fileName: string;
  sizeBytes: number;
  createdAt: string;
}

function formatSize(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(2)} م.ب`;
}

export default function BackupPage() {
  const { can } = useAuth();
  const { notify } = useToast();
  const { confirm } = useConfirm();

  const [rows, setRows] = useState<BackupEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [restoringFile, setRestoringFile] = useState<string | null>(null);

  function loadList() {
    setLoading(true);
    setError(null);
    apiInvoke<BackupEntry[]>('backup:list')
      .then(setRows)
      .catch((e) => setError(e instanceof Error ? e.message : 'حدث خطأ غير متوقع'))
      .finally(() => setLoading(false));
  }

  useEffect(loadList, []);

  async function handleCreate() {
    setCreating(true);
    try {
      const { filePath } = await apiInvoke<{ filePath: string }>('backup:create');
      notify(`تم إنشاء نسخة احتياطية وحفظها في: ${filePath}`, 'success');
      loadList();
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'تعذر إنشاء النسخة الاحتياطية', 'error');
    } finally {
      setCreating(false);
    }
  }

  async function handleRestore(entry: BackupEntry) {
    const ok = await confirm({
      title: 'استعادة نسخة احتياطية',
      message: 'سيتم استبدال جميع البيانات الحالية بالنسخة الاحتياطية المحددة. سيتم أخذ نسخة احتياطية تلقائية من الحالة الحالية أولاً قبل الاستعادة. هل تريد المتابعة؟',
      danger: true,
      confirmLabel: 'استعادة',
    });
    if (!ok) return;
    setRestoringFile(entry.fileName);
    try {
      await apiInvoke('backup:restore', { fileName: entry.fileName });
      notify('تمت استعادة البيانات بنجاح. قد تحتاج لإعادة تحميل التطبيق حتى تنعكس جميع البيانات في الواجهة.', 'success');
      loadList();
    } catch (err) {
      notify(
        (err instanceof ApiError ? err.message : 'تعذرت عملية الاستعادة') + ' لم يتم تغيير بياناتك، فقد تم التراجع تلقائياً إلى حالتها السابقة.',
        'error',
      );
    } finally {
      setRestoringFile(null);
    }
  }

  const columns: Column<BackupEntry>[] = [
    { key: 'fileName', header: 'اسم الملف' },
    { key: 'sizeBytes', header: 'الحجم', render: (r) => formatSize(r.sizeBytes) },
    { key: 'createdAt', header: 'تاريخ الإنشاء', render: (r) => new Date(r.createdAt).toLocaleString('ar-JO') },
  ];

  return (
    <AppShell>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">النسخ الاحتياطي</h1>
        {can('backup', 'create') && (
          <button className="btn-primary" onClick={handleCreate} disabled={creating}>
            {creating ? 'جارٍ إنشاء النسخة...' : 'إنشاء نسخة احتياطية الآن'}
          </button>
        )}
      </div>

      <div className="card">
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.fileName}
          loading={loading}
          error={error}
          onRetry={loadList}
          emptyTitle="لا توجد نسخ احتياطية بعد"
          actions={
            can('backup', 'update')
              ? (row) => (
                  <button
                    className="text-xs text-brand-600 hover:underline disabled:opacity-50"
                    disabled={restoringFile === row.fileName}
                    onClick={() => handleRestore(row)}
                  >
                    {restoringFile === row.fileName ? 'جارٍ الاستعادة...' : 'استعادة'}
                  </button>
                )
              : undefined
          }
        />
      </div>
    </AppShell>
  );
}
