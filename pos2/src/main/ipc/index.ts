import { registerAuthIpcHandlers } from './authIpc';
import { registerCategoryIpcHandlers } from './categoryIpc';
import { registerCategoryFieldIpcHandlers } from './categoryFieldIpc';
import { registerBuyerIpcHandlers } from './buyerIpc';
import { registerMetalRateIpcHandlers } from './metalRateIpc';
import { registerSystemIpcHandlers } from './systemIpc';

export function registerAllIpcHandlers(): void {
  registerSystemIpcHandlers();
  registerAuthIpcHandlers();
  registerCategoryIpcHandlers();
  registerCategoryFieldIpcHandlers();
  registerBuyerIpcHandlers();
  registerMetalRateIpcHandlers();
}
