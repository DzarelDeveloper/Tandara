/**
 * Tandara CorrectionFormModal
 * Modal for submitting an auditable attendance status correction.
 */

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Modal } from '../ui/Modal';
import { useToast } from '../../context/ToastContext';
import { AttendanceStatus } from '../../types';

const correctionSchema = z.object({
  studentId: z.string().min(1, 'Siswa wajib dipilih.'),
  attendanceDate: z.string().min(1, 'Tanggal presensi wajib diisi.'),
  previousStatus: z.string().min(1, 'Status semula wajib dipilih.'),
  newStatus: z.string().min(1, 'Status baru wajib dipilih.'),
  reason: z.string().min(5, 'Alasan koreksi wajib diisi minimal 5 karakter untuk jejak audit.'),
});

type CorrectionFormValues = z.infer<typeof correctionSchema>;

interface CorrectionFormModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CorrectionFormModal: React.FC<CorrectionFormModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { showBackendNotConnected } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CorrectionFormValues>({
    resolver: zodResolver(correctionSchema),
    defaultValues: {
      studentId: '',
      attendanceDate: new Date().toISOString().split('T')[0],
      previousStatus: 'UNEXCUSED',
      newStatus: 'PRESENT',
      reason: '',
    },
  });

  const onSubmit = async (_data: CorrectionFormValues) => {
    setIsSubmitting(true);
    await new Promise((resolve) => setTimeout(resolve, 400));
    setIsSubmitting(false);
    showBackendNotConnected(
      'Backend belum terhubung. Pengajuan koreksi absensi belum dapat disimpan ke server.'
    );
    onClose();
    reset();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Ajukan Koreksi Presensi Siswa"
      subtitle="Perubahan status presensi memerlukan alasan pertanggungjawaban audit"
      maxWidth="md"
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* Siswa Selector (Empty state) */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
            Pilih Siswa <span className="text-red-500">*</span>
          </label>
          <select
            {...register('studentId')}
            className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="">-- Pilih Siswa (Daftar Kosong) --</option>
          </select>
          {errors.studentId && (
            <p className="text-xs text-red-600 mt-1 font-medium">{errors.studentId.message}</p>
          )}
        </div>

        {/* Tanggal Presensi */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
            Tanggal Presensi yang Dikoreksi <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            {...register('attendanceDate')}
            className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
          {errors.attendanceDate && (
            <p className="text-xs text-red-600 mt-1 font-medium">{errors.attendanceDate.message}</p>
          )}
        </div>

        {/* Perubahan Status */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
              Status Semula <span className="text-red-500">*</span>
            </label>
            <select
              {...register('previousStatus')}
              className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="UNEXCUSED">Alpa / Belum Hadir</option>
              <option value="LATE">Terlambat</option>
              <option value="SICK">Sakit</option>
              <option value="PERMISSION">Izin</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
              Status Baru <span className="text-red-500">*</span>
            </label>
            <select
              {...register('newStatus')}
              className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="PRESENT">Hadir Tepat Waktu</option>
              <option value="LATE">Hadir Terlambat</option>
              <option value="SICK">Sakit Disetujui</option>
              <option value="PERMISSION">Izin Disetujui</option>
            </select>
          </div>
        </div>

        {/* Alasan Koreksi */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
            Alasan Koreksi (Wajib Diisi untuk Audit) <span className="text-red-500">*</span>
          </label>
          <textarea
            rows={3}
            placeholder="Contoh: Siswa hadir di kelas namun gerbang kamera terkendala jaringan saat jam masuk..."
            {...register('reason')}
            className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
          {errors.reason && (
            <p className="text-xs text-red-600 mt-1 font-medium">{errors.reason.message}</p>
          )}
        </div>

        {/* Notice */}
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 leading-relaxed">
          Koreksi manual akan dicatat dalam jejak audit permanen sistem beserta identitas guru yang mengajukan.
        </div>

        {/* Actions */}
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
            className="px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 rounded-lg transition-colors shadow-xs"
          >
            {isSubmitting ? 'Memproses...' : 'Kirim Pengajuan Koreksi'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
