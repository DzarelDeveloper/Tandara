/**
 * Tandara FaceEnrollmentDrawer
 * Biometric face enrollment interface for Admin IT.
 * Shows disconnected camera state without accessing the real webcam.
 */

import React, { useState } from 'react';
import { Drawer } from '../ui/Drawer';
import { Modal } from '../ui/Modal';
import { Camera, CameraOff, CheckCircle2, AlertCircle, Info, Video, ShieldCheck } from 'lucide-react';
import { useToast } from '../../context/ToastContext';

interface FaceEnrollmentDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FaceEnrollmentDrawer: React.FC<FaceEnrollmentDrawerProps> = ({
  isOpen,
  onClose,
}) => {
  const { showBackendNotConnected } = useToast();
  const [showDroidCamInfo, setShowDroidCamInfo] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState('');

  const handleSaveFace = () => {
    showBackendNotConnected('Backend belum terhubung. Data biometrik wajah belum dapat disimpan.');
  };

  return (
    <>
      <Drawer
        isOpen={isOpen}
        onClose={onClose}
        title="Pendaftaran Biometrik Wajah"
        subtitle="Daftarkan pola wajah siswa untuk sistem absensi otomatis"
        width="lg"
      >
        <div className="space-y-6">
          {/* Step 1: Select Student */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1.5">
              1. Pilih Siswa
            </label>
            <select
              value={selectedStudent}
              onChange={(e) => setSelectedStudent(e.target.value)}
              className="w-full px-3.5 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            >
              <option value="">-- Pilih Siswa (Daftar Kosong) --</option>
            </select>
            <p className="text-[11px] text-slate-500 mt-1">
              Data siswa akan dimuat otomatis saat terhubung ke basis data lokal.
            </p>
          </div>

          {/* Step 2: Camera Stream Area */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-semibold text-slate-700 uppercase">
                2. Pratinjau Kamera (DroidCam)
              </label>
              <span className="text-[11px] font-medium text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                Kamera Belum Terhubung
              </span>
            </div>

            {/* Camera Frame Placeholder */}
            <div className="relative aspect-video w-full rounded-xl bg-slate-900 border border-slate-800 flex flex-col items-center justify-center p-6 text-center text-slate-400 overflow-hidden">
              {/* Target Scan Guides */}
              <div className="absolute inset-8 border border-white/10 rounded-lg pointer-events-none flex flex-col justify-between p-2">
                <div className="flex justify-between">
                  <div className="w-4 h-4 border-t-2 border-l-2 border-slate-500"></div>
                  <div className="w-4 h-4 border-t-2 border-r-2 border-slate-500"></div>
                </div>
                <div className="flex justify-between">
                  <div className="w-4 h-4 border-b-2 border-l-2 border-slate-500"></div>
                  <div className="w-4 h-4 border-b-2 border-r-2 border-slate-500"></div>
                </div>
              </div>

              <div className="w-12 h-12 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400 mb-3">
                <CameraOff className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-semibold text-slate-200 mb-1">Kamera belum terhubung.</h4>
              <p className="text-xs text-slate-400 max-w-xs leading-relaxed mb-4">
                Sistem disiapkan untuk menggunakan DroidCam sebagai kamera nirkabel melalui FastAPI lokal.
              </p>

              <button
                type="button"
                onClick={() => setShowDroidCamInfo(true)}
                className="inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 border border-slate-700 rounded-lg hover:bg-slate-700 transition-colors"
              >
                <Video className="w-3.5 h-3.5" />
                Hubungkan Kamera
              </button>
            </div>
          </div>

          {/* Face Guidelines Box */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
            <h5 className="text-xs font-semibold text-slate-800 mb-2 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-slate-600" />
              Standar Pendaftaran Biometrik Wajah:
            </h5>
            <ul className="text-xs text-slate-600 space-y-1.5 pl-1">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                <span>Satu wajah di dalam frame (posisi tegak menghadap kamera).</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                <span>Pencahayaan cukup dan hindari backlight silau.</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                <span>Ambil beberapa sudut wajah (lurus, sedikit ke kiri, sedikit ke kanan).</span>
              </li>
            </ul>
          </div>

          {/* Action Buttons */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-between gap-3">
            <button
              type="button"
              disabled={true}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-medium text-slate-400 bg-slate-100 border border-slate-200 rounded-lg cursor-not-allowed"
              title="Kamera belum aktif"
            >
              <Camera className="w-4 h-4" />
              Ambil Foto (0/3)
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 text-xs sm:text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200"
              >
                Tutup
              </button>
              <button
                type="button"
                onClick={handleSaveFace}
                className="px-4 py-2.5 text-xs sm:text-sm font-medium text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-lg shadow-xs transition-colors"
              >
                Simpan Data Wajah
              </button>
            </div>
          </div>
        </div>
      </Drawer>

      {/* DroidCam Integration Info Modal */}
      <Modal
        isOpen={showDroidCamInfo}
        onClose={() => setShowDroidCamInfo(false)}
        title="Integrasi Sumber Kamera DroidCam"
        subtitle="Panduan koneksi DroidCam dengan server lokal FastAPI"
        maxWidth="md"
      >
        <div className="space-y-3 text-xs sm:text-sm text-slate-600 leading-relaxed">
          <p>
            Tandara dirancang untuk menggunakan perangkat smartphone sebagai kamera presensi melalui aplikasi <strong>DroidCam</strong> (koneksi RTSP / MJPEG IP Webcam) yang diproses langsung oleh modul pengenalan wajah ONNX di server FastAPI lokal.
          </p>

          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-900 text-xs space-y-1">
            <p className="font-semibold flex items-center gap-1.5">
              <Info className="w-4 h-4 text-blue-600" />
              Langkah saat FastAPI aktif:
            </p>
            <ol className="list-decimal pl-4 space-y-1 text-blue-800">
              <li>Pasang DroidCam pada ponsel dan hubungkan ke Wi-Fi sekolah yang sama.</li>
              <li>Buka menu <strong>Perangkat & Sistem</strong> di Admin IT.</li>
              <li>Masukkan IP DroidCam (contoh: <code>http://192.168.1.50:4747/video</code>).</li>
              <li>Server lokal akan menangkap frame stream untuk enrollment & presensi.</li>
            </ol>
          </div>

          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <span>
              Pada fase prototype ini, web browser tidak mengakses webcam lokal fisik untuk menjamin integritas batas arsitektur.
            </span>
          </div>

          <div className="pt-2 text-right">
            <button
              type="button"
              onClick={() => setShowDroidCamInfo(false)}
              className="px-4 py-2 bg-[#2563EB] text-white rounded-lg text-xs font-semibold hover:bg-[#1D4ED8] transition-colors"
            >
              Tutup Informasi
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
};
