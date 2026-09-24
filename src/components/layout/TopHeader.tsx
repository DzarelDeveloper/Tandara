/**
 * Tandara TopHeader Component
 * Desktop-first enterprise header with global search, notification center, user status, and dynamic date.
 */

import React, { useState, useRef, useEffect } from 'react';
import { Search, Bell, Menu, Shield, User as UserIcon, LogOut, Check } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';

interface TopHeaderProps {
  onToggleMobileSidebar: () => void;
  onConfirmLogout: () => void;
}

export const TopHeader: React.FC<TopHeaderProps> = ({
  onToggleMobileSidebar,
  onConfirmLogout,
}) => {
  const { session, isAdmin } = useAuth();
  const { showBackendNotConnected } = useToast();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const notifRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Close menus on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      showBackendNotConnected(`Pencarian "${searchQuery}" membutuhkan server backend.`);
    }
  };

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

  return (
    <header className="h-16 bg-white border-b border-slate-200/80 px-4 sm:px-6 flex items-center justify-between sticky top-0 z-30 shadow-2xs">
      {/* Left: Mobile Toggle & Global Search */}
      <div className="flex items-center gap-3 flex-1 max-w-lg">
        <button
          type="button"
          onClick={onToggleMobileSidebar}
          className="lg:hidden p-2 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 focus:outline-none"
          aria-label="Buka menu navigasi"
        >
          <Menu className="w-5 h-5" />
        </button>

        <form onSubmit={handleSearchSubmit} className="relative w-full max-w-sm">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari data..."
            className="w-full pl-9 pr-4 py-1.5 text-xs sm:text-sm bg-slate-50 hover:bg-slate-100/70 focus:bg-white border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors"
          />
        </form>

        <span className="hidden xl:inline-flex text-xs text-slate-400 font-medium">
          {currentDateString}
        </span>
      </div>

      {/* Right: Notifications, User Profile */}
      <div className="flex items-center gap-3">
        {/* Notifications Dropdown */}
        <div className="relative" ref={notifRef}>
          <button
            type="button"
            onClick={() => setShowNotifications((prev) => !prev)}
            aria-label="Notifikasi sistem"
            aria-expanded={showNotifications}
            className="p-2 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors focus:ring-2 focus:ring-blue-500/30 focus:outline-none"
          >
            <Bell className="w-5 h-5" />
          </button>

          {showNotifications && (
            <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg border border-slate-200 p-4 z-50 text-slate-800 animate-in fade-in-50 zoom-in-95 duration-100">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h4 className="text-sm font-semibold text-slate-900">Notifikasi Sistem</h4>
                <span className="text-[11px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                  Lokal
                </span>
              </div>
              <div className="py-4 text-center">
                <p className="text-xs text-slate-500">Belum ada notifikasi baru.</p>
                <p className="text-[11px] text-slate-400 mt-1">
                  Pemberitahuan presensi dan sistem akan muncul saat terhubung ke server.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* User Profile Pill & Dropdown */}
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
                {isAdmin ? 'Admin IT' : 'Guru / Piket'}
              </p>
            </div>
          </button>

          {showUserMenu && (
            <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-slate-200 py-1.5 z-50 animate-in fade-in-50 zoom-in-95 duration-100">
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
