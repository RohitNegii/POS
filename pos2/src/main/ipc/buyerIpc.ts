import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants/ipcChannels';
import type {
  CreateBuyerRequest,
  IpcResult,
  UpdateBuyerRequest,
} from '../../shared/types/ipc';
import { buyerService } from '../services/buyerService';

export function registerBuyerIpcHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.BUYER_LIST,
    async (_event, search?: string): Promise<IpcResult<unknown>> => {
      try {
        const buyers = await buyerService.listBuyers(search);
        return { success: true, data: buyers };
      } catch (err: unknown) {
        return {
          success: false,
          error: {
            message: err instanceof Error ? err.message : 'Failed to list buyers.',
          },
        };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.BUYER_GET_BY_ID,
    async (_event, id: string): Promise<IpcResult<unknown>> => {
      try {
        const buyer = await buyerService.getBuyerById(id);
        return { success: true, data: buyer };
      } catch (err: unknown) {
        return {
          success: false,
          error: {
            message: err instanceof Error ? err.message : 'Failed to retrieve buyer.',
          },
        };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.BUYER_CREATE,
    async (_event, input: CreateBuyerRequest): Promise<IpcResult<unknown>> => {
      try {
        const created = await buyerService.createBuyer(input);
        return { success: true, data: created };
      } catch (err: unknown) {
        return {
          success: false,
          error: {
            message: err instanceof Error ? err.message : 'Failed to create buyer.',
          },
        };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.BUYER_UPDATE,
    async (_event, input: UpdateBuyerRequest): Promise<IpcResult<unknown>> => {
      try {
        const updated = await buyerService.updateBuyer(input);
        return { success: true, data: updated };
      } catch (err: unknown) {
        return {
          success: false,
          error: {
            message: err instanceof Error ? err.message : 'Failed to update buyer.',
          },
        };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.BUYER_DELETE,
    async (_event, id: string): Promise<IpcResult<unknown>> => {
      try {
        const success = await buyerService.deleteBuyer(id);
        return { success: true, data: success };
      } catch (err: unknown) {
        return {
          success: false,
          error: {
            message: err instanceof Error ? err.message : 'Failed to delete buyer.',
          },
        };
      }
    }
  );
}
