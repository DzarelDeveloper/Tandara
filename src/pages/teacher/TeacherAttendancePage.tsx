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
  AlertTriangle,
} from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { FilterBar } from '../../components/ui/FilterBar';
import { DataTable, Column } from '../../components/ui/DataTable';
import { EmptyState } from '../../components/ui/EmptyState';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { useToast } from '../../context/ToastContext';
import { AttendanceRecord } from '../../types';
import { attendanceService } from '../../services/attendance.service';
import { CorrectionFormModal } from '../../components/teacher/CorrectionFormModal';
import { reportsService } from '../../services/reports.service';
import { classesService } from '../../services/classes.service';
import { Class } from '../../types';

export const TeacherAttendancePage: React.FC = () => {
  const { showToast } = useToast();

  const [search, setSearch] = useState('');
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [selectedGrade, setSelectedGrade] = useState('');
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
  const [summary, setSummary] = useState({ today: 0, students: 0 });
  const [selectedRecord, setSelectedRecord] = useState<AttendanceRecord | null>(null);
  const [classes, setClasses] = useState<Class[]>([]);
  const load = () => Promise.all([attendanceService.getAttendanceRecords({ date_from: selectedDate, date_to: selectedDate, ...(selectedStatus ? { status: selectedStatus } : {}) }), attendanceService.getSummary()]).then(([rows, stats]) => { setAttendanceRecords(rows); setSummary(stats); });
  useEffect(() => { load().catch(() => undefined); }, [selectedDate, selectedStatus]);
  useEffect(() => { classesService.getClasses().then(setClasses).catch(() => setClasses([])); }, []);

  const kpis = [
    { label: 'Presensi Hari Ini', value: String(summary.today), icon: CheckCircle2, color: 'text-emerald-600' },
    { label: 'Total Siswa', value: String(summary.students), icon: Clock, color: 'text-amber-600' },
    { label: 'Izin / Sakit', value: String(attendanceRecords.filter((item) => ['SICK', 'PERMISSION'].includes(item.status)).length), icon: AlertCircle, color: 'text-blue-600' },
    { label: 'Belum Hadir', value: String(Math.max(0, summary.students - attendanceRecords.length)), icon: XCircle, color: 'text-red-600' },
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
      key: 'actions',
      header: 'Aksi',
      className: 'text-right',
      render: (item) => (
        <div className="flex items-center justify-end gap-2">
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


  const handleExportToday = async () => {
    try {
      const response = await reportsService.downloadAttendanceCsv({ startDate: selectedDate, endDate: selectedDate, classId: selectedClass, status: selectedStatus });
      const blob = await response.blob(); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'tandara-attendance.csv'; link.click(); URL.revokeObjectURL(link.href);
    } catch (error) { showToast({ type: 'error', message: error instanceof Error ? error.message : 'Gagal mengunduh laporan.' }); }
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
            <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">Notifikasi Orang Tua: Dalam Pengembangan</span>
          </div>
        }
      />


      {/* KPI Cards (All values '—') */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi, idx) => {
          const Icon = kpi.icon;
          return (
            <div
              key={idx}
              className="bg-white p-5 rounded-xl border border-slate-200 flex items-center justify-between"
            >
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                  {kpi.label}
                </p>
                <p className="text-2xl font-semibold font-mono tabular-nums text-slate-900 mt-1">{kpi.value}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Data backend aktual</p>
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
          {[...new Set(classes.map((item) => item.grade).filter(Boolean))].map((grade) => <option key={grade} value={grade}>{grade}</option>)}
        </select>

        <select
          value={selectedClass}
          onChange={(e) => setSelectedClass(e.target.value)}
          aria-label="Filter Rombel Kelas"
          className="px-3 py-2 text-xs sm:text-sm bg-slate-50 hover:bg-slate-100/70 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        >
          <option value="">Semua Rombel</option>
          {classes.filter((item) => !selectedGrade || item.grade === selectedGrade).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
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
            data={attendanceRecords.filter((item) => (!search || `${item.studentName} ${item.nis}`.toLowerCase().includes(search.toLowerCase())) && (!selectedClass || classes.find((entry) => entry.id === selectedClass)?.name === item.className))}
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
            Notifikasi orang tua masih dalam pengembangan dan belum dikirim otomatis.
          </div>
        </div>
      </div>
      <CorrectionFormModal isOpen={!!selectedRecord} attendanceId={selectedRecord?.id} onClose={() => setSelectedRecord(null)} onSuccess={() => load()} />
    </div>
  );
};
