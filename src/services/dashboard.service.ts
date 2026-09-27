import { apiRequest } from './api';
import { AttendanceRecord } from '../types';

export interface AdminDashboardStats { activeStudents:number; activeClasses:number; activeDutyTeachers:number; facesRegistered:number; facesUnregistered:number; presentToday:number; lateToday:number; pendingLeaves:number; activeSessions:number; }
export interface TeacherDashboardStats { presentToday:number; lateToday:number; excusedToday:number; notPresent:number; faceEngine:string; session: { id:string; mode:string; cameraSource:string; status:string } | null; recentAttendance: AttendanceRecord[]; }
export const dashboardService = {
  admin: () => apiRequest<AdminDashboardStats>('/api/dashboard/admin'),
  teacher: () => apiRequest<TeacherDashboardStats>('/api/dashboard/teacher'),
};
