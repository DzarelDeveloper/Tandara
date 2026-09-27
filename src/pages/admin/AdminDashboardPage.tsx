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
  Activity,
} from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { StudentFormModal } from '../../components/admin/StudentFormModal';
import { FaceEnrollmentDrawer } from '../../components/admin/FaceEnrollmentDrawer';
import { useAuth } from '../../context/AuthContext';
import { dashboardService, AdminDashboardStats } from '../../services/dashboard.service';
import { LoadingSkeleton } from '../../components/ui/LoadingSkeleton';
import { ErrorState } from '../../components/ui/ErrorState';
import { studentsService } from '../../services/students.service';
import { Student } from '../../types';
import { HealthStatus, systemService } from '../../services/system.service';
import { StatCard } from '../../components/ui/StatCard';

export const AdminDashboardPage: React.FC = () => {
  const { session } = useAuth();
  const [showStudentModal, setShowStudentModal] = useState(false);
  const [showFaceDrawer, setShowFaceDrawer] = useState(false);
  const [stats, setStats] = useState<AdminDashboardStats | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const load = () => { setLoadError(null); dashboardService.admin().then(setStats).catch((e) => setLoadError(e.message)); };
  useEffect(load, []);
  useEffect(() => { studentsService.getStudents().then(setStudents).catch(() => setStudents([])); }, []);
  useEffect(() => { systemService.health().then(setHealth).catch(() => setHealth(null)); }, []);

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
    { name: 'Server Lokal (FastAPI)', status: health?.status === 'ok' ? 'Online' : 'Tidak tersedia', icon: Server },
    { name: 'Database SQLite', status: health?.database.status === 'connected' ? 'Terhubung' : 'Error', icon: Database },
    { name: 'Face Engine', status: health?.face_recognition ?? 'Tidak tersedia', icon: ScanFace },
  ];

  return (
    <div className="space-y-5">
      {/* Page Header with Quick Actions */}
      <PageHeader
        title={`Selamat datang, ${session?.displayName?.split(' ')[0] || 'Admin'}`}
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


      {loadError && <ErrorState message={loadError} onRetry={load} />}
      {!stats && !loadError ? <LoadingSkeleton type="card" /> : <>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        {kpis.map((kpi) => <StatCard key={kpi.label} label={kpi.label} value={kpi.value} icon={kpi.icon} iconClassName={kpi.color} helper="Data backend aktual" />)}
      </div></>}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)] gap-6">
        <section className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-blue-600">Kesiapan Biometrik</p>
          <h2 className="text-xl font-semibold text-slate-900 mt-1">Pendaftaran Wajah Siswa</h2>
          <p className="text-sm text-slate-500 mt-2">Cakupan enrollment berdasarkan data siswa aktif dari backend.</p>
          <div className="mt-8 flex items-end justify-between gap-6">
            <div><p className="text-4xl font-bold tracking-tight text-slate-900">{stats?.facesRegistered ?? 0}<span className="text-xl text-slate-400 font-medium"> / {stats?.activeStudents ?? 0}</span></p><p className="text-sm text-slate-500 mt-2">siswa telah memiliki data wajah</p></div>
            <ScanFace className="w-10 h-10 text-blue-600" />
          </div>
          <div className="h-2 bg-slate-100 rounded-sm overflow-hidden mt-6"><div className="h-full bg-blue-600" style={{ width: `${stats?.activeStudents ? Math.min(100, (stats.facesRegistered / stats.activeStudents) * 100) : 0}%` }} /></div>
          <div className="mt-5 pt-5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-slate-600"><strong className="text-slate-900">{stats?.facesUnregistered ?? 0}</strong> siswa belum terdaftar</p><button type="button" onClick={() => setShowFaceDrawer(true)} className="text-sm font-semibold text-blue-600 hover:text-blue-700">Daftarkan wajah</button></div>
        </section>

        {/* System Status Panel (1 col) */}
        <section className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col justify-between">
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
        </section>
      </div>

      {/* Modals & Drawers */}
      <StudentFormModal isOpen={showStudentModal} onClose={() => setShowStudentModal(false)} />
      <FaceEnrollmentDrawer isOpen={showFaceDrawer} onClose={() => setShowFaceDrawer(false)} students={students} selectedStudent={selectedStudent} onCompleted={async () => { setStudents(await studentsService.getStudents()); }} />
    </div>
  );
};
