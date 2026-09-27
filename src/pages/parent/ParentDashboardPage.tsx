import React, { useEffect, useState } from 'react';
import { School, User, ShieldCheck } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { EmptyState } from '../../components/ui/EmptyState';
import { LinkedStudent, ParentProfile, parentPortalService } from '../../services/parent-portal.service';
import { useAuth } from '../../context/AuthContext';

export const ParentDashboardPage: React.FC = () => {
  const { session } = useAuth();
  const [profile, setProfile] = useState<ParentProfile | null>(null);
  const [students, setStudents] = useState<LinkedStudent[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    Promise.all([parentPortalService.profile(), parentPortalService.students()])
      .then(([nextProfile, nextStudents]) => { setProfile(nextProfile); setStudents(nextStudents); })
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'Data orang tua gagal dimuat.'));
  }, []);
  return <div className="space-y-6">
    <PageHeader title={`Selamat pagi, ${session?.displayName?.split(' ')[0] || 'Orang Tua'}`} subtitle="Informasi siswa yang terhubung dengan akun Anda" />
    {error && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
    {profile && <section className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 py-4 border-y border-slate-200"><div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Akun Orang Tua</p><p className="text-sm font-medium text-slate-900 mt-1">{profile.fullName} · {profile.relationship}</p><p className="text-xs text-slate-500 mt-0.5">{profile.phone}</p></div><div className="flex items-center gap-2 text-xs font-medium text-emerald-700"><ShieldCheck className="w-4 h-4" /> Akun Aktif</div></section>}
    <section><div className="flex items-end justify-between mb-4"><div><h2 className="text-xl font-semibold text-slate-900">Anak Anda</h2><p className="text-sm text-slate-500 mt-1">Data siswa dari administrasi sekolah</p></div><span className="text-sm font-semibold text-slate-600">{students.length} siswa</span></div>{students.length === 0 ? <EmptyState icon={User} title="Belum ada siswa terhubung." description="Hubungi Admin IT untuk menghubungkan akun dengan siswa." /> : <div className="grid md:grid-cols-2 gap-5">{students.map((student) => <article key={student.id} className="bg-white rounded-xl border border-slate-200 p-6"><div className="flex items-start gap-4"><div className="w-11 h-11 rounded-lg bg-blue-50 flex items-center justify-center shrink-0"><School className="w-5 h-5 text-blue-600" /></div><div className="min-w-0"><h3 className="text-lg font-semibold text-slate-900">{student.fullName}</h3><p className="text-sm text-slate-500 mt-1">{student.className}</p><div className="mt-5 pt-4 border-t border-slate-100 grid grid-cols-2 gap-6 text-sm"><div><p className="text-xs text-slate-500">NIS</p><p className="font-medium text-slate-800 mt-1">{student.nis}</p></div><div><p className="text-xs text-slate-500">Hubungan</p><p className="font-medium text-slate-800 mt-1">{student.relationship}</p></div></div></div></div></article>)}</div>}</section>
    <section className="bg-white border border-slate-200 rounded-xl p-5"><h2 className="font-semibold text-slate-900">Notifikasi Presensi</h2><p className="text-sm text-slate-500 mt-1">Dalam Pengembangan.</p></section>
  </div>;
};
