import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants/ipcChannels';
import type {
  BackupHistoryDto,
  BackupStatusDto,
  IpcResult,
  RestoreBackupRequest,
  RestoreBackupResultDto,
  SaveBackupConfigRequest,
} from '../../shared/types/ipc';
import { authService } from '../services/authService';
import { backupService } from '../services/backupService';
import { googleDriveService } from '../services/googleDriveService';
import { backupCryptoService } from '../services/backupCryptoService';

function requireSuperAdmin(): void {
  const session = authService.getSession();
  if (!session || session.role !== 'SUPER_ADMIN') {
    throw new Error('Unauthorized: Only Super Admin can manage Google Drive backups.');
  }
}

export function registerBackupIpcHandlers(): void {
  // 1. Get Backup & Google Drive status
  ipcMain.removeHandler(IPC_CHANNELS.BACKUP_GET_STATUS);
  ipcMain.handle(
    IPC_CHANNELS.BACKUP_GET_STATUS,
    async (): Promise<IpcResult<BackupStatusDto>> => {
      try {
        const data = await backupService.getStatus();
        return { success: true, data };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to retrieve backup status.';
        return { success: false, error: message };
      }
    }
  );

  // 2. Start Google Drive OAuth Loopback Authorization Flow
  ipcMain.removeHandler(IPC_CHANNELS.BACKUP_START_AUTH);
  ipcMain.handle(
    IPC_CHANNELS.BACKUP_START_AUTH,
    async (): Promise<IpcResult<{ authUrl: string; waitingForAuth: boolean }>> => {
      try {
        requireSuperAdmin();
        const data = await googleDriveService.startOAuthFlow();
        return { success: true, data };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to start Google Drive authentication.';
        return { success: false, error: message };
      }
    }
  );

  // 3. Disconnect Google Drive
  ipcMain.removeHandler(IPC_CHANNELS.BACKUP_DISCONNECT);
  ipcMain.handle(
    IPC_CHANNELS.BACKUP_DISCONNECT,
    async (): Promise<IpcResult<void>> => {
      try {
        requireSuperAdmin();
        await googleDriveService.disconnect();
        return { success: true, data: undefined };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to disconnect Google Drive.';
        return { success: false, error: message };
      }
    }
  );

  // 4. Save Backup Configuration (Schedule, Auto-enabled, Retention, OAuth Credentials)
  ipcMain.removeHandler(IPC_CHANNELS.BACKUP_SAVE_CONFIG);
  ipcMain.handle(
    IPC_CHANNELS.BACKUP_SAVE_CONFIG,
    async (_event, input: SaveBackupConfigRequest): Promise<IpcResult<BackupStatusDto>> => {
      try {
        requireSuperAdmin();
        const data = await backupService.saveConfig(input);
        return { success: true, data };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to save backup configuration.';
        return { success: false, error: message };
      }
    }
  );

  // 5. Trigger Backup Now (Manual Backup)
  ipcMain.removeHandler(IPC_CHANNELS.BACKUP_TRIGGER_NOW);
  ipcMain.handle(
    IPC_CHANNELS.BACKUP_TRIGGER_NOW,
    async (): Promise<IpcResult<BackupHistoryDto>> => {
      try {
        requireSuperAdmin();
        const data = await backupService.performBackup('MANUAL');
        return { success: true, data };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Manual backup failed.';
        return { success: false, error: message };
      }
    }
  );

  // 6. List Backup History
  ipcMain.removeHandler(IPC_CHANNELS.BACKUP_LIST_HISTORY);
  ipcMain.handle(
    IPC_CHANNELS.BACKUP_LIST_HISTORY,
    async (_event, limit?: number): Promise<IpcResult<BackupHistoryDto[]>> => {
      try {
        requireSuperAdmin();
        const data = await backupService.listHistory(limit);
        return { success: true, data };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to list backup history.';
        return { success: false, error: message };
      }
    }
  );

  // 7. Restore Selected Backup
  ipcMain.removeHandler(IPC_CHANNELS.BACKUP_RESTORE);
  ipcMain.handle(
    IPC_CHANNELS.BACKUP_RESTORE,
    async (_event, input: RestoreBackupRequest): Promise<IpcResult<RestoreBackupResultDto>> => {
      try {
        requireSuperAdmin();
        const data = await backupService.restoreBackup(input.backupId);
        return { success: true, data };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to restore backup.';
        return { success: false, error: message };
      }
    }
  );

  // 8. Export Master Recovery Key (Hex string)
  ipcMain.removeHandler(IPC_CHANNELS.BACKUP_GET_RECOVERY_KEY);
  ipcMain.handle(
    IPC_CHANNELS.BACKUP_GET_RECOVERY_KEY,
    async (): Promise<IpcResult<{ recoveryKey: string }>> => {
      try {
        requireSuperAdmin();
        const recoveryKey = backupCryptoService.exportRecoveryKey();
        return { success: true, data: { recoveryKey } };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to retrieve recovery key.';
        return { success: false, error: message };
      }
    }
  );

  // 9. Import/Set Master Recovery Key
  ipcMain.removeHandler(IPC_CHANNELS.BACKUP_SET_RECOVERY_KEY);
  ipcMain.handle(
    IPC_CHANNELS.BACKUP_SET_RECOVERY_KEY,
    async (_event, input: { recoveryKey: string }): Promise<IpcResult<{ success: boolean }>> => {
      try {
        requireSuperAdmin();
        const ok = backupCryptoService.importRecoveryKey(input.recoveryKey);
        return { success: true, data: { success: ok } };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to import recovery key.';
        return { success: false, error: message };
      }
    }
  );
}
