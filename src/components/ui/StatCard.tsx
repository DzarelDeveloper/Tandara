import React from 'react';
import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: React.ReactNode;
  icon: LucideIcon;
  iconClassName?: string;
  helper?: string;
}

export const StatCard: React.FC<StatCardProps> = ({ label, value, icon: Icon, iconClassName = 'text-blue-600', helper }) => (
  <article className="bg-white border border-slate-200 rounded-xl p-4 lg:p-5 flex items-start justify-between gap-3 min-w-0">
    <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="text-[28px] leading-none font-bold tabular-nums text-[#172033] mt-2.5">{value}</p>{helper && <p className="text-xs text-slate-500 mt-1.5">{helper}</p>}</div>
    <Icon className={`w-5 h-5 shrink-0 ${iconClassName}`} />
  </article>
);
