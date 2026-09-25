/**
 * Tandara Guru / Piket - Pengajuan Izin Page
 * Route: /teacher/leave-requests
 */

import React, { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../../components/ui/PageHeader';
import { FilterBar } from '../../components/ui/FilterBar';
import { DataTable, Column } from '../../components/ui/DataTable';
import { BackendDisconnected } from '../../components/ui/BackendDisconnected';
import { LeaveReviewDrawer } from '../../components/teacher/LeaveReviewDrawer';
import { LeaveRequest } from '../../types';
import { leaveService } from '../../services/leave.service';
import { useToast } from '../../context/ToastContext';

export const TeacherLeaveRequestsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL'>('PENDING');
  const [search, setSearch] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedDate, setSelectedDate] = useState('');

  const [selectedRequest, setSelectedRequest] = useState<LeaveRequest | null>(null);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const { showToast } = useToast();
  const loadRequests = async () => {
    try { setLeaveRequests(await leaveService.getLeaveRequests()); }
    catch (error) { showToast({ type: 'error', message: error instanceof Error ? error.message : 'Gagal memuat pengajuan izin.' }); }
  };
  useEffect(() => { void loadRequests(); }, []);

  const tabs = [
    { id: 'PENDING', label: 'Menunggu Review' },
    { id: 'APPROVED', label: 'Disetujui' },
    { id: 'REJECTED', label: 'Ditolak' },
    { id: 'ALL', label: 'Semua' },
  ];

  const columns: Column<LeaveRequest>[] = [
    {
      key: 'studentName',
      header: 'Siswa',
      render: (item) => (
        <div>
          <span className="font-semibold text-slate-900">{item.studentName}</span>
          <span className="text-xs text-slate-500 block font-mono">{item.nis}</span>
        </div>
      ),
    },
    { key: 'className', header: 'Kelas' },
    { key: 'parentName', header: 'Pengaju (Orang Tua)' },
    {
      key: 'leaveType',
      header: 'Tipe Izin',
      render: (item) => (
        <span
          className={`px-2 py-0.5 rounded text-[11px] font-medium ${
            item.leaveType === 'SICK'
              ? 'bg-red-50 text-red-800 border border-red-200'
              : 'bg-blue-50 text-blue-800 border border-blue-200'
          }`}
        >
          {item.leaveType === 'SICK' ? 'Sakit' : item.leaveType === 'PERMISSION' ? 'Izin' : 'Dispensasi'}
        </span>
      ),
    },
    {
      key: 'dates',
      header: 'Tanggal',
      render: (item) => (
        <span className="text-xs text-slate-700 font-mono">
          {item.startDate} {item.endDate && item.endDate !== item.startDate ? `s/d ${item.endDate}` : ''}
        </span>
      ),
    },
    {
      key: 'reason',
      header: 'Alasan',
      render: (item) => (
        <span className="text-xs text-slate-600 line-clamp-1 max-w-xs">{item.reason}</span>
      ),
    },
    {
      key: 'attachmentUrl',
      header: 'Bukti',
      render: (item) => (
        <span className="text-xs text-slate-400">
          {item.attachmentUrl ? 'Ada Lampiran' : 'Tanpa Bukti'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (item) => (
        <span
          className={`px-2 py-0.5 rounded text-[11px] font-medium ${
            item.status === 'APPROVED'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : item.status === 'REJECTED'
              ? 'bg-red-50 text-red-800 border border-red-200'
              : 'bg-amber-50 text-amber-800 border border-amber-200'
          }`}
        >
          {item.status === 'APPROVED'
            ? 'Disetujui'
            : item.status === 'REJECTED'
            ? 'Ditolak'
            : 'Menunggu'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Aksi',
      className: 'text-right',
      render: (item) => (
        <button
          type="button"
          onClick={() => setSelectedRequest(item)}
          className="text-xs text-[#2563EB] hover:text-[#1D4ED8] font-medium"
        >
          Tinjau
        </button>
      ),
    },
  ];

  const visibleRequests = useMemo(() => leaveRequests.filter((request) => {
    const matchesTab = activeTab === 'ALL' || request.status === activeTab;
    const query = search.toLowerCase();
    const matchesSearch = !query || `${request.studentName} ${request.parentName}`.toLowerCase().includes(query);
    const matchesType = !selectedType || request.leaveType === ({ Sakit: 'SICK', Izin: 'PERMISSION', Dispensasi: 'DISPENSATION' } as Record<string, string>)[selectedType];
    const matchesDate = !selectedDate || request.startDate === selectedDate;
    return matchesTab && matchesSearch && matchesType && matchesDate;
  }), [activeTab, leaveRequests, search, selectedDate, selectedType]);

  const handleResetFilters = () => {
    setSearch('');
    setSelectedType('');
    setSelectedClass('');
    setSelectedDate('');
  };

  const hasActiveFilters = Boolean(search || selectedType || selectedClass || selectedDate);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pengajuan Izin"
        subtitle="Review pengajuan izin dan sakit yang diajukan oleh wali murid melalui aplikasi orang tua"
        breadcrumbs={[
          { label: 'Guru Piket', href: '/teacher/dashboard' },
          { label: 'Pengajuan Izin' },
        ]}
      />

      {/* Tab Pills */}
      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id as typeof activeTab)}
            className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-colors ${
              activeTab === tab.id
                ? 'bg-[#2563EB] text-white shadow-xs'
                : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200'
            }`}
          >
            <span>{tab.label}</span>
            <span
              className={`px-1.5 py-0.5 rounded text-[11px] font-bold ${
                activeTab === tab.id ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
              }`}
            >
              {leaveRequests.filter((request) => tab.id === 'ALL' || request.status === tab.id).length}
            </span>
          </button>
        ))}
      </div>

      {/* Filter Bar */}
      <FilterBar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Cari siswa atau orang tua..."
        hasActiveFilters={hasActiveFilters}
        onReset={handleResetFilters}
      >
        <select
          value={selectedType}
          onChange={(e) => setSelectedType(e.target.value)}
          aria-label="Filter Tipe Izin"
          className="px-3 py-2 text-xs sm:text-sm bg-slate-50 hover:bg-slate-100/70 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        >
          <option value="">Semua Tipe Izin</option>
          <option value="SICK">Sakit</option>
          <option value="PERMISSION">Izin Keperluan Keluarga</option>
          <option value="DISPENSATION">Dispensasi Lomba/Kegiatan</option>
        </select>

        <select
          value={selectedClass}
          onChange={(e) => setSelectedClass(e.target.value)}
          aria-label="Filter Kelas"
          className="px-3 py-2 text-xs sm:text-sm bg-slate-50 hover:bg-slate-100/70 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        >
          <option value="">Semua Kelas</option>
          <option value="">Filter kelas tersedia berdasarkan data backend</option>
        </select>

        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          aria-label="Filter Tanggal Izin"
          className="px-3 py-2 text-xs sm:text-sm bg-slate-50 hover:bg-slate-100/70 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        />
      </FilterBar>

      {/* Data Table */}
      <DataTable
        columns={columns}
        data={visibleRequests}
        emptyTitle="Belum ada pengajuan izin."
        emptyDescription="Pengajuan dari aplikasi orang tua akan muncul di sini setelah backend terhubung."
      />

      {/* Review Drawer */}
      <LeaveReviewDrawer
        isOpen={selectedRequest !== null}
        onClose={() => setSelectedRequest(null)}
        leaveRequest={selectedRequest}
        onReviewed={async () => { await loadRequests(); setSelectedRequest(null); }}
      />
    </div>
  );
};
