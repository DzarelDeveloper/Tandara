/**
 * Tandara Admin IT - Dashboard Page
 * Route: /admin/dashboard
 */

import React, { useEffect, useState } from 'react';
import {
  Users,
  ShieldCheck,
  ClipboardCheck,
  Cpu,
  UserPlus,
  ScanFace,
  Server,
  Database,
  Camera,
  Globe,
  Activity,
  BarChart3,
  Calendar,
} from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { EmptyState } from '../../components/ui/EmptyState';
import { BackendDisconnected } from '../../components/ui/BackendDisconnected';
import { StudentFormModal } from '../../components/admin/StudentFormModal';
import { FaceEnrollmentDrawer } from '../../components/admin/FaceEnrollmentDrawer';
import { useAuth } from '../../context/AuthContext';
import { dashboardService, AdminDashboardStats } from '../../services/dashboard.service';
import { LoadingSkeleton } from '../../components/ui/LoadingSkeleton';
import { ErrorState } from '../../components/ui/ErrorState';

export const AdminDashboardPage: React.FC = () => {
  const { session } = useAuth();
  const [showStudentModal, setShowStudentModal] = useState(false);
  const [showFaceDrawer, setShowFaceDrawer] = useState(false);
  const [stats, setStats] = useState<AdminDashboardStats | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const load = () => { setLoadError(null); dashboardService.admin().then(setStats).catch((e) => setLoadError(e.message)); };
  useEffect(load, []);

  const currentDateFormatted = new Intl.DateTimeFormat('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());

  const kpis = stats ? [
    { label: 'Siswa Aktif', value: stats.activeStudents, icon: Users, color: 'text-blue-600' },
    { label: 'Wajah Terdaftar', value: stats.facesRegistered, icon: ShieldCheck, color: 'text-teal-600' },
    { label: 'Hadir Hari Ini', value: stats.presentToday, icon: ClipboardCheck, color: 'text-emerald-600' },
    { label: 'Sesi Aktif', value: stats.activeSessions, icon: Cpu, color: 'text-slate-600' },
  ] : [];

  const systemStatuses = [
    { name: 'Server Lokal (FastAPI)', status: 'Belum terhubung', icon: Server },
    { name: 'Database SQLite', status: 'Belum terhubung', icon: Database },
    { name: 'Kamera (DroidCam)', status: 'Belum terhubung', icon: Camera },
    { name: 'Jaringan Sekolah', status: 'Belum diperiksa', icon: Globe },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header with Quick Actions */}
      <PageHeader
        title={`Selamat datang, ${session?.displayName?.split(' ')[0] || 'Dzarel'}`}
        subtitle={`Ringkasan operasional sistem absensi wajah sekolah per ${currentDateFormatted}`}
        actions={
          <>
            <button
              type="button"
              onClick={() => setShowStudentModal(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs sm:text-sm font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-lg shadow-xs transition-colors focus:ring-2 focus:ring-blue-500 focus:outline-none"
            >
              <UserPlus className="w-4 h-4" />
              Tambah Siswa
            </button>
            <button
              type="button"
              onClick={() => setShowFaceDrawer(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs sm:text-sm font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors focus:ring-2 focus:ring-teal-500 focus:outline-none"
            >
              <ScanFace className="w-4 h-4 text-teal-700" />
              Daftarkan Wajah
            </button>
          </>
        }
      />

      {/* Backend Disconnected Banner */}
      <BackendDisconnected moduleName="Dashboard Admin IT" />

      {loadError && <ErrorState message={loadError} onRetry={load} />}
      {!stats && !loadError ? <LoadingSkeleton type="card" /> : <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi, index) => {
          const Icon = kpi.icon;
          return (
            <div
              key={index}
              className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between"
            >
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                  {kpi.label}
                </p>
                <p className="text-2xl font-semibold font-mono tabular-nums text-slate-900 mt-1">{kpi.value}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Menunggu server aktif</p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center shrink-0">
                <Icon className={`w-5 h-5 ${kpi.color}`} />
              </div>
            </div>
          );
        })}
      </div></>}

      {/* Main Grid: Chart Container & Status Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Attendance Chart Container (2 cols) */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
          <div className="flex items-center justify-between pb-3.5 border-b border-slate-100 mb-5">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Tren Kehadiran 7 Hari</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Statistik persentase kehadiran seluruh tingkatan kelas
              </p>
            </div>
            <div className="w-8 h-8 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-600">
              <BarChart3 className="w-4 h-4" />
            </div>
          </div>

          <EmptyState
            icon={BarChart3}
            title="Belum ada data kehadiran."
            description="Grafik akan ditampilkan setelah backend terhubung."
            className="py-12"
          />
        </div>

        {/* System Status Panel (1 col) */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3.5 border-b border-slate-100 mb-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Status Sistem</h2>
                <p className="text-xs text-slate-500 mt-0.5">Pemantauan layanan lokal</p>
              </div>
              <Activity className="w-4 h-4 text-slate-400" />
            </div>

            <div className="space-y-2.5">
              {systemStatuses.map((item, idx) => {
                const Icon = item.icon;
                return (
                  <div
                    key={idx}
                    className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon className="w-4 h-4 text-slate-500" />
                      <span className="font-medium text-slate-700">{item.name}</span>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-white text-slate-600 border border-slate-200">
                      {item.status}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-5 pt-3.5 border-t border-slate-100 text-center">
            <span className="text-[11px] text-slate-400 font-mono">
              FastAPI: http://localhost:8000
            </span>
          </div>
        </div>
      </div>

      {/* Secondary Grid: Status Hari Ini & Aktivitas Terbaru */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Panel Status Hari Ini */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
            <h2 className="text-base font-semibold text-slate-900">Status Hari Ini</h2>
            <div className="text-xs text-slate-500 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>{currentDateFormatted}</span>
            </div>
          </div>

          <EmptyState
            title="Belum ada status hari ini."
            description="Informasi absensi harian akan dikompilasi secara real-time saat sesi absensi dimulai oleh Guru Piket."
            className="py-8"
          />
        </div>

        {/* Panel Aktivitas Terbaru */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
            <h2 className="text-base font-semibold text-slate-900">Aktivitas Terbaru</h2>
            <span className="text-xs text-slate-400 font-medium">Jejak Audit</span>
          </div>

          <EmptyState
            title="Belum ada aktivitas sistem."
            description="Riwayat pendaftaran siswa, enrollment wajah, dan perubahan konfigurasi akan muncul di sini."
            className="py-8"
          />
        </div>
      </div>

      {/* Modals & Drawers */}
      <StudentFormModal isOpen={showStudentModal} onClose={() => setShowStudentModal(false)} />
      <FaceEnrollmentDrawer isOpen={showFaceDrawer} onClose={() => setShowFaceDrawer(false)} />
    </div>
  );
};
