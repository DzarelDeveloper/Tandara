/**
 * Tandara Parent Service
 * Typed for future FastAPI endpoints:
 * GET    /api/v1/parents
 * POST   /api/v1/parents
 * POST   /api/v1/parents/:id/link-student
 * POST   /api/v1/parents/:id/reset-password
 * PATCH  /api/v1/parents/:id/status
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
    // When backend is connected, use:
    // return await apiRequest<Parent[]>('/api/v1/parents');
    return [];
  },

  async createParent(payload: CreateParentPayload): Promise<Parent> {
    return await apiRequest<Parent>('/api/v1/parents', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async linkStudent(parentId: string, studentId: string): Promise<void> {
    await apiRequest(`/api/v1/parents/${parentId}/link-student`, {
      method: 'POST',
      body: JSON.stringify({ studentId }),
    });
  },

  async resetPassword(parentId: string): Promise<{ temporaryPassword: string }> {
    return await apiRequest<{ temporaryPassword: string }>(`/api/v1/parents/${parentId}/reset-password`, {
      method: 'POST',
    });
  },

  async toggleStatus(parentId: string, active: boolean): Promise<void> {
    await apiRequest(`/api/v1/parents/${parentId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ active }),
    });
  },
};
