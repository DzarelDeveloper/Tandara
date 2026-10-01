/**
 * Reusable DataTable Component
 * Accessible semantic table with pagination controls, responsive wrapper, and empty state.
 */

import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { EmptyState } from './EmptyState';

export interface Column<T> {
  key: string;
  header: string;
  className?: string;
  render?: (item: T, index: number) => React.ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  emptyTitle?: string;
  emptyDescription?: string;
  emptyActionText?: string;
  onEmptyAction?: () => void;
  itemsPerPage?: number;
  totalItemsCount?: number;
}

export function DataTable<T>({
  columns,
  data,
  emptyTitle = 'Belum ada data',
  emptyDescription = 'Belum ada data untuk ditampilkan.',
  emptyActionText,
  onEmptyAction,
  itemsPerPage = 10,
}: DataTableProps<T>) {
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(data.length / itemsPerPage));

  const page = Math.min(currentPage, totalPages);
  useEffect(() => { setCurrentPage((value) => Math.min(value, totalPages)); }, [totalPages]);

  const startIndex = (page - 1) * itemsPerPage;
  const currentData = data.slice(startIndex, startIndex + itemsPerPage);

  if (data.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden p-6">
        <EmptyState
          title={emptyTitle}
          description={emptyDescription}
          actionText={emptyActionText}
          onAction={onEmptyAction}
        />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-slate-700">
          <thead className="bg-slate-50/80 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200">
            <tr>
              {columns.map((col) => (
                <th key={col.key} scope="col" className={`px-4 py-3 ${col.className || ''}`}>
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {currentData.map((item, rowIdx) => (
              <tr key={rowIdx} className="hover:bg-slate-50/60 transition-colors">
                {columns.map((col) => (
                  <td key={col.key} className={`px-4 py-3 text-slate-700 ${col.className || ''}`}>
                    {col.render
                      ? col.render(item, startIndex + rowIdx)
                      : ((item as Record<string, unknown>)[col.key] as React.ReactNode)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      <div className="px-5 py-3.5 bg-slate-50/50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
        <div>
          Menampilkan <span className="font-semibold text-slate-700">{data.length === 0 ? 0 : startIndex + 1}</span> -{' '}
          <span className="font-semibold text-slate-700">{Math.min(startIndex + itemsPerPage, data.length)}</span> dari{' '}
          <span className="font-semibold text-slate-700">{data.length}</span> baris
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 disabled:opacity-40 disabled:pointer-events-none transition-colors"
            aria-label="Halaman sebelumnya"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="px-2 font-medium text-slate-600">
            {page} / {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 disabled:opacity-40 disabled:pointer-events-none transition-colors"
            aria-label="Halaman berikutnya"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
