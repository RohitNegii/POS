import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants/ipcChannels';
import type {
  CurrentMetalRatesDto,
  IpcResult,
  JewelleryCalculationInput,
  JewelleryPriceCalculationResult,
  MetalRateHistoryItemDto,
  SaveDailyRatesRequest,
} from '../../shared/types/ipc';
import { metalRateService } from '../services/metalRateService';

/**
 * Registers IPC handlers for company-scoped daily metal rates and pricing calculations.
 */
export function registerMetalRateIpcHandlers(): void {
  // Get Current Metal Rates
  ipcMain.removeHandler(IPC_CHANNELS.METAL_RATE_GET_CURRENT);
  ipcMain.handle(
    IPC_CHANNELS.METAL_RATE_GET_CURRENT,
    async (): Promise<IpcResult<CurrentMetalRatesDto>> => {
      try {
        const rates = await metalRateService.getCurrentRates();
        return { success: true, data: rates };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to retrieve current metal rates.';
        return { success: false, error: message };
      }
    }
  );

  // Save Daily Metal Rates
  ipcMain.removeHandler(IPC_CHANNELS.METAL_RATE_SAVE_DAILY);
  ipcMain.handle(
    IPC_CHANNELS.METAL_RATE_SAVE_DAILY,
    async (
      _event,
      input: SaveDailyRatesRequest
    ): Promise<IpcResult<CurrentMetalRatesDto>> => {
      try {
        const updated = await metalRateService.saveDailyRates(input);
        return { success: true, data: updated };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to save daily metal rates.';
        return { success: false, error: message };
      }
    }
  );

  // Get Metal Rate History
  ipcMain.removeHandler(IPC_CHANNELS.METAL_RATE_GET_HISTORY);
  ipcMain.handle(
    IPC_CHANNELS.METAL_RATE_GET_HISTORY,
    async (): Promise<IpcResult<MetalRateHistoryItemDto[]>> => {
      try {
        const history = await metalRateService.getRateHistory();
        return { success: true, data: history };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to retrieve metal rate history.';
        return { success: false, error: message };
      }
    }
  );

  // Calculate Jewellery Price (isolated domain calculation)
  ipcMain.removeHandler(IPC_CHANNELS.PRICING_CALCULATE_JEWELLERY);
  ipcMain.handle(
    IPC_CHANNELS.PRICING_CALCULATE_JEWELLERY,
    async (
      _event,
      input: JewelleryCalculationInput
    ): Promise<IpcResult<JewelleryPriceCalculationResult>> => {
      try {
        const result = await metalRateService.calculatePriceForJewellery(input);
        return { success: true, data: result };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to calculate jewellery price.';
        return { success: false, error: message };
      }
    }
  );
}
