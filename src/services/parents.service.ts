import { Parent } from '../types';
import { apiRequest } from './api';

export interface CreateParentPayload {
  fullName: string;
  phone: string;
  relationship: string;
  studentIds: string[];
  temporaryPassword: string;
}

const mapParent = (item: Record<string, unknown>): Parent => {
  const students = (item.students as Parent['connectedStudents']) || [];
  return {
    id: String(item.id), fullName: String(item.fullName), phone: String(item.phone),
    relationship: String(item.relationship || 'Wali'),
    connectedStudentIds: students.map((student) => String(student.id)),
    connectedStudentNames: students.map((student) => student.fullName), connectedStudents: students,
    username: String(item.username || ''), accountStatus: item.isActive ? 'ACTIVE' : 'INACTIVE',
    notificationsActive: false, lastLogin: item.lastLogin ? String(item.lastLogin) : undefined,
    createdAt: String(item.createdAt),
  };
};

export const parentsService = {
  async getParents(): Promise<Parent[]> {
    return (await apiRequest<Array<Record<string, unknown>>>('/api/guardians?include_inactive=true')).map(mapParent);
  },
  async createParent(payload: CreateParentPayload): Promise<Parent> {
    return mapParent(await apiRequest<Record<string, unknown>>('/api/guardians', { method: 'POST', body: JSON.stringify({ full_name: payload.fullName, phone_number: payload.phone, relationship: payload.relationship, password: payload.temporaryPassword, student_ids: payload.studentIds.map(Number), is_active: true }) }));
  },
  async createGuardian(payload: { fullName: string; phone: string }): Promise<Parent> {
    return mapParent(await apiRequest<Record<string, unknown>>('/api/guardians', { method: 'POST', body: JSON.stringify({ full_name: payload.fullName, phone_number: payload.phone }) }));
  },
  async updateParent(parentId: string, payload: { fullName: string; phone: string; relationship: string }): Promise<Parent> {
    return mapParent(await apiRequest<Record<string, unknown>>(`/api/guardians/${parentId}`, { method: 'PATCH', body: JSON.stringify({ full_name: payload.fullName, phone_number: payload.phone, relationship: payload.relationship }) }));
  },
  async replaceStudents(parentId: string, studentIds: string[], relationship: string): Promise<Parent> {
    return mapParent(await apiRequest<Record<string, unknown>>(`/api/guardians/${parentId}/students`, { method: 'PUT', body: JSON.stringify({ student_ids: studentIds.map(Number), relationship }) }));
  },
  async linkStudents(parentId: string, studentIds: string[], relationship = 'Wali'): Promise<Parent> {
    return mapParent(await apiRequest<Record<string, unknown>>(`/api/guardians/${parentId}/students?relationship=${encodeURIComponent(relationship)}`, { method: 'POST', body: JSON.stringify(studentIds.map(Number)) }));
  },
  async unlinkStudent(parentId: string, studentId: string): Promise<void> {
    await apiRequest(`/api/guardians/${parentId}/students/${studentId}`, { method: 'DELETE' });
  },
  async toggleStatus(parentId: string, active: boolean): Promise<void> {
    await apiRequest(`/api/guardians/${parentId}/status?active=${active}`, { method: 'PATCH' });
  },
};
