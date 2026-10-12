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
} from '../../shared/types/ipc';

function unwrap<T>(result: IpcResult<T>): T {
  if (result.success) {
    return result.data;
  }
  throw new Error(result.error?.message || 'Unknown error occurred.');
}

function getApi(): PosDesktopApi {
  if (typeof window !== 'undefined' && window.posDesktop) {
    return window.posDesktop;
  }
  throw new Error('Electron POS Desktop API is not available on window.posDesktop.');
}

export const ipcClient = {
  // System
  async getSystemStatus(): Promise<SystemStatusPayload> {
    return unwrap(await getApi().getSystemStatus());
  },
  async pingDatabase(): Promise<DatabasePingPayload> {
    return unwrap(await getApi().pingDatabase());
  },

  // Auth
  async login(credentials: LoginCredentials): Promise<AuthSessionPayload> {
    return unwrap(await getApi().login(credentials));
  },
  async logout(): Promise<void> {
    return unwrap(await getApi().logout());
  },
  async getSession(): Promise<AuthSessionPayload | null> {
    return unwrap(await getApi().getSession());
  },
  async testProtectedOperation(): Promise<ProtectedTestPayload> {
    return unwrap(await getApi().testProtectedOperation());
  },

  // Categories
  async listCategories(options?: ListCategoriesFilter): Promise<CategoryDto[]> {
    return unwrap(await getApi().listCategories(options));
  },
  async createCategory(input: CreateCategoryRequest): Promise<CategoryDto> {
    return unwrap(await getApi().createCategory(input));
  },
  async updateCategory(input: UpdateCategoryRequest): Promise<CategoryDto> {
    return unwrap(await getApi().updateCategory(input));
  },
  async getCategoryById(id: string): Promise<CategoryDto> {
    return unwrap(await getApi().getCategoryById(id));
  },
  async deleteCategory(id: string): Promise<CategoryDto> {
    return unwrap(await getApi().deleteCategory(id));
  },

  // Category Fields
  async listCategoryFields(categoryId: string): Promise<CategoryFieldDto[]> {
    return unwrap(await getApi().listCategoryFields(categoryId));
  },
  async createCategoryField(input: CreateCategoryFieldRequest): Promise<CategoryFieldDto> {
    return unwrap(await getApi().createCategoryField(input));
  },
  async updateCategoryField(input: UpdateCategoryFieldRequest): Promise<CategoryFieldDto> {
    return unwrap(await getApi().updateCategoryField(input));
  },
  async deleteCategoryField(id: string): Promise<{ id: string; name: string }> {
    return unwrap(await getApi().deleteCategoryField(id));
  },
  async reorderCategoryFields(input: ReorderCategoryFieldsRequest): Promise<CategoryFieldDto[]> {
    return unwrap(await getApi().reorderCategoryFields(input));
  },

  // Buyers
  async listBuyers(search?: string): Promise<BuyerDto[]> {
    return unwrap(await getApi().listBuyers(search));
  },
  async getBuyerById(id: string): Promise<BuyerDto> {
    return unwrap(await getApi().getBuyerById(id));
  },
  async createBuyer(input: CreateBuyerRequest): Promise<BuyerDto> {
    return unwrap(await getApi().createBuyer(input));
  },
  async updateBuyer(input: UpdateBuyerRequest): Promise<BuyerDto> {
    return unwrap(await getApi().updateBuyer(input));
  },
  async deleteBuyer(id: string): Promise<boolean> {
    return unwrap(await getApi().deleteBuyer(id));
  },

  // Metal Rates
  async getCurrentMetalRates(asOfDate?: string) {
    return unwrap(await getApi().getCurrentMetalRates(asOfDate));
  },
  async saveDailyMetalRates(request: { effectiveDate?: string; goldRatePerGram?: number; silverRatePerGram?: number }) {
    return unwrap(await getApi().saveDailyMetalRates(request));
  },
  async getMetalRateHistory() {
    return unwrap(await getApi().getMetalRateHistory());
  },
};
