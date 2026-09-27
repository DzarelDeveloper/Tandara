/**
 * Tandara StartSessionModal
 * Modal for starting incoming/outgoing attendance sessions.
 */

import React, { useState } from 'react';
import { Modal } from '../ui/Modal';
import { useToast } from '../../context/ToastContext';
import { Video, LogIn, LogOut, Camera } from 'lucide-react';
import { attendanceService } from '../../services/attendance.service';

interface StartSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStarted?: (sessionId: string, mode: 'CHECK_IN' | 'CHECK_OUT', cameraSource: string) => void;
}

export const StartSessionModal: React.FC<StartSessionModalProps> = ({ isOpen, onClose, onStarted }) => {
  const { showToast } = useToast();
  const [mode, setMode] = useState<'CHECK_IN' | 'CHECK_OUT'>('CHECK_IN');
  const cameraSource = 'BROWSER_CAMERA';
  const [classFilter, setClassFilter] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const session = await attendanceService.startLiveSession({ mode, cameraSource, classFilter });
      onStarted?.(session.sessionId, session.mode, cameraSource);
      onClose();
    } catch (error) {
      showToast({ type: 'error', message: error instanceof Error ? error.message : 'Sesi belum dapat dimulai.' });
    } finally { setIsSubmitting(false); }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Mulai Sesi Absensi Wajah"
      subtitle="Pilih mode kehadiran untuk kamera browser atau virtual webcam"
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Mode Selector */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase mb-2">
            Mode Presensi
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setMode('CHECK_IN')}
              className={`p-3 rounded-lg border text-left flex items-center gap-2.5 transition-colors ${
                mode === 'CHECK_IN'
                  ? 'border-[#2563EB] bg-blue-50/50 text-slate-900 ring-1 ring-[#2563EB]'
                  : 'border-slate-200 hover:bg-slate-50 text-slate-700'
              }`}
            >
              <LogIn className={`w-5 h-5 ${mode === 'CHECK_IN' ? 'text-[#2563EB]' : 'text-slate-400'}`} />
              <div>
                <span className="font-semibold text-xs block">Presensi Masuk</span>
                <span className="text-[10px] text-slate-500">Kedatangan pagi hari</span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setMode('CHECK_OUT')}
              className={`p-3 rounded-lg border text-left flex items-center gap-2.5 transition-colors ${
                mode === 'CHECK_OUT'
                  ? 'border-teal-700 bg-teal-50/50 text-slate-900 ring-1 ring-teal-700'
                  : 'border-slate-200 hover:bg-slate-50 text-slate-700'
              }`}
            >
              <LogOut className={`w-5 h-5 ${mode === 'CHECK_OUT' ? 'text-teal-700' : 'text-slate-400'}`} />
              <div>
                <span className="font-semibold text-xs block">Presensi Pulang</span>
                <span className="text-[10px] text-slate-500">Kepulangan siswa</span>
              </div>
            </button>
          </div>
        </div>

        {/* Camera Source */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
            Sumber Kamera
          </label>
          <div className="relative">
            <div
              className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              Browser camera / virtual webcam
            </div>
            <Camera className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>

        {/* Optional Class Filter */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
            Filter Kelas Tertentu (Opsional)
          </label>
          <select
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="">Semua Tingkat & Kelas (Rekomendasi Gerbang)</option>
            <option value="10">Seluruh Kelas 10</option>
            <option value="11">Seluruh Kelas 11</option>
            <option value="12">Seluruh Kelas 12</option>
          </select>
          <p className="text-[11px] text-slate-400 mt-1">
            Biarkan default untuk memproses seluruh siswa yang melintas di depan kamera.
          </p>
        </div>

        {/* Runtime behaviour */}
        <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600">
          Kamera akan memindai frame secara berkala setelah sesi aktif. Pilih webcam atau DroidCam virtual pada halaman absensi.
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
            className="inline-flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 rounded-lg transition-colors shadow-xs"
          >
            <Video className="w-4 h-4" />
            {isSubmitting ? 'Menghubungkan...' : 'Mulai Sesi Absensi'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
