/**
 * Tandara StudentImportModal
 * Provides visual import interface for CSV/XLSX without fake parsing or storing.
 */

import React, { useState } from 'react';
import { Modal } from '../ui/Modal';
import { UploadCloud, FileSpreadsheet, AlertCircle, X } from 'lucide-react';
import { useToast } from '../../context/ToastContext';

interface StudentImportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const StudentImportModal: React.FC<StudentImportModalProps> = ({ isOpen, onClose }) => {
  const { showBackendNotConnected } = useToast();
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFileName(e.target.files[0].name);
    }
  };

  const handleImportSubmit = () => {
    if (!selectedFileName) return;
    showBackendNotConnected(
      'Backend belum terhubung. File impor siswa belum dapat diproses oleh server.'
    );
    setSelectedFileName(null);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Impor Data Siswa Sekaligus"
      subtitle="Unggah berkas CSV atau XLSX sesuai format template sekolah"
      maxWidth="md"
    >
      <div className="space-y-4">
        {/* Upload Zone */}
        <label className="border border-dashed border-slate-300 hover:border-slate-400 bg-slate-50 hover:bg-slate-100/60 rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer transition-colors text-center">
          <div className="w-10 h-10 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600 mb-3">
            <UploadCloud className="w-5 h-5" />
          </div>
          <p className="text-sm font-semibold text-slate-800">
            Pilih atau seret berkas CSV / Excel (.xlsx)
          </p>
          <p className="text-xs text-slate-500 mt-1">Maksimal ukuran berkas 5 MB</p>
          <input
            type="file"
            accept=".csv, .xlsx, .xls"
            onChange={handleFileChange}
            className="hidden"
          />
        </label>

        {/* Selected File Badge */}
        {selectedFileName && (
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between text-xs text-slate-800">
            <div className="flex items-center gap-2 truncate">
              <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
              <span className="font-medium truncate">{selectedFileName}</span>
            </div>
            <button
              type="button"
              onClick={() => setSelectedFileName(null)}
              className="text-slate-400 hover:text-slate-600 p-1"
              aria-label="Batalkan pilihan berkas"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Informational Box */}
        <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            Pemrosesan batch dan validasi NIS ganda memerlukan FastAPI backend dan koneksi basis data SQLite yang aktif.
          </p>
        </div>

        {/* Actions */}
        <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs sm:text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200"
          >
            Batal
          </button>
          <button
            type="button"
            disabled={!selectedFileName}
            onClick={handleImportSubmit}
            className="px-4 py-2 text-xs sm:text-sm font-medium text-white bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-40 disabled:cursor-not-allowed rounded-lg shadow-xs transition-colors"
          >
            Mulai Impor Berkas
          </button>
        </div>
      </div>
    </Modal>
  );
};
