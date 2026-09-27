/**
 * Tandara AppSidebar Component
 * Bright Tandara-blue navigation with persistent labels on desktop.
 */

import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  HeartHandshake,
  School,
  Cpu,
  Video,
  ClipboardCheck,
  FileText,
  FileClock,
  ShieldCheck,
  HelpCircle,
  LogOut,
  X,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { TandaraLogo } from '../ui/TandaraLogo';

interface AppSidebarProps {
  collapsed?: boolean;
  mobile?: boolean;
  onToggleCollapse: () => void;
  onItemClick?: () => void;
  onOpenAuditModal?: () => void;
  onOpenHelpModal?: () => void;
  onConfirmLogout: () => void;
}

export const AppSidebar: React.FC<AppSidebarProps> = ({
  collapsed = false,
  mobile = false,
  onToggleCollapse,
  onItemClick,
  onOpenAuditModal,
  onOpenHelpModal,
  onConfirmLogout,
}) => {
  const { isAdmin, session } = useAuth();

  const adminNav = [
    { label: 'Dashboard', path: '/admin/dashboard', icon: LayoutDashboard },
    { label: 'Siswa & Wajah', path: '/admin/students', icon: Users },
    { label: 'Orang Tua', path: '/admin/parents', icon: HeartHandshake },
    { label: 'Kelas & Pengguna', path: '/admin/classes-users', icon: School },
    { label: 'Perangkat & Sistem', path: '/admin/devices-system', icon: Cpu },
  ];

  const teacherNav = [
    { label: 'Dashboard', path: '/teacher/dashboard', icon: LayoutDashboard },
    { label: 'Absensi Langsung', path: '/teacher/live-attendance', icon: Video },
    { label: 'Riwayat Absensi', path: '/teacher/attendance', icon: ClipboardCheck },
    { label: 'Izin Siswa', path: '/teacher/leave-requests', icon: FileClock },
    { label: 'Laporan', path: '/teacher/reports-corrections', icon: FileText },
  ];
  const parentNav = [{ label: 'Dashboard', path: '/parent/dashboard', icon: LayoutDashboard }];

  const isParent = session?.role === 'PARENT';
  const navItems = isAdmin ? adminNav : isParent ? parentNav : teacherNav;
  const compact = collapsed && !mobile;
  const toggleLabel = mobile ? 'Tutup sidebar' : compact ? 'Buka sidebar' : 'Tutup sidebar';

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-40 bg-[#2463EB] text-white flex flex-col justify-between transition-[width] duration-200 ${collapsed && !mobile ? 'w-[72px]' : 'w-56'}`}
    >
      {/* Top Header & Logo */}
      <div>
        <div className={`relative h-16 flex border-b border-white/15 ${compact ? 'items-center justify-center px-2' : 'items-center justify-between px-4'}`}>
          <TandaraLogo
            size={compact ? 'sm' : 'md'}
            showText={!compact}
            light={true}
          />
          <button
            type="button"
            onClick={onToggleCollapse}
            autoFocus={mobile}
            aria-expanded={mobile ? true : !collapsed}
            aria-label={toggleLabel}
            title={toggleLabel}
            className={`${compact ? 'absolute -right-3.5 top-1/2 h-7 w-7 -translate-y-1/2 rounded-full border border-white/80 bg-[#2463EB] text-white shadow-sm hover:bg-[#1D4ED8]' : 'h-8 w-8 rounded-lg text-blue-100 hover:bg-white/10 hover:text-white'} inline-flex shrink-0 items-center justify-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#2463EB]`}
          >
            {mobile ? <X className="w-5 h-5" aria-hidden="true" /> : compact ? <ChevronRight className="w-5 h-5" strokeWidth={2.5} aria-hidden="true" /> : <ChevronLeft className="w-5 h-5" strokeWidth={2.5} aria-hidden="true" />}
          </button>
        </div>

        {/* Role Badge */}
          {!collapsed || mobile ? <div className="px-4 py-3 border-b border-white/15 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-100">
              Peran Aktif
            </span>
            <span
              className="text-xs px-2.5 py-1 rounded-md font-semibold bg-white/15 text-white"
            >
              {isAdmin ? 'Admin IT' : isParent ? 'Orang Tua' : 'Guru / Piket'}
            </span>
          </div> : null}

        {/* Navigation Items */}
        {!compact ? <p className="px-4 pt-4 pb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-blue-100">Main</p> : <div className="h-4" />}
        <nav aria-label="Navigasi Utama" className="px-2.5 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={onItemClick}
                title={compact ? item.label : undefined}
                aria-label={compact ? item.label : undefined}
                className={({ isActive }) =>
                  `flex items-center gap-3 min-h-10 rounded-lg text-sm font-semibold transition-colors ${compact ? 'justify-center px-2' : 'px-3 py-2.5'} ${
                    isActive
                      ? 'bg-white text-[#1D4ED8]'
                      : 'text-blue-50 hover:bg-white/12 hover:text-white'
                  }`
                }
              >
                <Icon className="w-5 h-5 shrink-0" />
                {!compact && <span className="truncate whitespace-nowrap overflow-hidden">{item.label}</span>}
              </NavLink>
            );
          })}
        </nav>
      </div>

      {/* Bottom Actions */}
      <div className="p-2.5 border-t border-white/15 space-y-1">
        {!compact && <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-blue-100">{isAdmin ? 'System' : 'Account'}</p>}
        {isAdmin ? (
          <button
            type="button"
            onClick={onOpenAuditModal}
            title={compact ? 'Audit Log' : undefined}
            aria-label="Audit Log"
            className={`w-full min-h-10 flex items-center gap-3 rounded-lg text-sm font-medium text-blue-50 hover:bg-white/10 hover:text-white transition-colors ${compact ? 'justify-center px-2' : 'px-3 py-2.5'}`}
          >
            <ShieldCheck className="w-4 h-4 shrink-0" />
            {!compact && <span className="whitespace-nowrap">Audit Log</span>}
          </button>
        ) : (
          <button
            type="button"
            onClick={onOpenHelpModal}
            title={compact ? 'Bantuan' : undefined}
            aria-label="Bantuan"
            className={`w-full min-h-10 flex items-center gap-3 rounded-lg text-sm font-medium text-blue-50 hover:bg-white/10 hover:text-white transition-colors ${compact ? 'justify-center px-2' : 'px-3 py-2.5'}`}
          >
            <HelpCircle className="w-4 h-4 shrink-0" />
            {!compact && <span className="whitespace-nowrap">Bantuan</span>}
          </button>
        )}

        <button
          type="button"
          onClick={onConfirmLogout}
          title={compact ? 'Keluar' : undefined}
          aria-label="Keluar"
          className={`w-full min-h-10 flex items-center gap-3 rounded-lg text-sm font-medium text-white hover:bg-white/10 transition-colors ${compact ? 'justify-center px-2' : 'px-3 py-2.5'}`}
        >
          <LogOut className="w-4 h-4 shrink-0" />
          {!compact && <span className="whitespace-nowrap">Keluar</span>}
        </button>
      </div>
    </aside>
  );
};
