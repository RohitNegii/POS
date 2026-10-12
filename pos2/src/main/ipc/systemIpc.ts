import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants/ipcChannels';
import type { IpcResult } from '../../shared/types/ipc';
import { systemService } from '../services/systemService';

export function registerSystemIpcHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.SYSTEM_GET_STATUS,
    async (): Promise<IpcResult<unknown>> => {
      try {
        const status = await systemService.getSystemStatus();
        return { success: true, data: status };
      } catch (err: unknown) {
        return {
          success: false,
          error: {
            message: err instanceof Error ? err.message : 'Failed to retrieve system status.',
          },
        };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.DATABASE_PING,
    async (): Promise<IpcResult<unknown>> => {
      try {
        const ping = await systemService.pingDatabase();
        return { success: true, data: ping };
      } catch (err: unknown) {
        return {
          success: false,
          error: {
            message: err instanceof Error ? err.message : 'Failed to ping database.',
          },
        };
      }
    }
  );
}
