import React, { useCallback, useEffect, useState } from 'react';
import { BookOpen, Plus, School, UserPlus, Users } from 'lucide-react';
import { ErrorState } from '../../components/ui/ErrorState';
import { LoadingSkeleton } from '../../components/ui/LoadingSkeleton';
import { PageHeader } from '../../components/ui/PageHeader';
import { DataTable, Column } from '../../components/ui/DataTable';
import { ClassFormModal } from '../../components/admin/ClassFormModal';
import { MajorFormModal } from '../../components/admin/MajorFormModal';
import { UserFormModal } from '../../components/admin/UserFormModal';
import { useToast } from '../../context/ToastContext';
import { Class, Major, User } from '../../types';
import { classesService } from '../../services/classes.service';
import { usersService } from '../../services/users.service';

export const AdminClassesUsersPage: React.FC = () => {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<'classes' | 'majors' | 'users'>('classes');
  const [classes, setClasses] = useState<Class[]>([]);
  const [majors, setMajors] = useState<Major[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [showClassModal, setShowClassModal] = useState(false);
  const [showMajorModal, setShowMajorModal] = useState(false);
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingClass, setEditingClass] = useState<Class | null>(null);
  const [editingMajor, setEditingMajor] = useState<Major | null>(null);

  const [loading, setLoading] = useState({ classes: true, majors: true, users: true });
  const [errors, setErrors] = useState({ classes: '', majors: '', users: '' });
  const reportError = useCallback((error: unknown, fallback: string) => showToast({ type: 'error', message: error instanceof Error ? error.message : fallback }), [showToast]);
  const loadTable = useCallback(async <T,>(key: 'classes' | 'majors' | 'users', fetchRows: () => Promise<T[]>, apply: (rows: T[]) => void) => {
    setLoading((state) => ({ ...state, [key]: true }));
    setErrors((state) => ({ ...state, [key]: '' }));
    try { apply(await fetchRows()); }
    catch (error) { setErrors((state) => ({ ...state, [key]: error instanceof Error ? error.message : 'Gagal memuat data.' })); }
    finally { setLoading((state) => ({ ...state, [key]: false })); }
  }, []);
  const loadClasses = useCallback(() => loadTable('classes', classesService.getClasses, setClasses), [loadTable]);
  const loadMajors = useCallback(() => loadTable('majors', classesService.getMajors, setMajors), [loadTable]);
  const loadUsers = useCallback(() => loadTable('users', usersService.getUsers, setUsers), [loadTable]);
  useEffect(() => { void loadClasses(); void loadMajors(); void loadUsers(); }, [loadClasses, loadMajors, loadUsers]);

  const removeClass = async (item: Class) => {
    if (!window.confirm(`Hapus kelas ${item.name}?`)) return;
    try { const result = await classesService.deleteClass(item.id); await loadClasses(); showToast({ type: 'success', message: result.action === 'DEACTIVATE' ? 'Kelas dinonaktifkan karena memiliki siswa terkait.' : 'Kelas berhasil dihapus.' }); }
    catch (error) { reportError(error, 'Gagal menghapus kelas.'); }
  };
  const removeMajor = async (item: Major) => {
    if (!window.confirm(`Hapus jurusan ${item.name}?`)) return;
    try { const result = await classesService.deleteMajor(item.id); await Promise.all([loadMajors(), loadClasses()]); showToast({ type: 'success', message: result.action === 'DEACTIVATE' ? 'Jurusan dinonaktifkan karena masih digunakan kelas.' : 'Jurusan berhasil dihapus.' }); }
    catch (error) { reportError(error, 'Gagal menghapus jurusan.'); }
  };

  const status = (active: boolean) => <span className={`px-2 py-0.5 rounded text-[11px] font-medium border ${active ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>{active ? 'Aktif' : 'Nonaktif'}</span>;
  const classColumns: Column<Class>[] = [
    { key: 'name', header: 'Nama Kelas' }, { key: 'grade', header: 'Tingkat', render: (item) => item.grade || '—' },
    { key: 'major', header: 'Jurusan', render: (item) => item.major || 'Tanpa Jurusan' },
    { key: 'schoolYear', header: 'Tahun Ajaran', render: (item) => item.schoolYear || '—' },
    { key: 'isActive', header: 'Status', render: (item) => status(item.isActive) },
    { key: 'studentCount', header: 'Siswa' },
    { key: 'actions', header: 'Aksi', render: (item) => <div className="flex gap-2"><button className="text-xs text-blue-700" onClick={() => { setEditingClass(item); setShowClassModal(true); }}>Edit</button><button className="text-xs text-red-700" onClick={() => void removeClass(item)}>Hapus</button></div> },
  ];
  const majorColumns: Column<Major>[] = [
    { key: 'name', header: 'Nama Jurusan / Program' }, { key: 'classCount', header: 'Jumlah Kelas' },
    { key: 'isActive', header: 'Status', render: (item) => status(item.isActive) },
    { key: 'actions', header: 'Aksi', render: (item) => <div className="flex gap-2"><button className="text-xs text-blue-700" onClick={() => { setEditingMajor(item); setShowMajorModal(true); }}>Edit</button><button className="text-xs text-red-700" onClick={() => void removeMajor(item)}>Hapus</button></div> },
  ];
  const userColumns: Column<User>[] = [
    { key: 'displayName', header: 'Nama Pengguna' }, { key: 'username', header: 'Username' }, { key: 'role', header: 'Role' },
    { key: 'isActive', header: 'Status', render: (item) => status(item.isActive) },
    { key: 'actions', header: 'Aksi', render: (item) => <button className="text-xs text-blue-700" onClick={async () => { try { await usersService.toggleUserStatus(item.id, !item.isActive); await loadUsers(); } catch (error) { reportError(error, 'Gagal memperbarui pengguna.'); } }}>{item.isActive ? 'Nonaktifkan' : 'Aktifkan'}</button> },
  ];

  const tabs = [
    { id: 'classes' as const, label: 'Kelas', icon: School },
    { id: 'majors' as const, label: 'Jurusan', icon: BookOpen },
    { id: 'users' as const, label: 'Pengguna', icon: Users },
  ];
  return <div className="space-y-6">
    <PageHeader title="Kelas & Pengguna" subtitle="Kelola master kelas, jurusan, dan akun operasional" breadcrumbs={[{ label: 'Admin IT', href: '/admin/dashboard' }, { label: 'Kelas & Pengguna' }]} />
    <div className="flex gap-2 border-b border-slate-200">{tabs.map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => setActiveTab(id)} className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 ${activeTab === id ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500'}`}><Icon className="w-4 h-4" />{label}</button>)}</div>
    <button type="button" disabled={loading[activeTab]} onClick={() => void ({ classes: loadClasses, majors: loadMajors, users: loadUsers }[activeTab])()} className="text-sm text-blue-700">Muat Ulang</button>
    {activeTab === 'classes' && <section className="space-y-4"><div className="flex justify-between"><p className="text-sm text-slate-500">{classes.length} kelas</p><button onClick={() => { setEditingClass(null); setShowClassModal(true); }} className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg"><Plus className="w-4 h-4" /> Tambah Kelas</button></div>{errors.classes ? <ErrorState message={errors.classes} onRetry={loadClasses} /> : loading.classes ? <LoadingSkeleton type="table" /> : <DataTable columns={classColumns} data={classes} emptyTitle="Belum ada kelas." emptyDescription="Tambahkan kelas pertama untuk mulai mendaftarkan siswa." emptyActionText="Tambah Kelas" onEmptyAction={() => { setEditingClass(null); setShowClassModal(true); }} />}</section>}
    {activeTab === 'majors' && <section className="space-y-4"><div className="flex justify-between"><p className="text-sm text-slate-500">Jurusan bersifat opsional untuk kelas.</p><button onClick={() => { setEditingMajor(null); setShowMajorModal(true); }} className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg"><Plus className="w-4 h-4" /> Tambah Jurusan</button></div>{errors.majors ? <ErrorState message={errors.majors} onRetry={loadMajors} /> : loading.majors ? <LoadingSkeleton type="table" /> : <DataTable columns={majorColumns} data={majors} emptyTitle="Belum ada jurusan." emptyDescription="Sekolah tanpa jurusan tetap dapat membuat kelas." emptyActionText="Tambah Jurusan" onEmptyAction={() => { setEditingMajor(null); setShowMajorModal(true); }} />}</section>}
    {activeTab === 'users' && <section className="space-y-4"><div className="flex justify-end"><button onClick={() => setShowUserModal(true)} className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg"><UserPlus className="w-4 h-4" /> Tambah Pengguna</button></div>{errors.users ? <ErrorState message={errors.users} onRetry={loadUsers} /> : loading.users ? <LoadingSkeleton type="table" /> : <DataTable columns={userColumns} data={users} emptyTitle="Belum ada pengguna." emptyDescription="Tambahkan akun operasional." />}</section>}
    <ClassFormModal isOpen={showClassModal} classroom={editingClass} majors={majors} onClose={() => { setShowClassModal(false); setEditingClass(null); }} onSaved={async () => { await Promise.all([loadClasses(), loadMajors()]); }} />
    <MajorFormModal isOpen={showMajorModal} major={editingMajor} onClose={() => { setShowMajorModal(false); setEditingMajor(null); }} onSaved={async () => { await Promise.all([loadMajors(), loadClasses()]); }} />
    <UserFormModal isOpen={showUserModal} onClose={() => setShowUserModal(false)} onCreated={loadUsers} />
  </div>;
};
