/**
 * Tandara StudentImportModal
 * Provides visual import interface for CSV/XLSX without fake parsing or storing.
 */

import React, { useState } from 'react';
import { Modal } from '../ui/Modal';
import { UploadCloud, FileSpreadsheet, AlertCircle, X } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { studentsService } from '../../services/students.service';

interface StudentImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImported: () => Promise<void>;
}

export const StudentImportModal: React.FC<StudentImportModalProps> = ({ isOpen, onClose, onImported }) => {
  const { showToast } = useToast();
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof studentsService.previewImport>> | null>(null);
  const [busy, setBusy] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFileName(e.target.files[0].name);
      setFile(e.target.files[0]); setPreview(null);
    }
  };

  const handleImportSubmit = async () => {
    if (!file || !preview || preview.invalid_rows) return;
    setBusy(true); try { await studentsService.importStudents(file); await onImported(); showToast({ type: 'success', message: 'Data siswa berhasil diimpor.' }); setSelectedFileName(null); setFile(null); setPreview(null); onClose(); } catch (e) { showToast({ type: 'error', message: e instanceof Error ? e.message : 'Impor gagal.' }); } finally { setBusy(false); }
  };
  const handlePreview = async () => { if (!file) return; setBusy(true); try { setPreview(await studentsService.previewImport(file)); } catch (e) { showToast({ type: 'error', message: e instanceof Error ? e.message : 'Preview gagal.' }); } finally { setBusy(false); } };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Impor Data Siswa Sekaligus"
      subtitle="Unggah berkas CSV UTF-8 sesuai format template sekolah"
      maxWidth="md"
    >
      <div className="space-y-4">
        {/* Upload Zone */}
        <label className="border border-dashed border-slate-300 hover:border-slate-400 bg-slate-50 hover:bg-slate-100/60 rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer transition-colors text-center">
          <div className="w-10 h-10 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600 mb-3">
            <UploadCloud className="w-5 h-5" />
          </div>
          <p className="text-sm font-semibold text-slate-800">
            Pilih berkas CSV
          </p>
          <p className="text-xs text-slate-500 mt-1">Gunakan template CSV; batas ukuran divalidasi server.</p>
          <input
            type="file"
            accept=".csv"
            disabled={busy}
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
            onClick={() => { setSelectedFileName(null); setFile(null); setPreview(null); }}
              className="text-slate-400 hover:text-slate-600 p-1"
              disabled={busy}
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
            CSV akan divalidasi dulu. Impor hanya tersedia jika semua baris valid.
          </p>
        </div>

        {preview && preview.rows.filter((row) => !row.valid).map((row) => <p key={row.row_number} role="alert" className="text-xs text-red-700">Baris {row.row_number}: {row.errors.map((error) => `${error.field}: ${error.message}`).join('; ')}</p>)}
        {/* Actions */}
        <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
          {preview && <p className="mr-auto text-xs text-slate-600">{preview.total_rows} baris · {preview.valid_rows} valid · {preview.invalid_rows} invalid</p>}
          <button type="button" onClick={() => studentsService.downloadTemplate().catch((e) => showToast({ type: 'error', message: e.message }))} className="px-3 py-2 text-xs text-blue-700">Template CSV</button>
          <button type="button" disabled={!file || busy} onClick={handlePreview} className="px-3 py-2 text-xs text-blue-700 disabled:opacity-40">Preview</button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs sm:text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200"
          >
            Batal
          </button>
          <button
            type="button"
            disabled={!selectedFileName || !preview || preview.invalid_rows > 0 || busy}
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
