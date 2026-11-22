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

export interface PrinterInfo {
  name: string;
  displayName: string;
  description: string;
  status: number;
  isDefault: boolean;
  options?: Record<string, any>;
}

export interface PrintBarcodeOptions {
  html: string;
  widthMm: number;
  heightMm: number;
  deviceName?: string;
  copies?: number;
  silent?: boolean;
  landscape?: boolean;
  margins?: {
    marginType?: 'default' | 'none' | 'printableArea' | 'custom';
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
  };
  scaleFactor?: number;
}

export interface PosDesktopApi {
  getSystemStatus: () => Promise<IpcResult<SystemStatusPayload>>;
  getPrinters: () => Promise<IpcResult<PrinterInfo[]>>;
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
  printBarcode: (input: string | PrintBarcodeOptions | { html: string; widthMm: number; heightMm: number }) => Promise<IpcResult<{ printed: boolean }>>;
  generateBarcode: (input: { productName: string; categoryName: string; existingBarcodes?: string[] }) => Promise<IpcResult<string>>;
  scanBillingProduct: (barcode: string) => Promise<IpcResult<ScannedProductDto>>;
  searchBillingProducts: (query?: string) => Promise<IpcResult<ScannedProductDto[]>>;
  createBill: (input: CreateBillRequest) => Promise<IpcResult<BillDto>>;
  updateBill: (input: UpdateBillRequest) => Promise<IpcResult<BillDto>>;
  cancelBill: (id: string, reason?: string) => Promise<IpcResult<BillDto>>;
  listBills: (filter?: ListBillsFilter) => Promise<IpcResult<BillDto[]>>;
  getBillById: (id: string) => Promise<IpcResult<BillDto>>;
  listCustomerRecords: (search?: string) => Promise<IpcResult<CustomerRecordDto[]>>;
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
  getOverduePurchases: (thresholdDays?: number) => Promise<IpcResult<OverduePurchasesSummary>>;
  createPurchaseReturn: (input: CreatePurchaseReturnRequest) => Promise<IpcResult<PurchaseReturnDto>>;
  listPurchaseReturns: (filter?: ListPurchaseReturnsFilter) => Promise<IpcResult<PurchaseReturnDto[]>>;
  getPurchaseReturnById: (id: string) => Promise<IpcResult<PurchaseReturnDto | null>>;
  listBillingUsers: () => Promise<IpcResult<BillingUserDto[]>>;
  createBillingUser: (input: CreateBillingUserRequest) => Promise<IpcResult<BillingUserDto>>;
  updateBillingUser: (input: UpdateBillingUserRequest) => Promise<IpcResult<BillingUserDto>>;
  deleteBillingUser: (id: string) => Promise<IpcResult<{ id: string; name: string }>>;
  listExpenses: (filter?: ListExpensesFilter) => Promise<IpcResult<ExpensesListResponse>>;
  getExpenseById: (id: string) => Promise<IpcResult<ExpenseDto>>;
  createExpense: (input: CreateExpenseRequest) => Promise<IpcResult<ExpenseDto>>;
  updateExpense: (input: UpdateExpenseRequest) => Promise<IpcResult<ExpenseDto>>;
  deleteExpense: (id: string) => Promise<IpcResult<{ message: string }>>;
  getExpenseSummary: (filter?: ListExpensesFilter) => Promise<IpcResult<ExpenseSummaryDto>>;
  getCompanyBalances: (companyId?: string) => Promise<IpcResult<CompanyBalanceDto[]>>;
  getCompanyExpenseTotals: (params?: GetCompanyExpenseTotalsParams) => Promise<IpcResult<CompanyExpenseTotalsDto>>;
  listExpenseCategories: () => Promise<IpcResult<ExpenseCategoryDto[]>>;
  createExpenseCategory: (input: CreateExpenseCategoryRequest) => Promise<IpcResult<ExpenseCategoryDto>>;
  updateExpenseCategory: (input: UpdateExpenseCategoryRequest) => Promise<IpcResult<ExpenseCategoryDto>>;
  deleteExpenseCategory: (id: string) => Promise<IpcResult<{ message: string }>>;
  listEmployees: () => Promise<IpcResult<BillingUserDto[]>>;
  getBackupStatus: () => Promise<IpcResult<BackupStatusDto>>;
  startGoogleDriveAuth: () => Promise<IpcResult<{ authUrl: string; waitingForAuth: boolean }>>;
  disconnectGoogleDrive: () => Promise<IpcResult<void>>;
  saveBackupConfig: (input: SaveBackupConfigRequest) => Promise<IpcResult<BackupStatusDto>>;
  triggerBackupNow: () => Promise<IpcResult<BackupHistoryDto>>;
  listBackupHistory: (limit?: number) => Promise<IpcResult<BackupHistoryDto[]>>;
  restoreBackup: (input: RestoreBackupRequest) => Promise<IpcResult<RestoreBackupResultDto>>;
  getBackupRecoveryKey: () => Promise<IpcResult<{ recoveryKey: string }>>;
  setBackupRecoveryKey: (key: string) => Promise<IpcResult<{ success: boolean }>>;
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
  billingUserId?: string;
  billingUserName?: string;
  customerName?: string;
  customerPhone?: string;
  paymentMethod?: 'CASH' | 'ONLINE' | 'UPI' | 'CARD' | 'SPLIT';
  discountPercentage?: number;
  discount?: number;
  taxPercentage?: number;
  tax?: number;
  notes?: string;
  items: CreateBillItemInput[];
}

export interface UpdateBillRequest {
  id: string;
  billingUserId?: string;
  billingUserName?: string;
  customerName?: string;
  customerPhone?: string;
  paymentMethod?: 'CASH' | 'ONLINE' | 'UPI' | 'CARD' | 'SPLIT';
  discountPercentage?: number;
  discount?: number;
  taxPercentage?: number;
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
  taxPercentage?: number;
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
  limit?: number;
  companyId?: string;
  billingUserId?: string;
  billingUserName?: string;
}

export interface CustomerRecordDto {
  customerPhone: string;
  customerName: string;
  totalBillsCount: number;
  totalSpent: number;
  firstVisitDate: string;
  lastVisitDate: string;
  bills: BillDto[];
}

export interface BillingUserDto {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateBillingUserRequest {
  name: string;
}

export interface UpdateBillingUserRequest {
  id: string;
  name: string;
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
  quantityReturned?: number;
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
  cgstRate?: number;
  cgstAmount?: number;
  sgstRate?: number;
  sgstAmount?: number;
  igstRate?: number;
  igstAmount?: number;
  taxAmount: number;
  totalAmount: number;
  paidAmount: number;
  balanceAmount: number;
  totalProductsCount: number;
  totalUnitsBought: number;
  totalUnitsReturned?: number;
  paymentStatus: PurchasePaymentStatus;
  paymentMethod: PurchasePaymentMethod;
  utr?: string | null;
  description?: string | null;
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
  utr?: string;
  description?: string;
  cgstRate?: number;
  cgstAmount?: number;
  sgstRate?: number;
  sgstAmount?: number;
  igstRate?: number;
  igstAmount?: number;
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
  utr?: string;
  description?: string;
  cgstRate?: number;
  cgstAmount?: number;
  sgstRate?: number;
  sgstAmount?: number;
  igstRate?: number;
  igstAmount?: number;
  notes?: string;
  items: CreatePurchaseItemInput[];
}

export interface UpdatePurchasePaymentRequest {
  id: string;
  paymentStatus: PurchasePaymentStatus;
  paymentMethod?: PurchasePaymentMethod | null;
  paymentDate?: string | null;
  paidAmount?: number;
  utr?: string;
  description?: string;
  notes?: string;
}

export interface ListPurchasesFilter {
  companyId?: string;
  vendorId?: string;
  productId?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
}

export type PurchaseReturnRefundType = 'CASH' | 'ONLINE' | 'BALANCE_DEDUCTION' | 'STORE_CREDIT';

export interface CreatePurchaseReturnItemInput {
  purchaseItemId: string;
  productId?: string | null;
  productName: string;
  barcode: string;
  quantityReturned: number;
  unitCost: number;
}

export interface CreatePurchaseReturnRequest {
  purchaseId: string;
  returnDate?: string;
  refundType: PurchaseReturnRefundType;
  refundAmount?: number;
  reason?: string;
  notes?: string;
  autoArchiveZeroStock?: boolean;
  items: CreatePurchaseReturnItemInput[];
}

export interface PurchaseReturnItemDto {
  id: string;
  purchaseReturnId: string;
  purchaseItemId: string;
  productId: string | null;
  productName: string;
  barcode: string;
  quantityReturned: number;
  unitCost: number;
  totalCost: number;
  createdAt: string;
}

export interface PurchaseReturnDto {
  id: string;
  returnNumber: string;
  purchaseId: string;
  purchaseNumber?: string;
  invoiceNumber?: string;
  companyId: string;
  companyName?: string;
  vendorId: string;
  vendorName?: string;
  returnDate: string;
  totalAmount: number;
  refundType: PurchaseReturnRefundType;
  refundAmount: number;
  reason?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  items: PurchaseReturnItemDto[];
}

export interface ListPurchaseReturnsFilter {
  companyId?: string;
  vendorId?: string;
  purchaseId?: string;
  startDate?: string;
  endDate?: string;
}

export interface OverduePurchaseDto {
  id: string;
  purchaseNumber: string;
  invoiceNumber: string;
  companyId: string;
  vendorId: string;
  vendorName: string;
  vendorPhone?: string | null;
  purchaseDate: string; // 'YYYY-MM-DD'
  totalAmount: number;
  paidAmount: number;
  balanceAmount: number;
  paymentStatus: PurchasePaymentStatus;
  paymentMethod: PurchasePaymentMethod;
  daysElapsed: number; // e.g. 7, 8, 9...
  daysOverdue: number; // e.g. 0 (at day 7), 1 (at day 8), etc.
}

export interface OverduePurchasesSummary {
  overdueCount: number;
  totalOverdueAmount: number;
  thresholdDays: number;
  items: OverduePurchaseDto[];
}

// -------------------------------------------------------------
// EXPENSE MANAGEMENT TYPES & DTOS
// -------------------------------------------------------------

export type ExpensePaymentMethod = 'CASH' | 'ONLINE';

export interface ExpenseCategoryDto {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  expenseCount?: number;
}

export interface CreateExpenseCategoryRequest {
  name: string;
  description?: string;
}

export interface UpdateExpenseCategoryRequest {
  id: string;
  name: string;
  description?: string;
}

/// Billing users serve as the showroom employees across both companies.
export type EmployeeDto = BillingUserDto;

export interface ExpenseDto {
  id: string;
  companyId: string;
  companyName?: string;
  companyCode?: string;
  categoryId: string;
  categoryName?: string;
  employeeId?: string | null;
  employeeName?: string | null;
  amount: number;
  paymentMethod: ExpensePaymentMethod;
  expenseDate: string;
  description?: string | null;
  receiptPath?: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface FinancialTransactionDto {
  id: string;
  companyId: string;
  type: string;
  expenseId?: string | null;
  paymentMethod: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  description?: string | null;
  createdAt: string;
}

export interface CreateExpenseRequest {
  companyId: string;
  categoryId: string;
  employeeId?: string;
  employeeName?: string;
  amount: number;
  paymentMethod: ExpensePaymentMethod;
  expenseDate: string;
  description?: string;
  receiptPath?: string;
}

export interface UpdateExpenseRequest {
  id: string;
  companyId: string;
  categoryId: string;
  employeeId?: string;
  employeeName?: string;
  amount: number;
  paymentMethod: ExpensePaymentMethod;
  expenseDate: string;
  description?: string;
  receiptPath?: string;
}

export interface ListExpensesFilter {
  companyId?: string;
  categoryId?: string;
  employeeId?: string;
  paymentMethod?: ExpensePaymentMethod;
  startDate?: string;
  endDate?: string;
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: 'expenseDate' | 'amount' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
}

export interface ExpensesListResponse {
  expenses: ExpenseDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ExpenseCategoryBreakdownItem {
  categoryId: string;
  categoryName: string;
  totalAmount: number;
  count: number;
}

export interface ExpenseCompanyBreakdownItem {
  companyId: string;
  companyName: string;
  companyCode: string;
  totalAmount: number;
  cashAmount: number;
  onlineAmount: number;
}

export interface ExpenseEmployeeBreakdownItem {
  employeeId: string;
  employeeName: string;
  totalAmount: number;
  count: number;
}

export interface ExpenseDateBreakdownItem {
  date: string;
  totalAmount: number;
  cashAmount: number;
  onlineAmount: number;
}

export interface ExpenseSummaryDto {
  totalExpenses: number;
  totalCashExpenses: number;
  totalOnlineExpenses: number;
  totalSalaryExpenses: number;
  count: number;
  categoryBreakdown: ExpenseCategoryBreakdownItem[];
  companyBreakdown: ExpenseCompanyBreakdownItem[];
  employeeBreakdown: ExpenseEmployeeBreakdownItem[];
  dateBreakdown: ExpenseDateBreakdownItem[];
}

export interface CompanyBalanceDto {
  companyId: string;
  companyName: string;
  companyCode: string;
  cashBalance: number;
  onlineBalance: number;
  totalSalesCash: number;
  totalSalesOnline: number;
  totalPurchaseReturnsCash: number;
  totalPurchaseReturnsOnline: number;
  totalPurchasePaymentsCash: number;
  totalPurchasePaymentsOnline: number;
  totalExpenseCash: number;
  totalExpenseOnline: number;
}

export interface CompanyExpenseTotalsDto {
  cashExpenses: number;
  onlineExpenses: number;
  totalExpenses: number;
  count: number;
}

export interface GetCompanyExpenseTotalsParams {
  companyId?: string;
  startDate?: string;
  endDate?: string;
}

export interface BackupStatusDto {
  isConnected: boolean;
  connectedEmail?: string;
  driveFolderName: string;
  driveFolderId?: string;
  schedulerEnabled: boolean;
  scheduledTime: string; // e.g. "22:00"
  nextScheduledRun?: string;
  lastBackupAt?: string;
  lastBackupStatus?: 'SUCCESS' | 'FAILED' | 'IN_PROGRESS';
  lastBackupFilename?: string;
  retentionCount: number;
  hasCustomCredentials: boolean;
  isBackingUp: boolean;
}

export interface SaveBackupConfigRequest {
  scheduledTime?: string;
  schedulerEnabled?: boolean;
  retentionCount?: number;
  googleClientId?: string;
  googleClientSecret?: string;
}

export interface BackupHistoryDto {
  id: string;
  filename: string;
  driveFileId?: string | null;
  sizeBytes: number;
  backupType: 'AUTOMATIC' | 'MANUAL' | 'MISSED_SCHEDULED';
  status: 'SUCCESS' | 'FAILED' | 'IN_PROGRESS';
  errorMessage?: string | null;
  checksum?: string | null;
  metadataJson?: string | null;
  createdAt: string;
  completedAt?: string | null;
}

export interface RestoreBackupRequest {
  backupId: string;
}

export interface RestoreBackupResultDto {
  success: boolean;
  restoredAt: string;
  emergencyBackupPath: string;
  tablesRestored: number;
  message: string;
}





