import { contextBridge, ipcRenderer } from 'electron';
import type {
  AuthSessionPayload,
  BuyerDto,
  CategoryDto,
  CategoryFieldDto,
  CreateBuyerRequest,
  CreateCategoryFieldRequest,
  CreateCategoryRequest,
  DatabasePingPayload,
  IpcResult,
  ListCategoriesFilter,
  LoginCredentials,
  PosDesktopApi,
  ProtectedTestPayload,
  ReorderCategoryFieldsRequest,
  SystemStatusPayload,
  UpdateBuyerRequest,
  UpdateCategoryFieldRequest,
  UpdateCategoryRequest,
  CurrentMetalRatesDto,
  MetalRateHistoryItemDto,
  SaveDailyRatesRequest,
} from '../shared/types/ipc';

const CHANNELS = {
  SYSTEM_GET_STATUS: 'system:get-status',
  DATABASE_PING: 'database:ping',
  AUTH_LOGIN: 'auth:login',
  AUTH_LOGOUT: 'auth:logout',
  AUTH_GET_SESSION: 'auth:get-session',
  AUTH_TEST_PROTECTED_OP: 'auth:test-protected-operation',
  CATEGORY_LIST: 'category:list',
  CATEGORY_CREATE: 'category:create',
  CATEGORY_UPDATE: 'category:update',
  CATEGORY_GET_BY_ID: 'category:get-by-id',
  CATEGORY_DELETE: 'category:delete',
  CATEGORY_FIELD_LIST: 'category-field:list',
  CATEGORY_FIELD_CREATE: 'category-field:create',
  CATEGORY_FIELD_UPDATE: 'category-field:update',
  CATEGORY_FIELD_DELETE: 'category-field:delete',
  CATEGORY_FIELD_REORDER: 'category-field:reorder',
  BUYER_LIST: 'buyer:list',
  BUYER_CREATE: 'buyer:create',
  BUYER_UPDATE: 'buyer:update',
  BUYER_GET_BY_ID: 'buyer:get-by-id',
  BUYER_DELETE: 'buyer:delete',
  METAL_RATE_GET_CURRENT: 'metal-rate:get-current',
  METAL_RATE_SAVE_DAILY: 'metal-rate:save-daily',
  METAL_RATE_GET_HISTORY: 'metal-rate:get-history',
} as const;

const posDesktopApi: PosDesktopApi = Object.freeze({
  getSystemStatus: (): Promise<IpcResult<SystemStatusPayload>> => {
    return ipcRenderer.invoke(CHANNELS.SYSTEM_GET_STATUS);
  },
  pingDatabase: (): Promise<IpcResult<DatabasePingPayload>> => {
    return ipcRenderer.invoke(CHANNELS.DATABASE_PING);
  },
  login: (credentials: LoginCredentials): Promise<IpcResult<AuthSessionPayload>> => {
    return ipcRenderer.invoke(CHANNELS.AUTH_LOGIN, credentials);
  },
  logout: (): Promise<IpcResult<void>> => {
    return ipcRenderer.invoke(CHANNELS.AUTH_LOGOUT);
  },
  getSession: (): Promise<IpcResult<AuthSessionPayload | null>> => {
    return ipcRenderer.invoke(CHANNELS.AUTH_GET_SESSION);
  },
  testProtectedOperation: (): Promise<IpcResult<ProtectedTestPayload>> => {
    return ipcRenderer.invoke(CHANNELS.AUTH_TEST_PROTECTED_OP);
  },
  listCategories: (options?: ListCategoriesFilter): Promise<IpcResult<CategoryDto[]>> => {
    return ipcRenderer.invoke(CHANNELS.CATEGORY_LIST, options);
  },
  createCategory: (input: CreateCategoryRequest): Promise<IpcResult<CategoryDto>> => {
    return ipcRenderer.invoke(CHANNELS.CATEGORY_CREATE, input);
  },
  updateCategory: (input: UpdateCategoryRequest): Promise<IpcResult<CategoryDto>> => {
    return ipcRenderer.invoke(CHANNELS.CATEGORY_UPDATE, input);
  },
  getCategoryById: (id: string): Promise<IpcResult<CategoryDto>> => {
    return ipcRenderer.invoke(CHANNELS.CATEGORY_GET_BY_ID, id);
  },
  deleteCategory: (id: string): Promise<IpcResult<CategoryDto>> => {
    return ipcRenderer.invoke(CHANNELS.CATEGORY_DELETE, id);
  },
  listCategoryFields: (categoryId: string): Promise<IpcResult<CategoryFieldDto[]>> => {
    return ipcRenderer.invoke(CHANNELS.CATEGORY_FIELD_LIST, categoryId);
  },
  createCategoryField: (input: CreateCategoryFieldRequest): Promise<IpcResult<CategoryFieldDto>> => {
    return ipcRenderer.invoke(CHANNELS.CATEGORY_FIELD_CREATE, input);
  },
  updateCategoryField: (input: UpdateCategoryFieldRequest): Promise<IpcResult<CategoryFieldDto>> => {
    return ipcRenderer.invoke(CHANNELS.CATEGORY_FIELD_UPDATE, input);
  },
  deleteCategoryField: (id: string): Promise<IpcResult<{ id: string; name: string }>> => {
    return ipcRenderer.invoke(CHANNELS.CATEGORY_FIELD_DELETE, id);
  },
  reorderCategoryFields: (input: ReorderCategoryFieldsRequest): Promise<IpcResult<CategoryFieldDto[]>> => {
    return ipcRenderer.invoke(CHANNELS.CATEGORY_FIELD_REORDER, input);
  },
  listBuyers: (search?: string): Promise<IpcResult<BuyerDto[]>> => {
    return ipcRenderer.invoke(CHANNELS.BUYER_LIST, search);
  },
  getBuyerById: (id: string): Promise<IpcResult<BuyerDto>> => {
    return ipcRenderer.invoke(CHANNELS.BUYER_GET_BY_ID, id);
  },
  createBuyer: (input: CreateBuyerRequest): Promise<IpcResult<BuyerDto>> => {
    return ipcRenderer.invoke(CHANNELS.BUYER_CREATE, input);
  },
  updateBuyer: (input: UpdateBuyerRequest): Promise<IpcResult<BuyerDto>> => {
    return ipcRenderer.invoke(CHANNELS.BUYER_UPDATE, input);
  },
  deleteBuyer: (id: string): Promise<IpcResult<boolean>> => {
    return ipcRenderer.invoke(CHANNELS.BUYER_DELETE, id);
  },
  getCurrentMetalRates: (asOfDate?: string): Promise<IpcResult<CurrentMetalRatesDto>> => {
    return ipcRenderer.invoke(CHANNELS.METAL_RATE_GET_CURRENT, asOfDate);
  },
  saveDailyMetalRates: (request: SaveDailyRatesRequest): Promise<IpcResult<CurrentMetalRatesDto>> => {
    return ipcRenderer.invoke(CHANNELS.METAL_RATE_SAVE_DAILY, request);
  },
  getMetalRateHistory: (): Promise<IpcResult<MetalRateHistoryItemDto[]>> => {
    return ipcRenderer.invoke(CHANNELS.METAL_RATE_GET_HISTORY);
  },
});

contextBridge.exposeInMainWorld('posDesktop', posDesktopApi);
