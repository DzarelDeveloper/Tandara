import type { AttendanceEvent, AttendanceRecord } from '../types';
import type { FaceScanResult } from '../services/attendance.service';

export interface LiveAttendanceEvent extends AttendanceEvent {
  attendanceId?: string;
  attendanceStatus?: string;
}

export function fromStoredAttendance(row: AttendanceRecord): LiveAttendanceEvent[] {
  return (['CHECK_IN', 'CHECK_OUT'] as const).flatMap((mode) => {
    const timestamp = mode === 'CHECK_IN' ? row.checkInTime : row.checkOutTime;
    if (!timestamp) return [];
    return [{
      id: `${row.id}-${mode}`, attendanceId: String(row.id), studentId: row.studentId,
      studentName: row.studentName, nis: row.nis, className: row.className,
      eventType: mode, timestamp, cameraSource: 'BROWSER_CAMERA', attendanceStatus: row.status,
    }];
  });
}

export function fromScanAttendance(item: FaceScanResult): LiveAttendanceEvent {
  return {
    id: `${item.id}-${item.mode}`, attendanceId: String(item.id),
    studentId: item.studentId, studentName: item.studentName,
    nis: item.nis, className: item.className, eventType: item.mode,
    timestamp: item.recordedAt, cameraSource: 'BROWSER_CAMERA',
    similarityScore: item.similarity, attendanceStatus: item.status,
  };
}

export function fromAttendanceEvent(data: Record<string, unknown>, timestamp: string): LiveAttendanceEvent | null {
  if (data.mode !== 'CHECK_IN' && data.mode !== 'CHECK_OUT') return null;
  if (data.student_id == null) return null;
  const attendanceId = data.attendance_id == null ? undefined : String(data.attendance_id);
  return {
    id: `${attendanceId ?? data.student_id}-${data.mode}`, attendanceId,
    studentId: String(data.student_id), studentName: String(data.student_name ?? ''),
    nis: String(data.nis ?? ''), className: String(data.class_name ?? ''),
    eventType: data.mode, timestamp: typeof data.recorded_at === 'string' ? data.recorded_at : timestamp,
    cameraSource: 'BROWSER_CAMERA',
    similarityScore: typeof data.similarity === 'number' ? data.similarity : undefined,
    attendanceStatus: typeof data.status === 'string' ? data.status : undefined,
  };
}

export function mergeRecentAttendance(current: LiveAttendanceEvent[], event: LiveAttendanceEvent): LiveAttendanceEvent[] {
  const index = current.findIndex((item) => {
    if (item.eventType !== event.eventType) return false;
    if (item.attendanceId && event.attendanceId) return item.attendanceId === event.attendanceId;
    return item.studentId === event.studentId && Math.abs(Date.parse(item.timestamp) - Date.parse(event.timestamp)) < 10_000;
  });
  const previous = index >= 0 ? current[index] : undefined;
  const merged = previous ? {
    ...previous, ...event,
    attendanceId: event.attendanceId ?? previous.attendanceId,
    attendanceStatus: event.attendanceStatus ?? previous.attendanceStatus,
    similarityScore: event.similarityScore ?? previous.similarityScore,
    nis: event.nis || previous.nis, className: event.className || previous.className,
  } : event;
  return [...current.filter((_, i) => i !== index), merged]
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
}
