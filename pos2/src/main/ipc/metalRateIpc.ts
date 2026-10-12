import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants/ipcChannels';
import type { IpcResult, SaveDailyRatesRequest } from '../../shared/types/ipc';
import { metalRateService } from '../services/metalRateService';

export function registerMetalRateIpcHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.METAL_RATE_GET_CURRENT,
    async (_event, asOfDate?: string): Promise<IpcResult<unknown>> => {
      try {
        const rates = await metalRateService.getCurrentRates(asOfDate);
        return { success: true, data: rates };
      } catch (err: unknown) {
        return {
          success: false,
          error: {
            message: err instanceof Error ? err.message : 'Failed to retrieve current metal rates.',
          },
        };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.METAL_RATE_SAVE_DAILY,
    async (_event, request: SaveDailyRatesRequest): Promise<IpcResult<unknown>> => {
      try {
        const updatedRates = await metalRateService.saveDailyRates(request);
        return { success: true, data: updatedRates };
      } catch (err: unknown) {
        return {
          success: false,
          error: {
            message: err instanceof Error ? err.message : 'Failed to save daily metal rates.',
          },
        };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.METAL_RATE_GET_HISTORY,
    async (): Promise<IpcResult<unknown>> => {
      try {
        const history = await metalRateService.getRateHistory();
        return { success: true, data: history };
      } catch (err: unknown) {
        return {
          success: false,
          error: {
            message: err instanceof Error ? err.message : 'Failed to retrieve metal rate history.',
          },
        };
      }
    }
  );
}
