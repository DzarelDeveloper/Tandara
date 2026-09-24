/**
 * Tandara ClassFormModal
 * Modal for creating a new class or major.
 */

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Modal } from '../ui/Modal';
import { useToast } from '../../context/ToastContext';

const classSchema = z.object({
  name: z.string().min(2, 'Nama kelas wajib diisi (contoh: X-MIPA-1).'),
  grade: z.enum(['10', '11', '12']),
  major: z.string().min(2, 'Jurusan wajib diisi.'),
  homeroomTeacher: z.string().min(2, 'Wali kelas wajib diisi.'),
});

type ClassFormValues = z.infer<typeof classSchema>;

interface ClassFormModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ClassFormModal: React.FC<ClassFormModalProps> = ({ isOpen, onClose }) => {
  const { showBackendNotConnected } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ClassFormValues>({
    resolver: zodResolver(classSchema),
    defaultValues: {
      name: '',
      grade: '10',
      major: '',
      homeroomTeacher: '',
    },
  });

  const onSubmit = async (_data: ClassFormValues) => {
    setIsSubmitting(true);
    await new Promise((resolve) => setTimeout(resolve, 400));
    setIsSubmitting(false);
    showBackendNotConnected('Backend belum terhubung. Data kelas belum dapat disimpan.');
    onClose();
    reset();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Tambah Rombongan Belajar (Kelas)"
      subtitle="Definisikan nama kelas, jenjang tingkat, dan wali kelas"
      maxWidth="md"
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
            Nama Kelas <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            placeholder="Contoh: X-RPL-1"
            {...register('name')}
            className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
          {errors.name && (
            <p className="text-xs text-red-600 mt-1 font-medium">{errors.name.message}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
              Tingkat / Jenjang <span className="text-red-500">*</span>
            </label>
            <select
              {...register('grade')}
              className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            >
              <option value="10">Kelas 10</option>
              <option value="11">Kelas 11</option>
              <option value="12">Kelas 12</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
              Jurusan <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="Contoh: RPL"
              {...register('major')}
              className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
            {errors.major && (
              <p className="text-xs text-red-600 mt-1 font-medium">{errors.major.message}</p>
            )}
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
            Wali Kelas <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            placeholder="Contoh: Siti Nurhaliza, S.Pd."
            {...register('homeroomTeacher')}
            className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
          {errors.homeroomTeacher && (
            <p className="text-xs text-red-600 mt-1 font-medium">{errors.homeroomTeacher.message}</p>
          )}
        </div>

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
            {isSubmitting ? 'Menyimpan...' : 'Simpan Kelas'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
