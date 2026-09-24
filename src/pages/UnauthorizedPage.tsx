/**
 * Tandara Unauthorized Page (Akses Ditolak)
 * Displayed when an authenticated user attempts to access a route restricted to another role.
 */

import React from 'react';
import { ShieldAlert, ArrowLeft, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { TandaraLogo } from '../components/ui/TandaraLogo';

export const UnauthorizedPage: React.FC = () => {
  const { session, logout } = useAuth();
  const navigate = useNavigate();

  const handleReturnHome = () => {
    if (session?.role === 'ADMIN_IT') {
      navigate('/admin/dashboard', { replace: true });
    } else if (session?.role === 'TEACHER') {
      navigate('/teacher/dashboard', { replace: true });
    } else {
      navigate('/login', { replace: true });
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-[#F6F7F9] flex flex-col justify-center items-center p-6 text-center">
      <div className="w-full max-w-md bg-white rounded-xl border border-slate-200 shadow-sm p-8">
        <div className="flex justify-center mb-6">
          <TandaraLogo size="md" />
        </div>

        <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-red-50 border border-red-200 flex items-center justify-center text-red-700">
          <ShieldAlert className="w-6 h-6" />
        </div>

        <h1 className="text-xl font-bold text-slate-900 mb-2">Akses Tidak Diizinkan</h1>
        <p className="text-sm text-slate-600 mb-6 leading-relaxed">
          Akun Anda saat ini terdaftar dengan peran{' '}
          <strong className="text-slate-800">
            {session?.role === 'ADMIN_IT' ? 'Admin IT' : 'Guru / Piket'}
          </strong>
          . Halaman yang Anda tuju dibatasi khusus untuk peran yang berwenang.
        </p>

        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 mb-6 text-xs text-slate-500 text-left">
          <p className="font-semibold text-slate-700 mb-1">Aturan Akses Tandara:</p>
          <ul className="list-disc pl-4 space-y-1">
            <li>Admin IT hanya berwenang mengelola data, kelas, perangkat & sistem.</li>
            <li>Guru/Piket hanya berwenang memantau sesi absensi, kehadiran & izin.</li>
          </ul>
        </div>

        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            onClick={handleReturnHome}
            className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-sm font-semibold rounded-lg shadow-xs transition-colors focus:ring-2 focus:ring-blue-500 focus:outline-none"
          >
            <ArrowLeft className="w-4 h-4" />
            Kembali ke Dashboard Anda
          </button>

          <button
            type="button"
            onClick={handleLogout}
            className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 bg-slate-100 hover:bg-slate-200/70 text-slate-700 text-sm font-medium rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Ganti Akun (Keluar)
          </button>
        </div>
      </div>
    </div>
  );
};
