/**
 * Tandara DashboardLayout
 * Provides desktop-first enterprise layout with sidebar, header, workspace, and modals.
 */

import React, { useState, useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AppSidebar } from '../components/layout/AppSidebar';
import { TopHeader } from '../components/layout/TopHeader';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Modal } from '../components/ui/Modal';
import { EmptyState } from '../components/ui/EmptyState';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { ShieldCheck, HelpCircle, FileText, CheckCircle2 } from 'lucide-react';
import { reportsService } from '../services/reports.service';
import { AuditLog } from '../types';

export const DashboardLayout: React.FC = () => {
  const { logout, isAdmin } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('tandara-sidebar-collapsed') === 'true');

  // Mobile sidebar visibility
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Modals state
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditRefresh, setAuditRefresh] = useState(0);
  const [auditError, setAuditError] = useState('');

  useEffect(() => {
    localStorage.setItem('tandara-sidebar-collapsed', String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  useEffect(() => {
    if (!mobileSidebarOpen) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileSidebarOpen(false);
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [mobileSidebarOpen]);

  useEffect(() => {
    if (!showAuditModal) return;
    setAuditLoading(true);
    setAuditError('');
    reportsService.getAuditLogs().then(setAuditLogs).catch((error: unknown) => setAuditError(error instanceof Error ? error.message : 'Gagal memuat audit log.')).finally(() => setAuditLoading(false));
  }, [showAuditModal, auditRefresh]);

  const handleLogout = async () => {
    try { await logout(); } catch { /* Local credentials are cleared even when the server is unavailable. */ }
    showToast({
      type: 'info',
      title: 'Sesi Berakhir',
      message: 'Anda telah berhasil keluar dari sistem Tandara.',
    });
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-[#F7F9FC] flex">
      {/* Mobile backdrop */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/60 lg:hidden"
          onClick={() => setMobileSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar - Desktop and Mobile */}
      <div className={`hidden lg:block shrink-0 transition-[width] duration-200 ${sidebarCollapsed ? 'w-[72px]' : 'w-56'}`}>
        <AppSidebar
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed((value) => !value)}
          onOpenAuditModal={() => setShowAuditModal(true)}
          onOpenHelpModal={() => setShowHelpModal(true)}
          onConfirmLogout={() => setShowLogoutConfirm(true)}
        />
      </div>

      {/* Mobile Drawer Sidebar */}
      {mobileSidebarOpen && (
        <div className="fixed inset-y-0 left-0 z-50 lg:hidden">
          <AppSidebar
            mobile
            onToggleCollapse={() => setMobileSidebarOpen(false)}
            onItemClick={() => setMobileSidebarOpen(false)}
            onOpenAuditModal={() => {
              setMobileSidebarOpen(false);
              setShowAuditModal(true);
            }}
            onOpenHelpModal={() => {
              setMobileSidebarOpen(false);
              setShowHelpModal(true);
            }}
            onConfirmLogout={() => {
              setMobileSidebarOpen(false);
              setShowLogoutConfirm(true);
            }}
          />
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <TopHeader
          onToggleMobileSidebar={() => setMobileSidebarOpen((prev) => !prev)}
          onConfirmLogout={() => setShowLogoutConfirm(true)}
        />

        <main className={`flex-1 min-w-0 w-full mx-auto p-3.5 sm:p-5 lg:p-6 ${location.pathname === '/teacher/live-attendance' || location.pathname === '/admin/devices-system' ? 'max-w-[1600px]' : 'max-w-[1480px]'}`}>
          <Outlet />
        </main>
      </div>

      {/* Logout Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showLogoutConfirm}
        onClose={() => setShowLogoutConfirm(false)}
        onConfirm={handleLogout}
        title="Keluar dari Sistem Tandara?"
        description="Sesi Anda akan diakhiri dan Anda akan dikembalikan ke halaman login."
        confirmLabel="Ya, Keluar"
        cancelLabel="Batal"
        isDestructive={true}
      />

      {/* Admin Audit Log Modal */}
      {isAdmin && (
        <Modal
          isOpen={showAuditModal}
          onClose={() => setShowAuditModal(false)}
          title="Audit Log Sistem"
          subtitle="Catatan riwayat aktivitas operasional dan perubahan konfigurasi sistem"
          maxWidth="2xl"
        >
          <div className="space-y-4">
            <button type="button" disabled={auditLoading} onClick={() => setAuditRefresh((value) => value + 1)} className="text-sm text-blue-700">Muat Ulang</button>
            {auditLoading && <p className="text-sm text-slate-500">Memuat audit log...</p>}
            {auditError && <p className="text-sm text-red-700">{auditError}</p>}
            {!auditLoading && !auditError && auditLogs.length === 0 && <EmptyState icon={ShieldCheck} title="Belum ada catatan audit" description="Belum ada event audit dari backend." />}
            {!auditLoading && !auditError && auditLogs.length > 0 && <div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="text-left text-slate-500 border-b"><th className="py-2">Waktu</th><th>Username</th><th>Aksi</th><th>Entity</th><th>ID</th><th>Detail</th></tr></thead><tbody>{auditLogs.map((log) => <tr key={log.id} className="border-b border-slate-100"><td className="py-2 pr-3 font-mono">{log.timestamp}</td><td className="pr-3">{log.username || '-'}</td><td className="pr-3">{log.action}</td><td className="pr-3">{log.entity}</td><td className="pr-3">{log.entityId || '-'}</td><td>{log.details}</td></tr>)}</tbody></table></div>}
          </div>
        </Modal>
      )}

      {/* Teacher Help Modal */}
      {!isAdmin && (
        <Modal
          isOpen={showHelpModal}
          onClose={() => setShowHelpModal(false)}
          title="Panduan Operasional Guru/Piket"
          subtitle="Petunjuk praktis pelaksanaan presensi dan penanganan permohonan izin"
          maxWidth="xl"
        >
          <div className="space-y-4 text-xs sm:text-sm text-slate-700">
            <div className="p-3.5 rounded-xl bg-blue-50/80 border border-blue-200">
              <div className="flex items-center gap-2 text-blue-900 font-semibold mb-1">
                <CheckCircle2 className="w-4 h-4 text-blue-600" />
                Alur Presensi Wajah
              </div>
              <p className="text-xs text-blue-800 leading-relaxed">
                Nyalakan sesi absensi di menu <strong>Absensi Langsung</strong>. Kamera (DroidCam) akan mendeteksi siswa dan backend akan mencatat kehadiran secara otomatis. Notifikasi orang tua masih dalam pengembangan.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-amber-50/80 border border-amber-200">
              <div className="flex items-center gap-2 text-amber-900 font-semibold mb-1">
                <FileText className="w-4 h-4 text-amber-600" />
                Verifikasi Izin & Sakit
              </div>
              <p className="text-xs text-amber-800 leading-relaxed">
                Tinjau surat keterangan dokter atau permohonan orang tua di menu <strong>Pengajuan Izin</strong>. Penolakan wajib disertai alasan tertulis.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
              <div className="flex items-center gap-2 text-slate-900 font-semibold mb-1">
                <HelpCircle className="w-4 h-4 text-slate-600" />
                Koreksi Manual
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Jika terjadi kendala teknis kamera, ajukan koreksi status pada menu <strong>Laporan & Koreksi</strong> dengan menyertakan keterangan minimal 10 karakter untuk rekam jejak audit.
              </p>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
