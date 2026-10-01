import React, { useEffect, useState } from 'react';
import type { AttendanceRecord, AttendanceType, Student } from '../../types';
import { studentsService } from '../../services/students.service';
import { attendanceService } from '../../services/attendance.service';

export function ManualAttendanceFallback({ mode, onRecorded }: { mode: AttendanceType; onRecorded: (row: AttendanceRecord) => void }) {
  const [open, setOpen] = useState(false);
  const [students, setStudents] = useState<Student[]>([]);
  const [studentId, setStudentId] = useState('');
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (!open) return;
    let active = true;
    studentsService.getStudents().then((rows) => { if (active) setStudents(rows.filter((row) => row.status === 'ACTIVE')); })
      .catch(() => { if (active) setMessage('Daftar siswa gagal dimuat. Tutup dan buka kembali panel ini.'); });
    return () => { active = false; };
  }, [open]);
  return <details className="rounded border border-slate-200 bg-white p-3" onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary className="cursor-pointer text-xs font-semibold text-slate-700">Verifikasi petugas / Presensi manual</summary>
    <form className="mt-3 space-y-3" onSubmit={async (event) => {
      event.preventDefault();
      if (!confirmed || !studentId || reason.trim().length < 3 || busy) return;
      setBusy(true); setMessage('');
      try {
        const row = await attendanceService.recordManual(studentId, mode, reason.trim());
        onRecorded(row); setMessage('Presensi manual berhasil dicatat.'); setConfirmed(false); setReason('');
      } catch (error) { setMessage(error instanceof Error ? error.message : 'Presensi gagal dicatat.'); }
      finally { setBusy(false); }
    }}>
      <p className="text-xs text-slate-600">Mode {mode === 'CHECK_IN' ? 'Masuk' : 'Pulang'}. Gunakan setelah petugas memeriksa siswa secara langsung. Tercatat sebagai MANUAL, bukan lolos liveness.</p>
      <label className="block text-xs">Siswa<select required disabled={busy} value={studentId} onChange={(event) => { setStudentId(event.target.value); setConfirmed(false); }} className="ml-2 rounded border p-2"><option value="">Pilih siswa</option>{students.map((student) => <option key={student.id} value={student.id}>{student.fullName} · {student.nis} · {student.className}</option>)}</select></label>
      <label className="block text-xs">Alasan<input required minLength={3} disabled={busy} value={reason} onChange={(event) => setReason(event.target.value)} className="ml-2 rounded border p-2" /></label>
      <label className="flex items-center gap-2 text-xs"><input type="checkbox" disabled={busy} checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />Saya sudah memeriksa identitas dan kehadiran siswa secara langsung.</label>
      <button disabled={busy || !confirmed || !studentId || reason.trim().length < 3} className="t-button-secondary text-xs disabled:opacity-50">{busy ? 'Menyimpan...' : 'Catat Presensi Manual'}</button>
      {message && <p role="status" className="text-xs text-slate-700">{message}</p>}
    </form>
  </details>;
}
