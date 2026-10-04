import { useCallback, useEffect, useState } from 'react';
import type {
  DatabasePingPayload,
  SystemStatusPayload,
} from '../../shared/types/ipc';
import { ipcClient } from '../services/ipcClient';

export interface UseSystemStatusReturn {
  status: SystemStatusPayload | null;
  lastPing: DatabasePingPayload | null;
  loading: boolean;
  pinging: boolean;
  error: string | null;
  refreshStatus: () => Promise<void>;
  triggerPing: () => Promise<void>;
}

export function useSystemStatus(): UseSystemStatusReturn {
  const [status, setStatus] = useState<SystemStatusPayload | null>(null);
  const [lastPing, setLastPing] = useState<DatabasePingPayload | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [pinging, setPinging] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const refreshStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await ipcClient.fetchSystemStatus();
      if (response.success) {
        setStatus(response.data);
      } else {
        setError(response.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected IPC error');
    } finally {
      setLoading(false);
    }
  }, []);

  const triggerPing = useCallback(async () => {
    setPinging(true);
    setError(null);
    try {
      const [pingRes, statusRes] = await Promise.all([
        ipcClient.pingDatabase(),
        ipcClient.fetchSystemStatus(),
      ]);
      if (pingRes.success) {
        setLastPing(pingRes.data);
      } else {
        setError(pingRes.error);
      }
      if (statusRes.success) {
        setStatus(statusRes.data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Database ping failed');
    } finally {
      setPinging(false);
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  return {
    status,
    lastPing,
    loading,
    pinging,
    error,
    refreshStatus,
    triggerPing,
  };
}
