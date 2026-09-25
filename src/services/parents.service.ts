/**
 * Tandara Parent Service
 * Typed for future FastAPI endpoints:
 * GET    /api/guardians
 * POST   /api/guardians
 * POST   /api/guardians/:id/students
 * PATCH  /api/guardians/:id/status
 */

import { Parent } from '../types';
import { apiRequest } from './api';

export interface CreateParentPayload {
  fullName: string;
  phone: string;
  relationship: 'Ayah' | 'Ibu' | 'Wali';
  studentId: string;
  username: string;
  temporaryPassword?: string;
  forcePasswordChange: boolean;
}

export const parentsService = {
  async getParents(): Promise<Parent[]> {
    const parents = await apiRequest<Array<Record<string, unknown>>>('/api/guardians?include_inactive=true');
    return parents.map((parent) => ({
      id: String(parent.id), fullName: String(parent.fullName), phone: String(parent.phone),
      relationship: 'Wali', connectedStudentIds: (parent.studentIds as string[]) || [],
      connectedStudentNames: (parent.studentNames as string[]) || [], username: '',
      accountStatus: parent.isActive ? 'ACTIVE' : 'INACTIVE', notificationsActive: false,
      createdAt: String(parent.createdAt),
    }));
  },

  async createParent(payload: CreateParentPayload): Promise<Parent> {
    return await apiRequest<Parent>('/api/guardians', {
      method: 'POST',
      body: JSON.stringify({ full_name: payload.fullName, phone_number: payload.phone }),
    });
  },

  async updateParent(parentId: string, payload: Pick<CreateParentPayload, 'fullName' | 'phone'>): Promise<void> {
    await apiRequest(`/api/guardians/${parentId}`, { method: 'PATCH', body: JSON.stringify({ full_name: payload.fullName, phone_number: payload.phone }) });
  },

  async linkStudent(parentId: string, studentId: string): Promise<void> {
    await apiRequest(`/api/guardians/${parentId}/students`, {
      method: 'POST',
      body: JSON.stringify([Number(studentId)]),
    });
  },

  async toggleStatus(parentId: string, active: boolean): Promise<void> {
    await apiRequest(`/api/guardians/${parentId}/status?active=${active}`, {
      method: 'PATCH',
    });
  },
};
