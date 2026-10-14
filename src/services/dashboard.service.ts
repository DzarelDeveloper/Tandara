import { apiRequest } from './api';
import { AttendanceRecord } from '../types';

export interface AdminDashboardStats { activeStudents:number; activeClasses:number; activeDutyTeachers:number; facesRegistered:number; facesUnregistered:number; presentToday:number; lateToday:number; pendingLeaves:number; activeSessions:number; }
export interface TeacherDashboardStats { presentToday:number; lateToday:number; excusedToday:number; notPresent:number; faceEngine:string; session: { id:string; mode:string; cameraSource:string; status:string } | null; recentAttendance: AttendanceRecord[]; }

const emptyTeacherDashboardStats = (): TeacherDashboardStats => ({
  presentToday: 0,
  lateToday: 0,
  excusedToday: 0,
  notPresent: 0,
  faceEngine: '',
  session: null,
  recentAttendance: [],
});

function countField(value: unknown, field: string): number {
  if (value === undefined || value === null) return 0;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`Respons statistik tidak valid: ${field}.`);
  }
  return value;
}

function normalizeTeacherDashboardStats(value: unknown): TeacherDashboardStats {
  if (value === null || value === undefined) return emptyTeacherDashboardStats();
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Respons statistik dashboard tidak valid.');
  }
  const data = value as Record<string, unknown>;
  const recentAttendance = data.recentAttendance ?? [];
  if (!Array.isArray(recentAttendance)) {
    throw new Error('Respons aktivitas absensi tidak valid.');
  }
  const session = data.session ?? null;
  if (session !== null && (typeof session !== 'object' || Array.isArray(session))) {
    throw new Error('Respons sesi absensi tidak valid.');
  }
  let normalizedSession: TeacherDashboardStats['session'] = null;
  if (session !== null) {
    const candidate = session as Record<string, unknown>;
    if (!['id', 'mode', 'cameraSource', 'status'].every((field) => typeof candidate[field] === 'string')) {
      throw new Error('Respons sesi absensi tidak valid.');
    }
    normalizedSession = {
      id: candidate.id as string,
      mode: candidate.mode as string,
      cameraSource: candidate.cameraSource as string,
      status: candidate.status as string,
    };
  }
  return {
    presentToday: countField(data.presentToday, 'Hadir'),
    lateToday: countField(data.lateToday, 'Terlambat'),
    excusedToday: countField(data.excusedToday, 'Izin/Sakit'),
    notPresent: countField(data.notPresent, 'Belum Hadir'),
    faceEngine: typeof data.faceEngine === 'string' ? data.faceEngine : '',
    session: normalizedSession,
    recentAttendance: recentAttendance as AttendanceRecord[],
  };
}

export const dashboardService = {
  admin: () => apiRequest<AdminDashboardStats>('/api/dashboard/admin'),
  teacher: async (attendanceDate: string, signal?: AbortSignal) => {
    const data = await apiRequest<unknown>(`/api/dashboard/teacher?attendance_date=${encodeURIComponent(attendanceDate)}`, { signal });
    return normalizeTeacherDashboardStats(data);
  },
};
