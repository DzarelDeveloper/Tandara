/**
 * Tandara ProtectedRoute
 * Enforces client-side authentication and role-based access control.
 * Security Note: Client-side routing guards are for UX; real endpoints must validate JWT/session tokens on FastAPI backend.
 */

import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Role } from '../types';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRole?: Role;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRole }) => {
  const { session, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F7FB]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-xs font-medium text-slate-500">Memeriksa sesi pengguna...</p>
        </div>
      </div>
    );
  }

  // Not authenticated -> redirect to login
  if (!session || !session.isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Role mismatch -> redirect to unauthorized page
  if (allowedRole && session.role !== allowedRole) {
    return <Navigate to="/unauthorized" replace />;
  }

  return <>{children}</>;
};
