export interface CompanySummaryInfo {
  id: string;
  name: string;
  code: string;
  createdAt: string;
}

export interface DatabaseStatusInfo {
  connected: boolean;
  provider: 'sqlite';
  databasePath: string;
  userDataDir: string;
  journalMode: string;
  firstInitializedAt: string;
  launchCount: number;
  lastLaunchedAt: string;
  metadataRecordCount: number;
  isOutsideRestrictedDirs: boolean;
  companyCount: number;
  companies: CompanySummaryInfo[];
}

export interface RuntimeStatusInfo {
  appName: string;
  appVersion: string;
  phase: string;
  isPackaged: boolean;
  platform: string;
  arch: string;
  electronVersion: string;
  chromeVersion: string;
  nodeVersion: string;
  timestamp: string;
}

export interface SystemStatusPayload {
  runtime: RuntimeStatusInfo;
  database: DatabaseStatusInfo;
}

export interface DatabasePingPayload {
  ok: boolean;
  latencyMs: number;
  checkedAt: string;
  launchCount: number;
  firstInitializedAt: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface AuthSessionPayload {
  adminId: string;
  companyId: string;
  role: string;
  adminName: string;
  email: string;
  companyName: string;
  companyCode: string;
  loginTime: string;
}

export interface ProtectedTestPayload {
  message: string;
  companyId: string;
  companyName: string;
  adminName: string;
}

export interface CategoryDto {
  id: string;
  companyId: string;
  name: string;
  description: string | null;
  fieldCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCategoryRequest {
  name: string;
  description?: string;
}

export interface UpdateCategoryRequest {
  id: string;
  name: string;
  description?: string;
}

export interface ListCategoriesFilter {
  search?: string;
}

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
  fieldKey: string;
  fieldType: CategoryFieldType;
  required?: boolean;
  displayOrder?: number;
  options?: string[];
}

export interface UpdateCategoryFieldRequest {
  id: string;
  name: string;
  required?: boolean;
  displayOrder?: number;
  options?: string[];
}

export interface ReorderCategoryFieldsRequest {
  categoryId: string;
  orderedFieldIds: string[];
}

export interface ProductFieldValueDto {
  id: string;
  productId: string;
  categoryFieldId: string;
  valueText: string | null;
  valueNumber: number | null;
  valueBoolean: boolean | null;
  createdAt: string;
  updatedAt: string;
  categoryField?: {
    id: string;
    name: string;
    fieldKey: string;
    fieldType: CategoryFieldType;
    required: boolean;
    displayOrder: number;
    options: string[] | null;
  };
}

export interface ProductDto {
  id: string;
  companyId: string;
  categoryId: string;
  name: string;
  barcode: string;
  stockQuantity: number;
  isArchived?: boolean;
  createdAt: string;
  updatedAt: string;
  categoryName?: string;
  fieldValues?: ProductFieldValueDto[];
  stockDisplay?: string | number | null;
  calculatedJewelleryPrice?: JewelleryPriceCalculationResult | null;
  pricingError?: string | null;
  purchasePrice?: number | null;
  additionalChargesPercentage?: number | null;
  actualPurchasePrice?: number | null;
  actualPurchasePriceCode?: string | null;
}

export type MetalType = 'GOLD' | 'SILVER';

export interface MetalRateDto {
  id: string;
  companyId: string;
  metalType: MetalType;
  ratePerGram: number;
  effectiveDate: string; // 'YYYY-MM-DD'
  createdAt: string;
  updatedAt: string;
}

export interface CurrentMetalRatesDto {
  goldRate: MetalRateDto | null;
  silverRate: MetalRateDto | null;
  effectiveDate: string;
}

export interface SaveDailyRatesRequest {
  effectiveDate: string; // 'YYYY-MM-DD'
  goldRatePerGram?: number;
  silverRatePerGram?: number;
}

export interface MetalRateHistoryItemDto {
  effectiveDate: string;
  goldRatePerGram: number | null;
  silverRatePerGram: number | null;
  lastUpdated: string;
}

export interface JewelleryCalculationInput {
  purity: string;
  weightGrams: number;
  makingChargePerGram: number;
  effectiveDate?: string;
  metalType?: MetalType;
}

export interface JewelleryPriceCalculationResult {
  metalType: MetalType;
  purity: string;
  purityFactor: number;
  weightGrams: number;
  ratePerGram: number;
  rateEffectiveDate: string;
  metalValue: number;
  makingChargePerGram: number;
  totalMakingCharges: number;
  finalPrice: number;
  isCalculated: true;
}

export interface ProductFieldValueInput {
  categoryFieldId: string;
  valueText?: string | null;
  valueNumber?: number | null;
  valueBoolean?: boolean | null;
}

export interface CreateProductRequest {
  categoryId: string;
  name: string;
  stockQuantity?: number;
  fieldValues: ProductFieldValueInput[];
  purchasePrice?: number | null;
  additionalChargesPercentage?: number | null;
  actualPurchasePrice?: number | null;
  actualPurchasePriceCode?: string | null;
}

export interface UpdateProductRequest {
  id: string;
  name: string;
  stockQuantity?: number;
  fieldValues: ProductFieldValueInput[];
  purchasePrice?: number | null;
  additionalChargesPercentage?: number | null;
  actualPurchasePrice?: number | null;
  actualPurchasePriceCode?: string | null;
}

export interface ListProductsFilter {
  categoryId?: string;
  search?: string;
}

export type IpcResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

export interface PosDesktopApi {
  getSystemStatus: () => Promise<IpcResult<SystemStatusPayload>>;
  pingDatabase: () => Promise<IpcResult<DatabasePingPayload>>;
  login: (credentials: LoginCredentials) => Promise<IpcResult<AuthSessionPayload>>;
  logout: () => Promise<IpcResult<void>>;
  getSession: () => Promise<IpcResult<AuthSessionPayload | null>>;
  testProtectedOperation: () => Promise<IpcResult<ProtectedTestPayload>>;
  listCategories: (options?: ListCategoriesFilter) => Promise<IpcResult<CategoryDto[]>>;
  createCategory: (input: CreateCategoryRequest) => Promise<IpcResult<CategoryDto>>;
  updateCategory: (input: UpdateCategoryRequest) => Promise<IpcResult<CategoryDto>>;
  getCategoryById: (id: string) => Promise<IpcResult<CategoryDto>>;
  deleteCategory: (id: string) => Promise<IpcResult<{ id: string; name: string }>>;
  listCategoryFields: (categoryId: string) => Promise<IpcResult<CategoryFieldDto[]>>;
  createCategoryField: (input: CreateCategoryFieldRequest) => Promise<IpcResult<CategoryFieldDto>>;
  updateCategoryField: (input: UpdateCategoryFieldRequest) => Promise<IpcResult<CategoryFieldDto>>;
  deleteCategoryField: (id: string) => Promise<IpcResult<{ id: string }>>;
  reorderCategoryFields: (input: ReorderCategoryFieldsRequest) => Promise<IpcResult<CategoryFieldDto[]>>;
  listProducts: (options?: ListProductsFilter) => Promise<IpcResult<ProductDto[]>>;
  createProduct: (input: CreateProductRequest) => Promise<IpcResult<ProductDto>>;
  updateProduct: (input: UpdateProductRequest) => Promise<IpcResult<ProductDto>>;
  getProductById: (id: string) => Promise<IpcResult<ProductDto>>;
  deleteProduct: (id: string) => Promise<IpcResult<{ id: string }>>;
  getCurrentMetalRates: () => Promise<IpcResult<CurrentMetalRatesDto>>;
  saveDailyMetalRates: (input: SaveDailyRatesRequest) => Promise<IpcResult<CurrentMetalRatesDto>>;
  getMetalRateHistory: () => Promise<IpcResult<MetalRateHistoryItemDto[]>>;
  calculateJewelleryPrice: (input: JewelleryCalculationInput) => Promise<IpcResult<JewelleryPriceCalculationResult>>;
  printBarcode: (productId: string) => Promise<IpcResult<{ printed: boolean }>>;
}

