import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Clock, Video, XCircle, ArrowRight } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { StartSessionModal } from '../../components/teacher/StartSessionModal';
import { useAuth } from '../../context/AuthContext';
import { dashboardService, TeacherDashboardStats } from '../../services/dashboard.service';
import { StatCard } from '../../components/ui/StatCard';

export const TeacherDashboardPage: React.FC = () => {
  const { session } = useAuth();
  const [showSessionModal, setShowSessionModal] = useState(false);
  const [stats, setStats] = useState<TeacherDashboardStats | null>(null);

  useEffect(() => {
    dashboardService.teacher().then(setStats).catch(() => setStats(null));
  }, []);

  const currentDate = new Intl.DateTimeFormat('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }).format(new Date());

  const kpis = [
    { label: 'Hadir', value: stats?.presentToday ?? 0, icon: CheckCircle2, color: 'text-emerald-600', helper: 'siswa hari ini' },
    { label: 'Terlambat', value: stats?.lateToday ?? 0, icon: Clock, color: 'text-amber-600', helper: 'siswa hari ini' },
    { label: 'Izin / Sakit', value: stats?.excusedToday ?? 0, icon: AlertCircle, color: 'text-blue-600', helper: 'siswa hari ini' },
    { label: 'Belum Hadir', value: stats?.notPresent ?? 0, icon: XCircle, color: 'text-red-600', helper: 'siswa hari ini' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Selamat pagi, ${session?.displayName || 'Guru Piket'}`}
        subtitle={currentDate}
        actions={<button type="button" onClick={() => setShowSessionModal(true)} className="t-button-primary"><Video className="w-4 h-4" /> Mulai Absensi</button>}
      />

      <section aria-label="Ringkasan kehadiran" className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        {kpis.map((item) => <StatCard key={item.label} label={item.label} value={item.value} icon={item.icon} iconClassName={item.color} helper={item.helper} />)}
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)] gap-6">
        <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col">
          <div className="flex items-start justify-between gap-4">
            <div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-blue-600">Operasional Hari Ini</p><h2 className="text-xl font-semibold text-slate-900 mt-1">Sesi Presensi</h2></div>
            <span className={`text-xs font-semibold rounded-md px-2.5 py-1 border ${stats?.session ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>{stats?.session ? 'AKTIF' : 'BELUM AKTIF'}</span>
          </div>
          <div className="flex-1 flex flex-col justify-center py-6">
            {stats?.session ? (
              <div><p className="text-3xl font-bold tracking-tight text-slate-900">{stats.session.mode.replace('_', ' ')}</p><p className="text-sm text-slate-500 mt-2">Kamera {stats.session.cameraSource} siap untuk pemindaian.</p><Link to="/teacher/live-attendance" className="t-button-primary inline-flex mt-6">Buka Kamera <ArrowRight className="w-4 h-4" /></Link></div>
            ) : (
              <div><Video className="w-8 h-8 text-blue-600 mb-4" /><h3 className="text-lg font-semibold text-slate-900">Belum ada sesi aktif.</h3><p className="text-sm text-slate-500 mt-2 max-w-lg">Mulai sesi CHECK_IN atau CHECK_OUT untuk menjalankan pemindaian wajah di halaman Absensi Langsung.</p><button type="button" onClick={() => setShowSessionModal(true)} className="t-button-primary mt-6">Mulai Sesi Absensi</button></div>
            )}
          </div>
        </div>

        <aside className="bg-white border border-slate-200 rounded-xl p-5">
          <h2 className="text-lg font-semibold text-slate-900">Ringkasan Kehadiran</h2><p className="text-sm text-slate-500 mt-1">Status siswa berdasarkan data hari ini.</p>
          <dl className="mt-5 divide-y divide-slate-100">{kpis.map((item) => <div key={item.label} className="py-3 flex items-center justify-between gap-4 first:pt-0"><dt className="text-sm text-slate-600">{item.label}</dt><dd className="text-base font-semibold tabular-nums text-slate-900">{item.value}</dd></div>)}</dl>
        </aside>
      </section>

      <section>
        <div className="flex items-end justify-between gap-4 mb-4"><div><h2 className="text-lg font-semibold text-slate-900">Aktivitas Absensi Terbaru</h2><p className="text-sm text-slate-500 mt-1">Pencatatan terbaru dari backend hari ini.</p></div><Link to="/teacher/attendance" className="text-sm font-semibold text-blue-600 hover:text-blue-700">Lihat riwayat</Link></div>
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {stats?.recentAttendance?.length ? <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="text-left px-5 py-3">Siswa</th><th className="text-left px-5 py-3">NIS</th><th className="text-left px-5 py-3">Kelas</th><th className="text-left px-5 py-3">Masuk</th><th className="text-left px-5 py-3">Pulang</th></tr></thead><tbody className="divide-y divide-slate-100">{stats.recentAttendance.map((record) => <tr key={record.id}><td className="px-5 py-3.5 font-medium text-slate-900">{record.studentName}</td><td className="px-5 py-3.5 text-slate-600">{record.nis}</td><td className="px-5 py-3.5 text-slate-600">{record.className}</td><td className="px-5 py-3.5 text-slate-600">{record.checkInTime ? new Date(record.checkInTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '—'}</td><td className="px-5 py-3.5 text-slate-600">{record.checkOutTime ? new Date(record.checkOutTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '—'}</td></tr>)}</tbody></table></div> : <div className="px-6 py-12 text-center"><p className="font-medium text-slate-800">Belum ada aktivitas absensi hari ini.</p><p className="text-sm text-slate-500 mt-1">Hasil presensi akan muncul setelah siswa berhasil dipindai.</p></div>}
        </div>
      </section>

      <StartSessionModal isOpen={showSessionModal} onClose={() => setShowSessionModal(false)} />
    </div>
  );
};
