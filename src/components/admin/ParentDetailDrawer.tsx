/**
 * Tandara ParentDetailDrawer
 * Drawer for inspecting parent account and performing administrative actions.
 */

import React, { useState } from 'react';
import { Drawer } from '../ui/Drawer';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { useToast } from '../../context/ToastContext';
import { Parent } from '../../types';
import { User, Phone, KeyRound, UserMinus, Link } from 'lucide-react';

interface ParentDetailDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  parent: Parent | null;
}

export const ParentDetailDrawer: React.FC<ParentDetailDrawerProps> = ({
  isOpen,
  onClose,
  parent,
}) => {
  const { showBackendNotConnected } = useToast();
  const [confirmAction, setConfirmAction] = useState<'reset' | 'status' | null>(null);

  const handleActionConfirm = () => {
    if (confirmAction === 'reset') {
      showBackendNotConnected('Backend belum terhubung. Permintaan reset password belum dapat diproses.');
    } else if (confirmAction === 'status') {
      showBackendNotConnected('Backend belum terhubung. Perubahan status akun belum dapat disimpan.');
    }
    setConfirmAction(null);
  };

  if (!parent) return null;

  return (
    <>
      <Drawer
        isOpen={isOpen}
        onClose={onClose}
        title="Detail Akun Orang Tua / Wali"
        subtitle="Informasi akun aplikasi orang tua dan keterhubungan siswa"
        width="md"
      >
        <div className="space-y-6">
          {/* Identity Box */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-slate-100 border border-slate-200 text-slate-700 flex items-center justify-center font-bold text-sm">
                {parent.fullName.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <h4 className="text-sm font-semibold text-slate-900">{parent.fullName}</h4>
                <p className="text-xs text-slate-500">Hubungan: {parent.relationship}</p>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-200/80 grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-semibold">Telepon</span>
                <span className="text-slate-800 font-mono flex items-center gap-1 mt-0.5">
                  <Phone className="w-3 h-3 text-slate-400" />
                  {parent.phone}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-semibold">Username</span>
                <span className="text-slate-800 font-mono flex items-center gap-1 mt-0.5">
                  <User className="w-3 h-3 text-slate-400" />
                  @{parent.username}
                </span>
              </div>
            </div>
          </div>

          {/* Connected Students Section */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h5 className="text-xs font-semibold text-slate-700 uppercase">Siswa Terhubung</h5>
              <button
                type="button"
                onClick={() =>
                  showBackendNotConnected('Backend belum terhubung. Hubungkan siswa memerlukan basis data.')
                }
                className="text-xs text-[#2563EB] hover:text-[#1D4ED8] font-medium flex items-center gap-1"
              >
                <Link className="w-3 h-3" />
                Hubungkan Siswa
              </button>
            </div>

            <div className="p-4 rounded-xl border border-dashed border-slate-200 bg-white text-center text-xs text-slate-500">
              Belum ada siswa terhubung.
            </div>
          </div>

          {/* Notification & Status Section */}
          <div className="space-y-3">
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-between text-xs">
              <div>
                <span className="font-medium text-slate-800 block">Notifikasi Aplikasi Orang Tua</span>
                <span className="text-[11px] text-slate-500">Pemberitahuan presensi harian otomatis</span>
              </div>
              <span className="px-2 py-0.5 text-[11px] font-medium rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                Aktif
              </span>
            </div>

            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-between text-xs">
              <div>
                <span className="font-medium text-slate-800 block">Status Akun</span>
                <span className="text-[11px] text-slate-500">Akses login wali murid</span>
              </div>
              <span className="px-2 py-0.5 text-[11px] font-medium rounded bg-slate-100 text-slate-700 border border-slate-200">
                Belum Aktivasi
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-6 border-t border-slate-200 space-y-2">
            <button
              type="button"
              onClick={() => setConfirmAction('reset')}
              className="w-full py-2.5 px-4 bg-white hover:bg-slate-50 text-slate-700 text-xs sm:text-sm font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors border border-slate-300 shadow-xs"
            >
              <KeyRound className="w-4 h-4 text-slate-500" />
              Reset Password Sementara
            </button>

            <button
              type="button"
              onClick={() => setConfirmAction('status')}
              className="w-full py-2.5 px-4 bg-red-50 hover:bg-red-100 text-red-700 text-xs sm:text-sm font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors border border-red-200"
            >
              <UserMinus className="w-4 h-4 text-red-600" />
              Nonaktifkan Akun
            </button>
          </div>
        </div>
      </Drawer>

      <ConfirmDialog
        isOpen={confirmAction !== null}
        onClose={() => setConfirmAction(null)}
        onConfirm={handleActionConfirm}
        title={confirmAction === 'reset' ? 'Reset Password Sementara?' : 'Nonaktifkan Akun Orang Tua?'}
        description={
          confirmAction === 'reset'
            ? 'Password acak baru akan digenerate dan dikirimkan ke kontak orang tua setelah backend aktif.'
            : 'Akun ini tidak akan dapat login ke aplikasi mobile orang tua Tandara hingga diaktifkan kembali.'
        }
        confirmLabel={confirmAction === 'reset' ? 'Ya, Reset Password' : 'Ya, Nonaktifkan'}
        isDestructive={confirmAction === 'status'}
      />
    </>
  );
};
