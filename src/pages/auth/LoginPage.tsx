/**
 * Tandara Login Page
 * Unified enterprise authentication portal for school personnel.
 * Secure single-form login without role disclosure or credential exposure.
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Eye,
  EyeOff,
  Lock,
  User,
  Info,
  ArrowRight,
  ShieldCheck,
  Camera,
  Server,
  HelpCircle,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { TandaraLogo } from '../../components/ui/TandaraLogo';
import { Modal } from '../../components/ui/Modal';

const loginSchema = z.object({
  username: z.string().min(1, 'Username atau ID Pengguna wajib diisi.'),
  password: z.string().min(1, 'Kata sandi wajib diisi.'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showForgotPasswordModal, setShowForgotPasswordModal] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: '',
      password: '',
    },
  });

  const onSubmit = async (data: LoginFormValues) => {
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const session = await login({
        username: data.username.trim(),
        password: data.password,
      });

      if (session.role === 'ADMIN_IT') {
        navigate('/admin/dashboard', { replace: true });
      } else {
        navigate('/teacher/dashboard', { replace: true });
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Username atau kata sandi tidak valid. Silakan periksa kembali.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F6F7F9] flex flex-col lg:grid lg:grid-cols-12">
      {/* LEFT COLUMN: Institutional Brand & Security Highlights (Desktop) */}
      <div className="lg:col-span-5 xl:col-span-5 bg-[#0F1F3D] text-white p-6 sm:p-10 lg:p-12 flex flex-col justify-between relative border-b lg:border-b-0 lg:border-r border-slate-800">
        {/* Top: Brand & Badge */}
        <div>
          <div className="flex items-center justify-between">
            <TandaraLogo size="md" light={true} />
            <span className="text-[11px] font-medium tracking-wide text-slate-300 bg-slate-800/80 px-2.5 py-1 rounded border border-slate-700">
              Sistem Presensi Sekolah
            </span>
          </div>

          {/* Core Messaging */}
          <div className="mt-8 lg:mt-16 max-w-md">
            <div className="inline-flex items-center gap-2 text-xs font-medium text-teal-400 mb-3">
              <span className="w-1.5 h-1.5 rounded-full bg-teal-400"></span>
              Portal Akses Terpadu
            </div>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight text-white leading-snug">
              Presensi Siswa Berbasis Pengenalan Wajah
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 mt-3 leading-relaxed">
              Otomasi pencatatan kehadiran gerbang sekolah dengan pemrosesan biometrik lokal, pengenalan cepat, dan perlindungan privasi data siswa.
            </p>
          </div>

          {/* Security & System Highlights */}
          <div className="hidden sm:flex flex-col gap-3.5 mt-8 lg:mt-12 max-w-md">
            <div className="flex items-start gap-3.5 p-3.5 rounded-lg bg-slate-800/50 border border-slate-700/60">
              <div className="w-8 h-8 rounded-md bg-[#2563EB] text-white flex items-center justify-center shrink-0 mt-0.5">
                <Camera className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-semibold text-white">Deteksi Wajah Multi-Titik</h4>
                <p className="text-[11px] text-slate-300 mt-0.5 leading-relaxed">
                  Integrasi kamera RTSP DroidCam untuk pencatatan presensi masuk dan kepulangan tanpa kontak fisik.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3.5 p-3.5 rounded-lg bg-slate-800/50 border border-slate-700/60">
              <div className="w-8 h-8 rounded-md bg-teal-600 text-white flex items-center justify-center shrink-0 mt-0.5">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-semibold text-white">Otentikasi Berbasis Peran</h4>
                <p className="text-[11px] text-slate-300 mt-0.5 leading-relaxed">
                  Hak akses dashboard disesuaikan secara otomatis sesuai kewenangan akun terdaftar.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3.5 p-3.5 rounded-lg bg-slate-800/50 border border-slate-700/60">
              <div className="w-8 h-8 rounded-md bg-slate-700 text-white flex items-center justify-center shrink-0 mt-0.5">
                <Server className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-semibold text-white">Penyimpanan Terenkripsi Lokal</h4>
                <p className="text-[11px] text-slate-300 mt-0.5 leading-relaxed">
                  Data embedding wajah dan riwayat presensi tersimpan aman di server institusi sekolah.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Metadata */}
        <div className="mt-8 pt-6 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
          <span>Tandara &bull; Hak Cipta Sekolah &copy; 2026</span>
          <button
            type="button"
            onClick={() => setShowHelpModal(true)}
            className="text-slate-300 hover:text-white inline-flex items-center gap-1 transition-colors"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Bantuan Masuk</span>
          </button>
        </div>
      </div>

      {/* RIGHT COLUMN: Unified Secure Login Form */}
      <div className="lg:col-span-7 xl:col-span-7 flex-1 flex items-center justify-center p-4 sm:p-8 lg:p-12">
        <div className="w-full max-w-md">
          {/* Card */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 sm:p-8">
            {/* Header info */}
            <div className="mb-6">
              <div className="lg:hidden mb-4">
                <TandaraLogo size="sm" />
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
                Masuk ke Sistem
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Silakan masukkan kredensial akun terdaftar Anda untuk melanjutkan
              </p>
            </div>

            {/* Error Notification */}
            {errorMessage && (
              <div
                role="alert"
                className="mb-5 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 flex items-start gap-2.5 animate-in fade-in-50"
              >
                <Info className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <span className="font-medium leading-relaxed">{errorMessage}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
              {/* Username Field */}
              <div>
                <label
                  htmlFor="username"
                  className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5"
                >
                  Username atau ID Pengguna <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="username"
                    type="text"
                    autoComplete="username"
                    placeholder="Masukkan username atau ID Anda"
                    {...register('username')}
                    className={`w-full pl-10 pr-4 py-2.5 text-xs sm:text-sm bg-slate-50 border rounded-lg text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 transition-all font-mono ${
                      errors.username
                        ? 'border-red-300 focus:border-red-500 focus:ring-red-100'
                        : 'border-slate-200 focus:border-[#2563EB] focus:ring-blue-100'
                    }`}
                  />
                </div>
                {errors.username && (
                  <p className="text-xs text-red-600 mt-1 font-medium">{errors.username.message}</p>
                )}
              </div>

              {/* Password Field */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label
                    htmlFor="password"
                    className="block text-xs font-semibold text-slate-700 uppercase tracking-wider"
                  >
                    Kata Sandi <span className="text-red-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowForgotPasswordModal(true)}
                    className="text-xs text-[#2563EB] hover:text-[#1D4ED8] font-medium"
                  >
                    Lupa kata sandi?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="Masukkan kata sandi"
                    {...register('password')}
                    className={`w-full pl-10 pr-11 py-2.5 text-xs sm:text-sm bg-slate-50 border rounded-lg text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 transition-all ${
                      errors.password
                        ? 'border-red-300 focus:border-red-500 focus:ring-red-100'
                        : 'border-slate-200 focus:border-[#2563EB] focus:ring-blue-100'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 rounded focus:outline-none focus:ring-1 focus:ring-slate-300"
                    aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {errors.password && (
                  <p className="text-xs text-red-600 mt-1 font-medium">{errors.password.message}</p>
                )}
              </div>

              {/* Remember me checkbox */}
              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 rounded text-[#2563EB] border-slate-300 focus:ring-[#2563EB]"
                  />
                  <span className="text-xs text-slate-600">Ingat sesi di perangkat ini</span>
                </label>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full mt-3 py-2.5 px-4 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white text-xs sm:text-sm font-semibold rounded-lg shadow-xs transition-colors flex items-center justify-center gap-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Memverifikasi Kredensial...</span>
                  </>
                ) : (
                  <>
                    <span>Masuk ke Sistem</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Institutional note */}
          <div className="text-center mt-5 text-xs text-slate-500 space-x-2">
            <span>Enkripsi Sesi Aman</span>
            <span>&bull;</span>
            <span>Kepatuhan Privasi Data Siswa</span>
          </div>
        </div>
      </div>

      {/* Forgot Password Modal */}
      <Modal
        isOpen={showForgotPasswordModal}
        onClose={() => setShowForgotPasswordModal(false)}
        title="Bantuan Pemulihan Akun"
        subtitle="Petunjuk pengaturan ulang kredensial akses"
        maxWidth="md"
      >
        <div className="space-y-4 text-xs sm:text-sm text-slate-600">
          <p className="leading-relaxed">
            Untuk menjaga keamanan data presensi dan privasi biometrik siswa, pemulihan akun dilakukan melalui administrator sistem sekolah.
          </p>

          <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-700 text-xs space-y-2">
            <h5 className="font-semibold text-slate-900">Langkah Pemulihan:</h5>
            <ol className="list-decimal pl-5 space-y-1.5 text-slate-600">
              <li>Hubungi bagian IT atau Tim Pengelola Presensi Sekolah.</li>
              <li>Sampaikan identitas akun (Username / NIP) untuk diverifikasi.</li>
              <li>Administrator akan menerbitkan kredensial sementara atau melakukan reset sandi.</li>
            </ol>
          </div>

          <div className="pt-2 text-right">
            <button
              type="button"
              onClick={() => setShowForgotPasswordModal(false)}
              className="px-4 py-2 bg-[#2563EB] text-white rounded-lg text-xs font-semibold hover:bg-[#1D4ED8] transition-colors"
            >
              Tutup
            </button>
          </div>
        </div>
      </Modal>

      {/* Help Modal */}
      <Modal
        isOpen={showHelpModal}
        onClose={() => setShowHelpModal(false)}
        title="Informasi Akses Portal Tandara"
        subtitle="Panduan autentikasi staf sekolah"
        maxWidth="md"
      >
        <div className="space-y-4 text-xs sm:text-sm text-slate-600">
          <p className="leading-relaxed">
            Portal ini diperuntukkan bagi staf sekolah resmi yang berwenang dalam operasional presensi maupun tata kelola data sistem.
          </p>

          <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
            <h5 className="font-semibold text-slate-900 text-xs uppercase tracking-wider">
              Akses Otomatis Berdasarkan Peran
            </h5>
            <p className="text-xs text-slate-600 leading-relaxed">
              Sistem akan secara otomatis mengenali peran akun Anda (Admin IT atau Petugas Guru/Piket) setelah berhasil masuk, lalu mengarahkan ke dashboard kerja yang sesuai tanpa perlu memilih peran secara manual.
            </p>
          </div>

          <div className="pt-2 text-right">
            <button
              type="button"
              onClick={() => setShowHelpModal(false)}
              className="px-4 py-2 bg-[#2563EB] text-white rounded-lg text-xs font-semibold hover:bg-[#1D4ED8] transition-colors"
            >
              Mengerti
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
