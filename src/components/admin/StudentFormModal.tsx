import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Modal } from '../ui/Modal';
import { useToast } from '../../context/ToastContext';
import { studentsService } from '../../services/students.service';
import { classesService } from '../../services/classes.service';
import { parentsService } from '../../services/parents.service';
import { Class, Parent, Student } from '../../types';

const phoneRegex = /^(\+62|62|0)\d{8,13}$/;
const schema = z.object({
  fullName: z.string().trim().min(2, 'Nama lengkap wajib diisi.'),
  nis: z.string().regex(/^[A-Za-z0-9\-.]{4,20}$/, 'NIS harus berupa alfanumerik 4-20 karakter.'),
  classId: z.string().min(1, 'Kelas wajib dipilih.'),
  gender: z.enum(['L', 'P']),
  guardianMode: z.enum(['NONE', 'EXISTING', 'NEW']),
  guardianId: z.string().optional(),
  parentName: z.string().optional(),
  parentPhone: z.string().optional(),
}).superRefine((values, context) => {
  if (values.guardianMode === 'EXISTING' && !values.guardianId) context.addIssue({ code: 'custom', path: ['guardianId'], message: 'Pilih wali yang tersedia.' });
  if (values.guardianMode === 'NEW') {
    if (!values.parentName || values.parentName.trim().length < 2) context.addIssue({ code: 'custom', path: ['parentName'], message: 'Nama wali wajib diisi.' });
    if (!values.parentPhone || !phoneRegex.test(values.parentPhone)) context.addIssue({ code: 'custom', path: ['parentPhone'], message: 'Format nomor telepon tidak valid.' });
  }
});
type Values = z.infer<typeof schema>;

export const StudentFormModal: React.FC<{ isOpen: boolean; onClose: () => void; student?: Student | null; onCreated?: () => Promise<void> }> = ({ isOpen, onClose, onCreated, student }) => {
  const { showToast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [classes, setClasses] = useState<Class[]>([]);
  const [guardians, setGuardians] = useState<Parent[]>([]);
  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { fullName: '', nis: '', classId: '', gender: 'L', guardianMode: 'NONE', guardianId: '', parentName: '', parentPhone: '' } });
  const guardianMode = watch('guardianMode');
  useEffect(() => {
    if (!isOpen) return;
    reset({ fullName: student?.fullName ?? '', nis: student?.nis ?? '', classId: student?.classId ?? '', gender: student?.gender ?? 'L', guardianMode: 'NONE', guardianId: '', parentName: '', parentPhone: '' });
    Promise.all([classesService.getClasses(), parentsService.getParents()]).then(([classRows, guardianRows]) => {
      setClasses(classRows.filter((item) => item.isActive || item.id === student?.classId));
      setGuardians(guardianRows.filter((item) => item.accountStatus === 'ACTIVE' && (!item.username || item.connectedStudentIds.length === 0)));
    }).catch((error) => showToast({ type: 'error', message: error instanceof Error ? error.message : 'Gagal memuat kelas atau wali.' }));
  }, [isOpen, showToast, student, reset]);

  const submit = async (values: Values) => {
    setSubmitting(true);
    try {
      let guardianId: string | null = null;
      if (values.guardianMode === 'EXISTING') guardianId = values.guardianId || null;
      if (values.guardianMode === 'NEW') {
        const guardian = await parentsService.createGuardian({ fullName: values.parentName!.trim(), phone: values.parentPhone! });
        guardianId = guardian.id;
        setGuardians((rows) => [...rows, guardian]);
        setValue('guardianMode', 'EXISTING'); setValue('guardianId', guardian.id);
      }
      await (student ? studentsService.updateStudent(student.id, { fullName: values.fullName, nis: values.nis, classId: values.classId, gender: values.gender }) : studentsService.createStudent({ fullName: values.fullName, nis: values.nis, classId: values.classId, guardianId, gender: values.gender }));
      await onCreated?.();
      showToast({ type: 'success', message: 'Siswa berhasil disimpan.' }); reset(); onClose();
    } catch (error) { showToast({ type: 'error', message: error instanceof Error ? error.message : 'Gagal menyimpan siswa.' }); }
    finally { setSubmitting(false); }
  };

  return <Modal isOpen={isOpen} onClose={onClose} title={student ? "Edit Data Siswa" : "Tambah Data Siswa Baru"} subtitle="Kelas berasal dari master data aktif" maxWidth="xl">
    <form onSubmit={handleSubmit(submit)} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div><label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Nama Lengkap *</label><input {...register('fullName')} className="w-full px-3 py-2 text-sm bg-slate-50 border rounded-lg" />{errors.fullName && <p className="text-xs text-red-600 mt-1">{errors.fullName.message}</p>}</div>
        <div><label className="block text-xs font-semibold text-slate-700 uppercase mb-1">NIS *</label><input {...register('nis')} className="w-full px-3 py-2 text-sm bg-slate-50 border rounded-lg" />{errors.nis && <p className="text-xs text-red-600 mt-1">{errors.nis.message}</p>}</div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div><label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Kelas *</label><select {...register('classId')} className="w-full px-3 py-2 text-sm bg-slate-50 border rounded-lg"><option value="">Pilih Kelas</option>{classes.map((item) => <option key={item.id} value={item.id}>{item.name}{item.major ? ` · ${item.major}` : ''}</option>)}</select>{classes.length === 0 && <p className="text-xs text-amber-700 mt-1">Belum ada kelas aktif. Tambahkan kelas melalui menu Kelas & Pengguna.</p>}{errors.classId && <p className="text-xs text-red-600 mt-1">{errors.classId.message}</p>}</div>
        <div><label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Jenis Kelamin *</label><select {...register('gender')} className="w-full px-3 py-2 text-sm bg-slate-50 border rounded-lg"><option value="L">Laki-laki</option><option value="P">Perempuan</option></select></div>
      </div>
      {student ? <p className="text-xs text-slate-600">Wali: {student.parentName || "Belum terhubung"}. Kelola hubungan melalui menu Orang Tua.</p> : <div className="pt-3 border-t space-y-3">
        <label className="block text-xs font-semibold text-slate-700 uppercase">Data Wali</label>
        <select {...register('guardianMode')} className="w-full px-3 py-2 text-sm bg-slate-50 border rounded-lg"><option value="NONE">Tanpa Wali</option><option value="EXISTING">Pilih Wali Existing</option><option value="NEW">Buat Wali Baru</option></select>
        {guardianMode === 'EXISTING' && <div><select {...register('guardianId')} className="w-full px-3 py-2 text-sm bg-slate-50 border rounded-lg"><option value="">Pilih Wali</option>{guardians.map((item) => <option key={item.id} value={item.id}>{item.fullName} · {item.phone}</option>)}</select>{errors.guardianId && <p className="text-xs text-red-600 mt-1">{errors.guardianId.message}</p>}</div>}
        {guardianMode === 'NEW' && <div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><div><label className="block text-xs text-slate-600 mb-1">Nama Wali *</label><input {...register('parentName')} className="w-full px-3 py-2 text-sm bg-slate-50 border rounded-lg" />{errors.parentName && <p className="text-xs text-red-600 mt-1">{errors.parentName.message}</p>}</div><div><label className="block text-xs text-slate-600 mb-1">Nomor Telepon *</label><input {...register('parentPhone')} className="w-full px-3 py-2 text-sm bg-slate-50 border rounded-lg" />{errors.parentPhone && <p className="text-xs text-red-600 mt-1">{errors.parentPhone.message}</p>}</div></div>}
      </div>
      }
      <div className="pt-4 border-t flex justify-end gap-2"><button type="button" onClick={onClose} className="px-4 py-2 text-sm border rounded-lg">Batal</button><button disabled={submitting || classes.length === 0} className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg disabled:opacity-50">{submitting ? 'Menyimpan...' : 'Simpan Siswa'}</button></div>
    </form>
  </Modal>;
};
