import { useCallback, useEffect, useState } from 'react';
import type { AuthSessionPayload, LoginCredentials } from '../../shared/types/ipc';
import { ipcClient } from '../services/ipcClient';

export function useAuth() {
  const [session, setSession] = useState<AuthSessionPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggingIn, setLoggingIn] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const fetchSession = useCallback(async () => {
    try {
      setLoading(true);
      const active = await ipcClient.getSession();
      setSession(active);
    } catch {
      setSession(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSession();
  }, [fetchSession]);

  const login = useCallback(async (credentials: LoginCredentials): Promise<boolean> => {
    setLoggingIn(true);
    setAuthError(null);
    try {
      const newSession = await ipcClient.login(credentials);
      setSession(newSession);
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Login failed.';
      setAuthError(msg);
      return false;
    } finally {
      setLoggingIn(false);
    }
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    setLoggingOut(true);
    try {
      await ipcClient.logout();
      setSession(null);
    } finally {
      setLoggingOut(false);
    }
  }, []);

  const clearError = useCallback(() => {
    setAuthError(null);
  }, []);

  return {
    session,
    loading,
    loggingIn,
    loggingOut,
    authError,
    login,
    logout,
    clearError,
    refreshSession: fetchSession,
  };
}
