import React, { useEffect, useState } from 'react';
import { attendanceService, AttendanceSchedule } from '../../services/attendance.service';

export function AttendanceSchedulePanel({ onSaved }: { onSaved?: () => void }) {
  const [schedule, setSchedule] = useState<AttendanceSchedule | null>(null);
  const [draft, setDraft] = useState({ checkInDeadline: '07:00', checkOutStart: '15:30' });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    attendanceService.getSchedule().then((data) => {
      if (active) { setSchedule(data); setDraft(data); }
    }).catch(() => { if (active) setError('Pengaturan belum dapat dimuat. Muat ulang halaman untuk mencoba kembali.'); });
    return () => { active = false; };
  }, []);
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(''); setMessage('');
    if (draft.checkOutStart <= draft.checkInDeadline) {
      setError('Jam pulang harus setelah batas masuk.'); return;
    }
    setSaving(true);
    try {
      const data = await attendanceService.saveSchedule({ checkInDeadline: draft.checkInDeadline, checkOutStart: draft.checkOutStart });
      setSchedule(data); setDraft(data);
      setMessage('Jam disimpan. Status Hadir/Terlambat hari ini sudah dihitung ulang.');
      onSaved?.();
    } catch (err) { setError(err instanceof Error ? err.message : 'Gagal menyimpan pengaturan.'); }
    finally { setSaving(false); }
  };
  return <details className="rounded-lg border border-slate-200 bg-white p-4">
    <summary className="cursor-pointer text-sm font-semibold text-slate-800">Pengaturan Jam Presensi{schedule && <span className="ml-2 text-xs font-normal text-slate-500">Masuk paling lambat {schedule.checkInDeadline} · Pulang mulai {schedule.checkOutStart}</span>}</summary>
    <form onSubmit={save} className="mt-4 space-y-3">
      <p className="text-xs text-slate-600">Berlaku untuk semua siswa ({schedule?.timezone ?? 'Asia/Jakarta'}). Masuk lewat batas waktu dicatat Terlambat. Pulang tersedia mulai jam yang ditentukan. Status Hadir/Terlambat hari ini dihitung ulang saat disimpan. Riwayat hari sebelumnya dan koreksi manual tetap.</p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs font-medium text-slate-700">Batas masuk (CHECK-IN)<input type="time" required disabled={!schedule || saving} value={draft.checkInDeadline} onChange={(e) => setDraft({ ...draft, checkInDeadline: e.target.value })} className="mt-1 block rounded border border-slate-300 px-3 py-2" /></label>
        <label className="text-xs font-medium text-slate-700">Mulai pulang (CHECK-OUT)<input type="time" required disabled={!schedule || saving} value={draft.checkOutStart} onChange={(e) => setDraft({ ...draft, checkOutStart: e.target.value })} className="mt-1 block rounded border border-slate-300 px-3 py-2" /></label>
        <button type="submit" disabled={!schedule || saving} className="t-button-primary text-sm disabled:opacity-50">{saving ? 'Menyimpan...' : 'Simpan Jam Presensi'}</button>
      </div>
      {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
      {message && <p role="status" className="text-xs text-emerald-700">{message}</p>}
    </form>
    {error && !schedule && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
  </details>;
}
