import React, { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Student } from '../../types';

export function PermanentDeleteStudentModal({ student, onClose, onDelete }: {
  student: Student;
  onClose: () => void;
  onDelete: () => Promise<void>;
}) {
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (confirmation !== 'HAPUS' || busy) return;
    setBusy(true); setError('');
    try { await onDelete(); onClose(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Penghapusan belum berhasil. Silakan coba lagi.'); }
    finally { setBusy(false); }
  };
  return <Modal isOpen onClose={() => { if (!busy) onClose(); }} title="Hapus siswa secara permanen?" maxWidth="md">
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-red-800">Tindakan ini hanya untuk data siswa yang salah atau tidak diperlukan. Data yang dihapus permanen tidak dapat dipulihkan.</p>
      <div className="rounded-lg border p-3 text-sm"><strong>{student.fullName}</strong><p>NIS: {student.nis}</p></div>
      <p className="text-xs text-slate-600">Riwayat presensi, izin, atau notifikasi akan memblokir penghapusan. Gunakan Nonaktifkan untuk mempertahankan riwayat. Data wajah milik siswa ini akan dihapus jika penghapusan diizinkan.</p>
      <label className="block text-sm">Ketik <strong>HAPUS</strong> untuk mengonfirmasi
        <input autoComplete="off" value={confirmation} disabled={busy} onChange={(event) => setConfirmation(event.target.value)} className="mt-2 w-full rounded-lg border px-3 py-2" />
      </label>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <div className="flex justify-end gap-2"><button type="button" disabled={busy} onClick={onClose} className="rounded-lg border px-4 py-2 text-sm">Batal</button><button disabled={busy || confirmation !== 'HAPUS'} className="rounded-lg bg-red-700 px-4 py-2 text-sm text-white disabled:opacity-40">{busy ? 'Menghapus…' : 'Hapus Permanen'}</button></div>
    </form>
  </Modal>;
}
