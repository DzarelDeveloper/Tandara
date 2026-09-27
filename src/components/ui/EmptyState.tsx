/**
 * Reusable EmptyState Component
 * Displays respectful, informative empty states without fake data.
 */

import React from 'react';
import { LucideIcon, Inbox } from 'lucide-react';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description: string;
  actionText?: string;
  onAction?: () => void;
  className?: string;
  badge?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon = Inbox,
  title,
  description,
  actionText,
  onAction,
  className = '',
  badge,
}) => {
  return (
    <div
      className={`flex flex-col items-center justify-center p-8 sm:p-12 text-center rounded-xl border border-dashed border-slate-200 bg-slate-50 ${className}`}
    >
      <div className="w-10 h-10 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500 mb-3">
        <Icon className="w-5 h-5" />
      </div>
      {badge && (
        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider bg-slate-100 border border-slate-200 px-2 py-0.5 rounded mb-2">
          {badge}
        </span>
      )}
      <h3 className="text-base font-semibold text-slate-800 mb-1">{title}</h3>
      <p className="text-sm text-slate-500 max-w-md leading-relaxed mb-4">{description}</p>
      {actionText && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors focus:ring-2 focus:ring-blue-500 focus:outline-none"
        >
          {actionText}
        </button>
      )}
    </div>
  );
};
