/**
 * Tandara AppSidebar Component
 * Deep navy background (#0F1F3D) with role-specific menu items and collapsible behavior.
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
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { TandaraLogo } from '../ui/TandaraLogo';

interface AppSidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  onItemClick?: () => void;
  onOpenAuditModal?: () => void;
  onOpenHelpModal?: () => void;
  onConfirmLogout: () => void;
}

export const AppSidebar: React.FC<AppSidebarProps> = ({
  collapsed,
  onToggleCollapse,
  onItemClick,
  onOpenAuditModal,
  onOpenHelpModal,
  onConfirmLogout,
}) => {
  const { isAdmin } = useAuth();

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
    { label: 'Kehadiran Siswa', path: '/teacher/attendance', icon: ClipboardCheck },
    { label: 'Pengajuan Izin', path: '/teacher/leave-requests', icon: FileClock },
    { label: 'Laporan & Koreksi', path: '/teacher/reports-corrections', icon: FileText },
  ];

  const navItems = isAdmin ? adminNav : teacherNav;

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-40 bg-[#0F1F3D] text-slate-300 transition-all duration-200 flex flex-col justify-between border-r border-[#1a2d52] ${
        collapsed ? 'w-20' : 'w-64'
      }`}
    >
      {/* Top Header & Logo */}
      <div>
        <div className="h-16 px-4 flex items-center justify-between border-b border-[#1a2d52]">
          <TandaraLogo
            size={collapsed ? 'sm' : 'md'}
            showText={!collapsed}
            light={true}
          />
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={collapsed ? 'Perluas bilah navigasi' : 'Ciutkan bilah navigasi'}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors"
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        {/* Role Badge */}
        {!collapsed && (
          <div className="px-5 py-3 bg-[#0a162d]/70 border-b border-[#152542] flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Peran Aktif
            </span>
            <span
              className={`text-xs px-2.5 py-0.5 rounded-md font-medium ${
                isAdmin
                  ? 'bg-blue-950 text-blue-300 border border-blue-800'
                  : 'bg-teal-950 text-teal-300 border border-teal-800'
              }`}
            >
              {isAdmin ? 'Admin IT' : 'Guru / Piket'}
            </span>
          </div>
        )}

        {/* Navigation Items */}
        <nav aria-label="Navigasi Utama" className="p-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={onItemClick}
                title={collapsed ? item.label : undefined}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-[#2563EB] text-white'
                      : 'text-slate-300 hover:bg-[#1a2d52] hover:text-white'
                  } ${collapsed ? 'justify-center px-0' : ''}`
                }
              >
                <Icon className="w-5 h-5 shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </NavLink>
            );
          })}
        </nav>
      </div>

      {/* Bottom Actions */}
      <div className="p-3 border-t border-[#1a2d52] space-y-1">
        {isAdmin ? (
          <button
            type="button"
            onClick={onOpenAuditModal}
            title={collapsed ? 'Audit Log' : undefined}
            className={`w-full flex items-center gap-3 px-3.5 py-2 rounded-lg text-xs font-medium text-slate-300 hover:bg-[#1a2d52] hover:text-white transition-colors ${
              collapsed ? 'justify-center px-0' : ''
            }`}
          >
            <ShieldCheck className="w-4 h-4 text-teal-400 shrink-0" />
            {!collapsed && <span>Audit Log</span>}
          </button>
        ) : (
          <button
            type="button"
            onClick={onOpenHelpModal}
            title={collapsed ? 'Bantuan' : undefined}
            className={`w-full flex items-center gap-3 px-3.5 py-2 rounded-lg text-xs font-medium text-slate-300 hover:bg-[#1a2d52] hover:text-white transition-colors ${
              collapsed ? 'justify-center px-0' : ''
            }`}
          >
            <HelpCircle className="w-4 h-4 text-teal-400 shrink-0" />
            {!collapsed && <span>Bantuan</span>}
          </button>
        )}

        <button
          type="button"
          onClick={onConfirmLogout}
          title={collapsed ? 'Keluar' : undefined}
          className={`w-full flex items-center gap-3 px-3.5 py-2 rounded-lg text-xs font-medium text-red-400 hover:bg-red-950/40 hover:text-red-300 transition-colors ${
            collapsed ? 'justify-center px-0' : ''
          }`}
        >
          <LogOut className="w-4 h-4 shrink-0" />
          {!collapsed && <span>Keluar</span>}
        </button>
      </div>
    </aside>
  );
};
