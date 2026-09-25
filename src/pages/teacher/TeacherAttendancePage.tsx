/**
 * Tandara Guru / Piket - Kehadiran Siswa Page
 * Route: /teacher/attendance
 */

import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  AlertCircle,
  XCircle,
  Download,
  Bell,
  AlertTriangle,
} from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { FilterBar } from '../../components/ui/FilterBar';
import { DataTable, Column } from '../../components/ui/DataTable';
import { EmptyState } from '../../components/ui/EmptyState';
import { BackendDisconnected } from '../../components/ui/BackendDisconnected';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { useToast } from '../../context/ToastContext';
import { AttendanceRecord } from '../../types';
import { attendanceService } from '../../services/attendance.service';
import { CorrectionFormModal } from '../../components/teacher/CorrectionFormModal';

export const TeacherAttendancePage: React.FC = () => {
  const { showBackendNotConnected } = useToast();

  const [search, setSearch] = useState('');
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [selectedGrade, setSelectedGrade] = useState('');
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [summary, setSummary] = useState({ today: 0, students: 0 });
  const [selectedRecord, setSelectedRecord] = useState<AttendanceRecord | null>(null);
  const load = () => Promise.all([attendanceService.getAttendanceRecords({ date_from: selectedDate, date_to: selectedDate, ...(selectedStatus ? { status: selectedStatus } : {}) }), attendanceService.getSummary()]).then(([rows, stats]) => { setAttendanceRecords(rows); setSummary(stats); });
  useEffect(() => { load().catch(() => undefined); }, [selectedDate, selectedStatus]);

  const kpis = [
    { label: 'Presensi Hari Ini', value: String(summary.today), icon: CheckCircle2, color: 'text-emerald-600' },
    { label: 'Total Siswa', value: String(summary.students), icon: Clock, color: 'text-amber-600' },
    { label: 'Izin / Sakit', value: '—', icon: AlertCircle, color: 'text-blue-600' },
    { label: 'Belum Hadir', value: '—', icon: XCircle, color: 'text-red-600' },
  ];

  const columns: Column<AttendanceRecord>[] = [
    {
      key: 'studentName',
      header: 'Siswa',
      render: (item) => <span className="font-semibold text-slate-900">{item.studentName}</span>,
    },
    {
      key: 'nis',
      header: 'NIS',
      render: (item) => <span className="font-mono text-xs text-slate-700">{item.nis}</span>,
    },
    {
      key: 'className',
      header: 'Kelas',
      render: (item) => <span className="text-slate-700">{item.className}</span>,
    },
    {
      key: 'checkInTime',
      header: 'Jam Masuk',
      render: (item) => <span className="font-mono text-xs">{item.checkInTime || '—'}</span>,
    },
    {
      key: 'checkOutTime',
      header: 'Jam Keluar',
      render: (item) => <span className="font-mono text-xs">{item.checkOutTime || '—'}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (item) => <StatusBadge status={item.status} />,
    },
    {
      key: 'parentNotified',
      header: 'Notifikasi',
      render: (item) => (
        <span className="text-xs text-slate-500">
          {item.parentNotified ? 'Terkirim ke Aplikasi Orang Tua' : 'Belum'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Aksi',
      className: 'text-right',
      render: (item) => (
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => showBackendNotConnected('Lihat detail presensi memerlukan server aktif.')}
            className="text-xs text-[#2563EB] hover:text-[#1D4ED8] font-medium"
          >
            Lihat Detail
          </button>
          <span className="text-slate-300">|</span>
          <button
            type="button"
            onClick={() => setSelectedRecord(item)}
            className="text-xs text-teal-700 hover:text-teal-900 font-medium"
          >
            Ajukan Koreksi
          </button>
        </div>
      ),
    },
  ];


  const handleExportToday = () => {
    showBackendNotConnected('Backend belum terhubung. Ekspor rekapitulasi kehadiran memerlukan data dari server.');
  };

  const handleSendReminder = () => {
    showBackendNotConnected(
      'Backend belum terhubung. Pengiriman notifikasi pengingat ke aplikasi orang tua belum dapat diproses.'
    );
  };

  const handleResetFilters = () => {
    setSearch('');
    setSelectedDate(new Date().toISOString().split('T')[0]);
    setSelectedGrade('');
    setSelectedClass('');
    setSelectedStatus('');
  };

  const hasActiveFilters = Boolean(search || selectedGrade || selectedClass || selectedStatus);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Kehadiran Siswa"
        subtitle="Pantau status kehadiran hari ini dan kelola absensi siswa secara detail"
        breadcrumbs={[
          { label: 'Guru Piket', href: '/teacher/dashboard' },
          { label: 'Kehadiran Siswa' },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportToday}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs sm:text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition-colors shadow-xs"
            >
              <Download className="w-4 h-4 text-slate-500" />
              Ekspor Hari Ini
            </button>
            <button
              type="button"
              onClick={handleSendReminder}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs sm:text-sm font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors shadow-xs"
            >
              <Bell className="w-4 h-4 text-blue-600" />
              Kirim Pengingat Orang Tua
            </button>
          </div>
        }
      />

      <BackendDisconnected moduleName="Modul Kehadiran Siswa" />

      {/* KPI Cards (All values '—') */}
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

      {/* Filter Bar with Date, Grade, Class, Status, and Search */}
      <FilterBar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Cari nama atau NIS siswa..."
        hasActiveFilters={hasActiveFilters}
        onReset={handleResetFilters}
      >
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          aria-label="Pilih Tanggal Presensi"
          className="px-3 py-2 text-xs sm:text-sm bg-slate-50 hover:bg-slate-100/70 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        />

        <select
          value={selectedGrade}
          onChange={(e) => setSelectedGrade(e.target.value)}
          aria-label="Filter Tingkat"
          className="px-3 py-2 text-xs sm:text-sm bg-slate-50 hover:bg-slate-100/70 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        >
          <option value="">Semua Tingkat</option>
          <option value="10">Kelas 10</option>
          <option value="11">Kelas 11</option>
          <option value="12">Kelas 12</option>
        </select>

        <select
          value={selectedClass}
          onChange={(e) => setSelectedClass(e.target.value)}
          aria-label="Filter Rombel Kelas"
          className="px-3 py-2 text-xs sm:text-sm bg-slate-50 hover:bg-slate-100/70 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        >
          <option value="">Semua Rombel</option>
          <option value="X-A">X-A</option>
          <option value="X-B">X-B</option>
          <option value="XI-IPA-1">XI-IPA-1</option>
          <option value="XII-IPA-1">XII-IPA-1</option>
        </select>

        <select
          value={selectedStatus}
          onChange={(e) => setSelectedStatus(e.target.value)}
          aria-label="Filter Status Kehadiran"
          className="px-3 py-2 text-xs sm:text-sm bg-slate-50 hover:bg-slate-100/70 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        >
          <option value="">Semua Status</option>
          <option value="PRESENT">Hadir</option>
          <option value="LATE">Terlambat</option>
          <option value="SICK">Sakit</option>
          <option value="PERMISSION">Izin</option>
          <option value="UNEXCUSED">Alpa / Belum Hadir</option>
        </select>
      </FilterBar>

      {/* Main Split: Attendance Table & "Perlu Perhatian" Side Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Table (3 cols) */}
        <div className="lg:col-span-3">
          <DataTable
            columns={columns}
            data={attendanceRecords}
            emptyTitle="Belum ada data presensi untuk filter ini."
            emptyDescription="Data absensi wajah harian akan tersinkronisasi saat sesi absensi dijalankan di gerbang sekolah."
          />
        </div>

        {/* Side Panel: Perlu Perhatian (1 col) */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 pb-3 border-b border-slate-100 mb-4">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <h3 className="text-sm font-bold text-slate-900">Perlu Perhatian</h3>
            </div>

            <EmptyState
              title="Tidak ada siswa terlambat / alpa berturut-turut."
              description="Siswa yang membutuhkan tindak lanjut atau pemanggilan wali akan terdeteksi di sini."
              className="py-6"
            />
          </div>

          <div className="pt-3 border-t border-slate-100 text-xs text-slate-500 leading-relaxed">
            Notifikasi rekapitulasi kehadiran akhir jam masuk akan dikirimkan otomatis ke aplikasi orang tua.
          </div>
        </div>
      </div>
      <CorrectionFormModal isOpen={!!selectedRecord} attendanceId={selectedRecord?.id} onClose={() => setSelectedRecord(null)} onSuccess={() => load()} />
    </div>
  );
};
