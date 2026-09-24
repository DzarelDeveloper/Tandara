/**
 * Tandara Attendance Service
 * Typed for future FastAPI endpoints:
 * GET    /api/v1/attendance/today
 * GET    /api/v1/attendance/records
 * POST   /api/v1/attendance/session/start
 * POST   /api/v1/attendance/session/stop
 * POST   /api/v1/attendance/records/:id/correction
 * POST   /api/v1/attendance/reminders/send
 */

import { AttendanceRecord, AttendanceType } from '../types';
import { apiRequest } from './api';

export interface StartSessionPayload {
  mode: AttendanceType;
  cameraSource: string;
  classFilter?: string;
}

export interface AttendanceCorrectionPayload {
  recordId: string;
  newStatus: string;
  checkInTime?: string;
  checkOutTime?: string;
  reason: string;
}

export const attendanceService = {
  async getTodayAttendance(): Promise<AttendanceRecord[]> {
    // When backend is connected:
    // return await apiRequest<AttendanceRecord[]>('/api/v1/attendance/today');
    return [];
  },

  async getAttendanceRecords(filters?: Record<string, string>): Promise<AttendanceRecord[]> {
    const params = new URLSearchParams(filters);
    // return await apiRequest<AttendanceRecord[]>(`/api/v1/attendance/records?${params.toString()}`);
    return [];
  },

  async startLiveSession(payload: StartSessionPayload): Promise<{ sessionId: string; status: string }> {
    return await apiRequest('/api/v1/attendance/session/start', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async stopLiveSession(sessionId: string): Promise<void> {
    await apiRequest('/api/v1/attendance/session/stop', {
      method: 'POST',
      body: JSON.stringify({ sessionId }),
    });
  },

  async submitCorrection(payload: AttendanceCorrectionPayload): Promise<void> {
    await apiRequest(`/api/v1/attendance/records/${payload.recordId}/correction`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async sendParentReminders(): Promise<{ sentCount: number }> {
    return await apiRequest('/api/v1/attendance/reminders/send', {
      method: 'POST',
    });
  },
};
