/**
 * Tandara Users Service (Admin IT management)
 * Typed for future FastAPI endpoints:
 * GET    /api/users
 * POST   /api/users
 * PATCH  /api/users/:id/status
 */

import { User } from '../types';
import { apiRequest } from './api';

export interface CreateTeacherUserPayload {
  fullName: string;
  username: string;
  password: string;
  isActive: boolean;
  role: 'TEACHER'; // Super-admin creation restricted on frontend
}

export const usersService = {
  async getUsers(): Promise<User[]> {
    return apiRequest<User[]>('/api/users');
  },

  async createUser(payload: CreateTeacherUserPayload): Promise<User> {
    return await apiRequest<User>('/api/users', {
      method: 'POST',
      body: JSON.stringify({ full_name: payload.fullName, username: payload.username, password: payload.password, role: 'GURU_PIKET', is_active: payload.isActive }),
    });
  },

  async toggleUserStatus(userId: string, isActive: boolean): Promise<void> {
    await apiRequest(`/api/users/${userId}/status?active=${isActive}`, {
      method: 'PATCH',
    });
  },
};
