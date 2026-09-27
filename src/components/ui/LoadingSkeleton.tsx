/**
 * Reusable LoadingSkeleton Component
 */

import React from 'react';

interface LoadingSkeletonProps {
  lines?: number;
  type?: 'card' | 'table' | 'text' | 'chart';
  className?: string;
}

export const LoadingSkeleton: React.FC<LoadingSkeletonProps> = ({
  lines = 4,
  type = 'table',
  className = '',
}) => {
  if (type === 'card') {
    return (
      <div className={`p-6 bg-white rounded-xl border border-slate-200 animate-pulse ${className}`}>
        <div className="h-4 w-24 bg-slate-200 rounded-sm mb-3"></div>
        <div className="h-8 w-16 bg-slate-200 rounded-sm mb-2"></div>
        <div className="h-3 w-32 bg-slate-100 rounded-sm"></div>
      </div>
    );
  }

  if (type === 'chart') {
    return (
      <div className={`p-6 bg-white rounded-xl border border-slate-200 animate-pulse ${className}`}>
        <div className="h-5 w-40 bg-slate-200 rounded-sm mb-6"></div>
        <div className="h-48 w-full bg-slate-100 rounded-lg flex items-end gap-3 p-4">
          <div className="w-full bg-slate-200 h-1/3 rounded-xs"></div>
          <div className="w-full bg-slate-200 h-2/3 rounded-xs"></div>
          <div className="w-full bg-slate-200 h-1/2 rounded-xs"></div>
          <div className="w-full bg-slate-200 h-3/4 rounded-xs"></div>
          <div className="w-full bg-slate-200 h-4/5 rounded-xs"></div>
        </div>
      </div>
    );
  }

  return (
    <div className={`w-full bg-white rounded-xl border border-slate-200 p-4 space-y-3 animate-pulse ${className}`}>
      <div className="h-5 bg-slate-200 rounded-sm w-1/4 mb-4"></div>
      {Array.from({ length: lines }).map((_, idx) => (
        <div key={idx} className="flex gap-4 items-center">
          <div className="h-4 bg-slate-100 rounded-sm w-1/6"></div>
          <div className="h-4 bg-slate-200 rounded-sm w-1/4"></div>
          <div className="h-4 bg-slate-100 rounded-sm w-1/4"></div>
          <div className="h-4 bg-slate-100 rounded-sm w-1/6"></div>
          <div className="h-4 bg-slate-200 rounded-sm w-1/6"></div>
        </div>
      ))}
    </div>
  );
};
