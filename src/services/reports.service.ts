/**
 * Tandara Reports & Audit Service
 * Typed for future FastAPI endpoints:
 * GET    /api/reports/attendance.csv
 * GET    /api/audit-logs
 */

import { AuditLog } from '../types';
import { apiRequest, apiRequestBlob } from './api';

export interface ReportFilterParams {
  startDate?: string;
  endDate?: string;
  classId?: string;
  status?: string;
}

export const reportsService = {
  async getAuditLogs(): Promise<AuditLog[]> {
    return apiRequest<AuditLog[]>('/api/audit-logs');
  },

  async downloadAttendanceCsv(filters?: ReportFilterParams): Promise<Response> {
    const params = new URLSearchParams();
    if (filters?.startDate) params.set('date_from', filters.startDate);
    if (filters?.endDate) params.set('date_to', filters.endDate);
    if (filters?.classId) params.set('class_id', filters.classId);
    if (filters?.status) params.set('status', filters.status);
    return apiRequestBlob(`/api/reports/attendance.csv?${params.toString()}`);
  },
};
