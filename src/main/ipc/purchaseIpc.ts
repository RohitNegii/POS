import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants/ipcChannels';
import type {
  CreatePurchaseRequest,
  UpdatePurchaseRequest,
  UpdatePurchasePaymentRequest,
  IpcResult,
  ListPurchasesFilter,
  PurchaseDto,
  OverduePurchasesSummary,
} from '../../shared/types/ipc';
import { purchaseService } from '../services/purchaseService';
import { purchaseReturnService } from '../services/purchaseReturnService';
import type {
  CreatePurchaseReturnRequest,
  ListPurchaseReturnsFilter,
  PurchaseReturnDto,
} from '../../shared/types/ipc';

export function registerPurchaseIpcHandlers(): void {
  ipcMain.removeHandler(IPC_CHANNELS.PURCHASE_LIST);
  ipcMain.handle(
    IPC_CHANNELS.PURCHASE_LIST,
    async (
      _event,
      filter?: ListPurchasesFilter
    ): Promise<IpcResult<PurchaseDto[]>> => {
      try {
        const purchases = await purchaseService.listPurchases(filter);
        return { success: true, data: purchases };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to list purchases.';
        return { success: false, error: message };
      }
    }
  );

  ipcMain.removeHandler(IPC_CHANNELS.PURCHASE_CREATE);
  ipcMain.handle(
    IPC_CHANNELS.PURCHASE_CREATE,
    async (
      _event,
      input: CreatePurchaseRequest
    ): Promise<IpcResult<PurchaseDto>> => {
      try {
        const purchase = await purchaseService.createPurchase(input);
        return { success: true, data: purchase };
      } catch (error) {
        console.error('[IPC ERROR: purchase:create]', error);
        const message =
          error instanceof Error ? error.message : 'Failed to record purchase.';
        return { success: false, error: message };
      }
    }
  );

  ipcMain.removeHandler(IPC_CHANNELS.PURCHASE_UPDATE);
  ipcMain.handle(
    IPC_CHANNELS.PURCHASE_UPDATE,
    async (
      _event,
      input: UpdatePurchaseRequest
    ): Promise<IpcResult<PurchaseDto>> => {
      try {
        const updated = await purchaseService.updatePurchase(input);
        return { success: true, data: updated };
      } catch (error) {
        console.error('[IPC ERROR: purchase:update]', error);
        const message =
          error instanceof Error ? error.message : 'Failed to update purchase bill.';
        return { success: false, error: message };
      }
    }
  );

  ipcMain.removeHandler(IPC_CHANNELS.PURCHASE_UPDATE_PAYMENT);
  ipcMain.handle(
    IPC_CHANNELS.PURCHASE_UPDATE_PAYMENT,
    async (
      _event,
      input: UpdatePurchasePaymentRequest
    ): Promise<IpcResult<PurchaseDto>> => {
      try {
        const updated = await purchaseService.updatePurchasePayment(input);
        return { success: true, data: updated };
      } catch (error) {
        console.error('[IPC ERROR: purchase:update-payment]', error);
        const message =
          error instanceof Error ? error.message : 'Failed to update purchase payment.';
        return { success: false, error: message };
      }
    }
  );

  ipcMain.removeHandler(IPC_CHANNELS.PURCHASE_GET_BY_ID);
  ipcMain.handle(
    IPC_CHANNELS.PURCHASE_GET_BY_ID,
    async (
      _event,
      id: string
    ): Promise<IpcResult<PurchaseDto | null>> => {
      try {
        const purchase = await purchaseService.getPurchaseById(id);
        return { success: true, data: purchase };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to retrieve purchase bill.';
        return { success: false, error: message };
      }
    }
  );

  ipcMain.removeHandler(IPC_CHANNELS.PURCHASE_GET_OVERDUE);
  ipcMain.handle(
    IPC_CHANNELS.PURCHASE_GET_OVERDUE,
    async (
      _event,
      thresholdDays?: number
    ): Promise<IpcResult<OverduePurchasesSummary>> => {
      try {
        const summary = await purchaseService.getOverduePurchases(thresholdDays);
        return { success: true, data: summary };
      } catch (error) {
        console.error('[IPC ERROR: purchase:get-overdue]', error);
        const message =
          error instanceof Error ? error.message : 'Failed to retrieve overdue purchases.';
        return { success: false, error: message };
      }
    }
  );

  ipcMain.removeHandler(IPC_CHANNELS.PURCHASE_DELETE);
  ipcMain.handle(
    IPC_CHANNELS.PURCHASE_DELETE,
    async (
      _event,
      id: string
    ): Promise<IpcResult<{ id: string }>> => {
      try {
        const result = await purchaseService.deletePurchase(id);
        return { success: true, data: result };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to delete purchase.';
        return { success: false, error: message };
      }
    }
  );

  ipcMain.removeHandler(IPC_CHANNELS.PURCHASE_RETURN_CREATE);
  ipcMain.handle(
    IPC_CHANNELS.PURCHASE_RETURN_CREATE,
    async (_event, input: CreatePurchaseReturnRequest): Promise<IpcResult<PurchaseReturnDto>> => {
      try {
        const ret = await purchaseReturnService.createPurchaseReturn(input);
        return { success: true, data: ret };
      } catch (error) {
        console.error('[IPC ERROR: purchase-return:create]', error);
        return { success: false, error: error instanceof Error ? error.message : 'Failed to process purchase return.' };
      }
    }
  );

  ipcMain.removeHandler(IPC_CHANNELS.PURCHASE_RETURN_LIST);
  ipcMain.handle(
    IPC_CHANNELS.PURCHASE_RETURN_LIST,
    async (_event, filter?: ListPurchaseReturnsFilter): Promise<IpcResult<PurchaseReturnDto[]>> => {
      try {
        const list = await purchaseReturnService.listPurchaseReturns(filter);
        return { success: true, data: list };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Failed to list purchase returns.' };
      }
    }
  );

  ipcMain.removeHandler(IPC_CHANNELS.PURCHASE_RETURN_GET_BY_ID);
  ipcMain.handle(
    IPC_CHANNELS.PURCHASE_RETURN_GET_BY_ID,
    async (_event, id: string): Promise<IpcResult<PurchaseReturnDto | null>> => {
      try {
        const ret = await purchaseReturnService.getPurchaseReturnById(id);
        return { success: true, data: ret };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Failed to get purchase return.' };
      }
    }
  );
}
