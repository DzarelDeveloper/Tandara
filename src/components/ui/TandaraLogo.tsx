/**
 * Tandara Logo Component
 * A consistent logo mark representing a face-scan frame combined with an attendance checkmark.
 */

import React from 'react';

interface TandaraLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
  light?: boolean;
}

export const TandaraLogo: React.FC<TandaraLogoProps> = ({
  className = '',
  size = 'md',
  showText = true,
  light = false,
}) => {
  const iconSizeClasses = {
    sm: 'w-7 h-7',
    md: 'w-9 h-9',
    lg: 'w-11 h-11',
  };

  const textClasses = {
    sm: 'text-base font-bold tracking-tight',
    md: 'text-xl font-bold tracking-tight',
    lg: 'text-2xl font-extrabold tracking-tight',
  };

  return (
    <div className={`flex items-center gap-2.5 select-none ${className}`}>
      {/* Face Scan + Checkmark Emblem */}
      <div
        className={`${iconSizeClasses[size]} relative flex items-center justify-center rounded-lg bg-[#2563EB] text-white shrink-0`}
        aria-hidden="true"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-3/5 h-3/5"
        >
          {/* Face scan corner brackets */}
          <path d="M3 7V5a2 2 0 0 1 2-2h2" />
          <path d="M17 3h2a2 2 0 0 1 2 2v2" />
          <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
          <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
          {/* Checkmark in center */}
          <polyline points="8 12 11 15 16 9" strokeWidth="2.5" />
        </svg>
      </div>

      {showText && (
        <div className="flex flex-col leading-none">
          <div className="flex items-center">
            <span
              className={`${textClasses[size]} ${
                light ? 'text-white' : 'text-slate-900'
              }`}
            >
              Tandara
            </span>
          </div>
          <span
            className={`text-[10px] uppercase font-semibold tracking-wider mt-0.5 ${
              light ? 'text-slate-400' : 'text-slate-500'
            }`}
          >
            Presensi Wajah
          </span>
        </div>
      )}
    </div>
  );
};
