/**
 * Tandara Guru / Piket - Rekap & Koreksi Page
 * Route: /teacher/reports-corrections
 */

import React, { useState } from 'react';
import {
  BarChart3,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  Plus,
  Clock,
  AlertCircle,
  XCircle,
  Calendar,
} from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { FilterBar } from '../../components/ui/FilterBar';
import { DataTable, Column } from '../../components/ui/DataTable';
import { EmptyState } from '../../components/ui/EmptyState';
import { CorrectionFormModal } from '../../components/teacher/CorrectionFormModal';
import { useToast } from '../../context/ToastContext';
import { AttendanceCorrection } from '../../types';
import { reportsService } from '../../services/reports.service';

export const TeacherReportsCorrectionsPage: React.FC = () => {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<'reports' | 'corrections'>('reports');

  // Filters for Rekap Presensi
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly'>('monthly');
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');

  const [showCorrectionModal, setShowCorrectionModal] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const kpis = [
    { label: 'Rata-rata Kehadiran', value: '—', icon: BarChart3, color: 'text-emerald-600' },
    { label: 'Terlambat', value: '—', icon: Clock, color: 'text-amber-600' },
    { label: 'Izin / Sakit', value: '—', icon: AlertCircle, color: 'text-blue-600' },
    { label: 'Alpa / Tanpa Keterangan', value: '—', icon: XCircle, color: 'text-red-600' },
  ];

  const handleExportCsv = async () => {
    setIsDownloading(true);
    try {
      const response = await reportsService.downloadAttendanceCsv({ classId: selectedClass, status: selectedStatus });
      const blob = await response.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = response.headers.get('Content-Disposition')?.match(/filename="?([^";]+)"?/i)?.[1] || 'tandara-attendance.csv';
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (error) { showToast({ type: 'error', message: error instanceof Error ? error.message : 'Gagal mengunduh laporan CSV.' }); }
    finally { setIsDownloading(false); }
  };

  // Correction table columns
  const correctionColumns: Column<AttendanceCorrection>[] = [
    {
      key: 'studentName',
      header: 'Siswa',
      render: (item) => <span className="font-semibold text-slate-900">{item.studentName}</span>,
    },
    {
      key: 'attendanceDate',
      header: 'Tanggal Absensi',
      render: (item) => <span className="font-mono text-xs text-slate-700">{item.attendanceDate}</span>,
    },
    {
      key: 'previousStatus',
      header: 'Status Semula',
      render: (item) => (
        <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
          {item.previousStatus}
        </span>
      ),
    },
    {
      key: 'newStatus',
      header: 'Status Baru',
      render: (item) => (
        <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-50 text-emerald-800 border border-emerald-200">
          {item.newStatus}
        </span>
      ),
    },
    {
      key: 'reason',
      header: 'Alasan Koreksi',
      render: (item) => <span className="text-xs text-slate-600 max-w-xs block truncate">{item.reason}</span>,
    },
    {
      key: 'requestedBy',
      header: 'Pemohon',
      render: (item) => <span className="text-xs text-slate-700">{item.requestedBy}</span>,
    },
    {
      key: 'requestedAt',
      header: 'Tgl Pengajuan',
      render: (item) => <span className="text-xs text-slate-500 font-mono">{item.requestedAt}</span>,
    },
    {
      key: 'approvalStatus',
      header: 'Status Persetujuan',
      render: (item) => (
        <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-800 border border-amber-200">
          {item.approvalStatus}
        </span>
      ),
    },
  ];

  // No fake records
  const corrections: AttendanceCorrection[] = [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Rekap & Koreksi"
        subtitle="Analisis kehadiran siswa berkala dan riwayat pengajuan koreksi presensi yang diaudit"
        breadcrumbs={[
          { label: 'Guru Piket', href: '/teacher/dashboard' },
          { label: 'Rekap & Koreksi' },
        ]}
      />

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-px">
        <button
          type="button"
          onClick={() => setActiveTab('reports')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === 'reports'
              ? 'border-[#2563EB] text-[#2563EB]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          Rekap Presensi
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('corrections')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === 'corrections'
              ? 'border-[#2563EB] text-[#2563EB]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <FileCheck2 className="w-4 h-4" />
          Koreksi Kehadiran
        </button>
      </div>

      {/* Tab 1: Rekap Presensi */}
      {activeTab === 'reports' && (
        <div className="space-y-6">
          {/* Action and Period bar */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500 uppercase mr-1">Periode:</span>
              <div className="inline-flex p-1 rounded-lg bg-slate-100 border border-slate-200 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setPeriod('daily')}
                  className={`px-3 py-1.5 rounded-md transition-colors ${
                    period === 'daily' ? 'bg-white text-[#2563EB] shadow-xs' : 'text-slate-600'
                  }`}
                >
                  Harian
                </button>
                <button
                  type="button"
                  onClick={() => setPeriod('weekly')}
                  className={`px-3 py-1.5 rounded-md transition-colors ${
                    period === 'weekly' ? 'bg-white text-[#2563EB] shadow-xs' : 'text-slate-600'
                  }`}
                >
                  Mingguan
                </button>
                <button
                  type="button"
                  onClick={() => setPeriod('monthly')}
                  className={`px-3 py-1.5 rounded-md transition-colors ${
                    period === 'monthly' ? 'bg-white text-[#2563EB] shadow-xs' : 'text-slate-600'
                  }`}
                >
                  Bulanan
                </button>
              </div>

              <select
                value={selectedClass}
                onChange={(e) => setSelectedClass(e.target.value)}
                aria-label="Filter Kelas"
                className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="">Semua Kelas</option>
                <option value="X-A">X-A</option>
                <option value="XI-IPA-1">XI-IPA-1</option>
                <option value="XII-IPA-1">XII-IPA-1</option>
              </select>

              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                aria-label="Filter Status"
                className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="">Semua Status</option>
                <option value="PRESENT">Hadir</option>
                <option value="LATE">Terlambat</option>
                <option value="SICK">Sakit</option>
                <option value="PERMISSION">Izin</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleExportCsv}
                disabled={isDownloading}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition-colors shadow-xs"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                {isDownloading ? 'Mengunduh...' : 'Ekspor CSV'}
              </button>
              <button
                type="button"
                disabled
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition-colors shadow-xs"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                PDF/Excel belum tersedia
              </button>
            </div>
          </div>

          {/* KPI Cards (Values '—') */}
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
                    <p className="text-[11px] text-slate-400 mt-0.5">Belum ada data untuk dihitung</p>
                  </div>
                  <div className="w-10 h-10 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center shrink-0">
                    <Icon className={`w-5 h-5 ${kpi.color}`} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Chart Container */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center justify-between pb-3.5 border-b border-slate-100 mb-5">
              <div>
                <h3 className="text-base font-semibold text-slate-900">Grafik Kehadiran Siswa</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Visualisasi sebaran kehadiran dan tingkat ketidakhadiran per periode
                </p>
              </div>
              <div className="text-xs text-slate-400 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" />
                <span>Periode Aktif</span>
              </div>
            </div>

            <EmptyState
              icon={BarChart3}
              title="Belum ada data rekap."
              description="Grafik akan ditampilkan setelah backend terhubung."
              className="py-12"
            />
          </div>
        </div>
      )}

      {/* Tab 2: Koreksi Kehadiran */}
      {activeTab === 'corrections' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Riwayat Pengajuan Koreksi Presensi</h3>
              <p className="text-xs text-slate-500">
                Catatan penyesuaian manual status absensi siswa beserta alasan pertanggungjawaban audit
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowCorrectionModal(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs sm:text-sm font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-lg shadow-xs transition-colors"
            >
              <Plus className="w-4 h-4" />
              Ajukan Koreksi
            </button>
          </div>

          <DataTable
            columns={correctionColumns}
            data={corrections}
            emptyTitle="Belum ada riwayat koreksi."
            emptyDescription="Koreksi absensi memerlukan pencatatan log audit di backend."
            emptyActionText="Ajukan Koreksi Presensi"
            onEmptyAction={() => setShowCorrectionModal(true)}
          />
        </div>
      )}

      {/* Correction Form Modal */}
      <CorrectionFormModal
        isOpen={showCorrectionModal}
        onClose={() => setShowCorrectionModal(false)}
      />
    </div>
  );
};
