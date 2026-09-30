/**
 * Tandara Admin IT - Orang Tua / Wali Page
 * Route: /admin/parents
 */

import React, { useEffect, useMemo, useState } from 'react';
import { UserPlus, HeartHandshake, ShieldCheck, Bell, Users } from 'lucide-react';
import { ErrorState } from '../../components/ui/ErrorState';
import { LoadingSkeleton } from '../../components/ui/LoadingSkeleton';
import { PageHeader } from '../../components/ui/PageHeader';
import { FilterBar } from '../../components/ui/FilterBar';
import { DataTable, Column } from '../../components/ui/DataTable';
import { ParentFormModal } from '../../components/admin/ParentFormModal';
import { ParentDetailDrawer } from '../../components/admin/ParentDetailDrawer';
import { Parent } from '../../types';
import { parentsService } from '../../services/parents.service';
import { useToast } from '../../context/ToastContext';

export const AdminParentsPage: React.FC = () => {
  const [search, setSearch] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');

  const [showParentModal, setShowParentModal] = useState(false);
  const [selectedParent, setSelectedParent] = useState<Parent | null>(null);
  const [parents, setParents] = useState<Parent[]>([]);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();

  const loadParents = async () => {
    setLoading(true); setLoadError('');
    try { const rows = await parentsService.getParents(); setParents(rows); setSelectedParent((current) => current ? rows.find((item) => item.id === current.id) ?? null : null); }
    catch (error) { setLoadError(error instanceof Error ? error.message : 'Gagal memuat data wali.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void loadParents(); }, []);

  const kpis = [
    { label: 'Total Akun', value: String(parents.filter((item) => item.username).length), icon: Users, color: 'text-blue-600' },
    { label: 'Aktif', value: String(parents.filter((item) => item.username && item.accountStatus === 'ACTIVE').length), icon: ShieldCheck, color: 'text-emerald-600' },
    { label: 'Nonaktif', value: String(parents.filter((item) => item.username && item.accountStatus === 'INACTIVE').length), icon: HeartHandshake, color: 'text-amber-600' },
    { label: 'Siswa Terhubung', value: String(new Set(parents.flatMap((item) => item.connectedStudentIds)).size), icon: Bell, color: 'text-teal-600' },
  ];

  const columns: Column<Parent>[] = [
    {
      key: 'fullName',
      header: 'Orang Tua / Wali',
      render: (item) => (
        <div>
          <span className="font-semibold text-slate-900">{item.fullName}</span>
          <span className="text-xs text-slate-500 block">Hubungan: {item.relationship}</span>
        </div>
      ),
    },
    {
      key: 'phone',
      header: 'Nomor Telepon',
      render: (item) => <span className="font-mono text-xs text-slate-700">{item.phone}</span>,
    },
    {
      key: 'connectedStudentNames',
      header: 'Siswa Terhubung',
      render: (item) => (
        <span className="text-xs text-slate-600">
          {item.connectedStudentNames?.length > 0
            ? item.connectedStudentNames.join(', ')
            : 'Belum ada'}
        </span>
      ),
    },
    {
      key: 'username',
      header: 'Username',
      render: (item) => <span className="font-mono text-xs">{item.username || '—'}</span>,
    },
    {
      key: 'accountStatus',
      header: 'Status Akun',
      render: (item) => (
        <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
          {item.username ? item.accountStatus : 'Tanpa akun login'}
        </span>
      ),
    },
    {
      key: 'notificationsActive',
      header: 'Notifikasi',
      render: (item) => (
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${
            item.notificationsActive
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-slate-100 text-slate-600 border border-slate-200'
          }`}
        >
          Dalam Pengembangan
        </span>
      ),
    },
    {
      key: 'lastLogin',
      header: 'Login Terakhir',
      render: (item) => <span className="text-xs text-slate-500 font-mono">{item.lastLogin || '—'}</span>,
    },
    {
      key: 'actions',
      header: 'Aksi',
      className: 'text-right',
      render: (item) => (
        <button
          type="button"
          onClick={() => setSelectedParent(item)}
          className="text-xs text-[#2563EB] hover:text-[#1D4ED8] font-medium"
        >
          Detail
        </button>
      ),
    },
  ];

  const filteredParents = useMemo(() => parents.filter((parent) => {
    const matchesSearch = !search || `${parent.fullName} ${parent.phone}`.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = !selectedStatus || parent.accountStatus === selectedStatus;
    return matchesSearch && matchesStatus;
  }), [parents, search, selectedStatus]);

  const handleResetFilters = () => {
    setSearch('');
    setSelectedStatus('');
  };

  const hasActiveFilters = Boolean(search || selectedStatus);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Orang Tua / Wali"
        subtitle="Kelola akun dan hubungan wali dengan siswa"
        breadcrumbs={[
          { label: 'Admin IT', href: '/admin/dashboard' },
          { label: 'Orang Tua' },
        ]}
        actions={
          <button
            type="button"
            onClick={() => setShowParentModal(true)}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs sm:text-sm font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-lg shadow-xs transition-colors focus:ring-2 focus:ring-blue-500 focus:outline-none"
          >
            <UserPlus className="w-4 h-4" />
            Tambah Orang Tua / Buat Akun
          </button>
        }
      />

      {/* KPI Cards with '—' values */}
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
                <p className="text-2xl font-semibold font-mono tabular-nums text-slate-900 mt-1">{loading || loadError ? '—' : kpi.value}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Data backend</p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center shrink-0">
                <Icon className={`w-5 h-5 ${kpi.color}`} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Search and Filters */}
      <FilterBar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Cari nama atau nomor orang tua"
        hasActiveFilters={hasActiveFilters}
        onReset={handleResetFilters}
      >
        <select
          value={selectedStatus}
          onChange={(e) => setSelectedStatus(e.target.value)}
          aria-label="Filter berdasarkan Status Akun"
          className="px-3 py-2 text-xs sm:text-sm bg-slate-50 hover:bg-slate-100/70 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        >
          <option value="">Semua Status Akun</option>
          <option value="ACTIVE">Aktif</option>

          <option value="INACTIVE">Nonaktif</option>
        </select>
      </FilterBar>

      {/* Data Table */}
      <button type="button" onClick={() => void loadParents()} disabled={loading} className="text-sm text-blue-700">Muat Ulang</button>
      {loadError ? <ErrorState message={loadError} onRetry={loadParents} /> : loading ? <LoadingSkeleton type="table" /> : <DataTable
        columns={columns}
        data={filteredParents}
        emptyTitle={hasActiveFilters ? 'Tidak ada wali sesuai filter.' : 'Belum ada data wali.'}
        emptyDescription="Akun orang tua akan muncul setelah data tersimpan di backend."
        emptyActionText="Tambah Akun Orang Tua"
        onEmptyAction={() => setShowParentModal(true)}
      />}

      {/* Modals & Drawers */}
      <ParentFormModal isOpen={showParentModal} onClose={() => setShowParentModal(false)} onCreated={loadParents} />
      <ParentDetailDrawer
        isOpen={selectedParent !== null}
        onClose={() => setSelectedParent(null)}
        parent={selectedParent}
        onChanged={loadParents}
      />
    </div>
  );
};
