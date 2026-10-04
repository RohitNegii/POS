import { registerAuthIpcHandlers } from './authIpc';
import { registerCategoryFieldIpcHandlers } from './categoryFieldIpc';
import { registerCategoryIpcHandlers } from './categoryIpc';
import { registerMetalRateIpcHandlers } from './metalRateIpc';
import { registerProductIpcHandlers } from './productIpc';
import { registerSystemIpcHandlers } from './systemIpc';

export function registerAllIpcHandlers(): void {
  registerSystemIpcHandlers();
  registerAuthIpcHandlers();
  registerCategoryIpcHandlers();
  registerCategoryFieldIpcHandlers();
  registerProductIpcHandlers();
  registerMetalRateIpcHandlers();
}

