/**
 * Tandara AppRoutes
 * Configures role-based routes, layouts, and protections.
 */

import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ProtectedRoute } from './ProtectedRoute';
import { DashboardLayout } from '../layouts/DashboardLayout';

// Auth and System Pages
import { LoginPage } from '../pages/auth/LoginPage';
import { UnauthorizedPage } from '../pages/UnauthorizedPage';
import { NotFoundPage } from '../pages/NotFoundPage';

// Admin IT Pages
import { AdminDashboardPage } from '../pages/admin/AdminDashboardPage';
import { AdminStudentsPage } from '../pages/admin/AdminStudentsPage';
import { AdminParentsPage } from '../pages/admin/AdminParentsPage';
import { AdminClassesUsersPage } from '../pages/admin/AdminClassesUsersPage';
import { AdminDevicesSystemPage } from '../pages/admin/AdminDevicesSystemPage';

// Guru / Piket Pages
import { TeacherDashboardPage } from '../pages/teacher/TeacherDashboardPage';
import { TeacherLiveAttendancePage } from '../pages/teacher/TeacherLiveAttendancePage';
import { TeacherAttendancePage } from '../pages/teacher/TeacherAttendancePage';
import { TeacherLeaveRequestsPage } from '../pages/teacher/TeacherLeaveRequestsPage';
import { TeacherReportsCorrectionsPage } from '../pages/teacher/TeacherReportsCorrectionsPage';

// Root redirect handler based on authenticated session role
const RootRedirect: React.FC = () => {
  const { session, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F7FB]">
        <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!session || !session.isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (session.role === 'ADMIN_IT') {
    return <Navigate to="/admin/dashboard" replace />;
  }

  if (session.role === 'TEACHER') {
    return <Navigate to="/teacher/dashboard" replace />;
  }

  return <Navigate to="/login" replace />;
};

export const AppRoutes: React.FC = () => {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/unauthorized" element={<UnauthorizedPage />} />

      {/* Root redirect */}
      <Route path="/" element={<RootRedirect />} />

      {/* Admin IT Protected Routes (/admin/*) */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute allowedRole="ADMIN_IT">
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/admin/dashboard" replace />} />
        <Route path="dashboard" element={<AdminDashboardPage />} />
        <Route path="students" element={<AdminStudentsPage />} />
        <Route path="parents" element={<AdminParentsPage />} />
        <Route path="classes-users" element={<AdminClassesUsersPage />} />
        <Route path="devices-system" element={<AdminDevicesSystemPage />} />
      </Route>

      {/* Teacher / Guru Piket Protected Routes (/teacher/*) */}
      <Route
        path="/teacher"
        element={
          <ProtectedRoute allowedRole="TEACHER">
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/teacher/dashboard" replace />} />
        <Route path="dashboard" element={<TeacherDashboardPage />} />
        <Route path="live-attendance" element={<TeacherLiveAttendancePage />} />
        <Route path="attendance" element={<TeacherAttendancePage />} />
        <Route path="leave-requests" element={<TeacherLeaveRequestsPage />} />
        <Route path="reports-corrections" element={<TeacherReportsCorrectionsPage />} />
      </Route>

      {/* 404 Fallback */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
};
