import { useState, useEffect, useCallback } from 'react';
import type {
  BackupHistoryDto,
  BackupStatusDto,
  RestoreBackupResultDto,
  SaveBackupConfigRequest,
} from '../../shared/types/ipc';
import { ipcClient } from '../services/ipcClient';
import { useToast } from '../context/ToastContext';

export interface UseCloudBackupReturn {
  status: BackupStatusDto | null;
  history: BackupHistoryDto[];
  loading: boolean;
  isBackingUp: boolean;
  isRestoring: boolean;
  authWaiting: boolean;
  recoveryKey: string | null;
  error: string | null;
  refresh: () => Promise<void>;
  startAuth: () => Promise<{ authUrl: string } | null>;
  disconnect: () => Promise<boolean>;
  saveConfig: (config: SaveBackupConfigRequest) => Promise<boolean>;
  triggerBackupNow: () => Promise<boolean>;
  restoreBackup: (backupId: string) => Promise<RestoreBackupResultDto | null>;
  fetchRecoveryKey: () => Promise<string | null>;
  importRecoveryKey: (key: string) => Promise<boolean>;
}

export function useCloudBackup(): UseCloudBackupReturn {
  const [status, setStatus] = useState<BackupStatusDto | null>(null);
  const [history, setHistory] = useState<BackupHistoryDto[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isBackingUp, setIsBackingUp] = useState<boolean>(false);
  const [isRestoring, setIsRestoring] = useState<boolean>(false);
  const [authWaiting, setAuthWaiting] = useState<boolean>(false);
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { showSuccess, showError, showInfo } = useToast();

  const fetchStatus = useCallback(async () => {
    try {
      const res = await ipcClient.getBackupStatus();
      if (res.success) {
        setStatus(res.data);
        setIsBackingUp(res.data.isBackingUp);
      } else {
        setError(res.error);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch backup status');
    }
  }, []);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await ipcClient.listBackupHistory(50);
      if (res.success) {
        setHistory(res.data);
      }
    } catch (err: any) {
      console.error('Failed to fetch backup history:', err);
    }
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    await Promise.all([fetchStatus(), fetchHistory()]);
    setLoading(false);
  }, [fetchStatus, fetchHistory]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // If waiting for OAuth authentication in browser, poll status every 3 seconds
  useEffect(() => {
    if (!authWaiting) return;

    const interval = setInterval(async () => {
      const res = await ipcClient.getBackupStatus();
      if (res.success && res.data.isConnected) {
        setStatus(res.data);
        setAuthWaiting(false);
        showSuccess(`Google Drive connected: ${res.data.connectedEmail || 'Account'}`);
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [authWaiting, showSuccess]);

  const startAuth = useCallback(async () => {
    try {
      setError(null);
      const res = await ipcClient.startGoogleDriveAuth();
      if (res.success) {
        setAuthWaiting(true);
        showInfo('Google sign-in started. Please complete authorization in your browser.');
        return { authUrl: res.data.authUrl };
      } else {
        setError(res.error);
        showError(res.error);
        return null;
      }
    } catch (err: any) {
      const msg = err?.message || 'Failed to initiate Google OAuth';
      setError(msg);
      showError(msg);
      return null;
    }
  }, [showInfo, showError]);

  const disconnect = useCallback(async () => {
    try {
      setError(null);
      const res = await ipcClient.disconnectGoogleDrive();
      if (res.success) {
        setAuthWaiting(false);
        showSuccess('Google Drive account unlinked successfully.');
        await refresh();
        return true;
      } else {
        setError(res.error);
        showError(res.error);
        return false;
      }
    } catch (err: any) {
      const msg = err?.message || 'Failed to disconnect';
      setError(msg);
      showError(msg);
      return false;
    }
  }, [showSuccess, showError, refresh]);

  const saveConfig = useCallback(
    async (config: SaveBackupConfigRequest) => {
      try {
        setError(null);
        const res = await ipcClient.saveBackupConfig(config);
        if (res.success) {
          setStatus(res.data);
          showSuccess('Backup settings saved successfully.');
          return true;
        } else {
          setError(res.error);
          showError(res.error);
          return false;
        }
      } catch (err: any) {
        const msg = err?.message || 'Failed to save configuration';
        setError(msg);
        showError(msg);
        return false;
      }
    },
    [showSuccess, showError]
  );

  const triggerBackupNow = useCallback(async () => {
    setIsBackingUp(true);
    setError(null);
    showInfo('Creating atomic database snapshot and uploading to Google Drive...');

    try {
      const res = await ipcClient.triggerBackupNow();
      if (res.success) {
        showSuccess(`Backup completed: ${res.data.filename} (${(res.data.sizeBytes / 1024).toFixed(1)} KB)`);
        await refresh();
        return true;
      } else {
        setError(res.error);
        showError(res.error);
        await refresh();
        return false;
      }
    } catch (err: any) {
      const msg = err?.message || 'Backup failed';
      setError(msg);
      showError(msg);
      await refresh();
      return false;
    } finally {
      setIsBackingUp(false);
    }
  }, [showInfo, showSuccess, showError, refresh]);

  const restoreBackup = useCallback(
    async (backupId: string) => {
      setIsRestoring(true);
      setError(null);
      showInfo('Downloading backup, creating emergency safety snapshot, and restoring...');

      try {
        const res = await ipcClient.restoreBackup({ backupId });
        if (res.success) {
          showSuccess(res.data.message);
          return res.data;
        } else {
          setError(res.error);
          showError(res.error);
          return null;
        }
      } catch (err: any) {
        const msg = err?.message || 'Failed to restore backup';
        setError(msg);
        showError(msg);
        return null;
      } finally {
        setIsRestoring(false);
      }
    },
    [showInfo, showSuccess, showError]
  );

  const fetchRecoveryKey = useCallback(async () => {
    try {
      const res = await ipcClient.getBackupRecoveryKey();
      if (res.success) {
        setRecoveryKey(res.data.recoveryKey);
        return res.data.recoveryKey;
      }
      return null;
    } catch {
      return null;
    }
  }, []);

  const importRecoveryKey = useCallback(
    async (key: string) => {
      try {
        const res = await ipcClient.setBackupRecoveryKey(key);
        if (res.success) {
          setRecoveryKey(key.trim());
          showSuccess('Encryption master key imported successfully.');
          return true;
        }
        return false;
      } catch (err: any) {
        showError(err?.message || 'Invalid recovery key format');
        return false;
      }
    },
    [showSuccess, showError]
  );

  return {
    status,
    history,
    loading,
    isBackingUp,
    isRestoring,
    authWaiting,
    recoveryKey,
    error,
    refresh,
    startAuth,
    disconnect,
    saveConfig,
    triggerBackupNow,
    restoreBackup,
    fetchRecoveryKey,
    importRecoveryKey,
  };
}
