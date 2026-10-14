import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Eye,
  EyeOff,
  HelpCircle,
  Info,
  KeyRound,
  LockKeyhole,
  LogIn,
  Mail,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { TandaraLogo } from '../../components/ui/TandaraLogo';
import { Modal } from '../../components/ui/Modal';

const loginSchema = z.object({
  username: z.string().min(1, 'Email atau username wajib diisi.'),
  password: z.string().min(1, 'Kata sandi wajib diisi.'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
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
    defaultValues: { username: '', password: '' },
  });

  const onSubmit = async (data: LoginFormValues) => {
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const session = await login({
        username: data.username.trim(),
        password: data.password,
      });

      navigate(session.role === 'ADMIN_IT' ? '/admin/dashboard' : '/teacher/dashboard', { replace: true });
    } catch (error: unknown) {
      setErrorMessage(error instanceof Error
        ? error.message
        : 'Email atau kata sandi tidak valid. Silakan periksa kembali.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="login-sky relative flex min-h-screen flex-col overflow-hidden px-5 py-5 sm:px-8 sm:py-7">
      <div className="login-clouds" aria-hidden="true" />
      <div className="login-orbit" aria-hidden="true" />

      <header className="login-header relative z-10">
        <TandaraLogo size="sm" />
      </header>

      <div className="login-content relative z-10 flex flex-1 items-center justify-center py-5">
        <section className="login-glass-card w-full max-w-[430px] rounded-[28px] px-6 py-4 sm:px-9 sm:py-5">
          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-2xl border border-white/80 bg-white/75 text-blue-700 shadow-[0_8px_24px_rgba(55,105,150,0.12)]">
            <LogIn className="h-[18px] w-[18px]" aria-hidden="true" />
          </div>

          <div className="mb-3 text-center">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-blue-700/75">
              Portal Presensi Sekolah
            </p>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
              Masuk ke Tandara
            </h1>
            <p className="mx-auto mt-1 max-w-xs text-xs leading-5 text-slate-600 sm:text-[13px]">
              Gunakan email atau username dan kata sandi akun sekolah Anda.
            </p>
          </div>

          {errorMessage && (
            <div
              role="alert"
              className="mb-5 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50/90 p-3.5 text-sm text-red-800"
            >
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />
              <span className="font-medium leading-relaxed">{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-2" noValidate>
            <div>
              <label htmlFor="username" className="mb-1.5 block text-xs font-semibold text-slate-700">
                Email atau username
              </label>
              <div className="login-input-wrap">
                <Mail className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                <input
                  id="username"
                  type="text"
                  autoComplete="username"
                  placeholder="nama@sekolah.sch.id atau username"
                  aria-invalid={Boolean(errors.username)}
                  aria-describedby={errors.username ? 'username-error' : undefined}
                  {...register('username')}
                  className="login-input"
                />
              </div>
              {errors.username && (
                <p id="username-error" className="mt-1.5 text-xs font-medium text-red-700">{errors.username.message}</p>
              )}
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between gap-3">
                <label htmlFor="password" className="text-xs font-semibold text-slate-700">
                  Kata sandi
                </label>
                <button
                  type="button"
                  onClick={() => setShowForgotPasswordModal(true)}
                  className="text-xs font-semibold text-blue-700 transition hover:text-blue-900 hover:underline"
                >
                  Lupa kata sandi?
                </button>
              </div>
              <div className="login-input-wrap">
                <LockKeyhole className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="Masukkan kata sandi"
                  aria-invalid={Boolean(errors.password)}
                  aria-describedby={errors.password ? 'password-error' : undefined}
                  {...register('password')}
                  className="login-input"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  className="rounded-md p-1 text-slate-400 transition hover:bg-white/70 hover:text-slate-700 focus-visible:outline-blue-600"
                  aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && (
                <p id="password-error" className="mt-1.5 text-xs font-medium text-red-700">{errors.password.message}</p>
              )}
            </div>

            <button type="submit" disabled={isSubmitting} className="login-submit mt-2">
              {isSubmitting ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/90 border-t-transparent" />
                  Memeriksa akun…
                </>
              ) : (
                <>
                  <KeyRound className="h-4 w-4" aria-hidden="true" />
                  Masuk
                </>
              )}
            </button>
          </form>

          <div className="mt-3 flex items-center gap-3 text-[10px] text-slate-500">
            <span className="h-px flex-1 bg-slate-300/70" />
            <span>Akses aman untuk warga sekolah</span>
            <span className="h-px flex-1 bg-slate-300/70" />
          </div>

          <div className="mt-2 flex items-center justify-center gap-2 text-xs text-slate-600">
            <span>Butuh bantuan masuk?</span>
            <button
              type="button"
              onClick={() => setShowHelpModal(true)}
              className="inline-flex items-center gap-1 font-semibold text-blue-700 hover:text-blue-900 hover:underline"
            >
              <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
              Hubungi admin
            </button>
          </div>
        </section>
      </div>

      <footer className="login-footer relative z-10 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 pb-1 text-center text-[10px] text-slate-600">
        <span className="font-semibold text-slate-700">Tandara</span>
        <span aria-hidden="true">·</span>
        <span>Sistem Presensi Sekolah</span>
        <span aria-hidden="true">·</span>
        <span>Privasi data siswa terlindungi</span>
      </footer>

      <Modal
        isOpen={showForgotPasswordModal}
        onClose={() => setShowForgotPasswordModal(false)}
        title="Bantuan Pemulihan Akun"
        subtitle="Petunjuk pengaturan ulang kredensial akses"
        maxWidth="md"
      >
        <div className="space-y-4 text-xs text-slate-600 sm:text-sm">
          <p className="leading-relaxed">
            Untuk menjaga keamanan data presensi dan privasi biometrik siswa, pemulihan akun dilakukan melalui administrator sistem sekolah.
          </p>
          <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-xs text-slate-700">
            <h2 className="font-semibold text-slate-900">Langkah Pemulihan</h2>
            <ol className="list-decimal space-y-1.5 pl-5 text-slate-600">
              <li>Hubungi bagian IT atau Tim Pengelola Presensi Sekolah.</li>
              <li>Sampaikan identitas akun (email, username, atau NIP) untuk diverifikasi.</li>
              <li>Administrator akan menerbitkan kredensial sementara atau melakukan reset sandi.</li>
            </ol>
          </div>
          <div className="pt-2 text-right">
            <button type="button" onClick={() => setShowForgotPasswordModal(false)} className="t-button-primary">
              Tutup
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={showHelpModal}
        onClose={() => setShowHelpModal(false)}
        title="Bantuan Masuk Tandara"
        subtitle="Panduan autentikasi akun sekolah"
        maxWidth="md"
      >
        <div className="space-y-4 text-xs text-slate-600 sm:text-sm">
          <p className="leading-relaxed">
            Masukkan email atau username dan kata sandi yang diberikan oleh administrator sekolah. Sistem akan membuka halaman sesuai peran akun Anda.
          </p>
          <div className="rounded-lg border border-blue-100 bg-blue-50 p-3.5 text-xs leading-relaxed text-blue-900">
            Jika belum memiliki akses atau tidak dapat masuk, hubungi Admin IT sekolah untuk memeriksa akun atau membantu reset kata sandi.
          </div>
          <div className="pt-2 text-right">
            <button type="button" onClick={() => setShowHelpModal(false)} className="t-button-primary">
              Mengerti
            </button>
          </div>
        </div>
      </Modal>
    </main>
  );
};
