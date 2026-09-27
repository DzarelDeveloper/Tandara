import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Modal } from '../ui/Modal';
import { useToast } from '../../context/ToastContext';
import { classesService } from '../../services/classes.service';
import { Class, Major } from '../../types';

const schema = z.object({
  name: z.string().trim().min(1, 'Nama kelas wajib diisi.'),
  grade: z.string().trim().max(10).optional(),
  majorId: z.string().optional(),
  schoolYear: z.string().trim().max(20).optional(),
  isActive: z.boolean(),
});
type Values = z.infer<typeof schema>;

interface Props { isOpen: boolean; classroom?: Class | null; majors: Major[]; onClose: () => void; onSaved: () => Promise<void>; }

export const ClassFormModal: React.FC<Props> = ({ isOpen, classroom, majors, onClose, onSaved }) => {
  const { showToast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const { register, handleSubmit, reset, formState: { errors } } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { name: '', grade: '', majorId: '', schoolYear: '', isActive: true } });
  useEffect(() => { if (isOpen) reset({ name: classroom?.name ?? '', grade: classroom?.grade ?? '', majorId: classroom?.majorId ?? '', schoolYear: classroom?.schoolYear ?? '', isActive: classroom?.isActive ?? true }); }, [classroom, isOpen, reset]);
  const submit = async (values: Values) => {
    setSubmitting(true);
    try {
      if (classroom) await classesService.updateClass(classroom.id, values); else await classesService.createClass(values);
      await onSaved(); showToast({ type: 'success', message: classroom ? 'Kelas berhasil diperbarui.' : 'Kelas berhasil dibuat.' }); onClose();
    } catch (error) { showToast({ type: 'error', message: error instanceof Error ? error.message : 'Gagal menyimpan kelas.' }); }
    finally { setSubmitting(false); }
  };
  return <Modal isOpen={isOpen} onClose={onClose} title={classroom ? 'Edit Kelas' : 'Tambah Kelas'} subtitle="Nama dan tingkat kelas dapat mengikuti struktur sekolah" maxWidth="md">
    <form onSubmit={handleSubmit(submit)} className="space-y-4">
      <div><label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Nama Kelas <span className="text-red-500">*</span></label><input {...register('name')} placeholder="Masukkan nama kelas" className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg" />{errors.name && <p className="text-xs text-red-600 mt-1">{errors.name.message}</p>}</div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Tingkat (Opsional)</label><input {...register('grade')} placeholder="Teks bebas" className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg" /></div>
        <div><label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Tahun Ajaran</label><input {...register('schoolYear')} placeholder="Contoh: 2026/2027" className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg" /></div>
      </div>
      <div><label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Jurusan</label><select {...register('majorId')} className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg"><option value="">Tanpa Jurusan</option>{majors.filter((item) => item.isActive || item.id === classroom?.majorId).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>{majors.length === 0 && <p className="text-xs text-slate-500 mt-1">Belum ada jurusan. Kelas tetap dapat dibuat tanpa jurusan.</p>}</div>
      <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" {...register('isActive')} /> Aktif</label>
      <div className="pt-4 border-t flex justify-end gap-2"><button type="button" onClick={onClose} className="px-4 py-2 text-sm border rounded-lg">Batal</button><button disabled={submitting} className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg disabled:opacity-50">{submitting ? 'Menyimpan...' : 'Simpan Kelas'}</button></div>
    </form>
  </Modal>;
};
