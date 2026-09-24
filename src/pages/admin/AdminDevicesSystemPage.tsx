/**
 * Tandara Admin IT - Perangkat & Sistem Page
 * Route: /admin/devices-system
 */

import React, { useState } from 'react';
import {
  Camera,
  Server,
  Database,
  RefreshCw,
  Sliders,
  Send,
  Save,
  Download,
  Shield,
  Activity,
} from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { EmptyState } from '../../components/ui/EmptyState';
import { BackendDisconnected } from '../../components/ui/BackendDisconnected';
import { useToast } from '../../context/ToastContext';

export const AdminDevicesSystemPage: React.FC = () => {
  const { showBackendNotConnected } = useToast();

  const [serverHost, setServerHost] = useState('http://localhost');
  const [apiPort, setApiPort] = useState('8000');
  const [webPort, setWebPort] = useState('3000');

  const handleTestCamera = (name: string) => {
    showBackendNotConnected(`Backend belum terhubung. Uji kamera ${name} memerlukan server aktif.`);
  };

  const handleRestartDevice = (name: string) => {
    showBackendNotConnected(`Backend belum terhubung. Mulai ulang ${name} belum dapat diproses.`);
  };

  const handleChangeSource = (name: string) => {
    showBackendNotConnected(`Backend belum terhubung. Pengaturan sumber kamera ${name} membutuhkan server.`);
  };

  const handleSaveNetwork = (e: React.FormEvent) => {
    e.preventDefault();
    showBackendNotConnected('Backend belum terhubung. Konfigurasi jaringan lokal belum dapat disimpan.');
  };

  const handleRetryNotifications = () => {
    showBackendNotConnected('Backend belum terhubung. Pengiriman ulang antrean notifikasi belum dapat diproses.');
  };

  const handleCreateBackup = () => {
    showBackendNotConnected('Backend belum terhubung. Pencadangan basis data SQLite memerlukan server lokal.');
  };

  const devices = [
    {
      id: 'cam-in',
      name: 'Kamera Gerbang Masuk',
      type: 'DroidCam RTSP',
      status: 'Belum terhubung',
      icon: Camera,
    },
    {
      id: 'cam-out',
      name: 'Kamera Gerbang Keluar',
      type: 'DroidCam RTSP',
      status: 'Belum terhubung',
      icon: Camera,
    },
    {
      id: 'srv-local',
      name: 'Server Lokal (FastAPI)',
      type: 'Python 3.11 Runtime',
      status: 'Belum terhubung',
      icon: Server,
    },
    {
      id: 'db-sqlite',
      name: 'Database SQLite',
      type: 'sqlite3 local.db',
      status: 'Belum terhubung',
      icon: Database,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Perangkat & Sistem"
        subtitle="Manajemen perangkat kamera pengenal wajah, koneksi FastAPI lokal, dan antrean aplikasi orang tua"
        breadcrumbs={[
          { label: 'Admin IT', href: '/admin/dashboard' },
          { label: 'Perangkat & Sistem' },
        ]}
      />

      <BackendDisconnected moduleName="Modul Perangkat & Sistem" />

      {/* 4 Device Cards (All without fake CPU/RAM/FPS/DB size) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {devices.map((device) => {
          const Icon = device.icon;
          return (
            <div
              key={device.id}
              className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="w-9 h-9 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-600">
                    <Icon className="w-4 h-4" />
                  </div>
                  <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-800 border border-amber-200">
                    {device.status}
                  </span>
                </div>
                <h4 className="text-sm font-semibold text-slate-900">{device.name}</h4>
                <p className="text-xs text-slate-500 mt-0.5">{device.type}</p>
              </div>

              <div className="pt-3.5 border-t border-slate-100 mt-4 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => handleTestCamera(device.name)}
                  className="text-xs text-[#2563EB] hover:text-[#1D4ED8] font-medium"
                >
                  Uji Koneksi
                </button>
                <button
                  type="button"
                  onClick={() => handleRestartDevice(device.name)}
                  className="text-xs text-slate-500 hover:text-slate-800"
                >
                  Restart
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Camera Live Preview & Control Container */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Monitoring Area (2 cols) */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
          <div className="flex items-center justify-between pb-3.5 border-b border-slate-100 mb-4">
            <div>
              <h3 className="text-base font-semibold text-slate-900">Pemantauan Stream Kamera</h3>
              <p className="text-xs text-slate-500">Pratinjau umpan video IP DroidCam</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleTestCamera('Gerbang Utama')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors border border-slate-200"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Tes Kamera
              </button>
              <button
                type="button"
                onClick={() => handleRestartDevice('Stream Kamera')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors border border-slate-200"
              >
                Mulai Ulang
              </button>
              <button
                type="button"
                onClick={() => handleChangeSource('Kamera Utama')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors border border-blue-200"
              >
                <Sliders className="w-3.5 h-3.5" />
                Ubah Sumber
              </button>
            </div>
          </div>

          {/* Placeholder frame without real webcam */}
          <div className="aspect-video w-full rounded-lg bg-slate-900 border border-slate-800 flex flex-col items-center justify-center p-6 text-center text-slate-400">
            <div className="w-12 h-12 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400 mb-3">
              <Camera className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-semibold text-slate-200">Kamera belum terhubung</h4>
            <p className="text-xs text-slate-400 max-w-sm mt-1 leading-relaxed">
              Hubungkan DroidCam pada perangkat Android/iOS ke jaringan sekolah yang sama dan masukkan URL RTSP/HTTP di server lokal.
            </p>
          </div>
        </div>

        {/* Notification Queue Panel (1 col) */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3.5 border-b border-slate-100 mb-4">
              <div>
                <h3 className="text-base font-semibold text-slate-900">Antrean Notifikasi</h3>
                <p className="text-xs text-slate-500">Pengiriman ke aplikasi orang tua</p>
              </div>
              <Send className="w-4 h-4 text-slate-400" />
            </div>

            <div className="grid grid-cols-3 gap-2 p-3 bg-slate-50 rounded-lg border border-slate-200 text-center mb-4">
              <div>
                <p className="text-[10px] uppercase font-semibold text-slate-500">Terkirim</p>
                <p className="text-xl font-bold text-slate-900 font-mono mt-0.5">—</p>
              </div>
              <div className="border-x border-slate-200">
                <p className="text-[10px] uppercase font-semibold text-slate-500">Menunggu</p>
                <p className="text-xl font-bold text-slate-900 font-mono mt-0.5">—</p>
              </div>
              <div>
                <p className="text-[10px] uppercase font-semibold text-slate-500">Gagal</p>
                <p className="text-xl font-bold text-slate-900 font-mono mt-0.5">—</p>
              </div>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              Pemberitahuan presensi otomatis ditransmisikan ke aplikasi mobile orang tua Tandara secara asinkron.
            </p>
          </div>

          <div className="pt-3.5 border-t border-slate-100 mt-4">
            <button
              type="button"
              onClick={handleRetryNotifications}
              className="w-full py-2 px-3 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center justify-center gap-1.5 border border-slate-200"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Coba Kirim Ulang
            </button>
          </div>
        </div>
      </div>

      {/* Local Network Configuration & Maintenance Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Local Network Configuration Form */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
          <div className="pb-3 border-b border-slate-100 mb-4">
            <h3 className="text-base font-semibold text-slate-900">Konfigurasi Jaringan Server Lokal</h3>
            <p className="text-xs text-slate-500">
              Pengaturan alamat host dan port koneksi backend FastAPI
            </p>
          </div>

          <form onSubmit={handleSaveNetwork} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                Alamat Server Lokal
              </label>
              <input
                type="text"
                value={serverHost}
                onChange={(e) => setServerHost(e.target.value)}
                placeholder="http://localhost atau http://192.168.1.100"
                className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-mono"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Port API (FastAPI)
                </label>
                <input
                  type="number"
                  value={apiPort}
                  onChange={(e) => setApiPort(e.target.value)}
                  className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Port Web App
                </label>
                <input
                  type="number"
                  value={webPort}
                  onChange={(e) => setWebPort(e.target.value)}
                  className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-mono"
                />
              </div>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600">
              <span className="font-semibold text-slate-800">Status Koneksi Saat Ini:</span> Belum aktif (menunggu layanan backend di port 8000).
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="submit"
                className="inline-flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-lg transition-colors shadow-xs"
              >
                <Save className="w-4 h-4" />
                Simpan Konfigurasi Jaringan
              </button>
            </div>
          </form>
        </div>

        {/* Backup and Maintenance Panel */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="pb-3 border-b border-slate-100 mb-4">
              <h3 className="text-base font-semibold text-slate-900">Pemeliharaan & Pencadangan Basis Data</h3>
              <p className="text-xs text-slate-500">Backup snapshot SQLite dan peremajaan sistem</p>
            </div>

            <div className="space-y-3 text-xs text-slate-600">
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <span className="font-semibold text-slate-800 block mb-0.5">Snapshot SQLite Harian</span>
                <p className="text-slate-500">
                  Cadangkan data siswa, pendaftaran pola wajah biometrik, dan seluruh rekam jejak absensi ke file backup terenkripsi.
                </p>
              </div>

              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <span className="font-semibold text-slate-800 block mb-0.5">Log Diagnostik Sistem</span>
                <p className="text-slate-500">
                  Pemeriksaan jejak runtime OpenCV/ONNX dan latency pengenalan wajah.
                </p>
              </div>
            </div>
          </div>

          <div className="pt-3.5 border-t border-slate-100 mt-4 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={handleCreateBackup}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors border border-slate-200"
            >
              <Download className="w-4 h-4 text-slate-500" />
              Unduh Snapshot SQLite
            </button>
          </div>
        </div>
      </div>

      {/* System Log Empty State */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
          <h3 className="text-base font-semibold text-slate-900">Log Aktivitas Layanan Sistem</h3>
          <span className="text-xs text-slate-400 font-mono">systemd / uvicorn</span>
        </div>

        <EmptyState
          icon={Activity}
          title="Belum ada catatan log sistem."
          description="Log runtime FastAPI, deteksi kamera RTSP DroidCam, dan pengiriman event absensi akan ditampilkan di sini."
          className="py-8"
        />
      </div>
    </div>
  );
};
