import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants/ipcChannels';
import type {
  BillDto,
  CreateBillRequest,
  IpcResult,
  ListBillsFilter,
  ScannedProductDto,
} from '../../shared/types/ipc';
import { billingService } from '../services/billingService';

/**
 * Registers IPC handlers for the POS Billing Terminal.
 */
export function registerBillingIpcHandlers(): void {
  // 1. Scan product by barcode
  ipcMain.removeHandler(IPC_CHANNELS.BILLING_SCAN_PRODUCT);
  ipcMain.handle(
    IPC_CHANNELS.BILLING_SCAN_PRODUCT,
    async (_event, barcode: string): Promise<IpcResult<ScannedProductDto>> => {
      try {
        const product = await billingService.scanProduct(barcode);
        return { success: true, data: product };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to scan product.';
        return { success: false, error: message };
      }
    }
  );

  // 2. Search products for billing
  ipcMain.removeHandler(IPC_CHANNELS.BILLING_SEARCH_PRODUCTS);
  ipcMain.handle(
    IPC_CHANNELS.BILLING_SEARCH_PRODUCTS,
    async (_event, query?: string): Promise<IpcResult<ScannedProductDto[]>> => {
      try {
        const products = await billingService.searchProducts(query);
        return { success: true, data: products };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to search products.';
        return { success: false, error: message };
      }
    }
  );

  // 3. Create unified single bill
  ipcMain.removeHandler(IPC_CHANNELS.BILLING_CREATE_BILL);
  ipcMain.handle(
    IPC_CHANNELS.BILLING_CREATE_BILL,
    async (_event, request: CreateBillRequest): Promise<IpcResult<BillDto>> => {
      try {
        const bill = await billingService.createBill(request);
        return { success: true, data: bill };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to create bill.';
        return { success: false, error: message };
      }
    }
  );

  // 4. List past bills
  ipcMain.removeHandler(IPC_CHANNELS.BILLING_LIST_BILLS);
  ipcMain.handle(
    IPC_CHANNELS.BILLING_LIST_BILLS,
    async (_event, filter?: ListBillsFilter): Promise<IpcResult<BillDto[]>> => {
      try {
        const bills = await billingService.listBills(filter);
        return { success: true, data: bills };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to retrieve bills.';
        return { success: false, error: message };
      }
    }
  );

  // 5. Get bill by ID
  ipcMain.removeHandler(IPC_CHANNELS.BILLING_GET_BILL_BY_ID);
  ipcMain.handle(
    IPC_CHANNELS.BILLING_GET_BILL_BY_ID,
    async (_event, id: string): Promise<IpcResult<BillDto>> => {
      try {
        const bill = await billingService.getBillById(id);
        return { success: true, data: bill };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to retrieve bill.';
        return { success: false, error: message };
      }
    }
  );
}
