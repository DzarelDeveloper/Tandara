/**
 * Tandara TopHeader Component
 * Desktop-first enterprise header with global search, notification center, user status, and dynamic date.
 */

import React, { useState, useRef, useEffect } from 'react';
import { PanelLeftOpen, User as UserIcon, LogOut } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

interface TopHeaderProps {
  onToggleMobileSidebar: () => void;
  onConfirmLogout: () => void;
}

export const TopHeader: React.FC<TopHeaderProps> = ({
  onToggleMobileSidebar,
  onConfirmLogout,
}) => {
  const { session, isAdmin } = useAuth();
  const location = useLocation();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Close menus on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const currentDateString = new Intl.DateTimeFormat('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());

  const userInitials = session?.displayName
    ? session.displayName
        .split(' ')
        .map((n) => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : 'TA';

  const sectionNames: Record<string, string> = {
    '/admin/dashboard': 'Dashboard',
    '/admin/students': 'Siswa & Wajah',
    '/admin/parents': 'Orang Tua',
    '/admin/classes-users': 'Kelas & Pengguna',
    '/admin/devices-system': 'Perangkat & Sistem',
    '/teacher/dashboard': 'Dashboard',
    '/teacher/live-attendance': 'Absensi Langsung',
    '/teacher/attendance': 'Riwayat Absensi',
    '/teacher/leave-requests': 'Izin Siswa',
    '/teacher/reports-corrections': 'Laporan',
    '/parent/dashboard': 'Beranda Orang Tua',
  };

  return (
    <header className="h-14 sm:h-16 bg-white border-b border-slate-200 px-4 sm:px-5 lg:px-6 flex items-center justify-between sticky top-0 z-30">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onToggleMobileSidebar}
          title="Buka sidebar navigasi"
          aria-expanded={false}
          className="lg:hidden inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
          aria-label="Buka menu navigasi"
        >
          <PanelLeftOpen className="w-5 h-5" aria-hidden="true" />
        </button>

        <div>
          <p className="text-sm font-semibold text-slate-900">{sectionNames[location.pathname] ?? 'Tandara'}</p>
          <p className="hidden sm:block text-xs text-slate-500 mt-0.5">Tandara · Presensi Wajah</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <span className="hidden xl:block text-xs text-slate-500 font-medium pr-3 border-r border-slate-200">
          {currentDateString}
        </span>
        <div className="relative" ref={userMenuRef}>
          <button
            type="button"
            onClick={() => setShowUserMenu((prev) => !prev)}
            aria-expanded={showUserMenu}
            aria-label="Menu akun pengguna"
            className="flex items-center gap-2.5 pl-2 pr-3 py-1.5 rounded-lg hover:bg-slate-100 transition-colors focus:ring-2 focus:ring-blue-500/30 focus:outline-none"
          >
            <div className="w-8 h-8 rounded-md bg-[#2563EB] text-white font-semibold text-xs flex items-center justify-center">
              {userInitials}
            </div>
            <div className="text-left hidden md:block leading-tight">
              <p className="text-xs font-semibold text-slate-800 truncate max-w-[120px]">
                {session?.displayName || 'Pengguna'}
              </p>
              <p className="text-[11px] text-slate-500">
                {isAdmin ? 'Admin IT' : session?.role === 'PARENT' ? 'Orang Tua' : 'Guru / Piket'}
              </p>
            </div>
          </button>

          {showUserMenu && (
            <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-md border border-slate-200 py-1.5 z-50 animate-in fade-in-50 zoom-in-95 duration-100">
              <div className="px-4 py-2 border-b border-slate-100">
                <p className="text-xs font-semibold text-slate-900">{session?.displayName}</p>
                <p className="text-[11px] text-slate-500 font-mono">@{session?.username}</p>
                <span className="inline-block mt-1 text-[10px] uppercase font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                  {session?.role}
                </span>
              </div>

              <div className="py-1">
                <div className="px-4 py-2 text-xs text-slate-500 flex items-center gap-2">
                  <UserIcon className="w-3.5 h-3.5 text-slate-400" />
                  <span>Sesi Browser Lokal</span>
                </div>
              </div>

              <div className="border-t border-slate-100 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setShowUserMenu(false);
                    onConfirmLogout();
                  }}
                  className="w-full text-left px-4 py-2 text-xs text-red-600 hover:bg-red-50 flex items-center gap-2 transition-colors font-medium"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Keluar dari Sistem
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
