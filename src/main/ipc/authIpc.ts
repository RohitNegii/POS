import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants/ipcChannels';
import {
  AuthSessionPayload,
  IpcResult,
  LoginCredentials,
  ProtectedTestPayload,
} from '../../shared/types/ipc';
import { authService } from '../services/authService';

/**
 * Registers IPC handlers for authentication and session management.
 * All authentication logic and session storage resides strictly in the Main Process.
 */
export function registerAuthIpcHandlers(): void {
  ipcMain.removeHandler(IPC_CHANNELS.AUTH_LOGIN);
  ipcMain.handle(
    IPC_CHANNELS.AUTH_LOGIN,
    async (
      _event,
      credentials: LoginCredentials
    ): Promise<IpcResult<AuthSessionPayload>> => {
      try {
        const session = await authService.login(credentials);
        return { success: true, data: session };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Invalid email or password.';
        return { success: false, error: message };
      }
    }
  );

  ipcMain.removeHandler(IPC_CHANNELS.AUTH_LOGOUT);
  ipcMain.handle(
    IPC_CHANNELS.AUTH_LOGOUT,
    async (): Promise<IpcResult<void>> => {
      try {
        await authService.logout();
        return { success: true, data: undefined };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to logout.';
        return { success: false, error: message };
      }
    }
  );

  ipcMain.removeHandler(IPC_CHANNELS.AUTH_GET_SESSION);
  ipcMain.handle(
    IPC_CHANNELS.AUTH_GET_SESSION,
    async (): Promise<IpcResult<AuthSessionPayload | null>> => {
      try {
        const session = authService.getSession();
        return { success: true, data: session };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to retrieve session.';
        return { success: false, error: message };
      }
    }
  );

  ipcMain.removeHandler(IPC_CHANNELS.AUTH_TEST_PROTECTED_OP);
  ipcMain.handle(
    IPC_CHANNELS.AUTH_TEST_PROTECTED_OP,
    async (): Promise<IpcResult<ProtectedTestPayload>> => {
      try {
        const result = await authService.testProtectedOperation();
        return { success: true, data: result };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unauthorized.';
        return { success: false, error: message };
      }
    }
  );
}
