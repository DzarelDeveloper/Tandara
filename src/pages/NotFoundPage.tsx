/**
 * Tandara 404 Not Found Page
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Home, FileQuestion } from 'lucide-react';
import { TandaraLogo } from '../components/ui/TandaraLogo';

export const NotFoundPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#F6F7F9] flex flex-col justify-center items-center p-6 text-center">
      <div className="w-full max-w-md bg-white rounded-xl border border-slate-200 shadow-sm p-8">
        <div className="flex justify-center mb-6">
          <TandaraLogo size="md" />
        </div>

        <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-[#2563EB]">
          <FileQuestion className="w-6 h-6" />
        </div>

        <h1 className="text-xl font-bold text-slate-900 mb-2">404 - Halaman Tidak Ditemukan</h1>
        <p className="text-sm text-slate-600 mb-6 leading-relaxed">
          Tautan yang Anda tuju tidak tersedia atau telah dipindahkan.
        </p>

        <button
          type="button"
          onClick={() => navigate('/login')}
          className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-sm font-semibold rounded-lg shadow-xs transition-colors focus:ring-2 focus:ring-blue-500 focus:outline-none"
        >
          <Home className="w-4 h-4" />
          Kembali ke Halaman Masuk
        </button>
      </div>
    </div>
  );
};
