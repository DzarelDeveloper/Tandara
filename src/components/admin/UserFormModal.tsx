/**
 * Tandara UserFormModal
 * Modal for creating Guru/Piket user accounts with role-fixed privileges.
 * Prohibits creating unauthorized super-admin accounts on client.
 */

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Modal } from '../ui/Modal';
import { useToast } from '../../context/ToastContext';
import { Shield, Eye, EyeOff } from 'lucide-react';
import { usersService } from '../../services/users.service';

const userSchema = z.object({
  fullName: z.string().trim().min(2, 'Nama lengkap wajib diisi.'),
  username: z.string().trim().min(4, 'Username minimal 4 karakter.'),
  password: z.string().min(8, 'Password sementara minimal 8 karakter.'),
  isActive: z.boolean(),
});

type UserFormValues = z.infer<typeof userSchema>;

interface UserFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => Promise<void>;
}

export const UserFormModal: React.FC<UserFormModalProps> = ({ isOpen, onClose, onCreated }) => {
  const { showToast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<UserFormValues>({
    resolver: zodResolver(userSchema) as any,
    defaultValues: {
      fullName: '',
      username: '',
      password: '',
      isActive: true,
    },
  });

  const onSubmit = async (data: UserFormValues) => {
    setIsSubmitting(true);
    try { await usersService.createUser({ ...data, role: 'TEACHER' }); await onCreated(); showToast({ type: 'success', message: 'Akun pengguna berhasil dibuat.' }); onClose(); reset(); }
    catch (e) { showToast({ type: 'error', message: e instanceof Error ? e.message : 'Gagal membuat akun.' }); }
    finally { setIsSubmitting(false); }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Tambah Akun Guru / Piket"
      subtitle="Buat akun operasional harian presensi sekolah"
      maxWidth="md"
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
            Nama Lengkap <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            placeholder="Contoh: Budi Prasetyo, M.Kom."
            {...register('fullName')}
            className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
          {errors.fullName && (
            <p className="text-xs text-red-600 mt-1 font-medium">{errors.fullName.message}</p>
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
            Username <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            placeholder="Contoh: budi.piket"
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
              placeholder="Minimal 8 karakter"
              {...register('password')}
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
          {errors.password && (
            <p className="text-xs text-red-600 mt-1 font-medium">{errors.password.message}</p>
          )}
        </div>

        {/* Role fixed display */}
        <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-semibold text-slate-700 uppercase">Peran Akses</span>
            <span className="text-xs font-medium text-teal-800 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded">
              Guru / Piket
            </span>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed mb-2">
            Peran ini dibatasi untuk mengoperasikan sesi absensi, memverifikasi permohonan izin, dan mengajukan koreksi manual.
          </p>

          <div className="text-[11px] text-slate-600 space-y-1 pl-1 border-t border-slate-200 pt-2">
            <div className="flex items-center gap-1.5 text-slate-700 font-medium">
              <Shield className="w-3.5 h-3.5 text-teal-700" />
              <span>Hak Akses Operasional:</span>
            </div>
            <ul className="list-disc pl-4 space-y-0.5 text-slate-500">
              <li>Membuka/menutup sesi absensi langsung</li>
              <li>Meninjau permohonan izin orang tua</li>
              <li>Membuat permohonan koreksi absensi</li>
              <li>Tidak diizinkan mengubah pendaftaran wajah atau konfigurasi server</li>
            </ul>
          </div>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <input
            type="checkbox"
            id="userIsActive"
            {...register('isActive')}
            className="w-4 h-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500"
          />
          <label htmlFor="userIsActive" className="text-xs text-slate-700 font-medium">
            Akun langsung aktif setelah disimpan
          </label>
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
            {isSubmitting ? 'Memeriksa...' : 'Simpan Pengguna'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
