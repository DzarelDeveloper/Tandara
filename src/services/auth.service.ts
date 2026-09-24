/**
 * Tandara Authentication Service
 * Currently runs mock authentication for frontend development.
 * Storing only temporary session data in localStorage.
 * Security Note: Client-side role checking is for prototype navigation only;
 * server-side authorization must be enforced once the FastAPI backend is connected.
 */

import { AuthSession, Role } from '../types';

const SESSION_STORAGE_KEY = 'tandara_session_v1';

// Permitted mock development accounts
const MOCK_CREDENTIALS = {
  admin: {
    password: 'admin123',
    role: 'ADMIN_IT' as Role,
    displayName: 'Dzarel Admin',
  },
  guru: {
    password: 'guru123',
    role: 'TEACHER' as Role,
    displayName: 'Siti Nurhaliza',
  },
};

export interface LoginParams {
  username: string;
  password: string;
}

export const authService = {
  /**
   * Authenticate using the two mock prototype accounts
   */
  async login({ username, password }: LoginParams): Promise<AuthSession> {
    // Artificial small delay for realistic UX transition
    await new Promise((resolve) => setTimeout(resolve, 600));

    const cleanUsername = username.trim().toLowerCase();
    const account = MOCK_CREDENTIALS[cleanUsername as keyof typeof MOCK_CREDENTIALS];

    if (!account || account.password !== password) {
      throw new Error('Username atau password tidak sesuai.');
    }

    const session: AuthSession = {
      username: cleanUsername,
      displayName: account.displayName,
      role: account.role,
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

  /**
   * Terminate mock session
   */
  logout(): void {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  },
};
