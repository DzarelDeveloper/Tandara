/**
 * Tandara StudentFormModal
 * Form for registering new students with full field validation.
 */

import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Modal } from '../ui/Modal';
import { useToast } from '../../context/ToastContext';
import { studentsService } from '../../services/students.service';
import { classesService } from '../../services/classes.service';
import { parentsService } from '../../services/parents.service';

// Indonesian phone number validation (08xx or +628xx)
const phoneRegex = /^(\+62|62|0)8[1-9][0-9]{6,11}$/;
// Alphanumeric NIS
const nisRegex = /^[A-Za-z0-9\-\.]{4,20}$/;

const studentSchema = z.object({
  fullName: z.string().min(2, 'Nama lengkap wajib diisi (minimal 2 karakter).'),
  nis: z.string().regex(nisRegex, 'NIS harus berupa alfanumerik 4-20 karakter.'),
  classId: z.string().min(1, 'Kelas wajib dipilih.'),
  guardianId: z.string().optional(),
  major: z.string().min(1, 'Jurusan wajib dipilih.'),
  gender: z.enum(['L', 'P'] as const),
  parentName: z.string().min(2, 'Nama orang tua/wali wajib diisi.'),
  parentPhone: z.string().regex(phoneRegex, 'Format nomor telepon tidak valid (contoh: 08123456789).'),
  status: z.enum(['ACTIVE', 'GRADUATED', 'TRANSFERRED', 'INACTIVE'] as const),
});

type StudentFormValues = z.infer<typeof studentSchema>;

interface StudentFormModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const StudentFormModal: React.FC<StudentFormModalProps> = ({ isOpen, onClose }) => {
  const { showToast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [classes, setClasses] = useState<any[]>([]);
  const [guardians, setGuardians] = useState<any[]>([]);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<StudentFormValues>({
    resolver: zodResolver(studentSchema),
    defaultValues: {
      fullName: '',
      nis: '',
      classId: '', guardianId: '',
      major: '',
      gender: 'L',
      parentName: '',
      parentPhone: '',
      status: 'ACTIVE',
    },
  });

  useEffect(() => { if (isOpen) Promise.all([classesService.getClasses(), parentsService.getParents()]).then(([c, g]) => { setClasses(c as any[]); setGuardians(g as any[]); }).catch((e) => showToast({ type: 'error', message: e instanceof Error ? e.message : 'Gagal memuat kelas atau wali.' })); }, [isOpen]);

  const onSubmit = async (data: StudentFormValues) => {
    setIsSubmitting(true);
    try { await studentsService.createStudent({ ...data, classId: data.classId, guardianId: data.guardianId || null }); showToast({ type: 'success', message: 'Siswa berhasil disimpan.' }); reset(); onClose(); }
    catch (e) { showToast({ type: 'error', message: e instanceof Error ? e.message : 'Gagal menyimpan siswa.' }); }
    finally { setIsSubmitting(false); }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Tambah Data Siswa Baru"
      subtitle="Lengkapi identitas siswa dan data kontak orang tua"
      maxWidth="xl"
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* Nama Lengkap & NIS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
              Nama Lengkap <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="Contoh: Ahmad Maulana"
              {...register('fullName')}
              className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
            {errors.fullName && (
              <p className="text-xs text-red-600 mt-1 font-medium">{errors.fullName.message}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
              Nomor Induk Siswa (NIS) <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="Contoh: 20261001"
              {...register('nis')}
              className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-mono"
            />
            {errors.nis && (
              <p className="text-xs text-red-600 mt-1 font-medium">{errors.nis.message}</p>
            )}
          </div>
        </div>

        {/* Kelas, Jurusan, Jenis Kelamin */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
              Kelas <span className="text-red-500">*</span>
            </label>
            <select
              {...register('classId')}
              className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            >
              <option value="">Pilih Kelas</option>
              {classes.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.major}</option>)}
            </select>
            {errors.classId && (
              <p className="text-xs text-red-600 mt-1 font-medium">{errors.classId.message}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
              Jurusan <span className="text-red-500">*</span>
            </label>
            <select
              {...register('major')}
              className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            >
              <option value="">Pilih Jurusan</option>
              <option value="IPA">IPA / MIPA</option>
              <option value="IPS">IPS</option>
              <option value="Rekayasa Perangkat Lunak">RPL</option>
              <option value="Teknik Komputer Jaringan">TKJ</option>
            </select>
            {errors.major && (
              <p className="text-xs text-red-600 mt-1 font-medium">{errors.major.message}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
              Jenis Kelamin <span className="text-red-500">*</span>
            </label>
            <select
              {...register('gender')}
              className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            >
              <option value="L">Laki-laki (L)</option>
              <option value="P">Perempuan (P)</option>
            </select>
          </div>
        </div>

        {/* Data Orang Tua */}
        <div className="pt-2 border-t border-slate-100">
          <p className="text-xs font-semibold text-slate-800 mb-3">Kontak Orang Tua / Wali</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Wali (opsional)</label>
              <select {...register('guardianId')} className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-lg"><option value="">Tanpa wali</option>{guardians.map((item) => <option key={item.id} value={item.id}>{item.fullName}</option>)}</select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                Nama Orang Tua/Wali <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="Contoh: Budi Santoso"
                {...register('parentName')}
                className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
              {errors.parentName && (
                <p className="text-xs text-red-600 mt-1 font-medium">{errors.parentName.message}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                Nomor Telepon Orang Tua <span className="text-red-500">*</span>
              </label>
              <input
                type="tel"
                placeholder="Contoh: 08123456789"
                {...register('parentPhone')}
                className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-mono"
              />
              {errors.parentPhone && (
                <p className="text-xs text-red-600 mt-1 font-medium">{errors.parentPhone.message}</p>
              )}
            </div>
          </div>
        </div>

        {/* Status Siswa */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
            Status Siswa
          </label>
          <select
            {...register('status')}
            className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          >
            <option value="ACTIVE">Aktif</option>
            <option value="INACTIVE">Nonaktif</option>
            <option value="GRADUATED">Lulus</option>
            <option value="TRANSFERRED">Pindah</option>
          </select>
        </div>

        {/* Notice */}
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900">
          Penyimpanan data siswa akan dialirkan ke database SQLite melalui FastAPI lokal setelah server diaktifkan.
        </div>

        {/* Buttons */}
        <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs sm:text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200"
          >
            Batal
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-4 py-2 text-xs sm:text-sm font-medium text-white bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 rounded-lg transition-colors shadow-xs"
          >
            {isSubmitting ? 'Memeriksa...' : 'Simpan Siswa'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
