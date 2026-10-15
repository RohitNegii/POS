import { contextBridge, ipcRenderer } from 'electron';
import type {
  AuthSessionPayload,
  CategoryDto,
  CategoryFieldDto,
  CreateCategoryFieldRequest,
  CreateCategoryRequest,
  CreateProductRequest,
  DatabasePingPayload,
  IpcResult,
  ListCategoriesFilter,
  ListProductsFilter,
  LoginCredentials,
  PosDesktopApi,
  ProductDto,
  ProtectedTestPayload,
  ReorderCategoryFieldsRequest,
  SystemStatusPayload,
  UpdateCategoryFieldRequest,
  UpdateCategoryRequest,
  UpdateProductRequest,
} from '../shared/types/ipc';

// Channel identifiers must match src/shared/constants/ipcChannels.ts.
// Inlined here so the compiled preload script has zero filesystem require() dependencies
// when running inside Electron's strict sandboxed preload environment (sandbox: true).
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
  PRODUCT_LIST: 'product:list',
  PRODUCT_CREATE: 'product:create',
  PRODUCT_UPDATE: 'product:update',
  PRODUCT_GET_BY_ID: 'product:get-by-id',
  PRODUCT_DELETE: 'product:delete',
  PRODUCT_PRINT_BARCODE: 'product:print-barcode',
  METAL_RATE_GET_CURRENT: 'metal-rate:get-current',
  METAL_RATE_SAVE_DAILY: 'metal-rate:save-daily',
  METAL_RATE_GET_HISTORY: 'metal-rate:get-history',
  PRICING_CALCULATE_JEWELLERY: 'pricing:calculate-jewellery',
  BILLING_SCAN_PRODUCT: 'billing:scan-product',
  BILLING_SEARCH_PRODUCTS: 'billing:search-products',
  BILLING_CREATE_BILL: 'billing:create-bill',
  BILLING_LIST_BILLS: 'billing:list-bills',
  BILLING_GET_BILL_BY_ID: 'billing:get-bill-by-id',
  VENDOR_LIST: 'vendor:list',
  VENDOR_CREATE: 'vendor:create',
  VENDOR_UPDATE: 'vendor:update',
  VENDOR_GET_BY_ID: 'vendor:get-by-id',
  VENDOR_DELETE: 'vendor:delete',
  PURCHASE_LIST: 'purchase:list',
  PURCHASE_GET_BY_ID: 'purchase:get-by-id',
  PURCHASE_CREATE: 'purchase:create',
  PURCHASE_UPDATE: 'purchase:update',
  PURCHASE_UPDATE_PAYMENT: 'purchase:update-payment',
  PURCHASE_DELETE: 'purchase:delete',
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
  deleteCategory: (id: string): Promise<IpcResult<{ id: string; name: string }>> => {
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
  deleteCategoryField: (id: string): Promise<IpcResult<{ id: string }>> => {
    return ipcRenderer.invoke(CHANNELS.CATEGORY_FIELD_DELETE, id);
  },
  reorderCategoryFields: (input: ReorderCategoryFieldsRequest): Promise<IpcResult<CategoryFieldDto[]>> => {
    return ipcRenderer.invoke(CHANNELS.CATEGORY_FIELD_REORDER, input);
  },
  listProducts: (options?: ListProductsFilter): Promise<IpcResult<ProductDto[]>> => {
    return ipcRenderer.invoke(CHANNELS.PRODUCT_LIST, options);
  },
  createProduct: (input: CreateProductRequest): Promise<IpcResult<ProductDto>> => {
    return ipcRenderer.invoke(CHANNELS.PRODUCT_CREATE, input);
  },
  updateProduct: (input: UpdateProductRequest): Promise<IpcResult<ProductDto>> => {
    return ipcRenderer.invoke(CHANNELS.PRODUCT_UPDATE, input);
  },
  getProductById: (id: string): Promise<IpcResult<ProductDto>> => {
    return ipcRenderer.invoke(CHANNELS.PRODUCT_GET_BY_ID, id);
  },
  deleteProduct: (id: string): Promise<IpcResult<{ id: string }>> => {
    return ipcRenderer.invoke(CHANNELS.PRODUCT_DELETE, id);
  },
  printBarcode: (input: any): Promise<IpcResult<{ printed: boolean }>> => {
    return ipcRenderer.invoke(CHANNELS.PRODUCT_PRINT_BARCODE, input);
  },
  getCurrentMetalRates: (): Promise<IpcResult<any>> => {
    return ipcRenderer.invoke(CHANNELS.METAL_RATE_GET_CURRENT);
  },
  saveDailyMetalRates: (input: any): Promise<IpcResult<any>> => {
    return ipcRenderer.invoke(CHANNELS.METAL_RATE_SAVE_DAILY, input);
  },
  getMetalRateHistory: (): Promise<IpcResult<any[]>> => {
    return ipcRenderer.invoke(CHANNELS.METAL_RATE_GET_HISTORY);
  },
  calculateJewelleryPrice: (input: any): Promise<IpcResult<any>> => {
    return ipcRenderer.invoke(CHANNELS.PRICING_CALCULATE_JEWELLERY, input);
  },
  scanBillingProduct: (barcode: string): Promise<IpcResult<any>> => {
    return ipcRenderer.invoke(CHANNELS.BILLING_SCAN_PRODUCT, barcode);
  },
  searchBillingProducts: (query?: string): Promise<IpcResult<any[]>> => {
    return ipcRenderer.invoke(CHANNELS.BILLING_SEARCH_PRODUCTS, query);
  },
  createBill: (input: any): Promise<IpcResult<any>> => {
    return ipcRenderer.invoke(CHANNELS.BILLING_CREATE_BILL, input);
  },
  listBills: (filter?: any): Promise<IpcResult<any[]>> => {
    return ipcRenderer.invoke(CHANNELS.BILLING_LIST_BILLS, filter);
  },
  getBillById: (id: string): Promise<IpcResult<any>> => {
    return ipcRenderer.invoke(CHANNELS.BILLING_GET_BILL_BY_ID, id);
  },
  listVendors: (search?: string): Promise<IpcResult<any[]>> => {
    return ipcRenderer.invoke(CHANNELS.VENDOR_LIST, search);
  },
  createVendor: (input: any): Promise<IpcResult<any>> => {
    return ipcRenderer.invoke(CHANNELS.VENDOR_CREATE, input);
  },
  updateVendor: (input: any): Promise<IpcResult<any>> => {
    return ipcRenderer.invoke(CHANNELS.VENDOR_UPDATE, input);
  },
  getVendorById: (id: string): Promise<IpcResult<any>> => {
    return ipcRenderer.invoke(CHANNELS.VENDOR_GET_BY_ID, id);
  },
  deleteVendor: (id: string): Promise<IpcResult<any>> => {
    return ipcRenderer.invoke(CHANNELS.VENDOR_DELETE, id);
  },
  listPurchases: (filter?: any): Promise<IpcResult<any[]>> => {
    return ipcRenderer.invoke(CHANNELS.PURCHASE_LIST, filter);
  },
  getPurchaseById: (id: string): Promise<IpcResult<any>> => {
    return ipcRenderer.invoke(CHANNELS.PURCHASE_GET_BY_ID, id);
  },
  createPurchase: (input: any): Promise<IpcResult<any>> => {
    return ipcRenderer.invoke(CHANNELS.PURCHASE_CREATE, input);
  },
  updatePurchase: (input: any): Promise<IpcResult<any>> => {
    return ipcRenderer.invoke(CHANNELS.PURCHASE_UPDATE, input);
  },
  updatePurchasePayment: (input: any): Promise<IpcResult<any>> => {
    return ipcRenderer.invoke(CHANNELS.PURCHASE_UPDATE_PAYMENT, input);
  },
  deletePurchase: (id: string): Promise<IpcResult<any>> => {
    return ipcRenderer.invoke(CHANNELS.PURCHASE_DELETE, id);
  },
});

contextBridge.exposeInMainWorld('posApi', posDesktopApi);

