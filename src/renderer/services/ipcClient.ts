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
  ProductDto,
  ProtectedTestPayload,
  ReorderCategoryFieldsRequest,
  SystemStatusPayload,
  UpdateCategoryFieldRequest,
  UpdateCategoryRequest,
  UpdateProductRequest,
  CurrentMetalRatesDto,
  SaveDailyRatesRequest,
  MetalRateHistoryItemDto,
  JewelleryCalculationInput,
  JewelleryPriceCalculationResult,
} from '../../shared/types/ipc';


/**
 * Renderer IPC Service.
 * Communicates strictly through the contextBridge-exposed `window.posApi`.
 * Never accesses Node.js, Electron internals, or Prisma directly.
 */
export const ipcClient = {
  async fetchSystemStatus(): Promise<IpcResult<SystemStatusPayload>> {
    if (!window.posApi) {
      return {
        success: false,
        error: 'Secure preload bridge (window.posApi) is not available.',
      };
    }
    return window.posApi.getSystemStatus();
  },

  async pingDatabase(): Promise<IpcResult<DatabasePingPayload>> {
    if (!window.posApi) {
      return {
        success: false,
        error: 'Secure preload bridge (window.posApi) is not available.',
      };
    }
    return window.posApi.pingDatabase();
  },

  async login(credentials: LoginCredentials): Promise<IpcResult<AuthSessionPayload>> {
    if (!window.posApi) {
      return {
        success: false,
        error: 'Secure preload bridge (window.posApi) is not available.',
      };
    }
    return window.posApi.login(credentials);
  },

  async logout(): Promise<IpcResult<void>> {
    if (!window.posApi) {
      return {
        success: false,
        error: 'Secure preload bridge (window.posApi) is not available.',
      };
    }
    return window.posApi.logout();
  },

  async getSession(): Promise<IpcResult<AuthSessionPayload | null>> {
    if (!window.posApi) {
      return {
        success: false,
        error: 'Secure preload bridge (window.posApi) is not available.',
      };
    }
    return window.posApi.getSession();
  },

  async testProtectedOperation(): Promise<IpcResult<ProtectedTestPayload>> {
    if (!window.posApi) {
      return {
        success: false,
        error: 'Secure preload bridge (window.posApi) is not available.',
      };
    }
    return window.posApi.testProtectedOperation();
  },

  async listCategories(options?: ListCategoriesFilter): Promise<IpcResult<CategoryDto[]>> {
    if (!window.posApi) {
      return {
        success: false,
        error: 'Secure preload bridge (window.posApi) is not available.',
      };
    }
    return window.posApi.listCategories(options);
  },

  async createCategory(input: CreateCategoryRequest): Promise<IpcResult<CategoryDto>> {
    if (!window.posApi) {
      return {
        success: false,
        error: 'Secure preload bridge (window.posApi) is not available.',
      };
    }
    return window.posApi.createCategory(input);
  },

  async updateCategory(input: UpdateCategoryRequest): Promise<IpcResult<CategoryDto>> {
    if (!window.posApi) {
      return {
        success: false,
        error: 'Secure preload bridge (window.posApi) is not available.',
      };
    }
    return window.posApi.updateCategory(input);
  },

  async getCategoryById(id: string): Promise<IpcResult<CategoryDto>> {
    if (!window.posApi) {
      return {
        success: false,
        error: 'Secure preload bridge (window.posApi) is not available.',
      };
    }
    return window.posApi.getCategoryById(id);
  },

  async deleteCategory(id: string): Promise<IpcResult<{ id: string; name: string }>> {
    if (!window.posApi) {
      return {
        success: false,
        error: 'Secure preload bridge (window.posApi) is not available.',
      };
    }
    return window.posApi.deleteCategory(id);
  },

  async listCategoryFields(categoryId: string): Promise<IpcResult<CategoryFieldDto[]>> {
    if (!window.posApi) {
      return {
        success: false,
        error: 'Secure preload bridge (window.posApi) is not available.',
      };
    }
    return window.posApi.listCategoryFields(categoryId);
  },

  async createCategoryField(input: CreateCategoryFieldRequest): Promise<IpcResult<CategoryFieldDto>> {
    if (!window.posApi) {
      return {
        success: false,
        error: 'Secure preload bridge (window.posApi) is not available.',
      };
    }
    return window.posApi.createCategoryField(input);
  },

  async updateCategoryField(input: UpdateCategoryFieldRequest): Promise<IpcResult<CategoryFieldDto>> {
    if (!window.posApi) {
      return {
        success: false,
        error: 'Secure preload bridge (window.posApi) is not available.',
      };
    }
    return window.posApi.updateCategoryField(input);
  },

  async deleteCategoryField(id: string): Promise<IpcResult<{ id: string }>> {
    if (!window.posApi) {
      return {
        success: false,
        error: 'Secure preload bridge (window.posApi) is not available.',
      };
    }
    return window.posApi.deleteCategoryField(id);
  },

  async reorderCategoryFields(input: ReorderCategoryFieldsRequest): Promise<IpcResult<CategoryFieldDto[]>> {
    if (!window.posApi) {
      return {
        success: false,
        error: 'Secure preload bridge (window.posApi) is not available.',
      };
    }
    return window.posApi.reorderCategoryFields(input);
  },

  async listProducts(options?: ListProductsFilter): Promise<IpcResult<ProductDto[]>> {
    if (!window.posApi) {
      return {
        success: false,
        error: 'Secure preload bridge (window.posApi) is not available.',
      };
    }
    return window.posApi.listProducts(options);
  },

  async createProduct(input: CreateProductRequest): Promise<IpcResult<ProductDto>> {
    if (!window.posApi) {
      return {
        success: false,
        error: 'Secure preload bridge (window.posApi) is not available.',
      };
    }
    return window.posApi.createProduct(input);
  },

  async updateProduct(input: UpdateProductRequest): Promise<IpcResult<ProductDto>> {
    if (!window.posApi) {
      return {
        success: false,
        error: 'Secure preload bridge (window.posApi) is not available.',
      };
    }
    return window.posApi.updateProduct(input);
  },

  async getProductById(id: string): Promise<IpcResult<ProductDto>> {
    if (!window.posApi) {
      return {
        success: false,
        error: 'Secure preload bridge (window.posApi) is not available.',
      };
    }
    return window.posApi.getProductById(id);
  },


  async deleteProduct(id: string): Promise<IpcResult<{ id: string }>> {
    if (!window.posApi) {
      return {
        success: false,
        error: 'Secure preload bridge (window.posApi) is not available.',
      };
    }
    return window.posApi.deleteProduct(id);
  },

  async printBarcode(productId: string): Promise<IpcResult<{ printed: boolean }>> {
    if (!window.posApi) {
      return {
        success: false,
        error: 'Secure preload bridge (window.posApi) is not available.',
      };
    }
    return window.posApi.printBarcode(productId);
  },

  async getCurrentMetalRates(): Promise<IpcResult<CurrentMetalRatesDto>> {
    if (!window.posApi) {
      return {
        success: false,
        error: 'Secure preload bridge (window.posApi) is not available.',
      };
    }
    return window.posApi.getCurrentMetalRates();
  },

  async saveDailyMetalRates(input: SaveDailyRatesRequest): Promise<IpcResult<CurrentMetalRatesDto>> {
    if (!window.posApi) {
      return {
        success: false,
        error: 'Secure preload bridge (window.posApi) is not available.',
      };
    }
    return window.posApi.saveDailyMetalRates(input);
  },

  async getMetalRateHistory(): Promise<IpcResult<MetalRateHistoryItemDto[]>> {
    if (!window.posApi) {
      return {
        success: false,
        error: 'Secure preload bridge (window.posApi) is not available.',
      };
    }
    return window.posApi.getMetalRateHistory();
  },

  async calculateJewelleryPrice(input: JewelleryCalculationInput): Promise<IpcResult<JewelleryPriceCalculationResult>> {
    if (!window.posApi) {
      return {
        success: false,
        error: 'Secure preload bridge (window.posApi) is not available.',
      };
    }
    return window.posApi.calculateJewelleryPrice(input);
  },
};

