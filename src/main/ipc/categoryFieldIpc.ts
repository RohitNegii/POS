import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants/ipcChannels';
import type {
  CategoryFieldDto,
  CreateCategoryFieldRequest,
  IpcResult,
  ReorderCategoryFieldsRequest,
  UpdateCategoryFieldRequest,
} from '../../shared/types/ipc';
import { categoryFieldService } from '../services/categoryFieldService';

/**
 * Registers IPC handlers for company-scoped category dynamic fields management.
 * Strictly enforces authentication and company isolation on all operations.
 */
export function registerCategoryFieldIpcHandlers(): void {
  // List Fields for a Category
  ipcMain.removeHandler(IPC_CHANNELS.CATEGORY_FIELD_LIST);
  ipcMain.handle(
    IPC_CHANNELS.CATEGORY_FIELD_LIST,
    async (
      _event,
      categoryId: string
    ): Promise<IpcResult<CategoryFieldDto[]>> => {
      try {
        const fields = await categoryFieldService.listFields(categoryId);
        return { success: true, data: fields };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to list category fields.';
        return { success: false, error: message };
      }
    }
  );

  // Create Field
  ipcMain.removeHandler(IPC_CHANNELS.CATEGORY_FIELD_CREATE);
  ipcMain.handle(
    IPC_CHANNELS.CATEGORY_FIELD_CREATE,
    async (
      _event,
      input: CreateCategoryFieldRequest
    ): Promise<IpcResult<CategoryFieldDto>> => {
      try {
        const field = await categoryFieldService.createField(input);
        return { success: true, data: field };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to create category field.';
        return { success: false, error: message };
      }
    }
  );

  // Update Field
  ipcMain.removeHandler(IPC_CHANNELS.CATEGORY_FIELD_UPDATE);
  ipcMain.handle(
    IPC_CHANNELS.CATEGORY_FIELD_UPDATE,
    async (
      _event,
      input: UpdateCategoryFieldRequest
    ): Promise<IpcResult<CategoryFieldDto>> => {
      try {
        const field = await categoryFieldService.updateField(input);
        return { success: true, data: field };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to update category field.';
        return { success: false, error: message };
      }
    }
  );

  // Delete Field
  ipcMain.removeHandler(IPC_CHANNELS.CATEGORY_FIELD_DELETE);
  ipcMain.handle(
    IPC_CHANNELS.CATEGORY_FIELD_DELETE,
    async (
      _event,
      fieldId: string
    ): Promise<IpcResult<{ id: string }>> => {
      try {
        const result = await categoryFieldService.deleteField(fieldId);
        return { success: true, data: result };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to delete category field.';
        return { success: false, error: message };
      }
    }
  );

  // Reorder Fields
  ipcMain.removeHandler(IPC_CHANNELS.CATEGORY_FIELD_REORDER);
  ipcMain.handle(
    IPC_CHANNELS.CATEGORY_FIELD_REORDER,
    async (
      _event,
      input: ReorderCategoryFieldsRequest
    ): Promise<IpcResult<CategoryFieldDto[]>> => {
      try {
        const fields = await categoryFieldService.reorderFields(input);
        return { success: true, data: fields };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to reorder category fields.';
        return { success: false, error: message };
      }
    }
  );
}
