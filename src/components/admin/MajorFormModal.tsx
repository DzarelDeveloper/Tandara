import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Modal } from '../ui/Modal';
import { useToast } from '../../context/ToastContext';
import { classesService } from '../../services/classes.service';
import { Major } from '../../types';

const schema = z.object({ name: z.string().trim().min(1, 'Nama jurusan wajib diisi.'), isActive: z.boolean() });
type Values = z.infer<typeof schema>;

export const MajorFormModal: React.FC<{ isOpen: boolean; major?: Major | null; onClose: () => void; onSaved: () => Promise<void> }> = ({ isOpen, major, onClose, onSaved }) => {
  const { showToast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const { register, handleSubmit, reset, formState: { errors } } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { name: '', isActive: true } });
  useEffect(() => { if (isOpen) reset({ name: major?.name ?? '', isActive: major?.isActive ?? true }); }, [isOpen, major, reset]);
  const submit = async (values: Values) => {
    setSubmitting(true);
    try {
      if (major) await classesService.updateMajor(major.id, values); else await classesService.createMajor(values);
      await onSaved(); showToast({ type: 'success', message: major ? 'Jurusan berhasil diperbarui.' : 'Jurusan berhasil dibuat.' }); onClose();
    } catch (error) { showToast({ type: 'error', message: error instanceof Error ? error.message : 'Gagal menyimpan jurusan.' }); }
    finally { setSubmitting(false); }
  };
  return <Modal isOpen={isOpen} onClose={onClose} title={major ? 'Edit Jurusan' : 'Tambah Jurusan'} subtitle="Nama program atau jurusan bersifat bebas" maxWidth="md">
    <form onSubmit={handleSubmit(submit)} className="space-y-4">
      <div><label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Nama Jurusan <span className="text-red-500">*</span></label><input {...register('name')} placeholder="Masukkan nama jurusan atau program" className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg" />{errors.name && <p className="text-xs text-red-600 mt-1">{errors.name.message}</p>}</div>
      <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" {...register('isActive')} /> Aktif</label>
      <div className="pt-4 border-t flex justify-end gap-2"><button type="button" onClick={onClose} className="px-4 py-2 text-sm border rounded-lg">Batal</button><button disabled={submitting} className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg disabled:opacity-50">{submitting ? 'Menyimpan...' : 'Simpan Jurusan'}</button></div>
    </form>
  </Modal>;
};
