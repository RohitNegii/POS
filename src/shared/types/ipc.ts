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
  purchaseRatePerGram?: number | null;
  purchaseMakingChargesPerGram?: number | null;
  additionalChargesPercentage?: number | null;
  actualPurchasePrice?: number | null;
  actualPurchasePriceCode?: string | null;
  sellingPrice?: number | null;
  marginPercentage?: number | null;
  vendorId?: string | null;
  vendorName?: string | null;
  vendorPhone?: string | null;
  purchaseDate?: string | null;
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
  barcode?: string;
  stockQuantity?: number;
  fieldValues: ProductFieldValueInput[];
  purchasePrice?: number | null;
  purchaseRatePerGram?: number | null;
  purchaseMakingChargesPerGram?: number | null;
  additionalChargesPercentage?: number | null;
  actualPurchasePrice?: number | null;
  actualPurchasePriceCode?: string | null;
  sellingPrice?: number | null;
  marginPercentage?: number | null;
  vendorId?: string | null;
  purchaseDate?: string | null;
}

export interface UpdateProductRequest {
  id: string;
  categoryId?: string;
  name: string;
  stockQuantity?: number;
  fieldValues: ProductFieldValueInput[];
  purchasePrice?: number | null;
  purchaseRatePerGram?: number | null;
  purchaseMakingChargesPerGram?: number | null;
  additionalChargesPercentage?: number | null;
  actualPurchasePrice?: number | null;
  actualPurchasePriceCode?: string | null;
  sellingPrice?: number | null;
  marginPercentage?: number | null;
  vendorId?: string | null;
  purchaseDate?: string | null;
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
  printBarcode: (input: string | { html: string; widthMm: number; heightMm: number }) => Promise<IpcResult<{ printed: boolean }>>;
  generateBarcode: (input: { productName: string; categoryName: string }) => Promise<IpcResult<string>>;
  scanBillingProduct: (barcode: string) => Promise<IpcResult<ScannedProductDto>>;
  searchBillingProducts: (query?: string) => Promise<IpcResult<ScannedProductDto[]>>;
  createBill: (input: CreateBillRequest) => Promise<IpcResult<BillDto>>;
  listBills: (filter?: ListBillsFilter) => Promise<IpcResult<BillDto[]>>;
  getBillById: (id: string) => Promise<IpcResult<BillDto>>;
  listVendors: (search?: string) => Promise<IpcResult<VendorDto[]>>;
  createVendor: (input: CreateVendorRequest) => Promise<IpcResult<VendorDto>>;
  updateVendor: (input: UpdateVendorRequest) => Promise<IpcResult<VendorDto>>;
  getVendorById: (id: string) => Promise<IpcResult<VendorDto>>;
  deleteVendor: (id: string) => Promise<IpcResult<{ id: string; name: string }>>;
  listPurchases: (filter?: ListPurchasesFilter) => Promise<IpcResult<PurchaseDto[]>>;
  getPurchaseById: (id: string) => Promise<IpcResult<PurchaseDto | null>>;
  createPurchase: (input: CreatePurchaseRequest) => Promise<IpcResult<PurchaseDto>>;
  updatePurchase: (input: UpdatePurchaseRequest) => Promise<IpcResult<PurchaseDto>>;
  updatePurchasePayment: (input: UpdatePurchasePaymentRequest) => Promise<IpcResult<PurchaseDto>>;
  deletePurchase: (id: string) => Promise<IpcResult<{ id: string }>>;
}

export interface ScannedProductDto {
  id: string;
  companyId: string;
  companyName: string;
  companyCode: string;
  categoryId: string;
  categoryName: string;
  name: string;
  barcode: string;
  stockQuantity: number;
  unitPrice: number;
  priceType: 'JEWELLERY_DYNAMIC' | 'FIXED' | 'PER_METER' | 'CUSTOM';
  pricingBreakdown: string;
  details?: Record<string, any>;
}

export interface CreateBillItemInput {
  productId?: string;
  companyId: string;
  companyName: string;
  barcode: string;
  productName: string;
  categoryName?: string;
  unitPrice: number;
  discountPercentage?: number;
  discountAmount?: number;
  netUnitPrice?: number;
  quantity: number;
  detailsJson?: string;
}

export interface CreateBillRequest {
  customerName?: string;
  customerPhone?: string;
  paymentMethod?: 'CASH' | 'UPI' | 'CARD' | 'SPLIT';
  discountPercentage?: number;
  discount?: number;
  tax?: number;
  notes?: string;
  items: CreateBillItemInput[];
}

export interface BillItemDto {
  id: string;
  billId: string;
  productId: string | null;
  companyId: string;
  companyName: string;
  barcode: string;
  productName: string;
  categoryName: string | null;
  unitPrice: number;
  discountPercentage?: number;
  discountAmount?: number;
  netUnitPrice?: number;
  quantity: number;
  totalPrice: number;
  detailsJson: string | null;
  createdAt: string;
}

export interface CompanyBreakdownDto {
  companyId: string;
  companyName: string;
  itemCount: number;
  totalQuantity: number;
  subtotal: number;
}

export interface BillDto {
  id: string;
  invoiceNumber: string;
  billingUserId: string | null;
  billingUserName: string;
  customerName: string | null;
  customerPhone: string | null;
  subtotal: number;
  discountPercentage?: number;
  discount: number;
  tax: number;
  totalAmount: number;
  paymentMethod: string;
  status: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  items: BillItemDto[];
  companyBreakdowns?: CompanyBreakdownDto[];
}

export interface ListBillsFilter {
  search?: string;
  startDate?: string;
  endDate?: string;
}

export interface VendorDto {
  id: string;
  companyId: string;
  name: string;
  phoneNumber?: string | null;
  address?: string | null;
  gstNumber?: string | null;
  bankName?: string | null;
  accountNumber?: string | null;
  ifscCode?: string | null;
  createdAt: string;
  updatedAt: string;
  purchasesCount?: number;
  totalPurchasedAmount?: number;
}

export interface CreateVendorRequest {
  name: string;
  phoneNumber?: string | null;
  address?: string | null;
  gstNumber?: string | null;
  bankName?: string | null;
  accountNumber?: string | null;
  ifscCode?: string | null;
}

export interface UpdateVendorRequest {
  id: string;
  name: string;
  phoneNumber?: string | null;
  address?: string | null;
  gstNumber?: string | null;
  bankName?: string | null;
  accountNumber?: string | null;
  ifscCode?: string | null;
}

export type PurchasePaymentStatus = 'PAID' | 'PARTIAL' | 'UNPAID';
export type PurchasePaymentMethod = 'CASH' | 'ONLINE' | 'NO_PAYMENT' | 'UPI' | 'BANK_TRANSFER' | 'CARD' | 'CREDIT';

export interface PurchaseItemDto {
  id: string;
  purchaseId: string;
  productId: string | null;
  productName: string;
  itemDescription?: string | null;
  barcode: string;
  categoryName: string | null;
  hsnCode?: string | null;
  quantityBought: number;
  currentStock: number;
  unitCost: number;
  discount?: number;
  taxableAmount?: number;
  taxRate?: number;
  taxAmount?: number;
  cgstRate?: number;
  cgstAmount?: number;
  sgstRate?: number;
  sgstAmount?: number;
  igstRate?: number;
  igstAmount?: number;
  totalAmount: number;
  detailsJson?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseDto {
  id: string;
  purchaseNumber: string;
  companyId: string;
  vendorId: string;
  vendorName: string;
  vendorPhone?: string | null;
  vendorAddress?: string | null;
  vendorGstNumber?: string | null;
  vendorBankName?: string | null;
  vendorAccountNumber?: string | null;
  vendorIfscCode?: string | null;
  invoiceNumber: string;
  purchaseDate: string; // 'YYYY-MM-DD'
  ewayBillNumber?: string | null;
  transporterName?: string | null;
  vehicleNumber?: string | null;
  paymentDate?: string | null; // 'YYYY-MM-DD'
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  paidAmount: number;
  balanceAmount: number;
  totalProductsCount: number;
  totalUnitsBought: number;
  paymentStatus: PurchasePaymentStatus;
  paymentMethod: PurchasePaymentMethod;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  items: PurchaseItemDto[];
}

export interface CreatePurchaseItemInput {
  productId: string;
  productName?: string;
  itemDescription?: string;
  barcode?: string;
  categoryName?: string;
  hsnCode?: string;
  quantityBought: number;
  unitCost: number;
  discount?: number;
  taxableAmount?: number;
  taxRate?: number;
  taxAmount?: number;
  cgstRate?: number;
  cgstAmount?: number;
  sgstRate?: number;
  sgstAmount?: number;
  igstRate?: number;
  igstAmount?: number;
  totalAmount?: number;
  detailsJson?: string;
  productDraft?: CreateProductRequest;
}

export interface CreatePurchaseRequest {
  vendorId: string;
  invoiceNumber: string;
  purchaseDate?: string;
  ewayBillNumber?: string;
  transporterName?: string;
  vehicleNumber?: string;
  paymentDate?: string | null;
  paymentMethod: PurchasePaymentMethod;
  paymentStatus?: PurchasePaymentStatus;
  amountPaid?: number;
  notes?: string;
  items: CreatePurchaseItemInput[];
  // Legacy optional single-item fields for fallback
  productId?: string;
  quantityBought?: number;
  unitCost?: number;
}

export interface UpdatePurchaseRequest {
  id: string;
  vendorId: string;
  invoiceNumber: string;
  purchaseDate?: string;
  ewayBillNumber?: string;
  transporterName?: string;
  vehicleNumber?: string;
  paymentDate?: string | null;
  paymentMethod: PurchasePaymentMethod;
  paymentStatus?: PurchasePaymentStatus;
  amountPaid?: number;
  notes?: string;
  items: CreatePurchaseItemInput[];
}

export interface UpdatePurchasePaymentRequest {
  id: string;
  paymentStatus: PurchasePaymentStatus;
  paymentMethod?: PurchasePaymentMethod | null;
  paymentDate?: string | null;
  paidAmount?: number;
  notes?: string;
}

export interface ListPurchasesFilter {
  vendorId?: string;
  productId?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
}

