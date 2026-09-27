/**
 * Tandara Admin IT - Siswa & Wajah Page
 * Route: /admin/students
 */

import React, { useEffect, useMemo, useState } from 'react';
import { UserPlus, UploadCloud, ScanFace } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { FilterBar } from '../../components/ui/FilterBar';
import { DataTable, Column } from '../../components/ui/DataTable';
import { StudentFormModal } from '../../components/admin/StudentFormModal';
import { StudentImportModal } from '../../components/admin/StudentImportModal';
import { FaceEnrollmentDrawer } from '../../components/admin/FaceEnrollmentDrawer';
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
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const { showToast } = useToast();

  const loadStudents = async () => {
    try { setStudents(await studentsService.getStudents()); }
    catch (error) { showToast({ type: 'error', message: error instanceof Error ? error.message : 'Gagal memuat data siswa.' }); }
  };
  useEffect(() => { void loadStudents(); classesService.getClasses().then(setClasses).catch((error) => showToast({ type: 'error', message: error instanceof Error ? error.message : 'Gagal memuat kelas.' })); }, []);

  // Table columns definition ready for future student objects
  const columns: Column<Student>[] = [
    {
      key: 'fullName',
      header: 'Siswa',
      render: (item) => (
        <div>
          <div className="font-semibold text-slate-900">{item.fullName}</div>
          <div className="text-xs text-slate-500">Gender: {item.gender === 'L' ? 'Laki-laki' : 'Perempuan'}</div>
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
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => { setSelectedStudent(item); setShowFaceDrawer(true); }} className="text-xs text-[#2563EB] hover:text-[#1D4ED8] font-medium">
            {item.faceRegistered ? 'Daftarkan Ulang' : 'Daftarkan Wajah'}
          </button>
          {item.faceRegistered && <button type="button" onClick={async () => { if (!window.confirm('Hapus enrollment biometrik siswa ini?')) return; try { await faceEnrollmentService.remove(item.id); await loadStudents(); showToast({ type: 'success', message: 'Enrollment wajah dihapus.' }); } catch (error) { showToast({ type: 'error', message: error instanceof Error ? error.message : 'Gagal menghapus enrollment wajah.' }); } }} className="text-xs text-red-600 hover:text-red-800 font-medium">Hapus Wajah</button>}
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
              onClick={() => setShowStudentModal(true)}
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
              onClick={() => setShowFaceDrawer(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs sm:text-sm font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors focus:ring-2 focus:ring-teal-500 focus:outline-none"
            >
              <ScanFace className="w-4 h-4 text-teal-700" />
              Daftarkan Wajah
            </button>
          </>
        }
      />

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
      <DataTable
        columns={columns}
        data={filteredStudents}
        emptyTitle="Belum ada data siswa."
        emptyDescription="Data siswa akan muncul setelah tersedia di backend."
        emptyActionText="Tambah Siswa Baru"
        onEmptyAction={() => setShowStudentModal(true)}
      />

      {/* Modals & Drawer */}
      <StudentFormModal isOpen={showStudentModal} onClose={() => setShowStudentModal(false)} onCreated={loadStudents} />
      <StudentImportModal isOpen={showImportModal} onClose={() => setShowImportModal(false)} />
      <FaceEnrollmentDrawer isOpen={showFaceDrawer} onClose={() => { setShowFaceDrawer(false); setSelectedStudent(null); }} students={students} selectedStudent={selectedStudent} onCompleted={loadStudents} />
    </div>
  );
};
