'use client';

export function LoadingState({ label = 'جارٍ التحميل...' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-gray-500">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function EmptyState({ title = 'لا توجد بيانات', description, action }: { title?: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-gray-500">
      <div className="text-4xl">📭</div>
      <div className="text-base font-medium text-gray-700">{title}</div>
      {description && <p className="max-w-sm text-sm">{description}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ message = 'حدث خطأ غير متوقع', onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <div className="text-4xl">⚠️</div>
      <p className="max-w-sm text-sm text-red-600">{message}</p>
      {onRetry && (
        <button className="btn-secondary" onClick={onRetry}>
          إعادة المحاولة
        </button>
      )}
    </div>
  );
}
