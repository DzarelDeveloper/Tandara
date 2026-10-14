import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowRight, CheckCircle2, Clock, Video, XCircle } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { StartSessionModal } from '../../components/teacher/StartSessionModal';
import { useAuth } from '../../context/AuthContext';
import { attendanceService } from '../../services/attendance.service';
import { dashboardService } from '../../services/dashboard.service';
import { TeacherDashboardController, TeacherDashboardState } from '../../services/teacher-dashboard-controller';
import { StatCard } from '../../components/ui/StatCard';

const formatJakartaDate = (date: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(date);
const getJakartaGreeting = (date: Date) => {
  const hour = Number(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    hourCycle: 'h23',
  }).format(date));
  if (hour < 11) return 'Selamat pagi';
  if (hour < 15) return 'Selamat siang';
  if (hour < 19) return 'Selamat sore';
  return 'Selamat malam';
};

export const TeacherDashboardPage: React.FC = () => {
  const { session } = useAuth();
  const [showSessionModal, setShowSessionModal] = useState(false);
  const [clock, setClock] = useState(() => new Date());
  const [dashboard, setDashboard] = useState<TeacherDashboardState>({
    stats: null,
    isLoading: true,
    error: null,
  });
  const controllerRef = useRef<TeacherDashboardController | null>(null);
  const attendanceDate = formatJakartaDate(clock);
  const { stats, isLoading, error: loadError } = dashboard;

  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let disconnected = false;
    let pollTimer: number | null = null;
    const controller = new TeacherDashboardController(
      (signal) => dashboardService.teacher(attendanceDate, signal),
      setDashboard,
    );
    controllerRef.current = controller;

    const stopPolling = () => {
      if (pollTimer !== null) {
        window.clearInterval(pollTimer);
        pollTimer = null;
      }
    };
    const startPolling = () => {
      if (pollTimer !== null || document.visibilityState !== 'visible') return;
      pollTimer = window.setInterval(() => {
        void controller.refreshIfIdle();
      }, 5_000);
    };
    const unsubscribe = attendanceService.subscribeWithDisconnect(
      (message) => { void controller.handleEvent(message.event); },
      (isDisconnected) => {
        disconnected = isDisconnected;
        if (isDisconnected) {
          startPolling();
        } else {
          stopPolling();
          void controller.refresh();
        }
      },
    );
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        stopPolling();
      } else {
        void controller.refresh();
        if (disconnected) startPolling();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    void controller.refresh(true);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      stopPolling();
      unsubscribe();
      controller.dispose();
      if (controllerRef.current === controller) controllerRef.current = null;
    };
  }, [attendanceDate]);

  const currentDate = useMemo(() => new Intl.DateTimeFormat('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta', hourCycle: 'h23',
  }).format(clock), [clock]);
  const greeting = getJakartaGreeting(clock);

  const values = [
    { label: 'Hadir', value: stats?.presentToday ?? 0, icon: CheckCircle2, color: 'text-emerald-600' },
    { label: 'Terlambat', value: stats?.lateToday ?? 0, icon: Clock, color: 'text-amber-600' },
    { label: 'Izin / Sakit', value: stats?.excusedToday ?? 0, icon: AlertCircle, color: 'text-blue-600' },
    { label: 'Belum Hadir', value: stats?.notPresent ?? 0, icon: XCircle, color: 'text-red-600' },
  ];
  const kpis = values.map((item) => ({
    ...item,
    value: isLoading ? 'Memuat…' : loadError ? '—' : item.value,
  }));
  const sessionStatus = stats?.session
    ? 'AKTIF'
    : isLoading
      ? 'MEMUAT'
      : loadError
        ? 'TIDAK TERSEDIA'
        : 'BELUM AKTIF';
  const sessionStatusClass = stats?.session
    ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
    : loadError
      ? 'bg-red-50 border-red-200 text-red-700'
      : 'bg-slate-50 border-slate-200 text-slate-600';

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${greeting}, ${session?.displayName || 'Guru Piket'}`}
        subtitle={currentDate}
        actions={<button type="button" onClick={() => setShowSessionModal(true)} className="t-button-primary"><Video className="w-4 h-4" /> Mulai Absensi</button>}
      />

      {loadError && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm text-red-800">Statistik kehadiran tidak dapat dimuat: {loadError}</p>
          <button type="button" onClick={() => void controllerRef.current?.refresh(true)} disabled={isLoading} className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm font-semibold text-red-800 disabled:opacity-50">
            Coba lagi
          </button>
        </div>
      )}

      <section aria-label="Status sesi absensi" className="rounded-xl border border-blue-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-blue-600">Operasional</p>
            <h2 className="mt-1 text-xl font-semibold text-slate-900">Sesi Absensi</h2>
            <p className="mt-1 text-sm text-slate-500">
              {stats?.session
                ? `${stats.session.mode.replace('_', ' ')} · Kamera ${stats.session.cameraSource}`
                : loadError
                  ? 'Status sesi belum dapat diperiksa.'
                  : isLoading
                    ? 'Memeriksa status sesi…'
                    : 'Belum ada sesi aktif.'}
            </p>
          </div>
          <span className={`rounded-md border px-2.5 py-1 text-xs font-semibold ${sessionStatusClass}`}>{sessionStatus}</span>
        </div>
        {stats?.session && (
          <Link to="/teacher/live-attendance" className="t-button-primary inline-flex mt-4">
            Buka Kamera <ArrowRight className="w-4 h-4" />
          </Link>
        )}
      </section>

      <section aria-label="Ringkasan kehadiran" className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {kpis.map((item) => (
          <StatCard key={item.label} label={item.label} value={item.value} icon={item.icon} iconClassName={item.color} helper={currentDate} />
        ))}
      </section>

      <section>
        <div className="mb-4 flex items-end justify-between gap-4">
          <div><h2 className="text-lg font-semibold text-slate-900">Aktivitas Absensi Terbaru</h2><p className="mt-1 text-sm text-slate-500">Pencatatan untuk {currentDate}.</p></div>
          <Link to="/teacher/attendance" className="text-sm font-semibold text-blue-600 hover:text-blue-700">Lihat riwayat</Link>
        </div>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          {stats?.recentAttendance.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3 text-left">Siswa</th><th className="px-5 py-3 text-left">NIS</th><th className="px-5 py-3 text-left">Kelas</th><th className="px-5 py-3 text-left">Masuk</th><th className="px-5 py-3 text-left">Pulang</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {stats.recentAttendance.map((record) => (
                    <tr key={record.id}>
                      <td className="px-5 py-3.5 font-medium text-slate-900">{record.studentName}</td>
                      <td className="px-5 py-3.5 text-slate-600">{record.nis}</td>
                      <td className="px-5 py-3.5 text-slate-600">{record.className}</td>
                      <td className="px-5 py-3.5 text-slate-600">{record.checkInTime ? new Date(record.checkInTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                      <td className="px-5 py-3.5 text-slate-600">{record.checkOutTime ? new Date(record.checkOutTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-6 py-12 text-center">
              <p className="font-medium text-slate-800">{loadError ? 'Aktivitas absensi tidak tersedia.' : isLoading ? 'Memuat aktivitas absensi…' : 'Belum ada aktivitas absensi pada tanggal ini.'}</p>
              {!loadError && !isLoading && <p className="mt-1 text-sm text-slate-500">Hasil presensi akan muncul setelah siswa berhasil dipindai.</p>}
            </div>
          )}
        </div>
      </section>

      <StartSessionModal isOpen={showSessionModal} onClose={() => setShowSessionModal(false)} />
    </div>
  );
};
