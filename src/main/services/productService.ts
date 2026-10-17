import { Prisma } from '@prisma/client';
import { getPrismaClient } from '../database/prisma';
import { authService } from './authService';
import { metalRateService } from './metalRateService';
import { generateActualPurchasePriceCode } from '../../shared/utils/purchaseCode';
import type {
  CategoryFieldType,
  CreateProductRequest,
  JewelleryPriceCalculationResult,
  ListProductsFilter,
  ProductDto,
  ProductFieldValueDto,
  UpdateProductRequest,
} from '../../shared/types/ipc';

/**
 * Product Service — Phase 5 Product Master + Product Field Values + Permanent Barcode.
 *
 * ARCHITECTURAL CONSTRAINTS & COMPANY ISOLATION:
 * - Product belongs to Company and Category.
 * - Authenticated session's companyId is the exclusive source of truth.
 * - Cross-company product read/write/delete is strictly rejected.
 * - Barcode is unique across the database, and immutable after creation.
 * - Products and their associated dynamic field values are permanently deleted upon deletion.
 * - Dynamic field values are normalized in ProductFieldValue and validated against CategoryField definitions.
 */
export class ProductService {
  /**
   * Helper to parse stored JSON options safely.
   */
  private parseOptions(rawOptions: string | null): string[] | null {
    if (!rawOptions) return null;
    try {
      const parsed = JSON.parse(rawOptions);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  /**
   * Generates a clean, deterministic, scannable barcode for a product.
   * Format:
   * - 1st letter: Company ("A" or "B")
   * - 2nd letter: Product name first letter (e.g. "G" for Gold Ring)
   * - 3rd letter: Category name first letter (e.g. "J" for Jewellery)
   * - Followed by a 6-digit padded sequential number (e.g. "AGJ000001", "BSS000001").
   * Guaranteed to be unique across the database.
   */
  public async generatePermanentBarcode(
    productName: string,
    categoryName: string,
    companyIdentifier?: string
  ): Promise<string> {
    const prisma = getPrismaClient();

    // 1. First letter: Company A or B
    let companyLetter = 'A';
    try {
      const session = authService.requireSession();
      const compCode = (companyIdentifier || session.companyCode || '').toUpperCase();
      const compName = (session.companyName || '').toUpperCase();
      if (compCode.endsWith('_B') || compCode === 'B' || compName.endsWith(' B') || compName.includes('COMPANY B')) {
        companyLetter = 'B';
      } else if (compCode.endsWith('_A') || compCode === 'A' || compName.endsWith(' A') || compName.includes('COMPANY A')) {
        companyLetter = 'A';
      } else {
        const clean = compName.replace(/[^A-Z0-9]/g, '');
        companyLetter = clean[0] || 'A';
      }
    } catch {
      companyLetter = 'A';
    }

    // 2. Second letter: Product name first letter
    const cleanProd = productName.trim().replace(/[^a-zA-Z0-9]/g, '');
    const productLetter = cleanProd.length > 0 ? cleanProd[0].toUpperCase() : 'P';

    // 3. Third letter: Category name first letter
    const cleanCat = categoryName.trim().replace(/[^a-zA-Z0-9]/g, '');
    const categoryLetter = cleanCat.length > 0 ? cleanCat[0].toUpperCase() : 'C';

    // 4. Combined 3-letter prefix: [Company A or B][Product Initial][Category Initial]
    const prefix = `${companyLetter}${productLetter}${categoryLetter}`;

    // 5. Query products starting with this prefix to determine next sequence number
    const existingWithPrefix = await prisma.product.findMany({
      where: {
        barcode: {
          startsWith: prefix,
        },
      },
      select: { barcode: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    let highestNum = 0;
    const prefixRegex = new RegExp(`^${prefix}(\\d{6,})$`);
    for (const item of existingWithPrefix) {
      const match = item.barcode.match(prefixRegex);
      if (match && match[1]) {
        const parsed = parseInt(match[1], 10);
        if (!isNaN(parsed) && parsed > highestNum) {
          highestNum = parsed;
        }
      }
    }

    let nextNum = highestNum + 1;
    let candidateBarcode = `${prefix}${String(nextNum).padStart(6, '0')}`;

    // 6. Collision check and retry loop
    let attempts = 0;
    while (attempts < 100) {
      const collision = await prisma.product.findUnique({
        where: { barcode: candidateBarcode },
        select: { id: true },
      });

      if (!collision) {
        return candidateBarcode;
      }

      nextNum++;
      candidateBarcode = `${prefix}${String(nextNum).padStart(6, '0')}`;
      attempts++;
    }

    // Fallback if sequential numbers are dense: add random alphanumeric suffix
    const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `${prefix}${String(nextNum).padStart(4, '0')}${randomSuffix}`;
  }

  /**
   * Helper to compute live price for Gold/Silver jewellery products.
   * If required parameters are present, calls metalRateService to compute current price
   * from the daily metal rates table.
   */
  private async enrichJewelleryPricing(
    _categoryName: string,
    fieldValuesDto: ProductFieldValueDto[]
  ): Promise<{
    calculatedJewelleryPrice: JewelleryPriceCalculationResult | null;
    pricingError: string | null;
  }> {
    const purityFv = fieldValuesDto.find(
      (f) =>
        f.categoryField?.fieldKey === 'purity' ||
        f.categoryField?.name?.toLowerCase() === 'purity'
    );
    const weightFv = fieldValuesDto.find(
      (f) =>
        f.categoryField?.fieldKey === 'weight' ||
        f.categoryField?.name?.toLowerCase() === 'weight'
    );
    const makingFv = fieldValuesDto.find(
      (f) =>
        f.categoryField?.fieldKey === 'makingChargesPerGram' ||
        f.categoryField?.name?.toLowerCase().includes('making charge')
    );

    if (!purityFv) {
      return { calculatedJewelleryPrice: null, pricingError: null };
    }

    const purity = purityFv?.valueText;
    const weight = weightFv?.valueNumber;
    const makingCharge = makingFv?.valueNumber ?? 0;

    if (!purity || weight === null || weight === undefined || weight <= 0) {
      return { calculatedJewelleryPrice: null, pricingError: null };
    }

    try {
      const calc = await metalRateService.calculatePriceForJewellery({
        purity,
        weightGrams: weight,
        makingChargePerGram: makingCharge,
      });
      return { calculatedJewelleryPrice: calc, pricingError: null };
    } catch (err) {
      return {
        calculatedJewelleryPrice: null,
        pricingError: err instanceof Error ? err.message : 'Error calculating jewellery price',
      };
    }
  }

  /**
   * Helper to extract purchase and selling pricing attributes from dynamic ProductFieldValue list.
   */
  private extractPurchasePricing(fieldValuesDto: ProductFieldValueDto[]): {
    purchasePrice: number | null;
    purchaseRatePerGram: number | null;
    purchaseMakingChargesPerGram: number | null;
    additionalChargesPercentage: number | null;
    actualPurchasePrice: number | null;
    actualPurchasePriceCode: string | null;
    sellingPrice: number | null;
    marginPercentage: number | null;
  } {
    const pFv = fieldValuesDto.find((f) => f.categoryField?.fieldKey === 'purchasePrice');
    const rpFv = fieldValuesDto.find((f) => f.categoryField?.fieldKey === 'purchaseRatePerGram');
    const mpFv = fieldValuesDto.find((f) => f.categoryField?.fieldKey === 'purchaseMakingChargesPerGram');
    const cFv = fieldValuesDto.find((f) => f.categoryField?.fieldKey === 'additionalChargesPercentage');
    const aFv = fieldValuesDto.find((f) => f.categoryField?.fieldKey === 'actualPurchasePrice');
    const codeFv = fieldValuesDto.find((f) => f.categoryField?.fieldKey === 'actualPurchasePriceCode');
    const sFv = fieldValuesDto.find((f) => f.categoryField?.fieldKey === 'sellingPrice');
    const mFv = fieldValuesDto.find((f) => f.categoryField?.fieldKey === 'marginPercentage' || f.categoryField?.fieldKey === 'margin');

    const purchasePrice = pFv?.valueNumber ?? null;
    const purchaseRatePerGram = rpFv?.valueNumber ?? null;
    const purchaseMakingChargesPerGram = mpFv?.valueNumber ?? null;
    const additionalChargesPercentage = cFv?.valueNumber ?? null;
    const actualPurchasePrice = aFv?.valueNumber ?? null;
    const actualPurchasePriceCode =
      codeFv?.valueText ?? generateActualPurchasePriceCode(actualPurchasePrice);
    const sellingPrice = sFv?.valueNumber ?? null;
    let marginPercentage = mFv?.valueNumber ?? null;

    if (marginPercentage === null && sellingPrice !== null && actualPurchasePrice !== null && actualPurchasePrice > 0) {
      marginPercentage = Math.round(((sellingPrice - actualPurchasePrice) / actualPurchasePrice) * 100 * 100) / 100;
    }

    return {
      purchasePrice,
      purchaseRatePerGram,
      purchaseMakingChargesPerGram,
      additionalChargesPercentage,
      actualPurchasePrice,
      actualPurchasePriceCode,
      sellingPrice,
      marginPercentage,
    };
  }

  /**
   * Helper to ensure standard purchase and selling pricing CategoryFields exist for a category.
   * Field keys: 'purchaseRatePerGram', 'purchaseMakingChargesPerGram', 'purchasePrice', 'additionalChargesPercentage', 'actualPurchasePrice', 'actualPurchasePriceCode', 'sellingPrice', 'marginPercentage'.
   */
  public async ensurePurchaseCategoryFields(
    tx: Prisma.TransactionClient,
    categoryId: string
  ): Promise<{
    purchaseRatePerGramField: { id: string; fieldKey: string };
    purchaseMakingChargesPerGramField: { id: string; fieldKey: string };
    purchasePriceField: { id: string; fieldKey: string };
    additionalChargesField: { id: string; fieldKey: string };
    actualPurchasePriceField: { id: string; fieldKey: string };
    actualPurchasePriceCodeField: { id: string; fieldKey: string };
    sellingPriceField: { id: string; fieldKey: string };
    marginPercentageField: { id: string; fieldKey: string };
  }> {
    const existing = await tx.categoryField.findMany({
      where: {
        categoryId,
        fieldKey: {
          in: [
            'purchaseRatePerGram',
            'purchaseMakingChargesPerGram',
            'purchasePrice',
            'additionalChargesPercentage',
            'actualPurchasePrice',
            'actualPurchasePriceCode',
            'sellingPrice',
            'marginPercentage',
          ],
        },
      },
    });

    const existingMap = new Map(existing.map((f) => [f.fieldKey, f]));

    let purchaseRatePerGramField = existingMap.get('purchaseRatePerGram');
    if (!purchaseRatePerGramField) {
      purchaseRatePerGramField = await tx.categoryField.create({
        data: {
          categoryId,
          name: 'Purchase Rate per Gram',
          fieldKey: 'purchaseRatePerGram',
          fieldType: 'number',
          required: false,
          displayOrder: 898,
        },
      });
    }

    let purchaseMakingChargesPerGramField = existingMap.get('purchaseMakingChargesPerGram');
    if (!purchaseMakingChargesPerGramField) {
      purchaseMakingChargesPerGramField = await tx.categoryField.create({
        data: {
          categoryId,
          name: 'Purchase Making Charges per Gram',
          fieldKey: 'purchaseMakingChargesPerGram',
          fieldType: 'number',
          required: false,
          displayOrder: 899,
        },
      });
    }

    let purchasePriceField = existingMap.get('purchasePrice');
    if (!purchasePriceField) {
      purchasePriceField = await tx.categoryField.create({
        data: {
          categoryId,
          name: 'Purchase Price',
          fieldKey: 'purchasePrice',
          fieldType: 'number',
          required: false,
          displayOrder: 900,
        },
      });
    }

    let additionalChargesField = existingMap.get('additionalChargesPercentage');
    if (!additionalChargesField) {
      additionalChargesField = await tx.categoryField.create({
        data: {
          categoryId,
          name: 'Additional Charges (%)',
          fieldKey: 'additionalChargesPercentage',
          fieldType: 'number',
          required: false,
          displayOrder: 901,
        },
      });
    }

    let actualPurchasePriceField = existingMap.get('actualPurchasePrice');
    if (!actualPurchasePriceField) {
      actualPurchasePriceField = await tx.categoryField.create({
        data: {
          categoryId,
          name: 'Actual Purchase Price',
          fieldKey: 'actualPurchasePrice',
          fieldType: 'number',
          required: false,
          displayOrder: 902,
        },
      });
    }

    let actualPurchasePriceCodeField = existingMap.get('actualPurchasePriceCode');
    if (!actualPurchasePriceCodeField) {
      actualPurchasePriceCodeField = await tx.categoryField.create({
        data: {
          categoryId,
          name: 'Actual Purchase Price Code',
          fieldKey: 'actualPurchasePriceCode',
          fieldType: 'text',
          required: false,
          displayOrder: 903,
        },
      });
    }

    let sellingPriceField = existingMap.get('sellingPrice');
    if (!sellingPriceField) {
      sellingPriceField = await tx.categoryField.create({
        data: {
          categoryId,
          name: 'Selling Price',
          fieldKey: 'sellingPrice',
          fieldType: 'number',
          required: false,
          displayOrder: 904,
        },
      });
    }

    let marginPercentageField = existingMap.get('marginPercentage');
    if (!marginPercentageField) {
      marginPercentageField = await tx.categoryField.create({
        data: {
          categoryId,
          name: 'Margin (%)',
          fieldKey: 'marginPercentage',
          fieldType: 'number',
          required: false,
          displayOrder: 905,
        },
      });
    }

    return {
      purchaseRatePerGramField,
      purchaseMakingChargesPerGramField,
      purchasePriceField,
      additionalChargesField,
      actualPurchasePriceField,
      actualPurchasePriceCodeField,
      sellingPriceField,
      marginPercentageField,
    };
  }

  /**
   * Verifies that the given category belongs to the authenticated admin's company.
   */
  private async verifyCategoryOwnership(categoryId: string, companyId: string) {
    const prisma = getPrismaClient();
    const category = await prisma.category.findUnique({
      where: { id: categoryId },
      select: { id: true, name: true, companyId: true },
    });

    if (!category || category.companyId !== companyId) {
      throw new Error(
        'Forbidden: Selected category does not belong to your company.'
      );
    }

    return category;
  }

  /**
   * Verifies that the given product belongs to the authenticated admin's company.
   */
  private async verifyProductOwnership(productId: string, companyId: string) {
    const prisma = getPrismaClient();
    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: {
        category: true,
      },
    });

    if (!product || product.companyId !== companyId) {
      throw new Error(
        'Forbidden: You do not have permission to access this product.'
      );
    }

    return product;
  }

  /**
   * Retrieves products for the authenticated company, optionally filtered by category or search.
   */
  public async listProducts(filter?: ListProductsFilter): Promise<ProductDto[]> {
    const companyId = authService.getAuthenticatedCompanyId();
    const prisma = getPrismaClient();

    const where: Prisma.ProductWhereInput = {
      companyId,
      isArchived: false,
    };

    if (filter?.categoryId) {
      await this.verifyCategoryOwnership(filter.categoryId, companyId);
      where.categoryId = filter.categoryId;
    }

    const search = filter?.search?.trim();
    if (search) {
      where.AND = [
        {
          OR: [
            { name: { contains: search } },
            { barcode: { contains: search } },
          ],
        },
      ];
    }

    const products = await prisma.product.findMany({
      where,
      include: {
        category: {
          select: { name: true },
        },
        vendor: {
          select: { id: true, name: true, phoneNumber: true },
        },
        fieldValues: {
          include: {
            categoryField: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const dtoList: ProductDto[] = [];
    for (const p of products) {
      const fieldValuesDto: ProductFieldValueDto[] = p.fieldValues.map((fv) => ({
        id: fv.id,
        productId: fv.productId,
        categoryFieldId: fv.categoryFieldId,
        valueText: fv.valueText,
        valueNumber: fv.valueNumber,
        valueBoolean: fv.valueBoolean,
        createdAt: fv.createdAt.toISOString(),
        updatedAt: fv.updatedAt.toISOString(),
        categoryField: fv.categoryField
          ? {
              id: fv.categoryField.id,
              name: fv.categoryField.name,
              fieldKey: fv.categoryField.fieldKey,
              fieldType: fv.categoryField.fieldType as CategoryFieldType,
              required: fv.categoryField.required,
              displayOrder: fv.categoryField.displayOrder,
              options: this.parseOptions(fv.categoryField.options),
            }
          : undefined,
      }));

      const pricingInfo = await this.enrichJewelleryPricing(p.category.name, fieldValuesDto);
      const purchasePricing = this.extractPurchasePricing(fieldValuesDto);

      dtoList.push({
        id: p.id,
        companyId: p.companyId,
        categoryId: p.categoryId,
        name: p.name,
        barcode: p.barcode,
        stockQuantity: p.stockQuantity,
        isArchived: p.isArchived,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
        categoryName: p.category.name,
        fieldValues: fieldValuesDto,
        stockDisplay: p.stockQuantity,
        calculatedJewelleryPrice: pricingInfo.calculatedJewelleryPrice,
        pricingError: pricingInfo.pricingError,
        purchasePrice: purchasePricing.purchasePrice,
        purchaseRatePerGram: purchasePricing.purchaseRatePerGram,
        purchaseMakingChargesPerGram: purchasePricing.purchaseMakingChargesPerGram,
        additionalChargesPercentage: purchasePricing.additionalChargesPercentage,
        actualPurchasePrice: purchasePricing.actualPurchasePrice,
        actualPurchasePriceCode: purchasePricing.actualPurchasePriceCode,
        sellingPrice: purchasePricing.sellingPrice,
        marginPercentage: purchasePricing.marginPercentage,
        vendorId: p.vendorId,
        vendorName: p.vendor?.name || null,
        vendorPhone: p.vendor?.phoneNumber || null,
        purchaseDate: p.purchaseDate || null,
      });
    }

    return dtoList;
  }

  /**
   * Retrieves single product details by ID, verifying company isolation.
   */
  public async getProductById(id: string, allowArchived = false): Promise<ProductDto> {
    const companyId = authService.getAuthenticatedCompanyId();
    const prisma = getPrismaClient();

    if (!id || typeof id !== 'string') {
      throw new Error('Valid product ID is required.');
    }

    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        category: {
          select: { name: true },
        },
        vendor: {
          select: { id: true, name: true, phoneNumber: true },
        },
        fieldValues: {
          include: {
            categoryField: true,
          },
        },
      },
    });

    if (!product || product.companyId !== companyId) {
      throw new Error(
        'Forbidden: You do not have permission to access this product.'
      );
    }

    if (product.isArchived && !allowArchived) {
      throw new Error('Product not found or has been removed.');
    }

    // Sort fieldValues by categoryField.displayOrder
    const sortedFieldValues = [...product.fieldValues].sort((a, b) => {
      const orderA = a.categoryField?.displayOrder ?? 0;
      const orderB = b.categoryField?.displayOrder ?? 0;
      return orderA - orderB;
    });

    const fieldValuesDto: ProductFieldValueDto[] = sortedFieldValues.map((fv) => ({
      id: fv.id,
      productId: fv.productId,
      categoryFieldId: fv.categoryFieldId,
      valueText: fv.valueText,
      valueNumber: fv.valueNumber,
      valueBoolean: fv.valueBoolean,
      createdAt: fv.createdAt.toISOString(),
      updatedAt: fv.updatedAt.toISOString(),
      categoryField: fv.categoryField
        ? {
            id: fv.categoryField.id,
            name: fv.categoryField.name,
            fieldKey: fv.categoryField.fieldKey,
            fieldType: fv.categoryField.fieldType as CategoryFieldType,
            required: fv.categoryField.required,
            displayOrder: fv.categoryField.displayOrder,
            options: this.parseOptions(fv.categoryField.options),
          }
        : undefined,
    }));

    const pricingInfo = await this.enrichJewelleryPricing(product.category.name, fieldValuesDto);
    const purchasePricing = this.extractPurchasePricing(fieldValuesDto);

    return {
      id: product.id,
      companyId: product.companyId,
      categoryId: product.categoryId,
      name: product.name,
      barcode: product.barcode,
      stockQuantity: product.stockQuantity,
      isArchived: product.isArchived,
      createdAt: product.createdAt.toISOString(),
      updatedAt: product.updatedAt.toISOString(),
      categoryName: product.category.name,
      fieldValues: fieldValuesDto,
      stockDisplay: product.stockQuantity,
      calculatedJewelleryPrice: pricingInfo.calculatedJewelleryPrice,
      pricingError: pricingInfo.pricingError,
      purchasePrice: purchasePricing.purchasePrice,
      purchaseRatePerGram: purchasePricing.purchaseRatePerGram,
      purchaseMakingChargesPerGram: purchasePricing.purchaseMakingChargesPerGram,
      additionalChargesPercentage: purchasePricing.additionalChargesPercentage,
      actualPurchasePrice: purchasePricing.actualPurchasePrice,
      actualPurchasePriceCode: purchasePricing.actualPurchasePriceCode,
      sellingPrice: purchasePricing.sellingPrice,
      marginPercentage: purchasePricing.marginPercentage,
      vendorId: product.vendorId,
      vendorName: product.vendor?.name || null,
      vendorPhone: product.vendor?.phoneNumber || null,
      purchaseDate: product.purchaseDate || null,
    };
  }

  /**
   * Internal helper to validate and create product + field values inside an existing Prisma transaction client.
   * Usable both by createProduct and purchaseService.createPurchase/updatePurchase.
   */
  public async createProductWithTx(
    tx: Prisma.TransactionClient,
    companyId: string,
    input: CreateProductRequest,
    stockQuantityOverride?: number
  ): Promise<any> {
    const category = await tx.category.findUnique({
      where: { id: input.categoryId },
      select: { id: true, companyId: true, name: true },
    });
    if (!category || category.companyId !== companyId) {
      throw new Error('Forbidden: Category not found or does not belong to your company.');
    }

    const name = input.name?.trim();
    if (!name) {
      throw new Error('Product name is required.');
    }
    if (name.length > 200) {
      throw new Error('Product name cannot exceed 200 characters.');
    }

    const categoryFields = await tx.categoryField.findMany({
      where: { categoryId: input.categoryId },
      orderBy: { displayOrder: 'asc' },
    });

    let rawPurchasePrice: unknown = input.purchasePrice;
    let rawPurchaseRate: unknown = input.purchaseRatePerGram;
    let rawPurchaseMaking: unknown = input.purchaseMakingChargesPerGram;
    let rawAdditionalCharges: unknown = input.additionalChargesPercentage;
    let rawSellingPrice: unknown = input.sellingPrice;
    let rawMargin: unknown = input.marginPercentage;

    if (Array.isArray(input.fieldValues)) {
      for (const fv of input.fieldValues) {
        const cf = categoryFields.find((f) => f.id === fv.categoryFieldId);
        if (cf?.fieldKey === 'purchasePrice' && rawPurchasePrice === undefined) {
          rawPurchasePrice = fv.valueNumber;
        } else if (cf?.fieldKey === 'purchaseRatePerGram' && rawPurchaseRate === undefined) {
          rawPurchaseRate = fv.valueNumber;
        } else if (cf?.fieldKey === 'purchaseMakingChargesPerGram' && rawPurchaseMaking === undefined) {
          rawPurchaseMaking = fv.valueNumber;
        } else if (cf?.fieldKey === 'additionalChargesPercentage' && rawAdditionalCharges === undefined) {
          rawAdditionalCharges = fv.valueNumber;
        } else if (cf?.fieldKey === 'sellingPrice' && rawSellingPrice === undefined) {
          rawSellingPrice = fv.valueNumber;
        } else if ((cf?.fieldKey === 'marginPercentage' || cf?.fieldKey === 'margin') && rawMargin === undefined) {
          rawMargin = fv.valueNumber;
        }
      }
    }

    const hasPurityField = categoryFields.some(
      (f) => f.fieldKey === 'purity' || f.name.toLowerCase().includes('purity')
    );

    let additionalChargesVal: number | null = null;
    if (rawAdditionalCharges !== undefined && rawAdditionalCharges !== null && String(rawAdditionalCharges).trim() !== '') {
      const cNum = typeof rawAdditionalCharges === 'number' ? rawAdditionalCharges : parseFloat(String(rawAdditionalCharges));
      if (isNaN(cNum) || cNum < 0) {
        throw new Error('Additional Charges must be a valid non-negative percentage.');
      }
      additionalChargesVal = cNum;
    }

    let purchaseRatePerGramVal: number | null = null;
    let purchaseMakingChargesPerGramVal: number | null = null;

    if (rawPurchaseRate !== undefined && rawPurchaseRate !== null && String(rawPurchaseRate).trim() !== '') {
      const rpNum = typeof rawPurchaseRate === 'number' ? rawPurchaseRate : parseFloat(String(rawPurchaseRate));
      if (isNaN(rpNum) || rpNum < 0) {
        throw new Error('Purchase Rate per Gram must be a valid non-negative number.');
      }
      purchaseRatePerGramVal = rpNum;
    }

    if (rawPurchaseMaking !== undefined && rawPurchaseMaking !== null && String(rawPurchaseMaking).trim() !== '') {
      const mpNum = typeof rawPurchaseMaking === 'number' ? rawPurchaseMaking : parseFloat(String(rawPurchaseMaking));
      if (isNaN(mpNum) || mpNum < 0) {
        throw new Error('Purchase Making Charges per Gram must be a valid non-negative number.');
      }
      purchaseMakingChargesPerGramVal = mpNum;
    }

    let weightVal: number | null = null;
    const weightField = categoryFields.find(
      (f) => f.fieldKey === 'weight' || f.name.toLowerCase().includes('weight')
    );
    if (weightField && Array.isArray(input.fieldValues)) {
      const wFv = input.fieldValues.find((f) => f.categoryFieldId === weightField.id);
      if (wFv?.valueNumber !== undefined && wFv?.valueNumber !== null && String(wFv.valueNumber).trim() !== '') {
        const wNum = typeof wFv.valueNumber === 'number' ? wFv.valueNumber : parseFloat(String(wFv.valueNumber));
        if (!isNaN(wNum) && wNum > 0) {
          weightVal = wNum;
        }
      }
    }

    let purchasePriceVal: number | null = null;
    let actualPurchasePriceVal: number | null = null;

    if (hasPurityField && purchaseRatePerGramVal !== null && weightVal !== null && weightVal > 0) {
      const baseCost = weightVal * purchaseRatePerGramVal;
      const makingCost = weightVal * (purchaseMakingChargesPerGramVal ?? 0);
      const baseTotal = baseCost + makingCost;
      const addPercent = additionalChargesVal ?? 0;
      const addCostAmt = baseCost * (addPercent / 100);

      purchasePriceVal = Math.round(baseTotal * 100) / 100;
      actualPurchasePriceVal = Math.round((baseTotal + addCostAmt) * 100) / 100;
    } else {
      if (rawPurchasePrice !== undefined && rawPurchasePrice !== null && String(rawPurchasePrice).trim() !== '') {
        const pNum = typeof rawPurchasePrice === 'number' ? rawPurchasePrice : parseFloat(String(rawPurchasePrice));
        if (isNaN(pNum) || pNum <= 0) {
          throw new Error('Purchase Price (₹) must be a valid number greater than 0.');
        }
        purchasePriceVal = pNum;
        const addPercent = additionalChargesVal ?? 0;
        actualPurchasePriceVal = Math.round((pNum + (pNum * addPercent / 100)) * 100) / 100;
      } else {
        throw new Error('Purchase Price (₹) is required.');
      }
    }

    let sellingPriceVal: number | null = null;
    let marginVal: number | null = null;

    if (rawSellingPrice !== undefined && rawSellingPrice !== null && String(rawSellingPrice).trim() !== '') {
      const sNum = typeof rawSellingPrice === 'number' ? rawSellingPrice : parseFloat(String(rawSellingPrice));
      if (isNaN(sNum) || sNum <= 0) {
        throw new Error('Selling Price (₹) must be a valid number greater than 0.');
      }
      sellingPriceVal = sNum;
    }

    if (rawMargin !== undefined && rawMargin !== null && String(rawMargin).trim() !== '') {
      const mNum = typeof rawMargin === 'number' ? rawMargin : parseFloat(String(rawMargin));
      if (isNaN(mNum)) {
        throw new Error('Margin must be a valid number.');
      }
      marginVal = mNum;
      if (sellingPriceVal === null && actualPurchasePriceVal !== null && actualPurchasePriceVal > 0) {
        sellingPriceVal = Math.round((actualPurchasePriceVal + (actualPurchasePriceVal * mNum / 100)) * 100) / 100;
      }
    }

    if (!hasPurityField && (sellingPriceVal === null || sellingPriceVal <= 0)) {
      throw new Error('Selling Price (₹) is required.');
    }

    const inputMap = new Map<string, typeof input.fieldValues[0]>();
    if (Array.isArray(input.fieldValues)) {
      for (const fv of input.fieldValues) {
        if (fv && fv.categoryFieldId) {
          inputMap.set(fv.categoryFieldId, fv);
        }
      }
    }

    const INTERNAL_SYSTEM_KEYS = [
      'purchasePrice',
      'purchaseRatePerGram',
      'purchaseMakingChargesPerGram',
      'additionalChargesPercentage',
      'actualPurchasePrice',
      'actualPurchasePriceCode',
      'sellingPrice',
      'marginPercentage',
      'margin',
    ];

    const fieldValuesToCreate: Array<{
      categoryFieldId: string;
      valueText: string | null;
      valueNumber: number | null;
      valueBoolean: boolean | null;
    }> = [];

    for (const field of categoryFields) {
      if (INTERNAL_SYSTEM_KEYS.includes(field.fieldKey)) {
        continue;
      }

      const userVal = inputMap.get(field.id);
      const parsedOpts = this.parseOptions(field.options) || [];

      let valueText: string | null = null;
      let valueNumber: number | null = null;
      let valueBoolean: boolean | null = null;

      switch (field.fieldType) {
        case 'text': {
          const raw = userVal?.valueText;
          if (raw !== undefined && raw !== null) {
            valueText = String(raw).trim();
          }
          if (field.required && (!valueText || valueText.length === 0)) {
            throw new Error(`Field "${field.name}" is required.`);
          }
          break;
        }

        case 'number': {
          const raw = userVal?.valueNumber;
          if (raw !== undefined && raw !== null) {
            const num = typeof raw === 'number' ? raw : parseFloat(String(raw));
            if (isNaN(num)) {
              throw new Error(`Field "${field.name}" must be a valid number.`);
            }
            valueNumber = num;
          }
          if (field.required && valueNumber === null) {
            throw new Error(`Field "${field.name}" is required.`);
          }
          break;
        }

        case 'boolean': {
          const raw = userVal?.valueBoolean;
          if (raw !== undefined && raw !== null) {
            valueBoolean = Boolean(raw);
          } else if (field.required) {
            valueBoolean = false;
          }
          break;
        }

        case 'select': {
          const raw = userVal?.valueText;
          if (raw !== undefined && raw !== null) {
            valueText = String(raw).trim();
          }
          if (field.required && (!valueText || valueText.length === 0)) {
            throw new Error(`Field "${field.name}" is required.`);
          }
          if (valueText && parsedOpts.length > 0 && !parsedOpts.includes(valueText)) {
            throw new Error(
              `Invalid option "${valueText}" for field "${field.name}". Must be one of: ${parsedOpts.join(', ')}.`
            );
          }
          break;
        }
      }

      fieldValuesToCreate.push({
        categoryFieldId: field.id,
        valueText,
        valueNumber,
        valueBoolean,
      });
    }

    const stockQuantity = stockQuantityOverride !== undefined
      ? Math.max(0, stockQuantityOverride)
      : (typeof input.stockQuantity === 'number' && !isNaN(input.stockQuantity) ? Math.max(0, input.stockQuantity) : 0);

    const barcode = input.barcode?.trim() || (await this.generatePermanentBarcode(name, category.name));

    if (
      purchasePriceVal !== null ||
      actualPurchasePriceVal !== null ||
      purchaseRatePerGramVal !== null ||
      additionalChargesVal !== null ||
      sellingPriceVal !== null ||
      marginVal !== null
    ) {
      const pricingFields = await this.ensurePurchaseCategoryFields(tx, input.categoryId);
      const actualPurchasePriceCodeVal = generateActualPurchasePriceCode(actualPurchasePriceVal);

      if (purchaseRatePerGramVal !== null) {
        const rpIdx = fieldValuesToCreate.findIndex((fv) => fv.categoryFieldId === pricingFields.purchaseRatePerGramField.id);
        if (rpIdx >= 0) fieldValuesToCreate[rpIdx].valueNumber = purchaseRatePerGramVal;
        else fieldValuesToCreate.push({ categoryFieldId: pricingFields.purchaseRatePerGramField.id, valueText: null, valueNumber: purchaseRatePerGramVal, valueBoolean: null });
      }

      if (purchaseMakingChargesPerGramVal !== null) {
        const mpIdx = fieldValuesToCreate.findIndex((fv) => fv.categoryFieldId === pricingFields.purchaseMakingChargesPerGramField.id);
        if (mpIdx >= 0) fieldValuesToCreate[mpIdx].valueNumber = purchaseMakingChargesPerGramVal;
        else fieldValuesToCreate.push({ categoryFieldId: pricingFields.purchaseMakingChargesPerGramField.id, valueText: null, valueNumber: purchaseMakingChargesPerGramVal, valueBoolean: null });
      }

      if (purchasePriceVal !== null) {
        const pIdx = fieldValuesToCreate.findIndex((fv) => fv.categoryFieldId === pricingFields.purchasePriceField.id);
        if (pIdx >= 0) fieldValuesToCreate[pIdx].valueNumber = purchasePriceVal;
        else fieldValuesToCreate.push({ categoryFieldId: pricingFields.purchasePriceField.id, valueText: null, valueNumber: purchasePriceVal, valueBoolean: null });
      }

      if (additionalChargesVal !== null) {
        const cIdx = fieldValuesToCreate.findIndex((fv) => fv.categoryFieldId === pricingFields.additionalChargesField.id);
        if (cIdx >= 0) fieldValuesToCreate[cIdx].valueNumber = additionalChargesVal;
        else fieldValuesToCreate.push({ categoryFieldId: pricingFields.additionalChargesField.id, valueText: null, valueNumber: additionalChargesVal, valueBoolean: null });
      }

      if (actualPurchasePriceVal !== null) {
        const aIdx = fieldValuesToCreate.findIndex((fv) => fv.categoryFieldId === pricingFields.actualPurchasePriceField.id);
        if (aIdx >= 0) fieldValuesToCreate[aIdx].valueNumber = actualPurchasePriceVal;
        else fieldValuesToCreate.push({ categoryFieldId: pricingFields.actualPurchasePriceField.id, valueText: null, valueNumber: actualPurchasePriceVal, valueBoolean: null });
      }

      if (actualPurchasePriceCodeVal !== null) {
        const codeIdx = fieldValuesToCreate.findIndex((fv) => fv.categoryFieldId === pricingFields.actualPurchasePriceCodeField.id);
        if (codeIdx >= 0) fieldValuesToCreate[codeIdx].valueText = actualPurchasePriceCodeVal;
        else fieldValuesToCreate.push({ categoryFieldId: pricingFields.actualPurchasePriceCodeField.id, valueText: actualPurchasePriceCodeVal, valueNumber: null, valueBoolean: null });
      }

      if (sellingPriceVal !== null) {
        const sIdx = fieldValuesToCreate.findIndex((fv) => fv.categoryFieldId === pricingFields.sellingPriceField.id);
        if (sIdx >= 0) fieldValuesToCreate[sIdx].valueNumber = sellingPriceVal;
        else fieldValuesToCreate.push({ categoryFieldId: pricingFields.sellingPriceField.id, valueText: null, valueNumber: sellingPriceVal, valueBoolean: null });
      }

      if (marginVal !== null) {
        const mIdx = fieldValuesToCreate.findIndex((fv) => fv.categoryFieldId === pricingFields.marginPercentageField.id);
        if (mIdx >= 0) fieldValuesToCreate[mIdx].valueNumber = marginVal;
        else fieldValuesToCreate.push({ categoryFieldId: pricingFields.marginPercentageField.id, valueText: null, valueNumber: marginVal, valueBoolean: null });
      }
    }

    const product = await tx.product.create({
      data: {
        companyId,
        categoryId: input.categoryId,
        name,
        barcode,
        stockQuantity,
        isArchived: false,
        vendorId: input.vendorId || null,
        purchaseDate: input.purchaseDate?.trim() || null,
      },
    });

    if (fieldValuesToCreate.length > 0) {
      await tx.productFieldValue.createMany({
        data: fieldValuesToCreate.map((fv) => ({
          productId: product.id,
          categoryFieldId: fv.categoryFieldId,
          valueText: fv.valueText,
          valueNumber: fv.valueNumber,
          valueBoolean: fv.valueBoolean,
        })),
      });
    }

    return product;
  }

  /**
   * Creates a new Product with permanent barcode and dynamic field values inside a database transaction.
   */
  public async createProduct(input: CreateProductRequest): Promise<ProductDto> {
    const companyId = authService.getAuthenticatedCompanyId();
    const prisma = getPrismaClient();

    const createdProduct = await prisma.$transaction(async (tx) => {
      return this.createProductWithTx(tx, companyId, input);
    });

    return this.getProductById(createdProduct.id);
  }

  public async updateProduct(input: UpdateProductRequest): Promise<ProductDto> {
    const companyId = authService.getAuthenticatedCompanyId();
    const prisma = getPrismaClient();

    if (!input.id || typeof input.id !== 'string') {
      throw new Error('Valid product ID is required.');
    }

    const existingProduct = await this.verifyProductOwnership(input.id, companyId);

    const name = input.name?.trim();
    if (!name) {
      throw new Error('Product name is required.');
    }
    if (name.length > 200) {
      throw new Error('Product name cannot exceed 200 characters.');
    }

    const categoryIdToUse = input.categoryId?.trim() || existingProduct.categoryId;
    if (categoryIdToUse !== existingProduct.categoryId) {
      await this.verifyCategoryOwnership(categoryIdToUse, companyId);
    }

    // Load category fields for product's category
    const categoryFields = await prisma.categoryField.findMany({
      where: { categoryId: categoryIdToUse },
    });

    // Extract purchase & selling pricing from direct fields or fieldValues
    let rawPurchasePrice: unknown = input.purchasePrice;
    let rawPurchaseRate: unknown = input.purchaseRatePerGram;
    let rawPurchaseMaking: unknown = input.purchaseMakingChargesPerGram;
    let rawAdditionalCharges: unknown = input.additionalChargesPercentage;
    let rawSellingPrice: unknown = input.sellingPrice;
    let rawMargin: unknown = input.marginPercentage;

    if (Array.isArray(input.fieldValues)) {
      for (const fv of input.fieldValues) {
        const cf = categoryFields.find((f) => f.id === fv.categoryFieldId);
        if (cf?.fieldKey === 'purchasePrice' && rawPurchasePrice === undefined) {
          rawPurchasePrice = fv.valueNumber;
        } else if (cf?.fieldKey === 'purchaseRatePerGram' && rawPurchaseRate === undefined) {
          rawPurchaseRate = fv.valueNumber;
        } else if (cf?.fieldKey === 'purchaseMakingChargesPerGram' && rawPurchaseMaking === undefined) {
          rawPurchaseMaking = fv.valueNumber;
        } else if (cf?.fieldKey === 'additionalChargesPercentage' && rawAdditionalCharges === undefined) {
          rawAdditionalCharges = fv.valueNumber;
        } else if (cf?.fieldKey === 'sellingPrice' && rawSellingPrice === undefined) {
          rawSellingPrice = fv.valueNumber;
        } else if ((cf?.fieldKey === 'marginPercentage' || cf?.fieldKey === 'margin') && rawMargin === undefined) {
          rawMargin = fv.valueNumber;
        }
      }
    }

    const hasPurityField = categoryFields.some(
      (f) => f.fieldKey === 'purity' || f.name.toLowerCase().includes('purity')
    );

    let additionalChargesVal: number | null = null;
    if (rawAdditionalCharges !== undefined && rawAdditionalCharges !== null && String(rawAdditionalCharges).trim() !== '') {
      const cNum = typeof rawAdditionalCharges === 'number' ? rawAdditionalCharges : parseFloat(String(rawAdditionalCharges));
      if (isNaN(cNum) || cNum < 0) {
        throw new Error('Additional Charges must be a valid non-negative percentage.');
      }
      additionalChargesVal = cNum;
    }

    let purchaseRatePerGramVal: number | null = null;
    let purchaseMakingChargesPerGramVal: number | null = null;

    if (rawPurchaseRate !== undefined && rawPurchaseRate !== null && String(rawPurchaseRate).trim() !== '') {
      const rpNum = typeof rawPurchaseRate === 'number' ? rawPurchaseRate : parseFloat(String(rawPurchaseRate));
      if (isNaN(rpNum) || rpNum < 0) {
        throw new Error('Purchase Rate per Gram must be a valid non-negative number.');
      }
      purchaseRatePerGramVal = rpNum;
    }

    if (rawPurchaseMaking !== undefined && rawPurchaseMaking !== null && String(rawPurchaseMaking).trim() !== '') {
      const mpNum = typeof rawPurchaseMaking === 'number' ? rawPurchaseMaking : parseFloat(String(rawPurchaseMaking));
      if (isNaN(mpNum) || mpNum < 0) {
        throw new Error('Purchase Making Charges per Gram must be a valid non-negative number.');
      }
      purchaseMakingChargesPerGramVal = mpNum;
    }

    // Weight extraction
    let weightVal: number | null = null;
    const weightField = categoryFields.find(
      (f) => f.fieldKey === 'weight' || f.name.toLowerCase().includes('weight')
    );
    if (weightField && Array.isArray(input.fieldValues)) {
      const wFv = input.fieldValues.find((f) => f.categoryFieldId === weightField.id);
      if (wFv?.valueNumber !== undefined && wFv?.valueNumber !== null && String(wFv.valueNumber).trim() !== '') {
        const wNum = typeof wFv.valueNumber === 'number' ? wFv.valueNumber : parseFloat(String(wFv.valueNumber));
        if (!isNaN(wNum) && wNum > 0) {
          weightVal = wNum;
        }
      }
    }
    if (weightVal === null && weightField) {
      const existingWFv = await prisma.productFieldValue.findUnique({
        where: {
          productId_categoryFieldId: {
            productId: existingProduct.id,
            categoryFieldId: weightField.id,
          },
        },
      });
      if (existingWFv?.valueNumber !== null && existingWFv?.valueNumber !== undefined) {
        weightVal = existingWFv.valueNumber;
      }
    }

    let purchasePriceVal: number | null = null;
    let actualPurchasePriceVal: number | null = null;
    const hasPurchasePriceInput = rawPurchasePrice !== undefined || rawPurchaseRate !== undefined;
    const hasSellingPriceInput = rawSellingPrice !== undefined;

    if (hasPurityField && purchaseRatePerGramVal !== null && weightVal !== null && weightVal > 0) {
      const baseCost = weightVal * purchaseRatePerGramVal;
      const makingCost = weightVal * (purchaseMakingChargesPerGramVal ?? 0);
      const addPercent = additionalChargesVal ?? 0;
      const addCostAmt = baseCost * (addPercent / 100);

      purchasePriceVal = Math.round((baseCost + makingCost) * 100) / 100;
      actualPurchasePriceVal = Math.round((baseCost + makingCost + addCostAmt) * 100) / 100;
      if (additionalChargesVal === null) {
        additionalChargesVal = 0;
      }
    } else if (rawPurchasePrice !== undefined && rawPurchasePrice !== null && String(rawPurchasePrice).trim() !== '') {
      const num = typeof rawPurchasePrice === 'number' ? rawPurchasePrice : parseFloat(String(rawPurchasePrice));
      if (isNaN(num) || num <= 0) {
        throw new Error('Purchase Price (₹) must be a valid number greater than 0.');
      }
      purchasePriceVal = num;
      if (additionalChargesVal === null) {
        additionalChargesVal = 0;
      }
      actualPurchasePriceVal = Math.round((purchasePriceVal + (purchasePriceVal * additionalChargesVal / 100)) * 100) / 100;
    }

    // Selling price and margin parsing & auto calculation
    let sellingPriceVal: number | null = null;
    let marginVal: number | null = null;

    if (rawSellingPrice !== undefined && rawSellingPrice !== null && String(rawSellingPrice).trim() !== '') {
      const spNum = typeof rawSellingPrice === 'number' ? rawSellingPrice : parseFloat(String(rawSellingPrice));
      if (isNaN(spNum) || spNum <= 0) {
        throw new Error('Selling Price (₹) must be a valid number greater than 0.');
      }
      sellingPriceVal = Math.round(spNum * 100) / 100;
    }

    if (rawMargin !== undefined && rawMargin !== null && String(rawMargin).trim() !== '') {
      const mNum = typeof rawMargin === 'number' ? rawMargin : parseFloat(String(rawMargin));
      if (isNaN(mNum)) {
        throw new Error('Margin must be a valid number.');
      }
      marginVal = Math.round(mNum * 100) / 100;
    }

    // Two-way calculation if cost is available
    if (sellingPriceVal !== null && marginVal === null && actualPurchasePriceVal !== null && actualPurchasePriceVal > 0) {
      marginVal = Math.round(((sellingPriceVal - actualPurchasePriceVal) / actualPurchasePriceVal) * 100 * 100) / 100;
    } else if (marginVal !== null && sellingPriceVal === null && actualPurchasePriceVal !== null && actualPurchasePriceVal > 0) {
      sellingPriceVal = Math.round((actualPurchasePriceVal + (actualPurchasePriceVal * marginVal / 100)) * 100) / 100;
    }

    const inputMap = new Map<string, { valueText?: string | null; valueNumber?: number | null; valueBoolean?: boolean | null }>();
    if (Array.isArray(input.fieldValues)) {
      for (const fv of input.fieldValues) {
        if (fv && fv.categoryFieldId) {
          inputMap.set(fv.categoryFieldId, fv);
        }
      }
    }

    const INTERNAL_SYSTEM_KEYS = [
      'purchasePrice',
      'purchaseRatePerGram',
      'purchaseMakingChargesPerGram',
      'additionalChargesPercentage',
      'actualPurchasePrice',
      'actualPurchasePriceCode',
      'sellingPrice',
      'marginPercentage',
      'margin',
    ];

    const fieldValuesToSave: Array<{
      categoryFieldId: string;
      valueText: string | null;
      valueNumber: number | null;
      valueBoolean: boolean | null;
    }> = [];

    for (const field of categoryFields) {
      // Internal pricing fields are managed dedicatedly below
      if (INTERNAL_SYSTEM_KEYS.includes(field.fieldKey)) {
        continue;
      }

      const userVal = inputMap.get(field.id);
      const parsedOpts = this.parseOptions(field.options) || [];

      let valueText: string | null = null;
      let valueNumber: number | null = null;
      let valueBoolean: boolean | null = null;

      switch (field.fieldType) {
        case 'text': {
          const raw = userVal?.valueText;
          if (raw !== undefined && raw !== null) {
            valueText = String(raw).trim();
          }
          if (field.required && (!valueText || valueText.length === 0)) {
            throw new Error(`Field "${field.name}" is required.`);
          }
          break;
        }

        case 'number': {
          const raw = userVal?.valueNumber;
          if (raw !== undefined && raw !== null) {
            const num = typeof raw === 'number' ? raw : parseFloat(String(raw));
            if (isNaN(num)) {
              throw new Error(`Field "${field.name}" must be a valid number.`);
            }
            valueNumber = num;
          }
          if (field.required && valueNumber === null) {
            throw new Error(`Field "${field.name}" is required.`);
          }
          break;
        }

        case 'boolean': {
          const raw = userVal?.valueBoolean;
          if (raw !== undefined && raw !== null) {
            valueBoolean = Boolean(raw);
          } else if (field.required) {
            valueBoolean = false;
          }
          break;
        }

        case 'select': {
          const raw = userVal?.valueText;
          if (raw !== undefined && raw !== null) {
            valueText = String(raw).trim();
          }
          if (field.required && (!valueText || valueText.length === 0)) {
            throw new Error(`Field "${field.name}" is required.`);
          }
          if (valueText && parsedOpts.length > 0 && !parsedOpts.includes(valueText)) {
            throw new Error(
              `Invalid option "${valueText}" for field "${field.name}". Must be one of: ${parsedOpts.join(', ')}.`
            );
          }
          break;
        }
      }

      fieldValuesToSave.push({
        categoryFieldId: field.id,
        valueText,
        valueNumber,
        valueBoolean,
      });
    }

    const stockQuantity =
      input.stockQuantity !== undefined &&
      typeof input.stockQuantity === 'number' &&
      !isNaN(input.stockQuantity)
        ? Math.max(0, input.stockQuantity)
        : existingProduct.stockQuantity;

    // Atomic transaction: update name, stockQuantity, replace field values
    await prisma.$transaction(async (tx) => {
      // Ensure pricing fields exist and populate them
      if (
        purchasePriceVal !== null ||
        actualPurchasePriceVal !== null ||
        purchaseRatePerGramVal !== null ||
        additionalChargesVal !== null ||
        sellingPriceVal !== null ||
        marginVal !== null
      ) {
        const pricingFields = await this.ensurePurchaseCategoryFields(tx, existingProduct.categoryId);
        const actualPurchasePriceCodeVal = generateActualPurchasePriceCode(actualPurchasePriceVal);

        // Append or update purchaseRatePerGram
        const rpIdx = fieldValuesToSave.findIndex((fv) => fv.categoryFieldId === pricingFields.purchaseRatePerGramField.id);
        if (rpIdx >= 0) {
          fieldValuesToSave[rpIdx].valueNumber = purchaseRatePerGramVal;
        } else if (purchaseRatePerGramVal !== null) {
          fieldValuesToSave.push({
            categoryFieldId: pricingFields.purchaseRatePerGramField.id,
            valueText: null,
            valueNumber: purchaseRatePerGramVal,
            valueBoolean: null,
          });
        }

        // Append or update purchaseMakingChargesPerGram
        const mpIdx = fieldValuesToSave.findIndex((fv) => fv.categoryFieldId === pricingFields.purchaseMakingChargesPerGramField.id);
        if (mpIdx >= 0) {
          fieldValuesToSave[mpIdx].valueNumber = purchaseMakingChargesPerGramVal;
        } else if (purchaseMakingChargesPerGramVal !== null) {
          fieldValuesToSave.push({
            categoryFieldId: pricingFields.purchaseMakingChargesPerGramField.id,
            valueText: null,
            valueNumber: purchaseMakingChargesPerGramVal,
            valueBoolean: null,
          });
        }

        // Append or update purchasePrice
        const pIdx = fieldValuesToSave.findIndex((fv) => fv.categoryFieldId === pricingFields.purchasePriceField.id);
        if (pIdx >= 0) {
          fieldValuesToSave[pIdx].valueNumber = purchasePriceVal;
        } else if (purchasePriceVal !== null) {
          fieldValuesToSave.push({
            categoryFieldId: pricingFields.purchasePriceField.id,
            valueText: null,
            valueNumber: purchasePriceVal,
            valueBoolean: null,
          });
        }

        // Append or update additionalChargesPercentage
        const cIdx = fieldValuesToSave.findIndex((fv) => fv.categoryFieldId === pricingFields.additionalChargesField.id);
        if (cIdx >= 0) {
          fieldValuesToSave[cIdx].valueNumber = additionalChargesVal;
        } else if (additionalChargesVal !== null) {
          fieldValuesToSave.push({
            categoryFieldId: pricingFields.additionalChargesField.id,
            valueText: null,
            valueNumber: additionalChargesVal,
            valueBoolean: null,
          });
        }

        // Append or update actualPurchasePrice
        const aIdx = fieldValuesToSave.findIndex((fv) => fv.categoryFieldId === pricingFields.actualPurchasePriceField.id);
        if (aIdx >= 0) {
          fieldValuesToSave[aIdx].valueNumber = actualPurchasePriceVal;
        } else if (actualPurchasePriceVal !== null) {
          fieldValuesToSave.push({
            categoryFieldId: pricingFields.actualPurchasePriceField.id,
            valueText: null,
            valueNumber: actualPurchasePriceVal,
            valueBoolean: null,
          });
        }

        // Append or update actualPurchasePriceCode
        const codeIdx = fieldValuesToSave.findIndex((fv) => fv.categoryFieldId === pricingFields.actualPurchasePriceCodeField.id);
        if (codeIdx >= 0) {
          fieldValuesToSave[codeIdx].valueText = actualPurchasePriceCodeVal;
        } else if (actualPurchasePriceCodeVal !== null) {
          fieldValuesToSave.push({
            categoryFieldId: pricingFields.actualPurchasePriceCodeField.id,
            valueText: actualPurchasePriceCodeVal,
            valueNumber: null,
            valueBoolean: null,
          });
        }

        // Append or update sellingPrice
        const sIdx = fieldValuesToSave.findIndex((fv) => fv.categoryFieldId === pricingFields.sellingPriceField.id);
        if (sIdx >= 0) {
          fieldValuesToSave[sIdx].valueNumber = sellingPriceVal;
        } else if (sellingPriceVal !== null) {
          fieldValuesToSave.push({
            categoryFieldId: pricingFields.sellingPriceField.id,
            valueText: null,
            valueNumber: sellingPriceVal,
            valueBoolean: null,
          });
        }

        // Append or update marginPercentage
        const mIdx = fieldValuesToSave.findIndex((fv) => fv.categoryFieldId === pricingFields.marginPercentageField.id);
        if (mIdx >= 0) {
          fieldValuesToSave[mIdx].valueNumber = marginVal;
        } else if (marginVal !== null) {
          fieldValuesToSave.push({
            categoryFieldId: pricingFields.marginPercentageField.id,
            valueText: null,
            valueNumber: marginVal,
            valueBoolean: null,
          });
        }
      } else if (hasPurchasePriceInput && purchasePriceVal === null) {
        // If explicitly set to null/empty, clear the purchase category fields
        const purchaseFields = await tx.categoryField.findMany({
          where: {
            categoryId: existingProduct.categoryId,
            fieldKey: { in: ['purchasePrice', 'purchaseRatePerGram', 'purchaseMakingChargesPerGram', 'additionalChargesPercentage', 'actualPurchasePrice', 'actualPurchasePriceCode'] },
          },
        });
        for (const pf of purchaseFields) {
          const idx = fieldValuesToSave.findIndex((fv) => fv.categoryFieldId === pf.id);
          if (idx >= 0) {
            fieldValuesToSave[idx].valueNumber = null;
            fieldValuesToSave[idx].valueText = null;
          }
        }
      }

      if (hasSellingPriceInput && sellingPriceVal === null) {
        const pricingFields = await tx.categoryField.findMany({
          where: {
            categoryId: existingProduct.categoryId,
            fieldKey: { in: ['sellingPrice', 'marginPercentage'] },
          },
        });
        for (const pf of pricingFields) {
          const idx = fieldValuesToSave.findIndex((fv) => fv.categoryFieldId === pf.id);
          if (idx >= 0) {
            fieldValuesToSave[idx].valueNumber = null;
            fieldValuesToSave[idx].valueText = null;
          }
        }
      }

      await tx.product.update({
        where: { id: input.id },
        data: {
          categoryId: categoryIdToUse,
          name,
          stockQuantity,
          isArchived: false,
          ...(input.vendorId !== undefined ? { vendorId: input.vendorId || null } : {}),
          ...(input.purchaseDate !== undefined ? { purchaseDate: input.purchaseDate?.trim() || null } : {}),
        },
      });

      // Remove existing field values for this product and reinsert validated values
      await tx.productFieldValue.deleteMany({
        where: { productId: input.id },
      });

      if (fieldValuesToSave.length > 0) {
        await tx.productFieldValue.createMany({
          data: fieldValuesToSave.map((fv) => ({
            productId: input.id,
            categoryFieldId: fv.categoryFieldId,
            valueText: fv.valueText,
            valueNumber: fv.valueNumber,
            valueBoolean: fv.valueBoolean,
          })),
        });
      }

    });

    return this.getProductById(input.id);
  }

  /**
   * Soft-deletes a product by marking isArchived = true.
   * Product record, barcode sequence, and dynamic field values are preserved
   * to ensure past/future sales, orders, and receipts retain full data integrity.
   */
  public async deleteProduct(productId: string): Promise<{ id: string }> {
    const companyId = authService.getAuthenticatedCompanyId();
    const prisma = getPrismaClient();

    if (!productId || typeof productId !== 'string') {
      throw new Error('Valid product ID is required.');
    }

    const existingProduct = await this.verifyProductOwnership(productId, companyId);
    if (existingProduct.isArchived) {
      throw new Error('Product is already deleted or archived.');
    }

    await prisma.product.update({
      where: { id: productId },
      data: { isArchived: true },
    });

    return { id: productId };
  }
}

export const productService = new ProductService();
