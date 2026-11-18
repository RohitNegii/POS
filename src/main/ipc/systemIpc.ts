import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants/ipcChannels';
import {
  DatabasePingPayload,
  IpcResult,
  PrinterInfo,
  SystemStatusPayload,
} from '../../shared/types/ipc';
import { systemService } from '../services/systemService';

export function registerSystemIpcHandlers(): void {
  ipcMain.removeHandler(IPC_CHANNELS.SYSTEM_GET_STATUS);
  ipcMain.handle(
    IPC_CHANNELS.SYSTEM_GET_STATUS,
    async (): Promise<IpcResult<SystemStatusPayload>> => {
      try {
        const data = await systemService.getSystemStatus();
        return { success: true, data };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to load system status.';
        return { success: false, error: message };
      }
    }
  );

  ipcMain.removeHandler(IPC_CHANNELS.SYSTEM_GET_PRINTERS);
  ipcMain.handle(
    IPC_CHANNELS.SYSTEM_GET_PRINTERS,
    async (event): Promise<IpcResult<PrinterInfo[]>> => {
      try {
        const webContents = event.sender;
        const printers = await webContents.getPrintersAsync();
        return { success: true, data: printers };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to query system printers.';
        return { success: false, error: message };
      }
    }
  );

  ipcMain.removeHandler(IPC_CHANNELS.DATABASE_PING);
  ipcMain.handle(
    IPC_CHANNELS.DATABASE_PING,
    async (): Promise<IpcResult<DatabasePingPayload>> => {
      try {
        const data = await systemService.pingDatabase();
        return { success: true, data };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Database ping failed.';
        return { success: false, error: message };
      }
    }
  );
}
