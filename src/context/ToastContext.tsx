/**
 * Tandara Toast Context & Notification System
 * Used across the dashboard to inform user of backend readiness, warnings, and alerts.
 */

import React, { createContext, useContext, useState, useCallback } from 'react';
import { AlertCircle, CheckCircle2, Info, X, XCircle } from 'lucide-react';

export type ToastType = 'info' | 'success' | 'warning' | 'error';

export interface ToastItem {
  id: string;
  type: ToastType;
  title?: string;
  message: string;
  duration?: number;
}

interface ToastContextType {
  toasts: ToastItem[];
  showToast: (toast: Omit<ToastItem, 'id'>) => void;
  showBackendNotConnected: (customMsg?: string) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    ({ type, title, message, duration = 4500 }: Omit<ToastItem, 'id'>) => {
      const id = Math.random().toString(36).substring(2, 9);
      setToasts((prev) => [...prev, { id, type, title, message, duration }]);

      if (duration > 0) {
        setTimeout(() => {
          removeToast(id);
        }, duration);
      }
    },
    [removeToast]
  );

  const showBackendNotConnected = useCallback(
    (customMsg?: string) => {
      showToast({
        type: 'warning',
        title: 'Backend Belum Terhubung',
        message: customMsg || 'Backend belum terhubung. Data belum dapat disimpan.',
        duration: 5000,
      });
    },
    [showToast]
  );

  return (
    <ToastContext.Provider value={{ toasts, showToast, showBackendNotConnected, removeToast }}>
      {children}
      {/* Toast container */}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-md w-full pointer-events-none px-4 sm:px-0">
        {toasts.map((toast) => {
          let bg = 'bg-white border-slate-200 text-slate-800 shadow-md';
          let Icon = Info;
          let iconColor = 'text-blue-600';

          if (toast.type === 'warning') {
            bg = 'bg-amber-50 border-amber-200 text-amber-950 shadow-md';
            Icon = AlertCircle;
            iconColor = 'text-amber-600';
          } else if (toast.type === 'error') {
            bg = 'bg-red-50 border-red-200 text-red-950 shadow-md';
            Icon = XCircle;
            iconColor = 'text-red-600';
          } else if (toast.type === 'success') {
            bg = 'bg-emerald-50 border-emerald-200 text-emerald-950 shadow-md';
            Icon = CheckCircle2;
            iconColor = 'text-emerald-600';
          }

          return (
            <div
              key={toast.id}
              role="alert"
              className={`pointer-events-auto flex items-start gap-3 p-4 rounded-xl border transition-all duration-200 ${bg}`}
            >
              <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${iconColor}`} />
              <div className="flex-1 text-sm">
                {toast.title && <h5 className="font-semibold mb-0.5 leading-snug">{toast.title}</h5>}
                <p className="text-xs text-slate-600 leading-relaxed">{toast.message}</p>
              </div>
              <button
                type="button"
                onClick={() => removeToast(toast.id)}
                aria-label="Tutup notifikasi"
                className="text-slate-400 hover:text-slate-600 p-1 rounded-md transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
