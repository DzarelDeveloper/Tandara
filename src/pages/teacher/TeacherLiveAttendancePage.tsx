/**
 * Tandara Guru / Piket - Absensi Langsung Page
 * Route: /teacher/live-attendance
 */

import React, { useEffect, useState } from 'react';
import {
  Video,
  Play,
  Pause,
  Sliders,
  StopCircle,
  CameraOff,
  UserCheck,
  CheckCircle2,
  AlertCircle,
  Scan,
  Clock,
} from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { DataTable, Column } from '../../components/ui/DataTable';
import { BackendDisconnected } from '../../components/ui/BackendDisconnected';
import { StartSessionModal } from '../../components/teacher/StartSessionModal';
import { useToast } from '../../context/ToastContext';
import { AttendanceEvent } from '../../types';
import { attendanceService } from '../../services/attendance.service';

export const TeacherLiveAttendancePage: React.FC = () => {
  const { showBackendNotConnected } = useToast();
  const [showSessionModal, setShowSessionModal] = useState(false);
  const [activeMode, setActiveMode] = useState<'CHECK_IN' | 'CHECK_OUT'>('CHECK_IN');
  const [cameraSource, setCameraSource] = useState('cam-1');
  const [classFilter, setClassFilter] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [recentDetections, setRecentDetections] = useState<AttendanceEvent[]>([]);

  useEffect(() => attendanceService.subscribe((message) => {
    if (message.event !== 'ATTENDANCE_SUCCESS') return;
    const data = message.data;
    setRecentDetections((current) => [{
      id: `${data.student_id}-${message.timestamp}`, studentId: String(data.student_id),
      studentName: String(data.student_name ?? ''), nis: '', className: '',
      eventType: data.mode as 'CHECK_IN' | 'CHECK_OUT', timestamp: message.timestamp,
      cameraSource, confidenceScore: typeof data.confidence === 'number' ? data.confidence : undefined,
    }, ...current].slice(0, 50));
  }), [cameraSource]);

  // Table columns for recent detections
  const columns: Column<AttendanceEvent>[] = [
    { key: 'timestamp', header: 'Waktu' },
    { key: 'studentName', header: 'Siswa' },
    { key: 'nis', header: 'NIS' },
    { key: 'className', header: 'Kelas' },
    {
      key: 'eventType',
      header: 'Tipe',
      render: (item) => (
        <span
          className={`px-2 py-0.5 rounded text-[11px] font-medium ${
            item.eventType === 'CHECK_IN'
              ? 'bg-blue-50 text-blue-800 border border-blue-200'
              : 'bg-teal-50 text-teal-800 border border-teal-200'
          }`}
        >
          {item.eventType === 'CHECK_IN' ? 'Masuk' : 'Pulang'}
        </span>
      ),
    },
    {
      key: 'notificationStatus',
      header: 'Notifikasi Aplikasi Orang Tua',
      render: () => (
        <span className="text-xs text-emerald-700 font-medium flex items-center gap-1">
          <CheckCircle2 className="w-3.5 h-3.5" /> Terkirim ke Aplikasi Orang Tua
        </span>
      ),
    },
  ];

  const handleDisabledAction = (actionName: string) => {
    showBackendNotConnected(`Sesi belum aktif. ${actionName} memerlukan sesi absensi yang sedang berjalan.`);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Absensi Langsung"
        subtitle="Pengoperasian kamera pengenal wajah dan pemantauan arus kedatangan/kepulangan siswa"
        breadcrumbs={[
          { label: 'Guru Piket', href: '/teacher/dashboard' },
          { label: 'Absensi Langsung' },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowSessionModal(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs sm:text-sm font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-lg shadow-xs transition-colors focus:ring-2 focus:ring-blue-500 focus:outline-none"
            >
              <Play className="w-4 h-4 fill-current" />
              Mulai Sesi
            </button>
            <button
              type="button"
              disabled={true}
              onClick={() => handleDisabledAction('Jeda Kamera')}
              className="inline-flex items-center gap-2 px-3 py-2 text-xs sm:text-sm font-medium text-slate-400 bg-slate-100 rounded-lg cursor-not-allowed border border-slate-200"
            >
              <Pause className="w-4 h-4" />
              Jeda Kamera
            </button>
            <button
              type="button"
              disabled={true}
              onClick={() => handleDisabledAction('Ganti Kamera')}
              className="inline-flex items-center gap-2 px-3 py-2 text-xs sm:text-sm font-medium text-slate-400 bg-slate-100 rounded-lg cursor-not-allowed border border-slate-200"
            >
              <Sliders className="w-4 h-4" />
              Ganti Kamera
            </button>
            <button
              type="button"
              disabled={!sessionId}
              onClick={async () => { if (sessionId) { await attendanceService.stopLiveSession(sessionId); setSessionId(null); } }}
              className={`inline-flex items-center gap-2 px-3 py-2 text-xs sm:text-sm font-medium rounded-lg border border-slate-200 ${sessionId ? 'text-red-700 bg-red-50 hover:bg-red-100' : 'text-slate-400 bg-slate-100 cursor-not-allowed'}`}
            >
              <StopCircle className="w-4 h-4" />
              Tutup Sesi
            </button>
          </div>
        }
      />

      <BackendDisconnected moduleName="Modul Absensi Langsung" />

      {/* Control Strip: Session Status, Segmented Mode, Camera Selector, Class Filter */}
      <div className="bg-white p-3.5 sm:p-4 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
        {/* Status Indicator */}
        <div className="flex items-center gap-2.5">
          <span className="text-xs font-medium uppercase tracking-wider text-slate-500">Status Sesi:</span>
          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-800 border border-amber-200">
            {sessionId ? 'Aktif' : 'Belum Aktif'}
          </span>
        </div>

        {/* Segmented Mode: Masuk / Keluar */}
        <div className="inline-flex p-1 rounded-lg bg-slate-100 border border-slate-200 text-xs font-medium">
          <button
            type="button"
            onClick={() => setActiveMode('CHECK_IN')}
            className={`px-3.5 py-1.5 rounded-md transition-colors ${
              activeMode === 'CHECK_IN'
                ? 'bg-white text-blue-700 shadow-xs font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Mode Masuk
          </button>
          <button
            type="button"
            onClick={() => setActiveMode('CHECK_OUT')}
            className={`px-3.5 py-1.5 rounded-md transition-colors ${
              activeMode === 'CHECK_OUT'
                ? 'bg-white text-teal-800 shadow-xs font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Mode Keluar / Pulang
          </button>
        </div>

        {/* Selectors */}
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={cameraSource}
            onChange={(e) => setCameraSource(e.target.value)}
            className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="cam-1">DroidCam - Gerbang Utama</option>
            <option value="cam-2">DroidCam - Gerbang Samping</option>
          </select>

          <select
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="">Semua Siswa</option>
            <option value="10">Kelas 10 Saja</option>
            <option value="11">Kelas 11 Saja</option>
            <option value="12">Kelas 12 Saja</option>
          </select>
        </div>
      </div>

      {/* Main Split: Camera Stream Placeholder & Recognition Result Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Large Camera Preview Placeholder (2 cols) */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
            <div className="flex items-center gap-2">
              <Video className="w-4 h-4 text-blue-600" />
              <h3 className="text-sm font-semibold text-slate-900">Umpan Kamera Langsung (DroidCam)</h3>
            </div>
            <span className="text-[11px] font-mono text-slate-400">FPS: — | Resolusi: —</span>
          </div>

          {/* Placeholder Frame with Scanner Overlay */}
          <div className="relative aspect-video w-full rounded-lg bg-slate-900 border border-slate-800 flex flex-col items-center justify-center p-6 text-center text-slate-400 overflow-hidden">
            {/* Scanner Target Guide Overlay */}
            <div className="absolute inset-8 sm:inset-12 border border-white/10 rounded-lg pointer-events-none flex flex-col justify-between p-3">
              <div className="flex justify-between">
                <div className="w-6 h-6 border-t-2 border-l-2 border-teal-500"></div>
                <div className="w-6 h-6 border-t-2 border-r-2 border-teal-500"></div>
              </div>
              <div className="flex justify-between">
                <div className="w-6 h-6 border-b-2 border-l-2 border-teal-500"></div>
                <div className="w-6 h-6 border-b-2 border-r-2 border-teal-500"></div>
              </div>
            </div>

            <div className="w-12 h-12 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400 mb-3">
              <CameraOff className="w-6 h-6" />
            </div>

            <h4 className="text-sm sm:text-base font-semibold text-slate-200">DroidCam belum terhubung</h4>
            <p className="text-xs text-slate-400 max-w-sm mt-1 leading-relaxed mb-4">
              Server pengenalan wajah lokal (FastAPI) belum aktif. Klik tombol di bawah untuk melihat konfigurasi sesi.
            </p>

            <button
              type="button"
              onClick={() => setShowSessionModal(true)}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-lg transition-colors shadow-xs"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              Buka Pengaturan Sesi
            </button>
          </div>

          {/* Attendance Rules Guidance Strip */}
          <div className="mt-4 pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-slate-600">
            <div className="flex items-start gap-2">
              <Scan className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
              <span>Satu wajah per proses scan.</span>
            </div>
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>Absensi ganda hari yang sama akan ditolak.</span>
            </div>
            <div className="flex items-start gap-2">
              <Clock className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <span>Waktu dicatat otomatis saat wajah terverifikasi.</span>
            </div>
          </div>
        </div>

        {/* Recognition Result Panel (1 col) */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="text-sm font-semibold text-slate-900">Hasil Deteksi Wajah</h3>
              <UserCheck className="w-4 h-4 text-teal-600" />
            </div>

            {/* Empty result indicator */}
            <div className="p-5 rounded-lg border border-dashed border-slate-200 bg-slate-50 text-center mb-4">
              <div className="w-9 h-9 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-400 mx-auto mb-2">
                <Scan className="w-4 h-4" />
              </div>
              <p className="text-xs font-medium text-slate-700">Belum ada wajah terdeteksi.</p>
              <p className="text-[11px] text-slate-400 mt-1">
                Data siswa, tingkat kemiripan (confidence score), dan jam absensi akan tampil sesaat setelah teridentifikasi.
              </p>
            </div>

            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-900 leading-relaxed">
              <strong>Pemberitahuan Otomatis:</strong> Setiap scan yang berhasil akan memicu push notification langsung ke <strong>aplikasi orang tua</strong> tanpa memerlukan input manual.
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 text-center">
            <span className="text-[11px] text-slate-400 font-mono">
              Protokol DroidCam: RTSP / IP Webcam
            </span>
          </div>
        </div>
      </div>

      {/* Recent Attendance Log in this session (semantic table) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900">Daftar Kehadiran Terbaru Sesi Ini</h3>
          <span className="text-xs text-slate-500">Terekam oleh kamera gerbang</span>
        </div>

        <DataTable
          columns={columns}
          data={recentDetections}
          emptyTitle="Belum ada data kehadiran pada sesi ini."
          emptyDescription="Kehadiran siswa yang berhasil dipindai oleh kamera akan otomatis tercantum di sini secara real-time."
        />
      </div>

      {/* Start Session Modal */}
      <StartSessionModal isOpen={showSessionModal} onClose={() => setShowSessionModal(false)} onStarted={(id, mode, source) => { setSessionId(id); setActiveMode(mode); setCameraSource(source); }} />
    </div>
  );
};
