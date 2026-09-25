/**
 * Tandara - Data Models & Types
 * Prepares the TypeScript interfaces and enums for future FastAPI backend integration.
 */

export type Role = 'ADMIN_IT' | 'TEACHER' | 'GURU_PIKET';

export type AttendanceType = 'CHECK_IN' | 'CHECK_OUT';

export type AttendanceStatus =
  | 'PRESENT'
  | 'LATE'
  | 'SICK'
  | 'PERMISSION'
  | 'UNEXCUSED'
  | 'UNKNOWN';

export type LeaveStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export type LeaveType = 'SICK' | 'PERMISSION' | 'DISPENSATION';

export type DeviceType = 'CAMERA_GATE_IN' | 'CAMERA_GATE_OUT' | 'LOCAL_SERVER' | 'SQLITE_DB';

export type DeviceStatus = 'CONNECTED' | 'DISCONNECTED' | 'ERROR';

export type NotificationStatus = 'PENDING' | 'SENT' | 'FAILED';

export interface User {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  isActive: boolean;
  createdAt: string;
  lastLogin?: string;
}

export interface AuthSession {
  username: string;
  displayName: string;
  role: Role;
  isAuthenticated: boolean;
}

export interface Student {
  id: string;
  nis: string;
  fullName: string;
  classId: string;
  className: string;
  major: string;
  gender: 'L' | 'P';
  parentName: string;
  parentPhone: string;
  faceRegistered: boolean;
  faceRegisteredAt?: string;
  status: 'ACTIVE' | 'GRADUATED' | 'TRANSFERRED' | 'INACTIVE';
  createdAt: string;
  updatedAt: string;
}

export interface Parent {
  id: string;
  fullName: string;
  phone: string;
  relationship: 'Ayah' | 'Ibu' | 'Wali';
  connectedStudentIds: string[];
  connectedStudentNames: string[];
  username: string;
  accountStatus: 'ACTIVE' | 'PENDING_ACTIVATION' | 'INACTIVE';
  notificationsActive: boolean;
  lastLogin?: string;
  createdAt: string;
}

export interface Class {
  id: string;
  name: string;
  grade: '10' | '11' | '12';
  major: string;
  homeroomTeacher: string;
  studentCount: number;
  checkInTime: string;
  lateToleranceTime: string;
  checkOutTime: string;
  activeDays: string[];
}

export interface AttendanceEvent {
  id: string;
  studentId: string;
  studentName: string;
  nis: string;
  className: string;
  eventType: AttendanceType;
  timestamp: string;
  cameraSource: string;
  confidenceScore?: number;
  notificationJobId?: string;
  notificationStatus?: NotificationStatus;
}

export interface AttendanceRecord {
  id: string;
  date: string;
  studentId: string;
  studentName: string;
  nis: string;
  className: string;
  checkInTime?: string;
  checkOutTime?: string;
  status: AttendanceStatus;
  originalStatus?: AttendanceStatus;
  isCorrected: boolean;
  correctionReason?: string;
  correctedBy?: string;
  correctedAt?: string;
  parentNotified: boolean;
}

export interface AttendanceCorrection {
  id: string;
  studentId: string;
  studentName: string;
  attendanceDate: string;
  previousStatus: string;
  newStatus: string;
  reason: string;
  requestedBy: string;
  requestedAt: string;
  approvalStatus: string;
}

export interface LeaveRequest {
  id: string;
  studentId: string;
  studentName: string;
  nis: string;
  className: string;
  parentId: string;
  parentName: string;
  parentPhone: string;
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  reason: string;
  attachmentUrl?: string;
  status: LeaveStatus;
  rejectionReason?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  teacherNotes?: string;
  createdAt: string;
}

export interface Device {
  id: string;
  name: string;
  type: DeviceType;
  ipAddress?: string;
  port?: number;
  status: DeviceStatus;
  lastPing?: string;
  description: string;
}

export interface NotificationJob {
  id: string;
  recipientType: 'PARENT_APP';
  parentId: string;
  studentId: string;
  title: string;
  message: string;
  status: NotificationStatus;
  sentAt?: string;
  error?: string;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  userId: string;
  username: string;
  action: string;
  entity: string;
  entityId?: string;
  details: string;
  ipAddress?: string;
}
