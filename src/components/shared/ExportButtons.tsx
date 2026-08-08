'use client';

import { useState } from 'react';
import { exportDocument, type DocumentSpec } from '@/lib/client/documents';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/lib/client/auth-context';

/** Drop into any detail view to offer PDF/Word/Excel export of that record. Requires documents.export permission. */
export function ExportButtons({ buildSpec }: { buildSpec: () => DocumentSpec }) {
  const { can } = useAuth();
  const { notify } = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  if (!can('documents', 'export')) return null;

  async function handleExport(format: 'pdf' | 'docx' | 'xlsx') {
    setBusy(format);
    try {
      await exportDocument(format, buildSpec());
      notify('تم إنشاء المستند بنجاح', 'success');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'تعذر إنشاء المستند، يرجى المحاولة مرة أخرى', 'error');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex gap-2">
      <button className="btn-secondary" disabled={busy !== null} onClick={() => handleExport('pdf')}>
        {busy === 'pdf' ? 'جارٍ التصدير...' : 'تصدير PDF'}
      </button>
      <button className="btn-secondary" disabled={busy !== null} onClick={() => handleExport('docx')}>
        {busy === 'docx' ? 'جارٍ التصدير...' : 'تصدير Word'}
      </button>
      <button className="btn-secondary" disabled={busy !== null} onClick={() => handleExport('xlsx')}>
        {busy === 'xlsx' ? 'جارٍ التصدير...' : 'تصدير Excel'}
      </button>
    </div>
  );
}
