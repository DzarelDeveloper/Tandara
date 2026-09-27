/**
 * Tandara Auth Context
 * Provides authenticated session state backed by the FastAPI login endpoint.
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import { AuthSession, Role } from '../types';
import { authService, LoginParams } from '../services/auth.service';

interface AuthContextType {
  session: AuthSession | null;
  isLoading: boolean;
  login: (params: LoginParams) => Promise<AuthSession>;
  logout: () => Promise<void>;
  isAdmin: boolean;
  isTeacher: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Restore safe session metadata; protected API calls still require the JWT.
    const current = authService.getCurrentSession();
    setSession(current);
    setIsLoading(false);
  }, []);

  const login = async (params: LoginParams) => {
    const newSession = await authService.login(params);
    setSession(newSession);
    return newSession;
  };

  const logout = async () => {
    await authService.logout();
    setSession(null);
  };

  const isAdmin = session?.role === 'ADMIN_IT';
  const isTeacher = session?.role === 'TEACHER';

  return (
    <AuthContext.Provider
      value={{
        session,
        isLoading,
        login,
        logout,
        isAdmin,
        isTeacher,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
