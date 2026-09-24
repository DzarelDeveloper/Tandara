import { apiRequest } from './api';

export interface AdminDashboardStats { activeStudents:number; activeClasses:number; activeDutyTeachers:number; facesRegistered:number; facesUnregistered:number; presentToday:number; lateToday:number; pendingLeaves:number; activeSessions:number; }
export interface TeacherDashboardStats { presentToday:number; lateToday:number; excusedToday:number; notPresent:number; faceEngine:'NOT_CONFIGURED'; session: { id:string; mode:string; status:string } | null; }
export const dashboardService = {
  admin: () => apiRequest<AdminDashboardStats>('/api/dashboard/admin'),
  teacher: () => apiRequest<TeacherDashboardStats>('/api/dashboard/teacher'),
};
