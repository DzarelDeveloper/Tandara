/**
 * Tandara DashboardLayout
 * Provides desktop-first enterprise layout with sidebar, header, workspace, and modals.
 */

import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { AppSidebar } from '../components/layout/AppSidebar';
import { TopHeader } from '../components/layout/TopHeader';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Modal } from '../components/ui/Modal';
import { EmptyState } from '../components/ui/EmptyState';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { ShieldCheck, HelpCircle, FileText, CheckCircle2 } from 'lucide-react';

export const DashboardLayout: React.FC = () => {
  const { logout, isAdmin } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  // Desktop sidebar collapse preference
  const [collapsed, setCollapsed] = useState(() => {
    return localStorage.getItem('tandara_sidebar_collapsed') === 'true';
  });

  // Mobile sidebar visibility
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Modals state
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);

  useEffect(() => {
    localStorage.setItem('tandara_sidebar_collapsed', String(collapsed));
  }, [collapsed]);

  const handleLogout = () => {
    logout();
    showToast({
      type: 'info',
      title: 'Sesi Berakhir',
      message: 'Anda telah berhasil keluar dari sistem Tandara.',
    });
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-[#F6F7F9] flex">
      {/* Mobile backdrop */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/60 lg:hidden"
          onClick={() => setMobileSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar - Desktop and Mobile */}
      <div className={`hidden lg:block shrink-0 ${collapsed ? 'w-20' : 'w-64'} transition-all duration-200`}>
        <AppSidebar
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((prev) => !prev)}
          onOpenAuditModal={() => setShowAuditModal(true)}
          onOpenHelpModal={() => setShowHelpModal(true)}
          onConfirmLogout={() => setShowLogoutConfirm(true)}
        />
      </div>

      {/* Mobile Drawer Sidebar */}
      {mobileSidebarOpen && (
        <div className="fixed inset-y-0 left-0 z-50 lg:hidden">
          <AppSidebar
            collapsed={false}
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

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          <Outlet />
        </main>
      </div>

      {/* Logout Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showLogoutConfirm}
        onClose={() => setShowLogoutConfirm(false)}
        onConfirm={handleLogout}
        title="Keluar dari Sistem Tandara?"
        description="Sesi prototipe Anda saat ini akan diakhiri dan Anda akan dikembalikan ke halaman login."
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
            <EmptyState
              icon={ShieldCheck}
              title="Belum ada catatan audit"
              description="Seluruh perubahan data siswa, pendaftaran wajah, dan konfigurasi server akan terekam secara otomatis setelah FastAPI backend dan database SQLite aktif."
            />
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
                Nyalakan sesi absensi di menu <strong>Absensi Langsung</strong>. Kamera (DroidCam) akan mendeteksi siswa secara otomatis. Setiap kehadiran akan langsung diteruskan ke aplikasi orang tua.
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
