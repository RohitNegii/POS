import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants/ipcChannels';
import type {
  CreateVendorRequest,
  IpcResult,
  UpdateVendorRequest,
  VendorDto,
} from '../../shared/types/ipc';
import { vendorService } from '../services/vendorService';

export function registerVendorIpcHandlers(): void {
  ipcMain.removeHandler(IPC_CHANNELS.VENDOR_LIST);
  ipcMain.handle(
    IPC_CHANNELS.VENDOR_LIST,
    async (_event, search?: string): Promise<IpcResult<VendorDto[]>> => {
      try {
        const vendors = await vendorService.listVendors(search);
        return { success: true, data: vendors };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to list vendors.';
        return { success: false, error: message };
      }
    }
  );

  ipcMain.removeHandler(IPC_CHANNELS.VENDOR_CREATE);
  ipcMain.handle(
    IPC_CHANNELS.VENDOR_CREATE,
    async (_event, input: CreateVendorRequest): Promise<IpcResult<VendorDto>> => {
      try {
        const vendor = await vendorService.createVendor(input);
        return { success: true, data: vendor };
      } catch (error) {
        console.error('[IPC ERROR: vendor:create]', error);
        const message = error instanceof Error ? error.message : 'Failed to create vendor.';
        return { success: false, error: message };
      }
    }
  );

  ipcMain.removeHandler(IPC_CHANNELS.VENDOR_UPDATE);
  ipcMain.handle(
    IPC_CHANNELS.VENDOR_UPDATE,
    async (_event, input: UpdateVendorRequest): Promise<IpcResult<VendorDto>> => {
      try {
        const vendor = await vendorService.updateVendor(input);
        return { success: true, data: vendor };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to update vendor.';
        return { success: false, error: message };
      }
    }
  );

  ipcMain.removeHandler(IPC_CHANNELS.VENDOR_GET_BY_ID);
  ipcMain.handle(
    IPC_CHANNELS.VENDOR_GET_BY_ID,
    async (_event, id: string): Promise<IpcResult<VendorDto>> => {
      try {
        const vendor = await vendorService.getVendorById(id);
        return { success: true, data: vendor };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to get vendor.';
        return { success: false, error: message };
      }
    }
  );

  ipcMain.removeHandler(IPC_CHANNELS.VENDOR_DELETE);
  ipcMain.handle(
    IPC_CHANNELS.VENDOR_DELETE,
    async (_event, id: string): Promise<IpcResult<{ id: string; name: string }>> => {
      try {
        const result = await vendorService.deleteVendor(id);
        return { success: true, data: result };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to delete vendor.';
        return { success: false, error: message };
      }
    }
  );
}
