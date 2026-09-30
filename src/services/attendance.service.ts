/**
 * Tandara Attendance Service
 * Real FastAPI attendance, session, scan, and WebSocket integration.
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

export interface FaceScanTelemetry {
  liveness_state?: string;
  verification_path?: string;
  verification_latency_ms?: number | null;
  detection_to_attendance_ms?: number;
  frame_total_ms?: number;
  bbox?: { x: number; y: number; width: number; height: number };
  bbox_size_px?: { width: number; height: number };
  frame_size_px?: { width: number; height: number };
  detection_count?: number | null;
  candidate_count?: number;
  candidate_id?: number;
  detection_confidence?: number;
  quality_status?: string;
  recognition_status?: string;
  sharpness_metric?: number;
  recognition_similarity?: number | null;
  second_best_similarity?: number | null;
  ambiguity_margin?: number | null;
  timings_ms?: { index?: number; detection?: number; embedding?: number; matching?: number; total?: number };
}

export interface FaceScanResult {
  id: string;
  date: string;
  studentId: string;
  studentName: string;
  nis: string;
  className: string;
  mode: AttendanceType;
  status: string;
  method: 'FACE';
  similarity: number;
  faceBox: { x: number; y: number; width: number; height: number } | null;
  recordedAt: string;
  checkInTime: string | null;
  checkOutTime: string | null;
  telemetry?: FaceScanTelemetry;
}

export interface TrackedFace {
  liveness: 'LIVENESS_PENDING' | 'LIVE' | 'SPOOF_SUSPECTED';
  message?: string;
  errorCode?: string;
  trackId: number | null;
  state: 'TRACKING' | 'VERIFYING' | 'VERIFIED' | 'ATTENDED' | 'UNKNOWN';
  evidenceCount: number;
  status: string;
  quality: string | null;
  faceBox: FaceScanResult['faceBox'];
  similarity: number | null;
  studentName?: string;
  attendanceStatus?: 'RECORDED' | 'ALREADY_RECORDED' | 'NOT_RECORDED';
  telemetry?: FaceScanTelemetry;
}

export interface MultiFaceScanResult {
  livenessMode: 'PASSIVE' | 'MANUAL_ONLY';
  faces: TrackedFace[];
  attendances: FaceScanResult[];
}

export interface AttendanceSchedule {
  checkInDeadline: string;
  checkOutStart: string;
  timezone: string;
}

export const attendanceService = {
  recordManual: (studentId: string, mode: AttendanceType, reason: string) =>
    apiRequest<AttendanceRecord>('/api/attendance/manual', { method: 'POST', body: JSON.stringify({ student_id: Number(studentId), mode, reason }) }),
  getSchedule: () => apiRequest<AttendanceSchedule>('/api/attendance/settings'),
  saveSchedule: (schedule: Pick<AttendanceSchedule, 'checkInDeadline' | 'checkOutStart'>) =>
    apiRequest<AttendanceSchedule>('/api/attendance/settings', { method: 'PUT', body: JSON.stringify(schedule) }),
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
  async getSummary(): Promise<{ today:number; students:number }> { return apiRequest('/api/attendance/summary'); },

  async startLiveSession(payload: StartSessionPayload): Promise<{ sessionId: string; mode: AttendanceType; status: string }> {
    const data = await apiRequest<{ id: string; mode: AttendanceType; status: string }>('/api/attendance-sessions/open', {
      method: 'POST',
      body: JSON.stringify({ mode: payload.mode, camera_source: payload.cameraSource }),
    });
    return { sessionId: data.id, mode: data.mode, status: data.status };
  },

  async stopLiveSession(sessionId: string): Promise<void> {
    await apiRequest(`/api/attendance-sessions/${sessionId}/close`, { method: 'POST' });
  },

  async scanFrame(sessionId: string, frame: Blob, signal?: AbortSignal): Promise<MultiFaceScanResult> {
    const body = new FormData();
    body.append('session_id', sessionId);
    body.append('image', frame, 'frame.jpg');
    return apiRequest<MultiFaceScanResult>('/api/attendance/scan', { method: 'POST', body, signal });
  },

  async submitCorrection(payload: AttendanceCorrectionPayload): Promise<void> {
    await apiRequest(`/api/attendance/${payload.recordId}/correction`, {
      method: 'PATCH', body: JSON.stringify({ status: payload.newStatus, notes: payload.reason, check_in_time: payload.checkInTime, check_out_time: payload.checkOutTime }),
    });
  },
};
