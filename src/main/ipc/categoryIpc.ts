import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants/ipcChannels';
import {
  CategoryDto,
  CreateCategoryRequest,
  IpcResult,
  ListCategoriesFilter,
  UpdateCategoryRequest,
} from '../../shared/types/ipc';
import { categoryService } from '../services/categoryService';

/**
 * Registers IPC handlers for company-scoped category management.
 * All operations strictly enforce authentication and company isolation.
 */
export function registerCategoryIpcHandlers(): void {
  ipcMain.removeHandler(IPC_CHANNELS.CATEGORY_LIST);
  ipcMain.handle(
    IPC_CHANNELS.CATEGORY_LIST,
    async (
      _event,
      options?: ListCategoriesFilter
    ): Promise<IpcResult<CategoryDto[]>> => {
      try {
        const categories = await categoryService.listCategories(options);
        return { success: true, data: categories };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to list categories.';
        return { success: false, error: message };
      }
    }
  );

  ipcMain.removeHandler(IPC_CHANNELS.CATEGORY_CREATE);
  ipcMain.handle(
    IPC_CHANNELS.CATEGORY_CREATE,
    async (
      _event,
      input: CreateCategoryRequest
    ): Promise<IpcResult<CategoryDto>> => {
      try {
        const category = await categoryService.createCategory(input);
        return { success: true, data: category };
      } catch (error) {
        console.error('[IPC ERROR: category:create]', error);
        const message =
          error instanceof Error ? error.message : 'Failed to create category.';
        return { success: false, error: message };
      }
    }
  );

  ipcMain.removeHandler(IPC_CHANNELS.CATEGORY_UPDATE);
  ipcMain.handle(
    IPC_CHANNELS.CATEGORY_UPDATE,
    async (
      _event,
      input: UpdateCategoryRequest
    ): Promise<IpcResult<CategoryDto>> => {
      try {
        const category = await categoryService.updateCategory(input.id, {
          name: input.name,
          description: input.description,
        });
        return { success: true, data: category };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to update category.';
        return { success: false, error: message };
      }
    }
  );

  ipcMain.removeHandler(IPC_CHANNELS.CATEGORY_GET_BY_ID);
  ipcMain.handle(
    IPC_CHANNELS.CATEGORY_GET_BY_ID,
    async (_event, id: string): Promise<IpcResult<CategoryDto>> => {
      try {
        const category = await categoryService.getCategoryById(id);
        return { success: true, data: category };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to get category.';
        return { success: false, error: message };
      }
    }
  );

  ipcMain.removeHandler(IPC_CHANNELS.CATEGORY_DELETE);
  ipcMain.handle(
    IPC_CHANNELS.CATEGORY_DELETE,
    async (
      _event,
      id: string
    ): Promise<IpcResult<{ id: string; name: string }>> => {
      try {
        const result = await categoryService.deleteCategory(id);
        return { success: true, data: result };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Category cannot be deleted.';
        return { success: false, error: message };
      }
    }
  );
}
