/**
 * PageHeader Component
 * Provides clean desktop title, descriptive subtitle, breadcrumb, and action buttons.
 */

import React from 'react';
import { ChevronRight } from 'lucide-react';

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  breadcrumbs?: BreadcrumbItem[];
  actions?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  breadcrumbs,
  actions,
}) => {
  return (
    <div className="mb-5 flex flex-col md:flex-row md:items-end md:justify-between gap-3">
      <div>
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-slate-500 mb-2">
            {breadcrumbs.map((crumb, idx) => (
              <React.Fragment key={idx}>
                {idx > 0 && <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
                {crumb.href ? (
                  <span className="hover:text-slate-800 transition-colors">{crumb.label}</span>
                ) : (
                  <span className="text-slate-700 font-medium">{crumb.label}</span>
                )}
              </React.Fragment>
            ))}
          </nav>
        )}
        <h1 className="text-2xl md:text-[27px] font-bold tracking-tight text-[#172033] leading-tight">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500 mt-1 leading-normal">{subtitle}</p>}
      </div>

      {actions && <div className="flex items-center gap-2.5 flex-wrap">{actions}</div>}
    </div>
  );
};
