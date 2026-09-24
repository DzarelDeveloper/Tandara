/**
 * Tandara Authentication Service
 * Currently runs mock authentication for frontend development.
 * Storing only temporary session data in localStorage.
 * Security Note: Client-side role checking is for prototype navigation only;
 * server-side authorization must be enforced once the FastAPI backend is connected.
 */

import { AuthSession, Role } from '../types';
import { ACCESS_TOKEN_KEY, apiRequest } from './api';

const SESSION_STORAGE_KEY = 'tandara_session_v1';

export interface LoginParams {
  username: string;
  password: string;
}

export const authService = {
  async login({ username, password }: LoginParams): Promise<AuthSession> {
    const result = await apiRequest<{ access_token: string; user: { username: string; displayName: string; role: Role | 'GURU_PIKET' } }>('/api/auth/login', {
      method: 'POST', body: JSON.stringify({ username, password }),
    });
    localStorage.setItem(ACCESS_TOKEN_KEY, result.access_token);

    const session: AuthSession = {
      username: result.user.username,
      displayName: result.user.displayName,
      role: result.user.role === 'GURU_PIKET' ? 'TEACHER' : result.user.role,
      isAuthenticated: true,
    };

    // Store only safe session metadata; never save password
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    return session;
  },

  /**
   * Retrieve current session from localStorage
   */
  getCurrentSession(): AuthSession | null {
    try {
      const data = localStorage.getItem(SESSION_STORAGE_KEY);
      if (!data) return null;
      const parsed = JSON.parse(data);
      if (parsed && parsed.isAuthenticated && parsed.role) {
        return parsed as AuthSession;
      }
      return null;
    } catch {
      return null;
    }
  },

  async logout(): Promise<void> {
    try { await apiRequest('/api/auth/logout', { method: 'POST' }); } finally {
      localStorage.removeItem(ACCESS_TOKEN_KEY);
      localStorage.removeItem(SESSION_STORAGE_KEY);
    }
  },
};
