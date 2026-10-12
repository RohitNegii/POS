import { registerAuthIpcHandlers } from './authIpc';
import { registerBillingIpcHandlers } from './billingIpc';
import { registerCategoryFieldIpcHandlers } from './categoryFieldIpc';
import { registerCategoryIpcHandlers } from './categoryIpc';
import { registerMetalRateIpcHandlers } from './metalRateIpc';
import { registerProductIpcHandlers } from './productIpc';
import { registerPurchaseIpcHandlers } from './purchaseIpc';
import { registerSystemIpcHandlers } from './systemIpc';
import { registerVendorIpcHandlers } from './vendorIpc';

export function registerAllIpcHandlers(): void {
  registerSystemIpcHandlers();
  registerAuthIpcHandlers();
  registerBillingIpcHandlers();
  registerCategoryIpcHandlers();
  registerCategoryFieldIpcHandlers();
  registerProductIpcHandlers();
  registerMetalRateIpcHandlers();
  registerVendorIpcHandlers();
  registerPurchaseIpcHandlers();
}

