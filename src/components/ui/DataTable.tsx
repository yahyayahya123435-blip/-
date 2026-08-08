'use client';

import { LoadingState, EmptyState, ErrorState } from './States';

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  emptyTitle?: string;
  onRowClick?: (row: T) => void;
  actions?: (row: T) => React.ReactNode;
}

export function DataTable<T>({ columns, rows, rowKey, loading, error, onRetry, emptyTitle, onRowClick, actions }: DataTableProps<T>) {
  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={onRetry} />;
  if (rows.length === 0) return <EmptyState title={emptyTitle} />;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-right text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-gray-500">
            {columns.map((col) => (
              <th key={col.key} className={'px-3 py-2 font-medium ' + (col.className ?? '')}>
                {col.header}
              </th>
            ))}
            {actions && <th className="px-3 py-2" />}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              className={'border-b border-gray-100 hover:bg-gray-50 ' + (onRowClick ? 'cursor-pointer' : '')}
              onClick={() => onRowClick?.(row)}
            >
              {columns.map((col) => (
                <td key={col.key} className={'px-3 py-2 ' + (col.className ?? '')}>
                  {col.render ? col.render(row) : String((row as Record<string, unknown>)[col.key] ?? '—')}
                </td>
              ))}
              {actions && (
                <td className="px-3 py-2 text-left" onClick={(e) => e.stopPropagation()}>
                  {actions(row)}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Pagination({
  page, pageSize, total, onPageChange,
}: { page: number; pageSize: number; total: number; onPageChange: (page: number) => void }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex items-center justify-between border-t border-gray-100 px-3 py-3 text-sm text-gray-600">
      <span>
        {total === 0 ? '0 نتيجة' : `عرض ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} من ${total}`}
      </span>
      <div className="flex gap-1">
        <button className="btn-secondary px-2 py-1" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          السابق
        </button>
        <span className="px-2 py-1">{page} / {totalPages}</span>
        <button className="btn-secondary px-2 py-1" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
          التالي
        </button>
      </div>
    </div>
  );
}
