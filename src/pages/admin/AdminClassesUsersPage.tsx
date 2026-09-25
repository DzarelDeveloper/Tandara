/**
 * Tandara Admin IT - Kelas & Pengguna Page
 * Route: /admin/classes-users
 */

import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { School, UserPlus, Users, Clock, Plus, Shield, Check } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { DataTable, Column } from '../../components/ui/DataTable';
import { BackendDisconnected } from '../../components/ui/BackendDisconnected';
import { ClassFormModal } from '../../components/admin/ClassFormModal';
import { UserFormModal } from '../../components/admin/UserFormModal';
import { useToast } from '../../context/ToastContext';
import { Class, User } from '../../types';
import { classesService } from '../../services/classes.service';
import { usersService } from '../../services/users.service';

interface ScheduleFormValues {
  checkInTime: string;
  lateToleranceTime: string;
  checkOutTime: string;
  days: string[];
}

export const AdminClassesUsersPage: React.FC = () => {
  const { showBackendNotConnected } = useToast();
  const [activeTab, setActiveTab] = useState<'classes' | 'users'>('classes');

  const [showClassModal, setShowClassModal] = useState(false);
  const [showUserModal, setShowUserModal] = useState(false);
  const [classes, setClasses] = useState<Class[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  // Attendance schedule configuration state with time validation
  const {
    register,
    handleSubmit,
    watch,
  } = useForm<ScheduleFormValues>({
    defaultValues: {
      checkInTime: '07:00',
      lateToleranceTime: '07:15',
      checkOutTime: '15:30',
      days: ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat'],
    },
  });

  const checkIn = watch('checkInTime');
  const lateTol = watch('lateToleranceTime');
  const checkOut = watch('checkOutTime');
  const loadClasses = async () => { try { setClasses(await classesService.getClasses()); } catch (error) { showBackendNotConnected(error instanceof Error ? error.message : 'Gagal memuat kelas.'); } };
  const loadUsers = async () => { try { setUsers(await usersService.getUsers()); } catch (error) { showBackendNotConnected(error instanceof Error ? error.message : 'Gagal memuat pengguna.'); } };
  useEffect(() => { void loadClasses(); void loadUsers(); }, []);

  let scheduleError = '';
  if (lateTol && checkIn && lateTol <= checkIn) {
    scheduleError = 'Batas terlambat harus setelah jam masuk.';
  } else if (checkOut && checkIn && checkOut <= checkIn) {
    scheduleError = 'Jam pulang harus setelah jam masuk.';
  }

  const handleSaveSchedule = (_data: ScheduleFormValues) => {
    if (scheduleError) return;
    showBackendNotConnected('Backend belum terhubung. Konfigurasi jadwal belum dapat disimpan.');
  };

  // Class table columns
  const classColumns: Column<Class>[] = [
    { key: 'name', header: 'Kelas' },
    { key: 'major', header: 'Jurusan' },
    { key: 'homeroomTeacher', header: 'Wali Kelas' },
    { key: 'studentCount', header: 'Jumlah Siswa' },
    { key: 'checkInTime', header: 'Jadwal Masuk' },
    { key: 'checkOutTime', header: 'Jadwal Pulang' },
    {
      key: 'actions',
      header: 'Aksi',
      className: 'text-right',
      render: () => (
        <span className="text-xs text-slate-400">Edit/hapus belum tersedia</span>
      ),
    },
  ];

  // User table columns
  const userColumns: Column<User>[] = [
    {
      key: 'displayName',
      header: 'Nama Pengguna',
      render: (item) => (
        <div>
          <span className="font-semibold text-slate-900">{item.displayName}</span>
        </div>
      ),
    },
    {
      key: 'username',
      header: 'Username',
      render: (item) => <span className="font-mono text-xs text-slate-700">@{item.username}</span>,
    },
    {
      key: 'role',
      header: 'Role',
      render: (item) => (
        <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-teal-50 text-teal-800 border border-teal-200">
          {item.role}
        </span>
      ),
    },
    {
      key: 'access',
      header: 'Hak Akses',
      render: () => (
        <span className="text-xs text-slate-500">Presensi & Pengajuan Izin</span>
      ),
    },
    {
      key: 'isActive',
      header: 'Status',
      render: (item) => (
        <span
          className={`px-2 py-0.5 rounded text-[11px] font-medium ${
            item.isActive
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-slate-100 text-slate-600 border border-slate-200'
          }`}
        >
          {item.isActive ? 'Aktif' : 'Nonaktif'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Aksi',
      className: 'text-right',
      render: (item) => (
        <button type="button" onClick={async () => { try { await usersService.toggleUserStatus(item.id, !item.isActive); await loadUsers(); } catch (error) { showBackendNotConnected(error instanceof Error ? error.message : 'Gagal memperbarui status pengguna.'); } }} className="text-xs text-[#2563EB] hover:text-[#1D4ED8] font-medium">
          {item.isActive ? 'Nonaktifkan' : 'Aktifkan'}
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Kelas & Pengguna"
        subtitle="Kelola struktur rombongan belajar, jadwal masuk, dan akun operasional Guru Piket"
        breadcrumbs={[
          { label: 'Admin IT', href: '/admin/dashboard' },
          { label: 'Kelas & Pengguna' },
        ]}
      />

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-px">
        <button
          type="button"
          onClick={() => setActiveTab('classes')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === 'classes'
              ? 'border-[#2563EB] text-[#2563EB]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <School className="w-4 h-4" />
          Kelas & Jurusan
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('users')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === 'users'
              ? 'border-[#2563EB] text-[#2563EB]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Users className="w-4 h-4" />
          Akun Guru / Piket
        </button>
      </div>

      {/* Tab 1: Kelas & Jurusan */}
      {activeTab === 'classes' && (
        <div className="space-y-6">
          {/* Action Row */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Kelas: {classes.length}</span>
              <span className="text-slate-300">|</span>
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Jurusan: {new Set(classes.map((item) => item.major)).size}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowClassModal(true)}
                className="inline-flex items-center gap-2 px-3.5 py-2 text-xs sm:text-sm font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-lg shadow-xs transition-colors"
              >
                <Plus className="w-4 h-4" />
                Tambah Kelas
              </button>
              <button
                type="button"
                onClick={() =>
                  showBackendNotConnected('Backend belum terhubung. Penambahan jurusan memerlukan database.')
                }
                className="inline-flex items-center gap-2 px-3.5 py-2 text-xs sm:text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition-colors"
              >
                <School className="w-4 h-4 text-slate-500" />
                Tambah Jurusan
              </button>
            </div>
          </div>

          {/* Classes Empty Table */}
          <DataTable
            columns={classColumns}
              data={classes}
            emptyTitle="Belum ada data kelas atau jurusan."
            emptyDescription="Tambahkan struktur kelas untuk mulai memetakan siswa dan jadwal absensi."
            emptyActionText="Tambah Kelas Pertama"
            onEmptyAction={() => setShowClassModal(true)}
          />

          {/* Attendance Configuration Panel */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
            <div className="flex items-center gap-2.5 pb-3.5 border-b border-slate-100 mb-4">
              <Clock className="w-5 h-5 text-blue-600" />
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Konfigurasi Jadwal Presensi Harian</h3>
                <p className="text-xs text-slate-500">
                  Tentukan jam masuk, batas toleransi keterlambatan, dan jam kepulangan
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmit(handleSaveSchedule)} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Jam Masuk
                  </label>
                  <input
                    type="time"
                    {...register('checkInTime')}
                    className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Batas Terlambat
                  </label>
                  <input
                    type="time"
                    {...register('lateToleranceTime')}
                    className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-mono"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">Status otomatis berubah menjadi 'Terlambat'</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                    Jam Pulang
                  </label>
                  <input
                    type="time"
                    {...register('checkOutTime')}
                    className="w-full px-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-mono"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">Sesi kepulangan diizinkan</p>
                </div>
              </div>

              {scheduleError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 font-medium">
                  {scheduleError}
                </div>
              )}

              {/* Applicable weekdays */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1.5">
                  Hari Aktif Belajar Mengajar
                </label>
                <div className="flex flex-wrap gap-2">
                  {['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'].map((day) => (
                    <label
                      key={day}
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs font-medium text-slate-700 cursor-pointer hover:bg-slate-100"
                    >
                      <input
                        type="checkbox"
                        value={day}
                        defaultChecked={day !== 'Sabtu'}
                        className="rounded text-blue-600 border-slate-300 focus:ring-blue-500"
                      />
                      <span>{day}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end">
                <button
                  type="submit"
                  disabled={Boolean(scheduleError)}
                  className="px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 rounded-lg transition-colors shadow-xs"
                >
                  Simpan Konfigurasi Jadwal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Tab 2: Akun Guru / Piket */}
      {activeTab === 'users' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Daftar Akun Guru & Piket</h3>
              <p className="text-xs text-slate-500">Petugas berwenang memantau dan mengoperasikan presensi</p>
            </div>
            <button
              type="button"
              onClick={() => setShowUserModal(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs sm:text-sm font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-lg shadow-xs transition-colors"
            >
              <UserPlus className="w-4 h-4" />
              Tambah Pengguna
            </button>
          </div>

          <DataTable
            columns={userColumns}
            data={users}
            emptyTitle="Belum ada akun guru atau petugas piket."
            emptyDescription="Akun yang didaftarkan akan muncul di sini setelah tersimpan di server."
            emptyActionText="Tambah Pengguna Guru/Piket"
            onEmptyAction={() => setShowUserModal(true)}
          />
        </div>
      )}

      {/* Modals */}
      <ClassFormModal isOpen={showClassModal} onClose={() => setShowClassModal(false)} onCreated={loadClasses} />
      <UserFormModal isOpen={showUserModal} onClose={() => setShowUserModal(false)} onCreated={loadUsers} />
    </div>
  );
};
