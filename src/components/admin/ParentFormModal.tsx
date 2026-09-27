import React, { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Modal } from '../ui/Modal';
import { useToast } from '../../context/ToastContext';
import { parentsService } from '../../services/parents.service';
import { studentsService } from '../../services/students.service';
import { Student } from '../../types';

const schema = z.object({
  fullName: z.string().trim().min(2, 'Nama lengkap wajib diisi.'),
  phone: z.string().regex(/^(\+62|62|0)\d{8,13}$/, 'Format nomor telepon tidak valid.'),
  relationship: z.string().trim().min(1, 'Hubungan wajib diisi.'),
  temporaryPassword: z.string().min(8, 'Password minimal 8 karakter.'),
  confirmPassword: z.string().min(8, 'Konfirmasi password wajib diisi.'),
}).refine((value) => value.temporaryPassword === value.confirmPassword, { path: ['confirmPassword'], message: 'Konfirmasi password tidak cocok.' });
type Values = z.infer<typeof schema>;

export const ParentFormModal: React.FC<{ isOpen: boolean; onClose: () => void; onCreated: () => Promise<void> }> = ({ isOpen, onClose, onCreated }) => {
  const { showToast } = useToast();
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [createdUsername, setCreatedUsername] = useState('');
  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { fullName: '', phone: '', relationship: 'Ayah', temporaryPassword: '', confirmPassword: '' } });
  const fullName = watch('fullName');
  const suggestedUsername = useMemo(() => fullName.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '') || '—', [fullName]);
  useEffect(() => { if (isOpen) { setSelectedIds([]); setSearch(''); setCreatedUsername(''); studentsService.getStudents().then(setStudents).catch((error) => showToast({ type: 'error', message: error instanceof Error ? error.message : 'Gagal memuat siswa.' })); } }, [isOpen, showToast]);
  const visible = useMemo(() => students.filter((student) => `${student.fullName} ${student.nis}`.toLowerCase().includes(search.toLowerCase())), [search, students]);
  const submit = async (values: Values) => {
    if (!selectedIds.length) { showToast({ type: 'error', message: 'Pilih minimal satu siswa existing.' }); return; }
    setSubmitting(true);
    try {
      const created = await parentsService.createParent({ fullName: values.fullName, phone: values.phone, relationship: values.relationship, temporaryPassword: values.temporaryPassword, studentIds: selectedIds });
      await onCreated(); showToast({ type: 'success', message: 'Akun orang tua dan hubungan siswa berhasil dibuat.' }); setCreatedUsername(created.username); reset();
    } catch (error) { showToast({ type: 'error', message: error instanceof Error ? error.message : 'Gagal membuat akun orang tua.' }); }
    finally { setSubmitting(false); }
  };
  return <Modal isOpen={isOpen} onClose={onClose} title="Tambah Akun Orang Tua / Wali" subtitle="Pilih siswa yang sudah ada; form ini tidak membuat data siswa" maxWidth="xl">
    {createdUsername ? <div className="space-y-4"><div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4"><p className="text-sm font-semibold text-emerald-900">Akun berhasil dibuat</p><p className="text-xs text-emerald-800 mt-1">Username Login</p><div className="mt-2 flex items-center gap-2"><code className="flex-1 rounded border bg-white px-3 py-2 text-sm">{createdUsername}</code><button type="button" onClick={() => navigator.clipboard.writeText(createdUsername).then(() => showToast({ type: 'success', message: 'Username disalin.' }))} className="px-3 py-2 text-sm border rounded-lg bg-white">Salin</button></div></div><div className="flex justify-end"><button type="button" onClick={onClose} className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg">Selesai</button></div></div> : <form onSubmit={handleSubmit(submit)} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><div><label className="block text-xs font-semibold mb-1">Nama Lengkap *</label><input {...register('fullName')} className="w-full px-3 py-2 text-sm bg-slate-50 border rounded-lg" />{errors.fullName && <p className="text-xs text-red-600">{errors.fullName.message}</p>}</div><div><label className="block text-xs font-semibold mb-1">Nomor Telepon *</label><input {...register('phone')} className="w-full px-3 py-2 text-sm bg-slate-50 border rounded-lg" />{errors.phone && <p className="text-xs text-red-600">{errors.phone.message}</p>}</div></div>
      <div><label className="block text-xs font-semibold mb-1">Hubungan dengan Siswa *</label><select {...register('relationship')} className="w-full px-3 py-2 text-sm bg-slate-50 border rounded-lg"><option value="Ayah">Ayah</option><option value="Ibu">Ibu</option><option value="Wali">Wali</option><option value="Lainnya">Lainnya</option></select></div>
      <div className="space-y-2"><label className="block text-xs font-semibold">Siswa Terhubung * ({selectedIds.length} dipilih)</label><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari nama atau NIS" className="w-full px-3 py-2 text-sm bg-slate-50 border rounded-lg" /><div className="max-h-52 overflow-y-auto border rounded-lg divide-y">{visible.map((student) => <label key={student.id} className="flex items-start gap-3 p-3 hover:bg-slate-50"><input type="checkbox" checked={selectedIds.includes(student.id)} onChange={(event) => setSelectedIds((current) => event.target.checked ? [...current, student.id] : current.filter((id) => id !== student.id))} /><span><strong className="block text-sm">{student.fullName}</strong><span className="text-xs text-slate-500">{student.nis} • {student.className}</span></span></label>)}{visible.length === 0 && <p className="p-3 text-xs text-slate-500">Tidak ada siswa ditemukan.</p>}</div></div>
      <div className="pt-3 border-t"><p className="text-xs font-semibold mb-3">Kredensial Aplikasi Orang Tua</p><div className="grid grid-cols-1 sm:grid-cols-3 gap-4"><div><label className="block text-xs mb-1">Username Otomatis</label><input value={suggestedUsername} readOnly aria-describedby="parent-username-help" className="w-full px-3 py-2 text-sm bg-slate-100 border rounded-lg font-mono text-slate-700" /><p id="parent-username-help" className="text-[11px] text-slate-500 mt-1">Backend memastikan username unik saat akun dibuat.</p></div><div><label className="block text-xs mb-1">Password Sementara *</label><input type="password" {...register('temporaryPassword')} className="w-full px-3 py-2 text-sm bg-slate-50 border rounded-lg" />{errors.temporaryPassword && <p className="text-xs text-red-600">{errors.temporaryPassword.message}</p>}</div><div><label className="block text-xs mb-1">Konfirmasi Password *</label><input type="password" {...register('confirmPassword')} className="w-full px-3 py-2 text-sm bg-slate-50 border rounded-lg" />{errors.confirmPassword && <p className="text-xs text-red-600">{errors.confirmPassword.message}</p>}</div></div><p className="text-xs text-slate-500 mt-2">Wajib ganti password saat login pertama belum didukung backend dan tidak diaktifkan secara palsu.</p></div>
      <div className="pt-4 border-t flex justify-end gap-2"><button type="button" onClick={onClose} className="px-4 py-2 text-sm border rounded-lg">Batal</button><button disabled={submitting} className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg disabled:opacity-50">{submitting ? 'Menyimpan...' : 'Buat Akun'}</button></div>
    </form>}
  </Modal>;
};
