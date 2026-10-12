import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants/ipcChannels';
import type {
  CreateCategoryRequest,
  IpcResult,
  ListCategoriesFilter,
  UpdateCategoryRequest,
} from '../../shared/types/ipc';
import { categoryService } from '../services/categoryService';

export function registerCategoryIpcHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.CATEGORY_LIST,
    async (_event, options?: ListCategoriesFilter): Promise<IpcResult<unknown>> => {
      try {
        const categories = await categoryService.listCategories(options);
        return { success: true, data: categories };
      } catch (err: unknown) {
        return {
          success: false,
          error: {
            message: err instanceof Error ? err.message : 'Failed to list categories.',
          },
        };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.CATEGORY_CREATE,
    async (_event, input: CreateCategoryRequest): Promise<IpcResult<unknown>> => {
      try {
        const created = await categoryService.createCategory(input);
        return { success: true, data: created };
      } catch (err: unknown) {
        return {
          success: false,
          error: {
            message: err instanceof Error ? err.message : 'Failed to create category.',
          },
        };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.CATEGORY_UPDATE,
    async (_event, input: UpdateCategoryRequest): Promise<IpcResult<unknown>> => {
      try {
        const updated = await categoryService.updateCategory(input);
        return { success: true, data: updated };
      } catch (err: unknown) {
        return {
          success: false,
          error: {
            message: err instanceof Error ? err.message : 'Failed to update category.',
          },
        };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.CATEGORY_GET_BY_ID,
    async (_event, id: string): Promise<IpcResult<unknown>> => {
      try {
        const category = await categoryService.getCategoryById(id);
        return { success: true, data: category };
      } catch (err: unknown) {
        return {
          success: false,
          error: {
            message: err instanceof Error ? err.message : 'Failed to retrieve category.',
          },
        };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.CATEGORY_DELETE,
    async (_event, id: string): Promise<IpcResult<unknown>> => {
      try {
        const result = await categoryService.deleteCategory(id);
        return { success: true, data: result };
      } catch (err: unknown) {
        return {
          success: false,
          error: {
            message: err instanceof Error ? err.message : 'Failed to delete category.',
          },
        };
      }
    }
  );
}
