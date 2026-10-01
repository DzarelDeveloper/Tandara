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
  liveness_signals?: {
    samples?: number;
    span_ms?: number;
    pose_range?: number;
    geometry_range?: number;
    coherent?: boolean;
    plausible?: boolean;
    reason?: string;
  };
  evidence_count?: number;
  verification_path?: string;
  verification_latency_ms?: number | null;
  detection_to_attendance_ms?: number;
  frame_total_ms?: number;
  decode_ms?: number;
  quality_ms?: number;
  tracking_ms?: number;
  temporal_ms?: number;
  liveness_ms?: number;
  backend_total_ms?: number;
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
  timings_ms?: { index?: number; detection?: number; quality?: number; embedding?: number; matching?: number; tracking?: number; temporal?: number; liveness?: number; decode?: number; attendance_write?: number; realtime_publish?: number; backend_total?: number; total?: number };
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
  livenessState: 'LIVENESS_PENDING' | 'LIVE' | 'SPOOF_SUSPECTED';
  message?: string;
  errorCode?: string;
  trackId: number | null;
  recognitionStatus: string;
  trackState: 'TRACKING' | 'VERIFYING' | 'VERIFIED' | 'ATTENDED' | 'UNKNOWN';
  state: 'TRACKING' | 'VERIFYING' | 'VERIFIED' | 'ATTENDED' | 'UNKNOWN';
  evidenceCount: number;
  status: string;
  quality: string | null;
  faceBox: FaceScanResult['faceBox'];
  similarity: number | null;
  studentName?: string;
  attendanceStatus?: 'RECORDED' | 'ALREADY_RECORDED' | 'NOT_RECORDED';
  benchmarkReady?: boolean;
  telemetry?: FaceScanTelemetry;
}

export interface MultiFaceScanResult {
  livenessMode: 'PASSIVE' | 'MANUAL_ONLY';
  benchmarkMode?: boolean;
  faces: TrackedFace[];
  attendances: FaceScanResult[];
}

export interface AttendanceSchedule {
  checkInDeadline: string;
  checkOutStart: string;
  timezone: string;
}

type AttendanceEventHandler = (event: { event: string; timestamp: string; data: Record<string, unknown> }) => void;
type DisconnectHandler = (firstDisconnect: boolean) => void;

interface AttendanceSocketSubscription {
  unsubscribe: () => void;
  onDisconnect: (handler: DisconnectHandler) => void;
}

interface SocketHolder {
  socket: WebSocket | null;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  currentDelayMs: number;
  subscriptions: Map<number, { onEvent: AttendanceEventHandler; onDisconnect: DisconnectHandler | null }>;
  nextSubId: number;
  closed: boolean;
  hasDisconnected: boolean;
}

const RECONNECT_MIN_MS = 1000;
const RECONNECT_MAX_MS = 30000;

const holder: SocketHolder = {
  socket: null,
  reconnectTimer: null,
  currentDelayMs: RECONNECT_MIN_MS,
  subscriptions: new Map(),
  nextSubId: 1,
  closed: false,
  hasDisconnected: false,
};

function broadcastToSubscribers(message: { event: string; timestamp: string; data: Record<string, unknown> }) {
  for (const { onEvent } of holder.subscriptions.values()) {
    try { onEvent(message); } catch { /* per-callback errors must not break the loop */ }
  }
}

function notifyDisconnect(firstDisconnect: boolean) {
  for (const { onDisconnect } of holder.subscriptions.values()) {
    if (onDisconnect) {
      try { onDisconnect(firstDisconnect); } catch { /* noop */ }
    }
  }
}

function clearReconnectTimer() {
  if (holder.reconnectTimer) {
    clearTimeout(holder.reconnectTimer);
    holder.reconnectTimer = null;
  }
}

function scheduleReconnect() {
  clearReconnectTimer();
  if (holder.closed || holder.subscriptions.size === 0) return;
  const delay = holder.currentDelayMs;
  holder.currentDelayMs = Math.min(RECONNECT_MAX_MS, holder.currentDelayMs * 2);
  holder.reconnectTimer = setTimeout(() => {
    holder.reconnectTimer = null;
    connect();
  }, delay);
}

function connect() {
  if (holder.closed || holder.socket !== null) return;
  const token = localStorage.getItem(ACCESS_TOKEN_KEY);
  if (!token) return;
  const endpoint = API_BASE_URL.replace(/^http/, 'ws') + `/ws/attendance?token=${encodeURIComponent(token)}`;
  let opened = false;
  const socket = new WebSocket(endpoint);
  holder.socket = socket;
  socket.onopen = () => {
    opened = true;
    holder.currentDelayMs = RECONNECT_MIN_MS;
    if (holder.hasDisconnected) {
      notifyDisconnect(false);
    }
  };
  socket.onmessage = ({ data }) => {
    try {
      const parsed = JSON.parse(data);
      if (parsed && typeof parsed === 'object' && typeof parsed.event === 'string') {
        broadcastToSubscribers(parsed);
      }
    } catch { /* ignore malformed payloads silently */ }
  };
  const handleEnd = () => {
    if (holder.socket === socket) {
      holder.socket = null;
    }
    if (opened || holder.hasDisconnected) {
      const first = !holder.hasDisconnected;
      holder.hasDisconnected = true;
      if (first) notifyDisconnect(true);
    }
    if (!holder.closed) scheduleReconnect();
  };
  socket.onclose = handleEnd;
  socket.onerror = handleEnd;
}

function teardownSocket() {
  clearReconnectTimer();
  const socket = holder.socket;
  holder.socket = null;
  if (socket) {
    try { socket.onclose = null; socket.onerror = null; socket.close(); } catch { /* noop */ }
  }
}

export const attendanceService = {
  recordManual: (studentId: string, mode: AttendanceType, reason: string) =>
    apiRequest<AttendanceRecord>('/api/attendance/manual', { method: 'POST', body: JSON.stringify({ student_id: Number(studentId), mode, reason }) }),
  getSchedule: () => apiRequest<AttendanceSchedule>('/api/attendance/settings'),
  saveSchedule: (schedule: Pick<AttendanceSchedule, 'checkInDeadline' | 'checkOutStart'>) =>
    apiRequest<AttendanceSchedule>('/api/attendance/settings', { method: 'PUT', body: JSON.stringify(schedule) }),
  subscribe(onEvent: AttendanceEventHandler): () => void {
    const subId = holder.nextSubId++;
    holder.subscriptions.set(subId, { onEvent, onDisconnect: null });
    holder.closed = false;
    connect();
    return () => {
      holder.subscriptions.delete(subId);
      if (holder.subscriptions.size === 0) {
        holder.closed = true;
        teardownSocket();
      }
    };
  },
  subscribeWithDisconnect(onEvent: AttendanceEventHandler, onDisconnect: DisconnectHandler): () => void {
    const subId = holder.nextSubId++;
    holder.subscriptions.set(subId, { onEvent, onDisconnect });
    holder.closed = false;
    connect();
    return () => {
      holder.subscriptions.delete(subId);
      if (holder.subscriptions.size === 0) {
        holder.closed = true;
        teardownSocket();
      }
    };
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

  async scanFrame(sessionId: string, frame: Blob, signal?: AbortSignal, benchmark = false): Promise<MultiFaceScanResult> {
    const body = new FormData();
    body.append('session_id', sessionId);
    body.append('image', frame, 'frame.jpg');
    if (benchmark) body.append('benchmark', 'true');
    return apiRequest<MultiFaceScanResult>('/api/attendance/scan', { method: 'POST', body, signal });
  },

  async submitCorrection(payload: AttendanceCorrectionPayload): Promise<void> {
    await apiRequest(`/api/attendance/${payload.recordId}/correction`, {
      method: 'PATCH', body: JSON.stringify({ status: payload.newStatus, notes: payload.reason, check_in_time: payload.checkInTime, check_out_time: payload.checkOutTime }),
    });
  },
};
