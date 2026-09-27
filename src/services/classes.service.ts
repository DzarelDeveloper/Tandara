import { Class, Major } from '../types';
import { apiRequest } from './api';

export interface ClassPayload {
  name: string;
  grade?: string;
  majorId?: string | null;
  schoolYear?: string;
  isActive: boolean;
}

export interface MajorPayload {
  name: string;
  isActive: boolean;
}

const mapClass = (item: Record<string, unknown>): Class => ({
  id: String(item.id), name: String(item.name), grade: String(item.grade ?? ''),
  major: String(item.major ?? ''), majorId: item.majorId == null ? null : String(item.majorId),
  schoolYear: String(item.schoolYear ?? ''), isActive: Boolean(item.isActive),
  homeroomTeacher: '-', studentCount: Number(item.studentCount || 0),
  checkInTime: '-', lateToleranceTime: '-', checkOutTime: '-', activeDays: [],
});

const mapMajor = (item: Record<string, unknown>): Major => ({
  id: String(item.id), name: String(item.name), isActive: Boolean(item.isActive),
  classCount: Number(item.classCount || 0), createdAt: String(item.createdAt), updatedAt: String(item.updatedAt),
});

export const classesService = {
  async getClasses(): Promise<Class[]> {
    return (await apiRequest<Array<Record<string, unknown>>>('/api/classes')).map(mapClass);
  },
  async createClass(payload: ClassPayload): Promise<Class> {
    const item = await apiRequest<Record<string, unknown>>('/api/classes', { method: 'POST', body: JSON.stringify({ name: payload.name, grade: payload.grade ?? '', major_id: payload.majorId ? Number(payload.majorId) : null, school_year: payload.schoolYear ?? '', is_active: payload.isActive }) });
    return mapClass(item);
  },
  async updateClass(id: string, payload: ClassPayload): Promise<Class> {
    const item = await apiRequest<Record<string, unknown>>(`/api/classes/${id}`, { method: 'PATCH', body: JSON.stringify({ name: payload.name, grade: payload.grade ?? '', major_id: payload.majorId ? Number(payload.majorId) : null, school_year: payload.schoolYear ?? '', is_active: payload.isActive }) });
    return mapClass(item);
  },
  async deleteClass(id: string): Promise<{ id: string; action: 'DELETE' | 'DEACTIVATE' }> {
    return apiRequest(`/api/classes/${id}`, { method: 'DELETE' });
  },
  async getMajors(): Promise<Major[]> {
    return (await apiRequest<Array<Record<string, unknown>>>('/api/majors')).map(mapMajor);
  },
  async createMajor(payload: MajorPayload): Promise<Major> {
    return mapMajor(await apiRequest<Record<string, unknown>>('/api/majors', { method: 'POST', body: JSON.stringify({ name: payload.name, is_active: payload.isActive }) }));
  },
  async updateMajor(id: string, payload: MajorPayload): Promise<Major> {
    return mapMajor(await apiRequest<Record<string, unknown>>(`/api/majors/${id}`, { method: 'PATCH', body: JSON.stringify({ name: payload.name, is_active: payload.isActive }) }));
  },
  async deleteMajor(id: string): Promise<{ id: string; action: 'DELETE' | 'DEACTIVATE' }> {
    return apiRequest(`/api/majors/${id}`, { method: 'DELETE' });
  },
};
