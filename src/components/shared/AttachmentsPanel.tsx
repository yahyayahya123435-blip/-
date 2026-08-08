'use client';

import { useEffect, useState } from 'react';
import { apiInvoke, ApiError } from '@/lib/client/api';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { useAuth } from '@/lib/client/auth-context';

interface Attachment {
  id: string;
  fileName: string;
  storedName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

/** Drop into any detail view: `<AttachmentsPanel entityType="families" entityId={family.id} />` */
export function AttachmentsPanel({ entityType, entityId }: { entityType: string; entityId: string }) {
  const { can } = useAuth();
  const { notify } = useToast();
  const { confirm } = useConfirm();
  const [items, setItems] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  function load() {
    setLoading(true);
    apiInvoke<Attachment[]>('attachments:list', { entityType, entityId })
      .then(setItems)
      .catch((e) => notify(e instanceof Error ? e.message : 'تعذر تحميل المرفقات', 'error'))
      .finally(() => setLoading(false));
  }

  useEffect(load, [entityType, entityId]);

  async function handleUpload() {
    setUploading(true);
    try {
      const result = await apiInvoke<{ canceled: boolean }>('attachments:pickAndUpload', { entityType, entityId });
      if (!result.canceled) {
        notify('تم رفع المرفق بنجاح', 'success');
        load();
      }
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'تعذر رفع الملف', 'error');
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(item: Attachment) {
    const ok = await confirm({ title: 'حذف المرفق', message: `هل تريد حذف الملف "${item.fileName}"؟`, danger: true, confirmLabel: 'حذف' });
    if (!ok) return;
    try {
      await apiInvoke('attachments:delete', { id: item.id });
      notify('تم حذف المرفق', 'success');
      load();
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'تعذر حذف الملف', 'error');
    }
  }

  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-bold">المرفقات ({items.length})</h2>
        {can('documents', 'create') && (
          <button className="btn-secondary" onClick={handleUpload} disabled={uploading}>
            {uploading ? 'جارٍ الرفع...' : '+ إرفاق ملف'}
          </button>
        )}
      </div>
      {loading ? (
        <p className="text-sm text-gray-500">جارٍ التحميل...</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-gray-500">لا توجد مرفقات</p>
      ) : (
        <ul className="divide-y divide-gray-100 text-sm">
          {items.map((item) => (
            <li key={item.id} className="flex items-center justify-between py-2">
              <button
                className="text-brand-600 hover:underline"
                onClick={() => apiInvoke('attachments:openInFolder', { storedName: item.storedName }).catch(() => undefined)}
              >
                📎 {item.fileName}
              </button>
              <div className="flex items-center gap-3 text-xs text-gray-500">
                <span>{(item.sizeBytes / 1024).toFixed(0)} كيلوبايت</span>
                {can('documents', 'delete') && (
                  <button className="text-red-600 hover:underline" onClick={() => handleDelete(item)}>
                    حذف
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
