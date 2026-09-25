/**
 * Tandara Classes & Majors Service
 * Typed for future FastAPI endpoints:
 * GET    /api/classes
 * POST   /api/classes
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
    const classes = await apiRequest<Array<Record<string, unknown>>>('/api/classes');
    return classes.map((item) => ({
      id: String(item.id), name: String(item.name), grade: String(item.grade) as Class['grade'],
      major: String(item.major), homeroomTeacher: '-', studentCount: Number(item.studentCount || 0),
      checkInTime: '-', lateToleranceTime: '-', checkOutTime: '-', activeDays: [],
    }));
  },

  async createClass(payload: CreateClassPayload): Promise<Class> {
    return await apiRequest<Class>('/api/classes', {
      method: 'POST',
      body: JSON.stringify({ name: payload.name, grade: payload.grade, major: payload.major, school_year: new Date().getFullYear().toString() }),
    });
  },
};
