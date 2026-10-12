export const IPC_CHANNELS = {
  // System & Database
  SYSTEM_GET_STATUS: 'system:get-status',
  DATABASE_PING: 'database:ping',

  // Authentication
  AUTH_LOGIN: 'auth:login',
  AUTH_LOGOUT: 'auth:logout',
  AUTH_GET_SESSION: 'auth:get-session',
  AUTH_TEST_PROTECTED_OP: 'auth:test-protected-operation',

  // Categories
  CATEGORY_LIST: 'category:list',
  CATEGORY_CREATE: 'category:create',
  CATEGORY_UPDATE: 'category:update',
  CATEGORY_GET_BY_ID: 'category:get-by-id',
  CATEGORY_DELETE: 'category:delete',

  // Dynamic Category Fields
  CATEGORY_FIELD_LIST: 'category-field:list',
  CATEGORY_FIELD_CREATE: 'category-field:create',
  CATEGORY_FIELD_UPDATE: 'category-field:update',
  CATEGORY_FIELD_DELETE: 'category-field:delete',
  CATEGORY_FIELD_REORDER: 'category-field:reorder',

  // Buyers
  BUYER_LIST: 'buyer:list',
  BUYER_CREATE: 'buyer:create',
  BUYER_UPDATE: 'buyer:update',
  BUYER_GET_BY_ID: 'buyer:get-by-id',
  BUYER_DELETE: 'buyer:delete',

  // Metal Rates
  METAL_RATE_GET_CURRENT: 'metal-rate:get-current',
  METAL_RATE_SAVE_DAILY: 'metal-rate:save-daily',
  METAL_RATE_GET_HISTORY: 'metal-rate:get-history',
} as const;

export type IpcChannel = typeof IPC_CHANNELS[keyof typeof IPC_CHANNELS];
