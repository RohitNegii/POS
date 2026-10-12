export interface IpcSuccessResult<T> {
  success: true;
  data: T;
}

export interface IpcErrorResult {
  success: false;
  error: {
    message: string;
    code?: string;
  };
}

export type IpcResult<T> = IpcSuccessResult<T> | IpcErrorResult;

// --- Auth Types ---
export interface LoginCredentials {
  email: string;
  password: string;
}

export type UserRole = 'COMPANY_ADMIN' | 'BILLING_USER';

export interface AuthSessionPayload {
  adminId: string;
  companyId: string;
  companyName: string;
  companyCode: string;
  name: string;
  email: string;
  role: UserRole;
  token?: string;
}

export interface ProtectedTestPayload {
  message: string;
  companyId: string;
  adminId: string;
  adminEmail: string;
}

// --- System Types ---
export interface SystemStatusPayload {
  status: 'ok' | 'degraded' | 'error';
  databaseConnected: boolean;
  appVersion: string;
  companyCount: number;
}

export interface DatabasePingPayload {
  alive: boolean;
  timestamp: string;
  responseTimeMs: number;
}

// --- Category Types ---
export interface CategoryDto {
  id: string;
  companyId: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  fieldsCount?: number;
}

export interface CreateCategoryRequest {
  name: string;
  description?: string;
}

export interface UpdateCategoryRequest {
  id: string;
  name?: string;
  description?: string;
}

export interface ListCategoriesFilter {
  search?: string;
}

// --- Dynamic Category Field Types ---
export type CategoryFieldType = 'text' | 'number' | 'select' | 'boolean';

export interface CategoryFieldDto {
  id: string;
  categoryId: string;
  name: string;
  fieldKey: string;
  fieldType: CategoryFieldType;
  required: boolean;
  displayOrder: number;
  options: string[] | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCategoryFieldRequest {
  categoryId: string;
  name: string;
  fieldKey?: string;
  fieldType: CategoryFieldType;
  required?: boolean;
  displayOrder?: number;
  options?: string[];
}

export interface UpdateCategoryFieldRequest {
  id: string;
  name?: string;
  fieldType?: CategoryFieldType;
  required?: boolean;
  displayOrder?: number;
  options?: string[];
}

export interface ReorderCategoryFieldsRequest {
  categoryId: string;
  orderedFieldIds: string[];
}

// --- Buyer Types ---
export interface BuyerDto {
  id: string;
  companyId: string;
  name: string;
  phoneNumber: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateBuyerRequest {
  name: string;
  phoneNumber?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
}

export interface UpdateBuyerRequest {
  id: string;
  name?: string;
  phoneNumber?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
}

// --- Metal Rate Types ---
export type MetalType = 'GOLD' | 'SILVER';

export interface MetalRateDto {
  id: string;
  companyId: string;
  metalType: MetalType;
  ratePerGram: number;
  effectiveDate: string;
  createdAt: string;
  updatedAt: string;
}

export interface CurrentMetalRatesDto {
  goldRate: MetalRateDto | null;
  silverRate: MetalRateDto | null;
  effectiveDate: string;
}

export interface SaveDailyRatesRequest {
  effectiveDate?: string;
  goldRatePerGram?: number;
  silverRatePerGram?: number;
}

export interface MetalRateHistoryItemDto {
  effectiveDate: string;
  goldRatePerGram: number | null;
  silverRatePerGram: number | null;
  lastUpdated: string;
}

// --- Window PosDesktop Bridge API ---
export interface PosDesktopApi {
  // System
  getSystemStatus: () => Promise<IpcResult<SystemStatusPayload>>;
  pingDatabase: () => Promise<IpcResult<DatabasePingPayload>>;

  // Auth
  login: (credentials: LoginCredentials) => Promise<IpcResult<AuthSessionPayload>>;
  logout: () => Promise<IpcResult<void>>;
  getSession: () => Promise<IpcResult<AuthSessionPayload | null>>;
  testProtectedOperation: () => Promise<IpcResult<ProtectedTestPayload>>;

  // Categories
  listCategories: (options?: ListCategoriesFilter) => Promise<IpcResult<CategoryDto[]>>;
  createCategory: (input: CreateCategoryRequest) => Promise<IpcResult<CategoryDto>>;
  updateCategory: (input: UpdateCategoryRequest) => Promise<IpcResult<CategoryDto>>;
  getCategoryById: (id: string) => Promise<IpcResult<CategoryDto>>;
  deleteCategory: (id: string) => Promise<IpcResult<CategoryDto>>;

  // Category Fields
  listCategoryFields: (categoryId: string) => Promise<IpcResult<CategoryFieldDto[]>>;
  createCategoryField: (input: CreateCategoryFieldRequest) => Promise<IpcResult<CategoryFieldDto>>;
  updateCategoryField: (input: UpdateCategoryFieldRequest) => Promise<IpcResult<CategoryFieldDto>>;
  deleteCategoryField: (id: string) => Promise<IpcResult<{ id: string; name: string }>>;
  reorderCategoryFields: (input: ReorderCategoryFieldsRequest) => Promise<IpcResult<CategoryFieldDto[]>>;

  // Buyers
  listBuyers: (search?: string) => Promise<IpcResult<BuyerDto[]>>;
  getBuyerById: (id: string) => Promise<IpcResult<BuyerDto>>;
  createBuyer: (input: CreateBuyerRequest) => Promise<IpcResult<BuyerDto>>;
  updateBuyer: (input: UpdateBuyerRequest) => Promise<IpcResult<BuyerDto>>;
  deleteBuyer: (id: string) => Promise<IpcResult<boolean>>;

  // Metal Rates
  getCurrentMetalRates: (asOfDate?: string) => Promise<IpcResult<CurrentMetalRatesDto>>;
  saveDailyMetalRates: (request: SaveDailyRatesRequest) => Promise<IpcResult<CurrentMetalRatesDto>>;
  getMetalRateHistory: () => Promise<IpcResult<MetalRateHistoryItemDto[]>>;
}

declare global {
  interface Window {
    posDesktop: PosDesktopApi;
  }
}

