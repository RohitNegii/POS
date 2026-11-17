import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants/ipcChannels';
import type {
  BillingUserDto,
  CreateBillingUserRequest,
  IpcResult,
  UpdateBillingUserRequest,
} from '../../shared/types/ipc';
import { billingUserService } from '../services/billingUserService';

/**
 * Registers IPC handlers for Billing User Management.
 */
export function registerBillingUserIpcHandlers(): void {
  // 1. List all billing users
  ipcMain.removeHandler(IPC_CHANNELS.BILLING_USER_LIST);
  ipcMain.handle(
    IPC_CHANNELS.BILLING_USER_LIST,
    async (): Promise<IpcResult<BillingUserDto[]>> => {
      try {
        const users = await billingUserService.listBillingUsers();
        return { success: true, data: users };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to list billing users.';
        return { success: false, error: message };
      }
    }
  );

  // 2. Create a new billing user (Super Admin only)
  ipcMain.removeHandler(IPC_CHANNELS.BILLING_USER_CREATE);
  ipcMain.handle(
    IPC_CHANNELS.BILLING_USER_CREATE,
    async (_event, request: CreateBillingUserRequest): Promise<IpcResult<BillingUserDto>> => {
      try {
        const user = await billingUserService.createBillingUser(request);
        return { success: true, data: user };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to create billing user.';
        return { success: false, error: message };
      }
    }
  );

  // 3. Update an existing billing user (Super Admin only)
  ipcMain.removeHandler(IPC_CHANNELS.BILLING_USER_UPDATE);
  ipcMain.handle(
    IPC_CHANNELS.BILLING_USER_UPDATE,
    async (_event, request: UpdateBillingUserRequest): Promise<IpcResult<BillingUserDto>> => {
      try {
        const user = await billingUserService.updateBillingUser(request.id, request);
        return { success: true, data: user };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to update billing user.';
        return { success: false, error: message };
      }
    }
  );

  // 4. Delete a billing user (Super Admin only)
  ipcMain.removeHandler(IPC_CHANNELS.BILLING_USER_DELETE);
  ipcMain.handle(
    IPC_CHANNELS.BILLING_USER_DELETE,
    async (_event, id: string): Promise<IpcResult<{ id: string; name: string }>> => {
      try {
        const result = await billingUserService.deleteBillingUser(id);
        return { success: true, data: result };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to delete billing user.';
        return { success: false, error: message };
      }
    }
  );
}
