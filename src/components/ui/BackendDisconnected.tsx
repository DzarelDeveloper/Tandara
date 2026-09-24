/**
 * Reusable BackendDisconnected Component
 * Clearly informs the user about the offline FastAPI status during prototype evaluation.
 */

import React from 'react';
import { ServerOff, RefreshCw } from 'lucide-react';
import { useToast } from '../../context/ToastContext';

interface BackendDisconnectedProps {
  moduleName?: string;
  onCheckAgain?: () => void;
  className?: string;
}

export const BackendDisconnected: React.FC<BackendDisconnectedProps> = ({
  moduleName = 'Modul ini',
  onCheckAgain,
  className = '',
}) => {
  const { showBackendNotConnected } = useToast();

  const handleTestConnection = () => {
    if (onCheckAgain) {
      onCheckAgain();
    } else {
      showBackendNotConnected();
    }
  };

  return (
    <div
      className={`p-6 sm:p-8 rounded-xl border border-amber-200 bg-amber-50/60 text-slate-800 ${className}`}
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 justify-between">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center text-amber-700 shrink-0">
            <ServerOff className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-semibold text-slate-900">
                Backend Lokal Belum Terhubung
              </h4>
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-md border border-slate-300 bg-white text-slate-700">
                Menunggu Integrasi
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-1 max-w-xl leading-relaxed">
              {moduleName} disiapkan untuk terhubung ke FastAPI lokal (port 8000). Karena belum ada server aktif, seluruh data ditampilkan dalam keadaan kosong dan input belum dapat disimpan.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleTestConnection}
          className="inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-2xs shrink-0 self-end sm:self-center"
        >
          <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
          Periksa Koneksi
        </button>
      </div>
    </div>
  );
};
