/**
 * Tandara ParentFormModal
 * Form for creating parent accounts connected to students.
 */

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Modal } from '../ui/Modal';
import { useToast } from '../../context/ToastContext';
import { Eye, EyeOff } from 'lucide-react';

const phoneRegex = /^(\+62|62|0)8[1-9][0-9]{6,11}$/;

const parentSchema = z
  .object({
    fullName: z.string().min(2, 'Nama lengkap orang tua/wali wajib diisi.'),
    phone: z.string().regex(phoneRegex, 'Format nomor telepon tidak valid (contoh: 08123456789).'),
    relationship: z.enum(['Ayah', 'Ibu', 'Wali'] as const),
    studentId: z.string().min(1, 'Wajib menghubungkan setidaknya satu siswa.'),
    username: z.string().min(4, 'Username minimal 4 karakter alfanumerik.'),
    temporaryPassword: z.string().min(8, 'Password sementara minimal 8 karakter.'),
    confirmPassword: z.string().min(8, 'Konfirmasi password wajib diisi.'),
    forcePasswordChange: z.boolean(),
  })
  .refine((data) => data.temporaryPassword === data.confirmPassword, {
    message: 'Konfirmasi password tidak cocok dengan password sementara.',
    path: ['confirmPassword'],
  });

type ParentFormValues = z.infer<typeof parentSchema>;

interface ParentFormModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ParentFormModal: React.FC<ParentFormModalProps> = ({ isOpen, onClose }) => {
  const { showBackendNotConnected } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ParentFormValues>({
    resolver: zodResolver(parentSchema) as any,
    defaultValues: {
      fullName: '',
      phone: '',
      relationship: 'Ayah',
      studentId: '',
      username: '',
      temporaryPassword: '',
      confirmPassword: '',
      forcePasswordChange: true,
    },
  });

  const onSubmit = async (_data: ParentFormValues) => {
    setIsSubmitting(true);
    await new Promise((resolve) => setTimeout(resolve, 400));
    setIsSubmitting(false);
    showBackendNotConnected('Backend belum terhubung. Akun orang tua belum dapat disimpan.');
    onClose();
    reset();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Tambah Akun Orang Tua / Wali"
      subtitle="Buat akun aplikasi orang tua dan tautkan dengan identitas siswa"
      maxWidth="xl"
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* Nama & Telepon */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
              Nama Lengkap <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="Contoh: Hendra Wijaya"
              {...register('fullName')}
              className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
            {errors.fullName && (
              <p className="text-xs text-red-600 mt-1 font-medium">{errors.fullName.message}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
              Nomor Telepon <span className="text-red-500">*</span>
            </label>
            <input
              type="tel"
              placeholder="Contoh: 081234567890"
              {...register('phone')}
              className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-mono"
            />
            {errors.phone && (
              <p className="text-xs text-red-600 mt-1 font-medium">{errors.phone.message}</p>
            )}
          </div>
        </div>

        {/* Hubungan & Pilih Siswa */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
              Hubungan dengan Siswa <span className="text-red-500">*</span>
            </label>
            <select
              {...register('relationship')}
              className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            >
              <option value="Ayah">Ayah</option>
              <option value="Ibu">Ibu</option>
              <option value="Wali">Wali</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
              Pilih Siswa Terhubung <span className="text-red-500">*</span>
            </label>
            <select
              {...register('studentId')}
              className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            >
              <option value="">-- Pilih Siswa (Daftar Kosong) --</option>
            </select>
            {errors.studentId && (
              <p className="text-xs text-red-600 mt-1 font-medium">{errors.studentId.message}</p>
            )}
          </div>
        </div>

        {/* Kredensial Akun Aplikasi Orang Tua */}
        <div className="pt-2 border-t border-slate-100">
          <p className="text-xs font-semibold text-slate-800 mb-3">Kredensial Aplikasi Orang Tua</p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                Username <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="Contoh: wali.hendra"
                {...register('username')}
                className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-mono"
              />
              {errors.username && (
                <p className="text-xs text-red-600 mt-1 font-medium">{errors.username.message}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                Password Sementara <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Min. 8 karakter"
                  {...register('temporaryPassword')}
                  className="w-full pr-8 px-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
              {errors.temporaryPassword && (
                <p className="text-xs text-red-600 mt-1 font-medium">{errors.temporaryPassword.message}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                Konfirmasi Password <span className="text-red-500">*</span>
              </label>
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Ulangi password"
                {...register('confirmPassword')}
                className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
              {errors.confirmPassword && (
                <p className="text-xs text-red-600 mt-1 font-medium">{errors.confirmPassword.message}</p>
              )}
            </div>
          </div>
        </div>

        {/* Checkbox Wajib Ganti Password */}
        <div className="flex items-center gap-2 pt-2">
          <input
            type="checkbox"
            id="forcePasswordChange"
            {...register('forcePasswordChange')}
            className="w-4 h-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500"
          />
          <label htmlFor="forcePasswordChange" className="text-xs text-slate-700 font-medium">
            Wajib ganti password saat login pertama di aplikasi orang tua
          </label>
        </div>

        {/* Notice */}
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-900 leading-relaxed">
          Akun ini nantinya akan digunakan oleh orang tua di aplikasi mobile Tandara untuk memantau waktu kedatangan, kepulangan, serta mengajukan izin.
        </div>

        {/* Action Buttons */}
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
            {isSubmitting ? 'Memeriksa...' : 'Buat Akun'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
