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
  private async generatePermanentBarcode(
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
   * Helper to extract purchase pricing attributes from dynamic ProductFieldValue list.
   */
  private extractPurchasePricing(fieldValuesDto: ProductFieldValueDto[]): {
    purchasePrice: number | null;
    additionalChargesPercentage: number | null;
    actualPurchasePrice: number | null;
    actualPurchasePriceCode: string | null;
  } {
    const pFv = fieldValuesDto.find((f) => f.categoryField?.fieldKey === 'purchasePrice');
    const cFv = fieldValuesDto.find((f) => f.categoryField?.fieldKey === 'additionalChargesPercentage');
    const aFv = fieldValuesDto.find((f) => f.categoryField?.fieldKey === 'actualPurchasePrice');
    const codeFv = fieldValuesDto.find((f) => f.categoryField?.fieldKey === 'actualPurchasePriceCode');

    const purchasePrice = pFv?.valueNumber ?? null;
    const additionalChargesPercentage = cFv?.valueNumber ?? null;
    const actualPurchasePrice = aFv?.valueNumber ?? null;
    const actualPurchasePriceCode =
      codeFv?.valueText ?? generateActualPurchasePriceCode(actualPurchasePrice);

    return {
      purchasePrice,
      additionalChargesPercentage,
      actualPurchasePrice,
      actualPurchasePriceCode,
    };
  }

  /**
   * Helper to ensure standard purchase pricing CategoryFields exist for a category.
   * Field keys: 'purchasePrice', 'additionalChargesPercentage', 'actualPurchasePrice'.
   */
  public async ensurePurchaseCategoryFields(
    tx: Prisma.TransactionClient,
    categoryId: string
  ): Promise<{
    purchasePriceField: { id: string; fieldKey: string };
    additionalChargesField: { id: string; fieldKey: string };
    actualPurchasePriceField: { id: string; fieldKey: string };
    actualPurchasePriceCodeField: { id: string; fieldKey: string };
  }> {
    const existing = await tx.categoryField.findMany({
      where: {
        categoryId,
        fieldKey: {
          in: ['purchasePrice', 'additionalChargesPercentage', 'actualPurchasePrice', 'actualPurchasePriceCode'],
        },
      },
    });

    const existingMap = new Map(existing.map((f) => [f.fieldKey, f]));

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

    return {
      purchasePriceField,
      additionalChargesField,
      actualPurchasePriceField,
      actualPurchasePriceCodeField,
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
        additionalChargesPercentage: purchasePricing.additionalChargesPercentage,
        actualPurchasePrice: purchasePricing.actualPurchasePrice,
        actualPurchasePriceCode: purchasePricing.actualPurchasePriceCode,
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
      additionalChargesPercentage: purchasePricing.additionalChargesPercentage,
      actualPurchasePrice: purchasePricing.actualPurchasePrice,
      actualPurchasePriceCode: purchasePricing.actualPurchasePriceCode,
    };
  }

  /**
   * Creates a new Product with permanent barcode and dynamic field values inside a database transaction.
   */
  public async createProduct(input: CreateProductRequest): Promise<ProductDto> {
    const companyId = authService.getAuthenticatedCompanyId();
    const prisma = getPrismaClient();

    // 1. Verify category belongs to authenticated company
    const category = await this.verifyCategoryOwnership(input.categoryId, companyId);

    // 2. Validate product name
    const name = input.name?.trim();
    if (!name) {
      throw new Error('Product name is required.');
    }
    if (name.length > 200) {
      throw new Error('Product name cannot exceed 200 characters.');
    }

    // 3. Load dynamic CategoryFields for this category
    const categoryFields = await prisma.categoryField.findMany({
      where: { categoryId: input.categoryId },
      orderBy: { displayOrder: 'asc' },
    });

    // Extract purchase pricing from direct fields or fieldValues
    let rawPurchasePrice: unknown = input.purchasePrice;
    let rawAdditionalCharges: unknown = input.additionalChargesPercentage;

    if (Array.isArray(input.fieldValues)) {
      for (const fv of input.fieldValues) {
        const cf = categoryFields.find((f) => f.id === fv.categoryFieldId);
        if (cf?.fieldKey === 'purchasePrice' && rawPurchasePrice === undefined) {
          rawPurchasePrice = fv.valueNumber;
        } else if (cf?.fieldKey === 'additionalChargesPercentage' && rawAdditionalCharges === undefined) {
          rawAdditionalCharges = fv.valueNumber;
        }
      }
    }

    let purchasePriceVal: number | null = null;
    let additionalChargesVal: number | null = null;
    let actualPurchasePriceVal: number | null = null;

    if (rawPurchasePrice !== undefined && rawPurchasePrice !== null && String(rawPurchasePrice).trim() !== '') {
      const num = typeof rawPurchasePrice === 'number' ? rawPurchasePrice : parseFloat(String(rawPurchasePrice));
      if (isNaN(num) || num < 0) {
        throw new Error('Purchase Price must be a valid non-negative number.');
      }
      purchasePriceVal = num;

      if (rawAdditionalCharges !== undefined && rawAdditionalCharges !== null && String(rawAdditionalCharges).trim() !== '') {
        const cNum = typeof rawAdditionalCharges === 'number' ? rawAdditionalCharges : parseFloat(String(rawAdditionalCharges));
        if (isNaN(cNum) || cNum < 0) {
          throw new Error('Additional Charges must be a valid non-negative percentage.');
        }
        additionalChargesVal = cNum;
      } else {
        additionalChargesVal = 0;
      }

      actualPurchasePriceVal = Math.round((purchasePriceVal + (purchasePriceVal * additionalChargesVal / 100)) * 100) / 100;
    } else if (rawAdditionalCharges !== undefined && rawAdditionalCharges !== null && String(rawAdditionalCharges).trim() !== '') {
      const cNum = typeof rawAdditionalCharges === 'number' ? rawAdditionalCharges : parseFloat(String(rawAdditionalCharges));
      if (isNaN(cNum) || cNum < 0) {
        throw new Error('Additional Charges must be a valid non-negative percentage.');
      }
      additionalChargesVal = cNum;
    }

    // 4. Validate and build sanitized field value records
    const inputMap = new Map<string, { valueText?: string | null; valueNumber?: number | null; valueBoolean?: boolean | null }>();
    if (Array.isArray(input.fieldValues)) {
      for (const fv of input.fieldValues) {
        if (fv && fv.categoryFieldId) {
          inputMap.set(fv.categoryFieldId, fv);
        }
      }
    }

    const fieldValuesToCreate: Array<{
      categoryFieldId: string;
      valueText: string | null;
      valueNumber: number | null;
      valueBoolean: boolean | null;
    }> = [];

    for (const field of categoryFields) {
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

      // Record field value even if empty/null so record exists for the product
      fieldValuesToCreate.push({
        categoryFieldId: field.id,
        valueText,
        valueNumber,
        valueBoolean,
      });
    }

    // 5. Extract stockQuantity (supports decimals e.g. 50.5m or integers e.g. 10 pcs)
    const stockQuantity =
      typeof input.stockQuantity === 'number' && !isNaN(input.stockQuantity)
        ? Math.max(0, input.stockQuantity)
        : 0;

    // 6. Generate permanent barcode
    const barcode = await this.generatePermanentBarcode(name, category.name);

    // 7. Execute atomic database transaction
    const createdProduct = await prisma.$transaction(async (tx) => {
      // If purchase pricing was provided, ensure standard CategoryFields exist
      if (purchasePriceVal !== null || additionalChargesVal !== null) {
        const purchaseFields = await this.ensurePurchaseCategoryFields(tx, input.categoryId);
        const actualPurchasePriceCodeVal = generateActualPurchasePriceCode(actualPurchasePriceVal);

        // Append or update purchasePrice
        const pIdx = fieldValuesToCreate.findIndex((fv) => fv.categoryFieldId === purchaseFields.purchasePriceField.id);
        if (pIdx >= 0) {
          fieldValuesToCreate[pIdx].valueNumber = purchasePriceVal;
        } else {
          fieldValuesToCreate.push({
            categoryFieldId: purchaseFields.purchasePriceField.id,
            valueText: null,
            valueNumber: purchasePriceVal,
            valueBoolean: null,
          });
        }

        // Append or update additionalChargesPercentage
        const cIdx = fieldValuesToCreate.findIndex((fv) => fv.categoryFieldId === purchaseFields.additionalChargesField.id);
        if (cIdx >= 0) {
          fieldValuesToCreate[cIdx].valueNumber = additionalChargesVal;
        } else {
          fieldValuesToCreate.push({
            categoryFieldId: purchaseFields.additionalChargesField.id,
            valueText: null,
            valueNumber: additionalChargesVal,
            valueBoolean: null,
          });
        }

        // Append or update actualPurchasePrice
        const aIdx = fieldValuesToCreate.findIndex((fv) => fv.categoryFieldId === purchaseFields.actualPurchasePriceField.id);
        if (aIdx >= 0) {
          fieldValuesToCreate[aIdx].valueNumber = actualPurchasePriceVal;
        } else {
          fieldValuesToCreate.push({
            categoryFieldId: purchaseFields.actualPurchasePriceField.id,
            valueText: null,
            valueNumber: actualPurchasePriceVal,
            valueBoolean: null,
          });
        }

        // Append or update actualPurchasePriceCode
        const codeIdx = fieldValuesToCreate.findIndex((fv) => fv.categoryFieldId === purchaseFields.actualPurchasePriceCodeField.id);
        if (codeIdx >= 0) {
          fieldValuesToCreate[codeIdx].valueText = actualPurchasePriceCodeVal;
        } else {
          fieldValuesToCreate.push({
            categoryFieldId: purchaseFields.actualPurchasePriceCodeField.id,
            valueText: actualPurchasePriceCodeVal,
            valueNumber: null,
            valueBoolean: null,
          });
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
    });

    return this.getProductById(createdProduct.id);
  }

  /**
   * Updates an existing Product.
   * Barcode, category, and ID are immutable.
   */
  public async updateProduct(input: UpdateProductRequest): Promise<ProductDto> {
    const companyId = authService.getAuthenticatedCompanyId();
    const prisma = getPrismaClient();

    if (!input.id || typeof input.id !== 'string') {
      throw new Error('Valid product ID is required.');
    }

    const existingProduct = await this.verifyProductOwnership(input.id, companyId);

    if (existingProduct.isArchived) {
      throw new Error('Cannot update an archived or deleted product.');
    }

    const name = input.name?.trim();
    if (!name) {
      throw new Error('Product name is required.');
    }
    if (name.length > 200) {
      throw new Error('Product name cannot exceed 200 characters.');
    }

    // Load category fields for product's category
    const categoryFields = await prisma.categoryField.findMany({
      where: { categoryId: existingProduct.categoryId },
    });

    // Extract purchase pricing from direct fields or fieldValues
    let rawPurchasePrice: unknown = input.purchasePrice;
    let rawAdditionalCharges: unknown = input.additionalChargesPercentage;

    if (Array.isArray(input.fieldValues)) {
      for (const fv of input.fieldValues) {
        const cf = categoryFields.find((f) => f.id === fv.categoryFieldId);
        if (cf?.fieldKey === 'purchasePrice' && rawPurchasePrice === undefined) {
          rawPurchasePrice = fv.valueNumber;
        } else if (cf?.fieldKey === 'additionalChargesPercentage' && rawAdditionalCharges === undefined) {
          rawAdditionalCharges = fv.valueNumber;
        }
      }
    }

    let purchasePriceVal: number | null = null;
    let additionalChargesVal: number | null = null;
    let actualPurchasePriceVal: number | null = null;
    const hasPurchasePriceInput = rawPurchasePrice !== undefined;

    if (rawPurchasePrice !== undefined && rawPurchasePrice !== null && String(rawPurchasePrice).trim() !== '') {
      const num = typeof rawPurchasePrice === 'number' ? rawPurchasePrice : parseFloat(String(rawPurchasePrice));
      if (isNaN(num) || num < 0) {
        throw new Error('Purchase Price must be a valid non-negative number.');
      }
      purchasePriceVal = num;

      if (rawAdditionalCharges !== undefined && rawAdditionalCharges !== null && String(rawAdditionalCharges).trim() !== '') {
        const cNum = typeof rawAdditionalCharges === 'number' ? rawAdditionalCharges : parseFloat(String(rawAdditionalCharges));
        if (isNaN(cNum) || cNum < 0) {
          throw new Error('Additional Charges must be a valid non-negative percentage.');
        }
        additionalChargesVal = cNum;
      } else {
        additionalChargesVal = 0;
      }

      actualPurchasePriceVal = Math.round((purchasePriceVal + (purchasePriceVal * additionalChargesVal / 100)) * 100) / 100;
    } else if (rawAdditionalCharges !== undefined && rawAdditionalCharges !== null && String(rawAdditionalCharges).trim() !== '') {
      const cNum = typeof rawAdditionalCharges === 'number' ? rawAdditionalCharges : parseFloat(String(rawAdditionalCharges));
      if (isNaN(cNum) || cNum < 0) {
        throw new Error('Additional Charges must be a valid non-negative percentage.');
      }
      additionalChargesVal = cNum;
    }

    const inputMap = new Map<string, { valueText?: string | null; valueNumber?: number | null; valueBoolean?: boolean | null }>();
    if (Array.isArray(input.fieldValues)) {
      for (const fv of input.fieldValues) {
        if (fv && fv.categoryFieldId) {
          inputMap.set(fv.categoryFieldId, fv);
        }
      }
    }

    const fieldValuesToSave: Array<{
      categoryFieldId: string;
      valueText: string | null;
      valueNumber: number | null;
      valueBoolean: boolean | null;
    }> = [];

    for (const field of categoryFields) {
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
      // If purchase pricing was provided, ensure standard CategoryFields exist
      if (purchasePriceVal !== null || additionalChargesVal !== null) {
        const purchaseFields = await this.ensurePurchaseCategoryFields(tx, existingProduct.categoryId);
        const actualPurchasePriceCodeVal = generateActualPurchasePriceCode(actualPurchasePriceVal);

        // Append or update purchasePrice
        const pIdx = fieldValuesToSave.findIndex((fv) => fv.categoryFieldId === purchaseFields.purchasePriceField.id);
        if (pIdx >= 0) {
          fieldValuesToSave[pIdx].valueNumber = purchasePriceVal;
        } else {
          fieldValuesToSave.push({
            categoryFieldId: purchaseFields.purchasePriceField.id,
            valueText: null,
            valueNumber: purchasePriceVal,
            valueBoolean: null,
          });
        }

        // Append or update additionalChargesPercentage
        const cIdx = fieldValuesToSave.findIndex((fv) => fv.categoryFieldId === purchaseFields.additionalChargesField.id);
        if (cIdx >= 0) {
          fieldValuesToSave[cIdx].valueNumber = additionalChargesVal;
        } else {
          fieldValuesToSave.push({
            categoryFieldId: purchaseFields.additionalChargesField.id,
            valueText: null,
            valueNumber: additionalChargesVal,
            valueBoolean: null,
          });
        }

        // Append or update actualPurchasePrice
        const aIdx = fieldValuesToSave.findIndex((fv) => fv.categoryFieldId === purchaseFields.actualPurchasePriceField.id);
        if (aIdx >= 0) {
          fieldValuesToSave[aIdx].valueNumber = actualPurchasePriceVal;
        } else {
          fieldValuesToSave.push({
            categoryFieldId: purchaseFields.actualPurchasePriceField.id,
            valueText: null,
            valueNumber: actualPurchasePriceVal,
            valueBoolean: null,
          });
        }

        // Append or update actualPurchasePriceCode
        const codeIdx = fieldValuesToSave.findIndex((fv) => fv.categoryFieldId === purchaseFields.actualPurchasePriceCodeField.id);
        if (codeIdx >= 0) {
          fieldValuesToSave[codeIdx].valueText = actualPurchasePriceCodeVal;
        } else {
          fieldValuesToSave.push({
            categoryFieldId: purchaseFields.actualPurchasePriceCodeField.id,
            valueText: actualPurchasePriceCodeVal,
            valueNumber: null,
            valueBoolean: null,
          });
        }
      } else if (hasPurchasePriceInput && purchasePriceVal === null) {
        // If explicitly set to null/empty, clear the purchase category fields
        const purchaseFields = await tx.categoryField.findMany({
          where: {
            categoryId: existingProduct.categoryId,
            fieldKey: { in: ['purchasePrice', 'additionalChargesPercentage', 'actualPurchasePrice', 'actualPurchasePriceCode'] },
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

      await tx.product.update({
        where: { id: input.id },
        data: {
          name,
          stockQuantity,
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
