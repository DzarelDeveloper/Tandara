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
import { ACCESS_TOKEN_KEY, API_BASE_URL, apiRequest } from './api';

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
  subscribe(onEvent: (event: { event: string; timestamp: string; data: Record<string, unknown> }) => void): () => void {
    const token = localStorage.getItem(ACCESS_TOKEN_KEY);
    const endpoint = API_BASE_URL.replace(/^http/, 'ws') + `/ws/attendance${token ? `?token=${encodeURIComponent(token)}` : ''}`;
    const socket = new WebSocket(endpoint);
    socket.onmessage = ({ data }) => onEvent(JSON.parse(data));
    return () => socket.close();
  },
  async getTodayAttendance(): Promise<AttendanceRecord[]> {
    return apiRequest<AttendanceRecord[]>('/api/attendance?today=true');
  },

  async getAttendanceRecords(filters?: Record<string, string>): Promise<AttendanceRecord[]> {
    const params = new URLSearchParams(filters);
    return apiRequest<AttendanceRecord[]>(`/api/attendance?${params.toString()}`);
  },

  async startLiveSession(payload: StartSessionPayload): Promise<{ sessionId: string; status: string }> {
    const data = await apiRequest<{ id: string; status: string }>('/api/attendance-sessions/open', {
      method: 'POST',
      body: JSON.stringify({ mode: payload.mode, camera_source: payload.cameraSource }),
    });
    return { sessionId: data.id, status: data.status };
  },

  async stopLiveSession(sessionId: string): Promise<void> {
    await apiRequest(`/api/attendance-sessions/${sessionId}/close`, { method: 'POST' });
  },

  async submitCorrection(payload: AttendanceCorrectionPayload): Promise<void> {
    await apiRequest(`/api/attendance/${payload.recordId}/correction`, {
      method: 'PATCH', body: JSON.stringify({ status: payload.newStatus, notes: payload.reason, check_in_time: payload.checkInTime, check_out_time: payload.checkOutTime }),
    });
  },

  async sendParentReminders(): Promise<{ sentCount: number }> {
    return await apiRequest('/api/attendance/reminders/send', {
      method: 'POST',
    });
  },
};
