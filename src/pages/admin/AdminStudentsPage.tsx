/**
 * Tandara Admin IT - Siswa & Wajah Page
 * Route: /admin/students
 */

import React, { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { UserPlus, UploadCloud, ScanFace } from 'lucide-react';
import { ErrorState } from '../../components/ui/ErrorState';
import { LoadingSkeleton } from '../../components/ui/LoadingSkeleton';
import { PageHeader } from '../../components/ui/PageHeader';
import { FilterBar } from '../../components/ui/FilterBar';
import { DataTable, Column } from '../../components/ui/DataTable';
import { StudentFormModal } from '../../components/admin/StudentFormModal';
import { StudentImportModal } from '../../components/admin/StudentImportModal';
import { FaceEnrollmentDrawer } from '../../components/admin/FaceEnrollmentDrawer';
import { PermanentDeleteStudentModal } from '../../components/admin/PermanentDeleteStudentModal';
import { createStudentLifecycleStore } from '../../services/student-lifecycle.store';
import { Class, Student } from '../../types';
import { studentsService } from '../../services/students.service';
import { useToast } from '../../context/ToastContext';
import { faceEnrollmentService } from '../../services/face-enrollment.service';
import { classesService } from '../../services/classes.service';

export const AdminStudentsPage: React.FC = () => {
  const [search, setSearch] = useState('');
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedFaceStatus, setSelectedFaceStatus] = useState('');

  const [showStudentModal, setShowStudentModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showFaceDrawer, setShowFaceDrawer] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const lifecycle = useMemo(() => createStudentLifecycleStore(), []);
  const { active, students, loading, error: loadError, activeCount, inactiveCount, mutating } = useSyncExternalStore(lifecycle.subscribe, lifecycle.snapshot);
  const [deletingStudent, setDeletingStudent] = useState<Student | null>(null);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [classes, setClasses] = useState<Class[]>([]);
  const { showToast } = useToast();

  const loadStudents = lifecycle.load;
  useEffect(() => { void loadStudents(); classesService.getClasses().then(setClasses).catch((error) => showToast({ type: 'error', message: error instanceof Error ? error.message : 'Gagal memuat kelas.' })); }, [lifecycle]);
  const changeView = (next: boolean) => {
    setSelectedStudent(null); setEditingStudent(null); setDeletingStudent(null);
    setShowStudentModal(false); setShowFaceDrawer(false); setShowImportModal(false);
    void lifecycle.selectView(next);
  };
  const changeStatus = async (student: Student) => {
    const deactivate = student.status === 'ACTIVE';
    if (!window.confirm(deactivate
      ? `Nonaktifkan ${student.fullName}? Data siswa tidak akan dihapus. Riwayat presensi dan data wajah tetap tersimpan dan siswa dapat diaktifkan kembali.`
      : `Aktifkan kembali ${student.fullName}? Identitas, riwayat, hubungan wali, dan enrollment tetap tersimpan.`)) return;
    try {
      await lifecycle.mutate(async () => { if (deactivate) await studentsService.deactivateStudent(student.id); else await studentsService.reactivateStudent(student.id); });
      showToast({ type: 'success', message: deactivate ? 'Siswa dinonaktifkan.' : 'Siswa diaktifkan kembali.' });
    } catch (error) { showToast({ type: 'error', message: error instanceof Error ? error.message : 'Status belum dapat diubah.' }); }
  };

  // Table columns definition ready for future student objects
  const columns: Column<Student>[] = [
    {
      key: 'fullName',
      header: 'Siswa',
      render: (item) => (
        <div>
          <div className="font-semibold text-slate-900">{item.fullName}</div>
          <div className="text-xs text-slate-500">Gender: {item.gender === 'L' ? 'Laki-laki' : item.gender === 'P' ? 'Perempuan' : '—'}</div>
        </div>
      ),
    },
    {
      key: 'nis',
      header: 'NIS',
      render: (item) => <span className="font-mono text-xs">{item.nis}</span>,
    },
    {
      key: 'className',
      header: 'Kelas / Jurusan',
      render: (item) => (
        <div>
          <span className="font-medium text-slate-800">{item.className}</span>
          <span className="text-xs text-slate-500 block">{item.major}</span>
        </div>
      ),
    },
    {
      key: 'parentName',
      header: 'Orang Tua / Wali',
      render: (item) => (
        <div>
          <span className="text-slate-800">{item.parentName}</span>
          <span className="text-xs text-slate-500 block">{item.parentPhone}</span>
        </div>
      ),
    },
    {
      key: 'faceRegistered',
      header: 'Status Wajah',
      render: (item) => (
        <span
          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium ${
            item.faceRegistered
              ? 'bg-teal-50 text-teal-800 border border-teal-200'
              : 'bg-amber-50 text-amber-800 border border-amber-200'
          }`}
        >
          {item.faceRegistered ? 'Terdaftar' : 'Belum Terdaftar'}
        </span>
      ),
    },
    { key: 'status', header: 'Status', render: (item) => item.status === 'ACTIVE' ? 'Aktif' : 'Nonaktif' },
    {
      key: 'updatedAt',
      header: 'Terakhir Diperbarui',
      render: (item) => <span className="text-xs text-slate-500 font-mono">{item.updatedAt}</span>,
    },
    {
      key: 'actions',
      header: 'Aksi',
      className: 'text-right',
      render: (item) => (
        <div className="flex flex-wrap justify-end gap-2">
          <button disabled={mutating} type="button" className="text-xs text-blue-700" onClick={() => { setEditingStudent(item); setShowStudentModal(true); }}>Edit</button>
          <button disabled={mutating} type="button" className="text-xs text-blue-700" onClick={() => void changeStatus(item)}>{active ? 'Nonaktifkan' : 'Aktifkan Kembali'}</button>
          {active && <>
            <button disabled={mutating} type="button" onClick={() => { setSelectedStudent(item); setShowFaceDrawer(true); }} className="text-xs text-blue-700">{item.faceRegistered ? 'Daftarkan Ulang' : 'Daftarkan Wajah'}</button>
            {item.faceRegistered && <button disabled={mutating} type="button" className="text-xs text-red-600" onClick={async () => {
              if (!window.confirm(`Hapus enrollment biometrik ${item.fullName}?`)) return;
              try { const result = await lifecycle.mutate(() => faceEnrollmentService.remove(item.id)); showToast({ type: result.cleanupPending ? 'info' : 'success', message: result.cleanupPending ? 'Enrollment dihapus. Pembersihan berkas wajah terisolasi memerlukan tindak lanjut Admin IT.' : 'Enrollment wajah dihapus.' }); }
              catch (error) { showToast({ type: 'error', message: error instanceof Error ? error.message : 'Gagal menghapus enrollment wajah.' }); }
            }}>Hapus Wajah</button>}
          </>}
          <details className="basis-full border-t border-slate-200 pt-2 text-xs text-slate-500"><summary className="cursor-pointer">Tindakan lainnya</summary><button disabled={mutating} type="button" onClick={() => setDeletingStudent(item)} className="mt-2 text-red-700">Hapus Permanen</button></details>
        </div>
      ),
    },
  ];

  const filteredStudents = useMemo(() => students.filter((student) => {
    const query = search.toLowerCase();
    return (!query || `${student.fullName} ${student.nis}`.toLowerCase().includes(query)) && (!selectedClass || student.classId === selectedClass) && (!selectedFaceStatus || (selectedFaceStatus === 'REGISTERED' ? student.faceRegistered : !student.faceRegistered));
  }), [search, selectedClass, selectedFaceStatus, students]);

  const handleResetFilters = () => {
    setSearch('');
    setSelectedClass('');
    setSelectedFaceStatus('');
  };

  const hasActiveFilters = Boolean(search || selectedClass || selectedFaceStatus);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Siswa & Wajah"
        subtitle="Kelola identitas siswa dan data biometrik wajah"
        breadcrumbs={[
          { label: 'Admin IT', href: '/admin/dashboard' },
          { label: 'Siswa & Wajah' },
        ]}
        actions={
          <>
            <button
              type="button"
              onClick={() => { setEditingStudent(null); setShowStudentModal(true); }}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs sm:text-sm font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-lg shadow-xs transition-colors focus:ring-2 focus:ring-blue-500 focus:outline-none"
            >
              <UserPlus className="w-4 h-4" />
              Tambah Siswa
            </button>
            <button
              type="button"
              onClick={() => setShowImportModal(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs sm:text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition-colors focus:ring-2 focus:ring-slate-400 focus:outline-none"
            >
              <UploadCloud className="w-4 h-4 text-slate-500" />
              Impor Data
            </button>
            <button
              type="button"
              disabled={!active || loading || mutating}
              onClick={() => setShowFaceDrawer(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs sm:text-sm font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors focus:ring-2 focus:ring-teal-500 focus:outline-none"
            >
              <ScanFace className="w-4 h-4 text-teal-700" />
              Daftarkan Wajah
            </button>
          </>
        }
      />

      <div className="flex gap-2 border-b border-slate-200" role="tablist" aria-label="Status siswa">
        {[true, false].map((value) => <button key={String(value)} type="button" role="tab" aria-selected={active === value} disabled={mutating} onClick={() => changeView(value)} className={`px-4 py-2.5 text-sm font-semibold border-b-2 ${active === value ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500'}`}>
          {value ? 'Siswa Aktif' : 'Siswa Nonaktif'}{(value ? activeCount : inactiveCount) !== null ? ` (${value ? activeCount : inactiveCount})` : ''}
        </button>)}
      </div>
      {/* Filter and Search Bar */}
      <FilterBar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Cari nama atau NIS"
        hasActiveFilters={hasActiveFilters}
        onReset={handleResetFilters}
      >
        <select
          value={selectedClass}
          onChange={(e) => setSelectedClass(e.target.value)}
          aria-label="Filter berdasarkan Kelas"
          className="px-3 py-2 text-xs sm:text-sm bg-slate-50 hover:bg-slate-100/70 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        >
          <option value="">Semua Kelas</option>
          {classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>

        <select
          value={selectedFaceStatus}
          onChange={(e) => setSelectedFaceStatus(e.target.value)}
          aria-label="Filter berdasarkan Status Wajah"
          className="px-3 py-2 text-xs sm:text-sm bg-slate-50 hover:bg-slate-100/70 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        >
          <option value="">Semua Status Wajah</option>
          <option value="REGISTERED">Terdaftar</option>
          <option value="UNREGISTERED">Belum Terdaftar</option>
        </select>
      </FilterBar>

      {/* Data Table with Meaningful Empty State */}
      <button type="button" onClick={() => void loadStudents()} disabled={loading} className="text-sm text-blue-700">Muat Ulang</button>
      {loadError ? <ErrorState message={loadError} onRetry={loadStudents} /> : loading ? <LoadingSkeleton type="table" /> : <DataTable
        key={`${active}-${search}-${selectedClass}-${selectedFaceStatus}`}
        columns={columns}
        data={filteredStudents}
        emptyTitle={hasActiveFilters ? "Tidak ada siswa sesuai filter." : (active ? "Belum ada siswa aktif." : "Belum ada siswa nonaktif.")}
        emptyDescription="Data siswa akan muncul setelah tersedia di backend."
        emptyActionText={active ? "Tambah Siswa Baru" : undefined}
        onEmptyAction={() => { setEditingStudent(null); setShowStudentModal(true); }}
      />}

      {deletingStudent && <PermanentDeleteStudentModal key={deletingStudent.id} student={deletingStudent} onClose={() => setDeletingStudent(null)} onDelete={async () => {
        const result = await lifecycle.mutate(() => studentsService.permanentlyDeleteStudent(deletingStudent.id));
        showToast({ type: result.cleanupPending ? 'info' : 'success', message: result.cleanupPending ? 'Siswa dihapus. Pembersihan berkas wajah terisolasi memerlukan tindak lanjut Admin IT.' : 'Siswa berhasil dihapus permanen.' });
      }} />}
      {/* Modals & Drawer */}
      <StudentFormModal isOpen={showStudentModal} student={editingStudent} onClose={() => { setShowStudentModal(false); setEditingStudent(null); }} onCreated={loadStudents} />
      <StudentImportModal onImported={loadStudents} isOpen={showImportModal} onClose={() => setShowImportModal(false)} />
      <FaceEnrollmentDrawer isOpen={showFaceDrawer} onClose={() => { setShowFaceDrawer(false); setSelectedStudent(null); }} students={students} selectedStudent={selectedStudent} onCompleted={loadStudents} />
    </div>
  );
};
