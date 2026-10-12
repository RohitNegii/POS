import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants/ipcChannels';
import type { IpcResult, LoginCredentials } from '../../shared/types/ipc';
import { authService } from '../services/authService';

export function registerAuthIpcHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.AUTH_LOGIN,
    async (_event, credentials: LoginCredentials): Promise<IpcResult<unknown>> => {
      try {
        const session = await authService.login(credentials);
        return { success: true, data: session };
      } catch (err: unknown) {
        return {
          success: false,
          error: {
            message: err instanceof Error ? err.message : 'Login failed.',
          },
        };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.AUTH_LOGOUT,
    async (): Promise<IpcResult<void>> => {
      try {
        await authService.logout();
        return { success: true, data: undefined };
      } catch (err: unknown) {
        return {
          success: false,
          error: {
            message: err instanceof Error ? err.message : 'Logout failed.',
          },
        };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.AUTH_GET_SESSION,
    async (): Promise<IpcResult<unknown>> => {
      try {
        const session = authService.getSession();
        return { success: true, data: session };
      } catch (err: unknown) {
        return {
          success: false,
          error: {
            message: err instanceof Error ? err.message : 'Failed to retrieve session.',
          },
        };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.AUTH_TEST_PROTECTED_OP,
    async (): Promise<IpcResult<unknown>> => {
      try {
        const result = await authService.testProtectedOperation();
        return { success: true, data: result };
      } catch (err: unknown) {
        return {
          success: false,
          error: {
            message: err instanceof Error ? err.message : 'Protected operation failed.',
          },
        };
      }
    }
  );
}
