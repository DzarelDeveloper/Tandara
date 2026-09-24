/**
 * Tandara Guru / Piket - Dashboard Page
 * Route: /teacher/dashboard
 */

import React, { useState } from 'react';
import {
  CheckCircle2,
  Clock,
  AlertCircle,
  XCircle,
  Video,
  FileClock,
  ShieldCheck,
  Calendar,
  Layers,
  AlertTriangle,
} from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { EmptyState } from '../../components/ui/EmptyState';
import { BackendDisconnected } from '../../components/ui/BackendDisconnected';
import { StartSessionModal } from '../../components/teacher/StartSessionModal';
import { useAuth } from '../../context/AuthContext';

export const TeacherDashboardPage: React.FC = () => {
  const { session } = useAuth();
  const [showSessionModal, setShowSessionModal] = useState(false);

  const currentDateFormatted = new Intl.DateTimeFormat('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());

  const kpis = [
    { label: 'Hadir', value: '—', icon: CheckCircle2, color: 'text-emerald-600' },
    { label: 'Terlambat', value: '—', icon: Clock, color: 'text-amber-600' },
    { label: 'Izin / Sakit', value: '—', icon: AlertCircle, color: 'text-blue-600' },
    { label: 'Belum Hadir', value: '—', icon: XCircle, color: 'text-red-600' },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title={`Selamat pagi, ${session?.displayName?.split(' ')[0] || 'Bu Siti'}`}
        subtitle={`Operasional piket harian dan pemantauan absensi siswa per ${currentDateFormatted}`}
        actions={
          <button
            type="button"
            onClick={() => setShowSessionModal(true)}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs sm:text-sm font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-lg shadow-xs transition-colors focus:ring-2 focus:ring-blue-500 focus:outline-none"
          >
            <Video className="w-4 h-4" />
            Mulai Sesi Absensi
          </button>
        }
      />

      <BackendDisconnected moduleName="Dashboard Guru / Piket" />

      {/* Duty Card: Piket Hari Ini (Solid #0F1F3D) */}
      <div className="bg-[#0F1F3D] text-white p-5 sm:p-6 rounded-xl border border-[#1a2d52] shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center gap-3.5">
          <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center text-teal-300 shrink-0 border border-white/10">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-teal-300">
                Piket Hari Ini
              </span>
              <span className="text-xs text-slate-400">&bull;</span>
              <span className="text-xs text-slate-300">{currentDateFormatted}</span>
            </div>
            <h2 className="text-base sm:text-lg font-bold text-white mt-0.5">
              Petugas Aktif: {session?.displayName || 'Siti Nurhaliza'}
            </h2>
            <p className="text-xs text-slate-300 mt-0.5">
              Tugas: Memantau gerbang masuk, memverifikasi permohonan izin orang tua, dan rekapitulasi harian.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowSessionModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-lg transition-colors shadow-xs shrink-0 self-start md:self-auto"
        >
          <Video className="w-4 h-4" />
          Buka Absensi Kamera
        </button>
      </div>

      {/* 4 KPI Cards (All values '—') */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi, idx) => {
          const Icon = kpi.icon;
          return (
            <div
              key={idx}
              className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between"
            >
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                  {kpi.label}
                </p>
                <p className="text-2xl font-semibold font-mono tabular-nums text-slate-900 mt-1">{kpi.value}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Data backend belum aktif</p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center shrink-0">
                <Icon className={`w-5 h-5 ${kpi.color}`} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Session Panel & Attendance Progress */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Session Panel (2 cols) */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
          <div className="flex items-center justify-between pb-3.5 border-b border-slate-100 mb-4">
            <div>
              <h3 className="text-base font-semibold text-slate-900">Status Sesi Presensi Langsung</h3>
              <p className="text-xs text-slate-500">Kamera pendeteksi wajah DroidCam</p>
            </div>
            <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-800 border border-amber-200">
              Belum Aktif
            </span>
          </div>

          <EmptyState
            icon={Video}
            title="Belum ada sesi absensi aktif."
            description="Mulai sesi untuk mengaktifkan pemindaian wajah siswa di gerbang masuk atau pulang sekolah."
            actionText="Mulai Sesi Absensi"
            onAction={() => setShowSessionModal(true)}
            className="py-10"
          />
        </div>

        {/* Attendance Progress by Grade (1 col) */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3.5 border-b border-slate-100 mb-4">
              <div>
                <h3 className="text-base font-semibold text-slate-900">Kehadiran per Tingkat</h3>
                <p className="text-xs text-slate-500">Progres kelas 10, 11, dan 12</p>
              </div>
              <Layers className="w-4 h-4 text-slate-400" />
            </div>

            <EmptyState
              title="Belum ada data progres."
              description="Persentase kehadiran per tingkat akan terhitung secara real-time saat sesi berjalan."
              className="py-6"
            />
          </div>

          <div className="pt-3 border-t border-slate-100 text-center text-xs text-slate-400 font-mono">
            Total target: — siswa
          </div>
        </div>
      </div>

      {/* Secondary Grid: Pengajuan Menunggu & Perlu Verifikasi & Aktivitas Terbaru */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Panel Pengajuan Menunggu */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
            <div className="flex items-center gap-2">
              <FileClock className="w-4 h-4 text-blue-600" />
              <h3 className="text-sm font-semibold text-slate-900">Pengajuan Izin Menunggu</h3>
            </div>
            <span className="text-xs text-slate-400 font-mono">0</span>
          </div>

          <EmptyState
            title="Belum ada pengajuan izin."
            description="Pengajuan surat sakit/izin dari aplikasi orang tua akan langsung muncul di sini."
            className="py-6"
          />
        </div>

        {/* Alert Panel Verifikasi Manual */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <h3 className="text-sm font-semibold text-slate-900">Verifikasi Manual</h3>
            </div>
            <span className="text-xs text-slate-400 font-mono">0</span>
          </div>

          <EmptyState
            title="Belum ada siswa memerlukan verifikasi."
            description="Jika wajah tidak terbaca optimal atau terjadi kendala pencahayaan, guru piket dapat mengonfirmasi identitas siswa."
            className="py-6"
          />
        </div>

        {/* Panel Aktivitas Terbaru */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-slate-400" />
              <h3 className="text-sm font-semibold text-slate-900">Aktivitas Terbaru</h3>
            </div>
            <span className="text-xs text-slate-400">Hari ini</span>
          </div>

          <EmptyState
            title="Belum ada aktivitas presensi."
            description="Catatan waktu absensi siswa hari ini akan terekam secara kronologis."
            className="py-6"
          />
        </div>
      </div>

      {/* Start Session Modal */}
      <StartSessionModal isOpen={showSessionModal} onClose={() => setShowSessionModal(false)} />
    </div>
  );
};
