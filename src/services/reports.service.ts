/**
 * Tandara Reports & Audit Service
 * Typed for future FastAPI endpoints:
 * GET    /api/v1/reports/attendance
 * GET    /api/v1/reports/audit-logs
 * GET    /api/v1/reports/export/pdf
 * GET    /api/v1/reports/export/excel
 */

import { AuditLog } from '../types';
import { apiRequest } from './api';

export interface ReportFilterParams {
  startDate?: string;
  endDate?: string;
  classId?: string;
  status?: string;
}

export const reportsService = {
  async getAuditLogs(): Promise<AuditLog[]> {
    // When backend is connected:
    // return await apiRequest<AuditLog[]>('/api/v1/reports/audit-logs');
    return [];
  },

  async triggerExport(format: 'pdf' | 'excel', filters?: ReportFilterParams): Promise<Blob> {
    const params = new URLSearchParams(filters as Record<string, string>);
    return await apiRequest(`/api/v1/reports/export/${format}?${params.toString()}`);
  },
};
