import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants/ipcChannels';
import type {
  CreateProductRequest,
  IpcResult,
  ListProductsFilter,
  ProductDto,
  UpdateProductRequest,
} from '../../shared/types/ipc';
import { productService } from '../services/productService';

/**
 * Registers IPC handlers for company-scoped product management.
 * Strictly enforces authentication and company isolation on all operations.
 */
export function registerProductIpcHandlers(): void {
  // List Products
  ipcMain.removeHandler(IPC_CHANNELS.PRODUCT_LIST);
  ipcMain.handle(
    IPC_CHANNELS.PRODUCT_LIST,
    async (
      _event,
      options?: ListProductsFilter
    ): Promise<IpcResult<ProductDto[]>> => {
      try {
        const products = await productService.listProducts(options);
        return { success: true, data: products };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to list products.';
        return { success: false, error: message };
      }
    }
  );

  // Get Product by ID
  ipcMain.removeHandler(IPC_CHANNELS.PRODUCT_GET_BY_ID);
  ipcMain.handle(
    IPC_CHANNELS.PRODUCT_GET_BY_ID,
    async (
      _event,
      id: string
    ): Promise<IpcResult<ProductDto>> => {
      try {
        const product = await productService.getProductById(id);
        return { success: true, data: product };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to get product.';
        return { success: false, error: message };
      }
    }
  );

  // Create Product
  ipcMain.removeHandler(IPC_CHANNELS.PRODUCT_CREATE);
  ipcMain.handle(
    IPC_CHANNELS.PRODUCT_CREATE,
    async (
      _event,
      input: CreateProductRequest
    ): Promise<IpcResult<ProductDto>> => {
      try {
        const product = await productService.createProduct(input);
        return { success: true, data: product };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to create product.';
        return { success: false, error: message };
      }
    }
  );

  // Update Product
  ipcMain.removeHandler(IPC_CHANNELS.PRODUCT_UPDATE);
  ipcMain.handle(
    IPC_CHANNELS.PRODUCT_UPDATE,
    async (
      _event,
      input: UpdateProductRequest
    ): Promise<IpcResult<ProductDto>> => {
      try {
        const product = await productService.updateProduct(input);
        return { success: true, data: product };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to update product.';
        return { success: false, error: message };
      }
    }
  );


  // Delete Product Permanently
  ipcMain.removeHandler(IPC_CHANNELS.PRODUCT_DELETE);
  ipcMain.handle(
    IPC_CHANNELS.PRODUCT_DELETE,
    async (
      _event,
      id: string
    ): Promise<IpcResult<{ id: string }>> => {
      try {
        const result = await productService.deleteProduct(id);
        return { success: true, data: result };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to delete product.';
        return { success: false, error: message };
      }
    }
  );

  // Print Barcode
  ipcMain.removeHandler(IPC_CHANNELS.PRODUCT_PRINT_BARCODE);
  ipcMain.handle(
    IPC_CHANNELS.PRODUCT_PRINT_BARCODE,
    async (
      event,
      productId: string
    ): Promise<IpcResult<{ printed: boolean }>> => {
      try {
        await productService.getProductById(productId);
        event.sender.print({ silent: false, printBackground: true });
        return { success: true, data: { printed: true } };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to print barcode.';
        return { success: false, error: message };
      }
    }
  );
}
