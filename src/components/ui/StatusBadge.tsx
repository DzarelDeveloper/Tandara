/**
 * Reusable StatusBadge
 * Never relies on color alone; always combines icon and text.
 */

import React from 'react';
import {
  CheckCircle2,
  Clock,
  AlertCircle,
  HelpCircle,
  XCircle,
  MinusCircle,
  ShieldCheck,
  ShieldAlert,
  ServerOff,
} from 'lucide-react';
import { AttendanceStatus, LeaveStatus } from '../../types';

interface StatusBadgeProps {
  status:
    | AttendanceStatus
    | LeaveStatus
    | 'ACTIVE'
    | 'INACTIVE'
    | 'PENDING_ACTIVATION'
    | 'REGISTERED'
    | 'UNREGISTERED'
    | 'DISCONNECTED'
    | 'WAITING_INTEGRATION'
    | string;
  size?: 'sm' | 'md';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'sm' }) => {
  const sizeClasses = size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-xs px-2.5 py-1';

  switch (status) {
    case 'PRESENT':
      return (
        <span className={`inline-flex items-center gap-1.5 font-medium rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 ${sizeClasses}`}>
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
          Hadir
        </span>
      );
    case 'LATE':
      return (
        <span className={`inline-flex items-center gap-1.5 font-medium rounded-md bg-amber-50 text-amber-800 border border-amber-200 ${sizeClasses}`}>
          <Clock className="w-3.5 h-3.5 text-amber-700" />
          Terlambat
        </span>
      );
    case 'SICK':
      return (
        <span className={`inline-flex items-center gap-1.5 font-medium rounded-md bg-blue-50 text-blue-800 border border-blue-200 ${sizeClasses}`}>
          <AlertCircle className="w-3.5 h-3.5 text-blue-700" />
          Sakit
        </span>
      );
    case 'PERMISSION':
      return (
        <span className={`inline-flex items-center gap-1.5 font-medium rounded-md bg-teal-50 text-teal-800 border border-teal-200 ${sizeClasses}`}>
          <HelpCircle className="w-3.5 h-3.5 text-teal-700" />
          Izin
        </span>
      );
    case 'UNEXCUSED':
      return (
        <span className={`inline-flex items-center gap-1.5 font-medium rounded-md bg-red-50 text-red-800 border border-red-200 ${sizeClasses}`}>
          <XCircle className="w-3.5 h-3.5 text-red-700" />
          Alpa / Belum Hadir
        </span>
      );
    case 'APPROVED':
      return (
        <span className={`inline-flex items-center gap-1.5 font-medium rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 ${sizeClasses}`}>
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
          Disetujui
        </span>
      );
    case 'REJECTED':
      return (
        <span className={`inline-flex items-center gap-1.5 font-medium rounded-md bg-red-50 text-red-800 border border-red-200 ${sizeClasses}`}>
          <XCircle className="w-3.5 h-3.5 text-red-700" />
          Ditolak
        </span>
      );
    case 'PENDING':
    case 'PENDING_ACTIVATION':
      return (
        <span className={`inline-flex items-center gap-1.5 font-medium rounded-md bg-amber-50 text-amber-800 border border-amber-200 ${sizeClasses}`}>
          <Clock className="w-3.5 h-3.5 text-amber-700" />
          Menunggu
        </span>
      );
    case 'ACTIVE':
      return (
        <span className={`inline-flex items-center gap-1.5 font-medium rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 ${sizeClasses}`}>
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
          Aktif
        </span>
      );
    case 'INACTIVE':
      return (
        <span className={`inline-flex items-center gap-1.5 font-medium rounded-md bg-slate-100 text-slate-700 border border-slate-200 ${sizeClasses}`}>
          <MinusCircle className="w-3.5 h-3.5 text-slate-500" />
          Nonaktif
        </span>
      );
    case 'REGISTERED':
      return (
        <span className={`inline-flex items-center gap-1.5 font-medium rounded-md bg-teal-50 text-teal-800 border border-teal-200 ${sizeClasses}`}>
          <ShieldCheck className="w-3.5 h-3.5 text-teal-700" />
          Terdaftar
        </span>
      );
    case 'UNREGISTERED':
      return (
        <span className={`inline-flex items-center gap-1.5 font-medium rounded-md bg-amber-50 text-amber-800 border border-amber-200 ${sizeClasses}`}>
          <ShieldAlert className="w-3.5 h-3.5 text-amber-700" />
          Belum Terdaftar
        </span>
      );
    case 'DISCONNECTED':
    case 'Belum terhubung':
      return (
        <span className={`inline-flex items-center gap-1.5 font-medium rounded-md bg-slate-50 text-slate-700 border border-slate-200 ${sizeClasses}`}>
          <ServerOff className="w-3.5 h-3.5 text-slate-500" />
          Belum terhubung
        </span>
      );
    case 'WAITING_INTEGRATION':
    case 'Menunggu integrasi':
      return (
        <span className={`inline-flex items-center gap-1.5 font-medium rounded-md bg-slate-50 text-slate-700 border border-slate-200 ${sizeClasses}`}>
          Menunggu integrasi
        </span>
      );
    default:
      return (
        <span className={`inline-flex items-center gap-1.5 font-medium rounded-md bg-slate-50 text-slate-700 border border-slate-200 ${sizeClasses}`}>
          {status}
        </span>
      );
  }
};
