import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants/ipcChannels';
import type {
  CreateCategoryFieldRequest,
  IpcResult,
  ReorderCategoryFieldsRequest,
  UpdateCategoryFieldRequest,
} from '../../shared/types/ipc';
import { categoryFieldService } from '../services/categoryFieldService';

export function registerCategoryFieldIpcHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.CATEGORY_FIELD_LIST,
    async (_event, categoryId: string): Promise<IpcResult<unknown>> => {
      try {
        const fields = await categoryFieldService.listFields(categoryId);
        return { success: true, data: fields };
      } catch (err: unknown) {
        return {
          success: false,
          error: {
            message: err instanceof Error ? err.message : 'Failed to list category fields.',
          },
        };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.CATEGORY_FIELD_CREATE,
    async (_event, input: CreateCategoryFieldRequest): Promise<IpcResult<unknown>> => {
      try {
        const field = await categoryFieldService.createField(input);
        return { success: true, data: field };
      } catch (err: unknown) {
        return {
          success: false,
          error: {
            message: err instanceof Error ? err.message : 'Failed to create category field.',
          },
        };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.CATEGORY_FIELD_UPDATE,
    async (_event, input: UpdateCategoryFieldRequest): Promise<IpcResult<unknown>> => {
      try {
        const updated = await categoryFieldService.updateField(input);
        return { success: true, data: updated };
      } catch (err: unknown) {
        return {
          success: false,
          error: {
            message: err instanceof Error ? err.message : 'Failed to update category field.',
          },
        };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.CATEGORY_FIELD_DELETE,
    async (_event, id: string): Promise<IpcResult<unknown>> => {
      try {
        const result = await categoryFieldService.deleteField(id);
        return { success: true, data: result };
      } catch (err: unknown) {
        return {
          success: false,
          error: {
            message: err instanceof Error ? err.message : 'Failed to delete category field.',
          },
        };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.CATEGORY_FIELD_REORDER,
    async (_event, input: ReorderCategoryFieldsRequest): Promise<IpcResult<unknown>> => {
      try {
        const fields = await categoryFieldService.reorderFields(input);
        return { success: true, data: fields };
      } catch (err: unknown) {
        return {
          success: false,
          error: {
            message: err instanceof Error ? err.message : 'Failed to reorder category fields.',
          },
        };
      }
    }
  );
}
