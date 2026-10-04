import { useCallback, useEffect, useState } from 'react';
import type {
  AuthSessionPayload,
  LoginCredentials,
  ProtectedTestPayload,
} from '../../shared/types/ipc';
import { ipcClient } from '../services/ipcClient';

export interface UseAuthReturn {
  session: AuthSessionPayload | null;
  loading: boolean;
  loggingIn: boolean;
  loggingOut: boolean;
  authError: string | null;
  protectedResult: ProtectedTestPayload | null;
  protectedError: string | null;
  login: (credentials: LoginCredentials) => Promise<boolean>;
  logout: () => Promise<void>;
  testProtectedOperation: () => Promise<void>;
  clearError: () => void;
}

export function useAuth(): UseAuthReturn {
  const [session, setSession] = useState<AuthSessionPayload | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [loggingIn, setLoggingIn] = useState<boolean>(false);
  const [loggingOut, setLoggingOut] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [protectedResult, setProtectedResult] = useState<ProtectedTestPayload | null>(null);
  const [protectedError, setProtectedError] = useState<string | null>(null);

  // Check existing session on mount
  useEffect(() => {
    let mounted = true;

    async function checkSession() {
      try {
        const result = await ipcClient.getSession();
        if (mounted && result.success) {
          setSession(result.data);
        }
      } catch {
        if (mounted) {
          setSession(null);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void checkSession();

    return () => {
      mounted = false;
    };
  }, []);

  const login = useCallback(async (credentials: LoginCredentials): Promise<boolean> => {
    setLoggingIn(true);
    setAuthError(null);
    setProtectedResult(null);
    setProtectedError(null);

    try {
      const result = await ipcClient.login(credentials);
      if (result.success) {
        setSession(result.data);
        return true;
      } else {
        setAuthError(result.error);
        return false;
      }
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
    setAuthError(null);
    setProtectedResult(null);
    setProtectedError(null);

    try {
      await ipcClient.logout();
    } finally {
      setSession(null);
      setLoggingOut(false);
    }
  }, []);

  const testProtectedOperation = useCallback(async (): Promise<void> => {
    setProtectedResult(null);
    setProtectedError(null);

    const result = await ipcClient.testProtectedOperation();
    if (result.success) {
      setProtectedResult(result.data);
    } else {
      setProtectedError(result.error);
    }
  }, []);

  const clearError = useCallback(() => {
    setAuthError(null);
    setProtectedError(null);
  }, []);

  return {
    session,
    loading,
    loggingIn,
    loggingOut,
    authError,
    protectedResult,
    protectedError,
    login,
    logout,
    testProtectedOperation,
    clearError,
  };
}
