import React, { useState } from 'react';
import { AlertCircle, FileSpreadsheet, UploadCloud, X } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { useToast } from '../../context/ToastContext';
import {
  StudentImportField,
  StudentImportMapping,
  StudentImportPreview,
  StudentImportResult,
  studentsService,
} from '../../services/students.service';

interface StudentImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImported: () => Promise<void>;
}

const mappingFields: Array<{ field: StudentImportField; label: string; required?: boolean }> = [
  { field: 'nis', label: 'NIS / NISN', required: true },
  { field: 'full_name', label: 'Nama siswa', required: true },
  { field: 'class_name', label: 'Kelas / Rombel', required: true },
  { field: 'major', label: 'Jurusan' },
  { field: 'gender', label: 'Jenis kelamin' },
  { field: 'guardian_name', label: 'Nama wali' },
  { field: 'guardian_phone', label: 'Nomor wali' },
];

export const StudentImportModal: React.FC<StudentImportModalProps> = ({ isOpen, onClose, onImported }) => {
  const { showToast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<StudentImportPreview | null>(null);
  const [mapping, setMapping] = useState<StudentImportMapping>({});
  const [mappingChanged, setMappingChanged] = useState(false);
  const [duplicatePolicy, setDuplicatePolicy] = useState<'skip' | 'abort'>('skip');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<StudentImportResult | null>(null);

  const runPreview = async (selectedFile: File, selectedMapping?: StudentImportMapping) => {
    setBusy(true);
    setResult(null);
    try {
      const nextPreview = await studentsService.previewImport(selectedFile, selectedMapping);
      setPreview(nextPreview);
      setMapping(nextPreview.mapping);
      setMappingChanged(nextPreview.mapping_required);
    } catch (error) {
      setPreview(null);
      showToast({ type: 'error', message: error instanceof Error ? error.message : 'Preview import gagal.' });
    } finally {
      setBusy(false);
    }
  };

  const selectFile = (selectedFile?: File) => {
    if (!selectedFile) return;
    setFile(selectedFile);
    setPreview(null);
    setMapping({});
    setMappingChanged(false);
    setResult(null);
    void runPreview(selectedFile);
  };

  const changeMapping = (field: StudentImportField, value: string) => {
    setMapping((current) => {
      const next = { ...current };
      if (value === '') delete next[field];
      else next[field] = Number(value);
      return next;
    });
    setMappingChanged(true);
    setResult(null);
  };

  const handlePreview = async () => {
    if (file) await runPreview(file, mapping);
  };

  const handleImport = async () => {
    if (!file || !preview || mappingChanged || preview.mapping_required || preview.valid_rows === 0) return;
    setBusy(true);
    try {
      const imported = await studentsService.importStudents(file, mapping, duplicatePolicy);
      await onImported();
      setResult(imported);
      showToast({ type: 'success', message: `${imported.imported_count} siswa berhasil ditambahkan.` });
    } catch (error) {
      showToast({ type: 'error', message: error instanceof Error ? error.message : 'Import siswa gagal.' });
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setFile(null);
    setPreview(null);
    setMapping({});
    setMappingChanged(false);
    setResult(null);
    setDuplicatePolicy('skip');
  };
  const close = () => {
    if (busy) return;
    reset();
    onClose();
  };
  const mappingComplete = Boolean(preview && !preview.mapping_required);
  const canImport = Boolean(file && preview && mappingComplete && !mappingChanged && preview.valid_rows > 0 && !busy && !result);

  return (
    <Modal
      isOpen={isOpen}
      onClose={close}
      title="Import Excel Siswa"
      subtitle="Unggah .xlsx atau .csv, tinjau kolom, lalu import data yang valid"
      maxWidth="xl"
    >
      <div className="space-y-4">
        <label
          className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center transition-colors hover:border-blue-400 hover:bg-blue-50/40"
          onDragOver={(event: React.DragEvent<HTMLLabelElement>) => event.preventDefault()}
          onDrop={(event: React.DragEvent<HTMLLabelElement>) => {
            event.preventDefault();
            selectFile(event.dataTransfer.files[0]);
          }}
        >
          <UploadCloud className="mb-2 h-6 w-6 text-blue-600" />
          <span className="text-sm font-semibold text-slate-800">Pilih atau tarik file Excel/CSV ke sini</span>
          <span className="mt-1 text-xs text-slate-500">.xlsx atau .csv, maksimal 5 MB dan 2.000 baris data</span>
          <input
            type="file"
            accept=".xlsx,.csv"
            className="hidden"
            disabled={busy}
            onChange={(event) => {
              selectFile(event.target.files?.[0]);
              event.currentTarget.value = '';
            }}
          />
        </label>

        {file && (
          <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-3 text-sm">
            <span className="flex min-w-0 items-center gap-2 truncate text-slate-700">
              <FileSpreadsheet className="h-4 w-4 shrink-0 text-emerald-600" />
              <span className="truncate">{file.name}</span>
            </span>
            <button type="button" disabled={busy} onClick={reset} aria-label="Hapus file yang dipilih" className="p-1 text-slate-500 disabled:opacity-50">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {busy && <p role="status" className="text-sm text-blue-700">Memproses dan memvalidasi data...</p>}

        {preview && (
          <>
            <details className="rounded-lg border border-slate-200 p-3" open={preview.mapping_required || undefined}>
              <summary className="cursor-pointer text-sm font-semibold text-slate-800">Pemetaan kolom</summary>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {mappingFields.map(({ field, label, required }) => (
                  <label key={field} className="text-xs font-medium text-slate-700">
                    {label}{required ? ' *' : ' (opsional)'}
                    <select
                      value={mapping[field] === undefined ? '' : String(mapping[field])}
                      disabled={busy}
                      onChange={(event) => changeMapping(field, event.target.value)}
                      className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm"
                    >
                      <option value="">Tidak dipetakan</option>
                      {preview.headers.map((header) => {
                        const selectedElsewhere = Object.entries(mapping).some(([selectedField, index]) => selectedField !== field && index === header.index);
                        return <option key={header.index} value={header.index} disabled={selectedElsewhere}>{header.label} (kolom {header.index + 1})</option>;
                      })}
                    </select>
                  </label>
                ))}
              </div>
              {(preview.mapping_required || mappingChanged) && (
                <button type="button" disabled={busy} onClick={handlePreview} className="mt-3 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
                  Validasi Preview
                </button>
              )}
              {preview.mapping_required && <p className="mt-2 text-xs text-amber-800">Petakan kolom NIS, nama siswa, dan kelas sebelum import.</p>}
              {mappingChanged && !preview.mapping_required && <p className="mt-2 text-xs text-amber-800">Pemetaan berubah. Jalankan Validasi Preview kembali sebelum import.</p>}
            </details>

            {!preview.mapping_required && (
              <>
                <div className="grid gap-2 sm:grid-cols-4">
                  <div className="rounded-lg bg-slate-50 p-3 text-sm"><strong>{preview.total_rows}</strong><span className="ml-1 text-slate-600">baris</span></div>
                  <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800"><strong>{preview.valid_rows}</strong><span className="ml-1">valid</span></div>
                  <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900"><strong>{preview.duplicate_rows}</strong><span className="ml-1">duplikat (dilewati)</span></div>
                  <div className="rounded-lg bg-red-50 p-3 text-sm text-red-800"><strong>{preview.invalid_rows}</strong><span className="ml-1">tidak valid</span></div>
                </div>
                <div className="max-h-80 overflow-auto rounded-lg border border-slate-200">
                  <table className="w-full min-w-[760px] text-left text-xs">
                    <thead className="sticky top-0 bg-slate-100 text-slate-600">
                      <tr><th className="p-2">Baris</th><th className="p-2">NIS</th><th className="p-2">Nama</th><th className="p-2">Kelas / Jurusan</th><th className="p-2">Status / Alasan</th></tr>
                    </thead>
                    <tbody>
                      {preview.rows.slice(0, 50).map((row) => (
                        <tr key={row.row_number} className="border-t border-slate-100 align-top">
                          <td className="p-2">{row.row_number}</td>
                          <td className="p-2 font-mono">{row.data.nis}</td>
                          <td className="p-2">{row.data.full_name}</td>
                          <td className="p-2">{row.data.class_name}{row.data.major ? ` · ${row.data.major}` : ''}</td>
                          <td className={`p-2 ${row.status === 'valid' ? 'text-emerald-700' : row.status === 'duplicate' ? 'text-amber-800' : 'text-red-700'}`}>
                            {row.status === 'valid' ? 'Valid' : row.status === 'duplicate' ? 'Duplikat' : 'Tidak valid'}
                            {row.errors.map((item, index) => <div key={`${item.field}-${index}`}>{item.field}: {item.message}</div>)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {preview.rows.length > 50 && <p className="p-2 text-xs text-slate-500">Menampilkan 50 dari {preview.rows.length} baris. Semua baris tetap divalidasi.</p>}
                </div>
                {preview.rows.slice(50).some((row) => row.status !== 'valid') && (
                  <details className="rounded-lg border border-amber-200 p-3">
                    <summary className="cursor-pointer text-xs font-semibold text-amber-900">
                      Alasan penolakan untuk baris lainnya
                    </summary>
                    <ul className="mt-2 space-y-2 text-xs text-slate-700">
                      {preview.rows.slice(50).filter((row) => row.status !== 'valid').map((row) => (
                        <li key={row.row_number}>
                          <strong>Baris {row.row_number} — {row.status === 'duplicate' ? 'Duplikat' : 'Tidak valid'}:</strong>{' '}
                          {row.errors.map((item) => item.message).join(' ')}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                {preview.duplicate_rows > 0 && (
                  <label className="block text-xs font-medium text-slate-700">
                    Kebijakan NIS duplikat
                    <select value={duplicatePolicy} disabled={busy} onChange={(event) => setDuplicatePolicy(event.target.value as 'skip' | 'abort')} className="ml-2 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs">
                      <option value="skip">Lewati duplikat dan lanjutkan (default)</option>
                      <option value="abort">Batalkan seluruh import bila ada duplikat</option>
                    </select>
                  </label>
                )}
              </>
            )}
          </>
        )}

        {result && (
          <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            <p className="font-semibold">Import selesai</p>
            <p>{result.imported_count} berhasil ditambahkan · {result.skipped_count} duplikat dilewati · {result.failed_count} gagal validasi.</p>
          </div>
        )}

        {preview?.rows.some((row) => row.status === 'invalid') && (
          <div className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            Baris tidak valid ditampilkan dengan nomor baris dan alasan; baris valid tetap dapat diimport.
          </div>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-3">
          <button type="button" disabled={busy} onClick={close} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 disabled:opacity-50">
            {result ? 'Selesai' : 'Batal'}
          </button>
          <button type="button" disabled={!canImport} onClick={handleImport} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">
            {busy ? 'Memproses...' : 'Import Data Siswa'}
          </button>
        </div>
      </div>
    </Modal>
  );
};
