/**
 * Tandara Classes & Majors Service
 * Typed for future FastAPI endpoints:
 * GET    /api/v1/classes
 * POST   /api/v1/classes
 * POST   /api/v1/majors
 * PUT    /api/v1/classes/:id/schedule
 */

import { Class } from '../types';
import { apiRequest } from './api';

export interface CreateClassPayload {
  name: string;
  grade: '10' | '11' | '12';
  major: string;
  homeroomTeacher: string;
}

export interface CreateMajorPayload {
  code: string;
  name: string;
  departmentHead?: string;
}

export interface AttendanceSchedulePayload {
  checkInTime: string;
  lateToleranceTime: string;
  checkOutTime: string;
  activeDays: string[];
}

export const classesService = {
  async getClasses(): Promise<Class[]> {
    // When backend is connected, use:
    // return await apiRequest<Class[]>('/api/v1/classes');
    return [];
  },

  async createClass(payload: CreateClassPayload): Promise<Class> {
    return await apiRequest<Class>('/api/v1/classes', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async createMajor(payload: CreateMajorPayload): Promise<{ id: string; name: string }> {
    return await apiRequest('/api/v1/majors', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async updateSchedule(schedule: AttendanceSchedulePayload): Promise<void> {
    await apiRequest('/api/v1/classes/schedule', {
      method: 'PUT',
      body: JSON.stringify(schedule),
    });
  },
};
