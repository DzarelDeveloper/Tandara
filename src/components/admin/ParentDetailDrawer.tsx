/**
 * Tandara ParentDetailDrawer
 * Drawer for inspecting parent account and performing administrative actions.
 */

import React, { useEffect, useState } from 'react';
import { Drawer } from '../ui/Drawer';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { useToast } from '../../context/ToastContext';
import { Parent } from '../../types';
import { User, Phone, KeyRound, UserMinus, Link, Pencil, Save } from 'lucide-react';
import { parentsService } from '../../services/parents.service';
import { studentsService } from '../../services/students.service';
import { Student } from '../../types';

interface ParentDetailDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  parent: Parent | null;
  onChanged: () => Promise<void>;
}

export const ParentDetailDrawer: React.FC<ParentDetailDrawerProps> = ({
  isOpen,
  onClose,
  parent,
  onChanged,
}) => {
  const { showToast } = useToast();
  const [confirmAction, setConfirmAction] = useState<'reset' | 'status' | null>(null);
  const [editing, setEditing] = useState(false);
  const [fullName, setFullName] = useState(parent?.fullName || '');
  const [phone, setPhone] = useState(parent?.phone || '');
  const [relationship, setRelationship] = useState(parent?.relationship || 'Wali');
  const [students, setStudents] = useState<Student[]>([]);
  const [studentId, setStudentId] = useState('');
  useEffect(() => { setFullName(parent?.fullName || ''); setPhone(parent?.phone || ''); setRelationship(parent?.relationship || 'Wali'); }, [parent]);

  useEffect(() => { setEditing(false); setStudents([]); setStudentId(''); setConfirmAction(null); }, [parent?.id, isOpen]);

  const handleActionConfirm = async () => {
    if (confirmAction === 'status' && parent) {
      try { await parentsService.toggleStatus(parent.id, parent.accountStatus !== 'ACTIVE'); await onChanged(); showToast({ type: 'success', message: 'Status wali berhasil diperbarui.' }); }
      catch (error) { showToast({ type: 'error', message: error instanceof Error ? error.message : 'Gagal memperbarui status wali.' }); }
    }
    setConfirmAction(null);
  };

  const handleSave = async () => {
    if (!parent) return;
    try { await parentsService.updateParent(parent.id, { fullName, phone, relationship }); await onChanged(); setEditing(false); showToast({ type: 'success', message: 'Data wali berhasil diperbarui.' }); }
    catch (error) { showToast({ type: 'error', message: error instanceof Error ? error.message : 'Gagal memperbarui data wali.' }); }
  };

  const handleLinkStudent = async () => {
    if (!studentId || !parent) return;
    try { await parentsService.linkStudents(parent.id, [studentId], relationship); await onChanged(); setStudents([]); setStudentId(''); showToast({ type: 'success', message: 'Siswa berhasil dihubungkan.' }); }
    catch (error) { showToast({ type: 'error', message: error instanceof Error ? error.message : 'Gagal menghubungkan siswa.' }); }
  };

  if (!parent) return null;

  return (
    <>
      <Drawer
        isOpen={isOpen}
        onClose={onClose}
        title="Detail Akun Orang Tua / Wali"
        subtitle="Informasi akun aplikasi orang tua dan keterhubungan siswa"
        width="md"
      >
        <div className="space-y-6">
          {/* Identity Box */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-slate-100 border border-slate-200 text-slate-700 flex items-center justify-center font-bold text-sm">
                {parent.fullName.slice(0, 2).toUpperCase()}
              </div>
              <div>
                {editing ? <input value={fullName} onChange={(event) => setFullName(event.target.value)} className="text-sm font-semibold text-slate-900 border rounded px-2 py-1" /> : <h4 className="text-sm font-semibold text-slate-900">{parent.fullName}</h4>}
                {editing ? <select value={relationship} onChange={(event) => setRelationship(event.target.value)} className="text-xs border rounded px-2 py-1 mt-1"><option>Ayah</option><option>Ibu</option><option>Wali</option><option>Lainnya</option></select> : <p className="text-xs text-slate-500">Hubungan: {parent.relationship}</p>}
              </div>
            </div>

            <div className="pt-2 border-t border-slate-200/80 grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-semibold">Telepon</span>
                <span className="text-slate-800 font-mono flex items-center gap-1 mt-0.5">
                  <Phone className="w-3 h-3 text-slate-400" />
                  {editing ? <input value={phone} onChange={(event) => setPhone(event.target.value)} className="font-mono border rounded px-1" /> : parent.phone}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-semibold">Username</span>
                <span className="text-slate-800 font-mono flex items-center gap-1 mt-0.5">
                  <User className="w-3 h-3 text-slate-400" />
                  {parent.username ? `@${parent.username}` : 'Tanpa akun login'}
                </span>
              </div>
            </div>
          </div>

          <button type="button" onClick={editing ? handleSave : () => setEditing(true)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600">
            {editing ? <Save className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
            {editing ? 'Simpan perubahan' : 'Edit data wali'}
          </button>

          {/* Connected Students Section */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h5 className="text-xs font-semibold text-slate-700 uppercase">Siswa Terhubung</h5>
              {parent.connectedStudents.length === 0 && <button
                type="button"
                onClick={async () => { try { setStudents(await studentsService.getStudents()); } catch (error) { showToast({ type: 'error', message: error instanceof Error ? error.message : 'Gagal memuat siswa.' }); } }}
                className="text-xs text-[#2563EB] hover:text-[#1D4ED8] font-medium flex items-center gap-1"
              >
                <Link className="w-3 h-3" />
                Tetapkan Siswa
              </button>}
            </div>

            {students.length > 0 && parent.connectedStudents.length === 0 && <div className="flex gap-2 mb-2"><select value={studentId} onChange={(event) => setStudentId(event.target.value)} className="flex-1 text-xs border rounded px-2 py-1"><option value="">Pilih satu siswa</option>{students.map((student) => <option key={student.id} value={student.id}>{student.fullName} ({student.nis})</option>)}</select><button type="button" onClick={handleLinkStudent} disabled={!studentId} className="text-xs font-semibold text-blue-600 disabled:opacity-50">Simpan</button></div>}

            <div className="rounded-xl border border-slate-200 bg-white text-xs text-slate-600 divide-y">
              {parent.connectedStudents.length ? parent.connectedStudents.map((student) => <div key={student.id} className="flex justify-between gap-2 p-3"><span><strong className="block text-slate-800">{student.fullName}</strong>{student.nis} • {student.className}</span><button type="button" className="text-red-600" onClick={async () => { if (!window.confirm(`Lepas hubungan dengan ${student.fullName}?`)) return; try { await parentsService.unlinkStudent(parent.id, student.id); await onChanged(); showToast({ type: 'success', message: 'Hubungan siswa dilepas tanpa menghapus data siswa.' }); } catch (error) { showToast({ type: 'error', message: error instanceof Error ? error.message : 'Gagal melepas siswa.' }); } }}>Lepas</button></div>) : <p className="p-4">Belum ada siswa terhubung.</p>}
            </div>
          </div>

          {/* Notification & Status Section */}
          <div className="space-y-3">
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-between text-xs">
              <div>
                <span className="font-medium text-slate-800 block">Notifikasi Aplikasi Orang Tua</span>
                <span className="text-[11px] text-amber-700">Dalam Pengembangan</span>
              </div>
              <span className="px-2 py-0.5 text-[11px] font-medium rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                {parent.notificationsActive ? 'Aktif' : 'Tidak tersedia'}
              </span>
            </div>

            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-between text-xs">
              <div>
                <span className="font-medium text-slate-800 block">Status Akun</span>
                <span className="text-[11px] text-slate-500">Akses login wali murid</span>
              </div>
              <span className="px-2 py-0.5 text-[11px] font-medium rounded bg-slate-100 text-slate-700 border border-slate-200">
                {parent.accountStatus}
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-6 border-t border-slate-200 space-y-2">
            <button
              type="button"
              disabled title="Reset password belum tersedia"
              className="w-full py-2.5 px-4 bg-white hover:bg-slate-50 text-slate-700 text-xs sm:text-sm font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors border border-slate-300 shadow-xs"
            >
              <KeyRound className="w-4 h-4 text-slate-500" />
              Reset Password — Belum Tersedia
            </button>

            <button
              type="button"
              onClick={() => setConfirmAction('status')}
              className="w-full py-2.5 px-4 bg-red-50 hover:bg-red-100 text-red-700 text-xs sm:text-sm font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors border border-red-200"
            >
              <UserMinus className="w-4 h-4 text-red-600" />
              {parent.accountStatus === 'ACTIVE' ? 'Nonaktifkan' : 'Aktifkan'} {parent.username ? 'Akun' : 'Wali'}
            </button>
          </div>
        </div>
      </Drawer>

      <ConfirmDialog
        isOpen={confirmAction !== null}
        onClose={() => setConfirmAction(null)}
        onConfirm={handleActionConfirm}
        title="Ubah Status Akun Orang Tua?"
        description={
          'Status akun login orang tua akan diperbarui tanpa menghapus hubungan atau histori siswa.'
        }
        confirmLabel="Ubah Status"
        isDestructive={parent.accountStatus === 'ACTIVE'}
      />
    </>
  );
};
