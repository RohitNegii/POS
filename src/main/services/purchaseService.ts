import { Prisma } from '@prisma/client';
import { getPrismaClient } from '../database/prisma';
import { authService } from './authService';
import { productService } from './productService';
import { generateActualPurchasePriceCode } from '../../shared/utils/purchaseCode';
import { getLocalDateString } from '../../shared/utils/date';
import type {
  CreateProductRequest,
  CreatePurchaseItemInput,
  CreatePurchaseRequest,
  ListPurchasesFilter,
  PurchaseDto,
  PurchaseItemDto,
  PurchasePaymentMethod,
  PurchasePaymentStatus,
  UpdatePurchasePaymentRequest,
  UpdatePurchaseRequest,
} from '../../shared/types/ipc';

export class PurchaseService {
  /**
   * Generates a unique, sequential purchase bill number.
   * Format: PUR-YYYYMMDD-XXXX (e.g. PUR-20261012-0001)
   */
  private async generatePurchaseNumber(
    tx: Prisma.TransactionClient,
    companyId: string,
    purchaseDate: string
  ): Promise<string> {
    const dateCompact = purchaseDate.replace(/-/g, '');
    const prefix = `PUR-${dateCompact}-`;

    const existing = await tx.purchase.findMany({
      where: {
        companyId,
        purchaseNumber: {
          startsWith: prefix,
        },
      },
      select: { purchaseNumber: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    let highestSeq = 0;
    const regex = new RegExp(`^${prefix}(\\d+)$`);
    for (const p of existing) {
      const match = p.purchaseNumber.match(regex);
      if (match && match[1]) {
        const seq = parseInt(match[1], 10);
        if (!isNaN(seq) && seq > highestSeq) {
          highestSeq = seq;
        }
      }
    }

    const nextSeq = highestSeq + 1;
    let candidate = `${prefix}${String(nextSeq).padStart(4, '0')}`;

    // Collision check loop
    let attempts = 0;
    while (attempts < 50) {
      const collision = await tx.purchase.findUnique({
        where: { purchaseNumber: candidate },
        select: { id: true },
      });
      if (!collision) {
        return candidate;
      }
      attempts++;
      candidate = `${prefix}${String(nextSeq + attempts).padStart(4, '0')}`;
    }

    return candidate;
  }

  /**
   * Retrieves purchase history entries for the authenticated admin's company.
   * Displays all saved purchase bills with itemized products list, invoice number, and payment status.
   */
  public async listPurchases(filter?: ListPurchasesFilter): Promise<PurchaseDto[]> {
    const companyId = authService.getAuthenticatedCompanyId();
    const prisma = getPrismaClient();

    const where: Prisma.PurchaseWhereInput = {
      companyId,
    };

    if (filter?.vendorId) {
      where.vendorId = filter.vendorId;
    }

    if (filter?.productId) {
      where.items = {
        some: {
          productId: filter.productId,
        },
      };
    }

    if (filter?.startDate || filter?.endDate) {
      where.purchaseDate = {};
      if (filter.startDate) {
        where.purchaseDate.gte = filter.startDate;
      }
      if (filter.endDate) {
        where.purchaseDate.lte = filter.endDate;
      }
    }

    const trimmedSearch = filter?.search?.trim();
    if (trimmedSearch) {
      where.OR = [
        { purchaseNumber: { contains: trimmedSearch } },
        { invoiceNumber: { contains: trimmedSearch } },
        { vendor: { name: { contains: trimmedSearch } } },
        { items: { some: { productName: { contains: trimmedSearch } } } },
        { items: { some: { barcode: { contains: trimmedSearch } } } },
      ];
    }

    const purchases = await prisma.purchase.findMany({
      where,
      include: {
        vendor: {
          select: {
            id: true,
            name: true,
            phoneNumber: true,
            address: true,
            gstNumber: true,
            bankName: true,
            accountNumber: true,
            ifscCode: true,
          },
        },
        items: {
          include: {
            product: {
              select: {
                id: true,
                stockQuantity: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: [
        { purchaseDate: 'desc' },
        { createdAt: 'desc' },
      ],
    });

    return purchases.map((p) => this.mapPurchaseToDto(p));
  }

  /**
   * Retrieves a single purchase order by ID with all itemized products and payment status.
   */
  public async getPurchaseById(id: string): Promise<PurchaseDto | null> {
    const companyId = authService.getAuthenticatedCompanyId();
    const prisma = getPrismaClient();

    const p = await prisma.purchase.findUnique({
      where: { id },
      include: {
        vendor: {
          select: {
            id: true,
            name: true,
            phoneNumber: true,
            address: true,
            gstNumber: true,
            bankName: true,
            accountNumber: true,
            ifscCode: true,
          },
        },
        items: {
          include: {
            product: {
              select: {
                id: true,
                stockQuantity: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!p || p.companyId !== companyId) {
      return null;
    }

    return this.mapPurchaseToDto(p);
  }

  /**
   * Records a bill-wise purchase from a vendor, creates purchase line items,
   * updates payment details, and atomically increases inventory for the purchased products.
   */
  public async createPurchase(input: CreatePurchaseRequest): Promise<PurchaseDto> {
    const companyId = authService.getAuthenticatedCompanyId();
    const prisma = getPrismaClient();

    if (!input.vendorId) {
      throw new Error('Vendor is required.');
    }

    // 1. Verify vendor belongs to company
    const vendor = await prisma.vendor.findUnique({
      where: { id: input.vendorId },
    });
    if (!vendor || vendor.companyId !== companyId) {
      throw new Error('Selected vendor is invalid or does not belong to your store.');
    }

    // 2. Validate vendor invoice number
    const invoiceNumber = (input.invoiceNumber || '').trim();
    if (!invoiceNumber) {
      throw new Error('Vendor invoice / bill number is required.');
    }

    // 3. Normalise item list (supports both new multi-item format and legacy single-item format)
    let rawItems: CreatePurchaseItemInput[] = [];
    if (Array.isArray(input.items) && input.items.length > 0) {
      rawItems = input.items;
    } else if (input.productId) {
      rawItems = [
        {
          productId: input.productId,
          quantityBought: input.quantityBought || 1,
          unitCost: input.unitCost || 0,
        },
      ];
    }

    if (rawItems.length === 0) {
      throw new Error('Please add at least one product to the purchase bill.');
    }

    // 4. Validate and resolve all products
    const productIds = rawItems.filter((it) => !it.productDraft && !it.productId.startsWith('draft_')).map((it) => it.productId);
    const existingProducts = await prisma.product.findMany({
      where: {
        id: { in: productIds },
        companyId,
      },
      include: {
        category: { select: { name: true } },
        fieldValues: { include: { categoryField: true } },
      },
    });

    const productMap = new Map<string, (typeof existingProducts)[0]>();
    for (const prod of existingProducts) {
      productMap.set(prod.id, prod);
    }

    const validatedItems: Array<{
      productId: string;
      productName: string;
      itemDescription: string | null;
      barcode: string;
      categoryName: string | null;
      hsnCode: string | null;
      quantityBought: number;
      unitCost: number;
      discount: number;
      taxableAmount: number;
      taxRate: number;
      taxAmount: number;
      cgstRate: number;
      cgstAmount: number;
      sgstRate: number;
      sgstAmount: number;
      igstRate: number;
      igstAmount: number;
      totalAmount: number;
      detailsJson: string | null;
      productDraft?: CreateProductRequest;
    }> = [];

    let billSubtotal = 0;
    let billTaxAmount = 0;

    for (const item of rawItems) {
      const isDraft = Boolean(item.productDraft || item.productId.startsWith('draft_'));
      let prodName = item.productName || '';
      let prodBarcode = item.barcode || '';
      let prodCategoryName: string | null = item.categoryName || null;
      let detailsJson: string | null = item.detailsJson || null;

      if (!isDraft) {
        const prod = productMap.get(item.productId);
        if (!prod) {
          throw new Error(`Product with ID "${item.productId}" was not found or does not belong to your company.`);
        }
        prodName = prod.name;
        prodBarcode = prod.barcode;
        prodCategoryName = prod.category?.name || null;

        const snapshot: Record<string, any> = {
          name: prod.name,
          barcode: prod.barcode,
          category: prod.category?.name,
        };
        for (const fv of prod.fieldValues) {
          if (fv.categoryField?.fieldKey) {
            snapshot[fv.categoryField.fieldKey] = fv.valueNumber ?? fv.valueText ?? fv.valueBoolean;
          }
        }
        detailsJson = JSON.stringify(snapshot);
      } else if (item.productDraft) {
        prodName = item.productDraft.name || item.productName || 'New Product';
        prodBarcode = item.productDraft.barcode || item.barcode || '';
        const cat = item.productDraft.categoryId
          ? await prisma.category.findUnique({ where: { id: item.productDraft.categoryId }, select: { name: true } })
          : null;
        if (cat) prodCategoryName = cat.name;
        detailsJson = JSON.stringify({
          name: prodName,
          barcode: prodBarcode,
          category: prodCategoryName,
        });
      }

      const rawQty = item.quantityBought !== undefined && item.quantityBought !== null ? item.quantityBought : (item as any).quantity;
      const qty = typeof rawQty === 'number' ? rawQty : parseFloat(String(rawQty));
      if (isNaN(qty) || qty <= 0) {
        throw new Error(`Purchased quantity for "${prodName || 'Item'}" must be greater than 0.`);
      }

      const cost = typeof item.unitCost === 'number' ? item.unitCost : parseFloat(String(item.unitCost || 0));
      if (isNaN(cost) || cost < 0) {
        throw new Error(`Unit cost for "${prodName || 'Item'}" cannot be negative.`);
      }

      const rawDiscount = typeof item.discount === 'number' ? item.discount : parseFloat(String(item.discount || 0));
      const discount = isNaN(rawDiscount) || rawDiscount < 0 ? 0 : Math.round(rawDiscount * 100) / 100;

      const grossSubtotal = Math.round(qty * cost * 100) / 100;
      const lineTaxable = Math.max(0, Math.round((grossSubtotal - discount) * 100) / 100);

      // Taxes: CGST, SGST, IGST
      const rawCgstRate = typeof item.cgstRate === 'number' ? item.cgstRate : parseFloat(String(item.cgstRate || 0));
      const cgstRate = isNaN(rawCgstRate) || rawCgstRate < 0 ? 0 : rawCgstRate;

      const rawSgstRate = typeof item.sgstRate === 'number' ? item.sgstRate : parseFloat(String(item.sgstRate || 0));
      const sgstRate = isNaN(rawSgstRate) || rawSgstRate < 0 ? 0 : rawSgstRate;

      const rawIgstRate = typeof item.igstRate === 'number' ? item.igstRate : parseFloat(String(item.igstRate || 0));
      const igstRate = isNaN(rawIgstRate) || rawIgstRate < 0 ? 0 : rawIgstRate;

      const rawTaxRate = typeof item.taxRate === 'number' ? item.taxRate : parseFloat(String(item.taxRate || 0));
      const fallbackTaxRate = isNaN(rawTaxRate) || rawTaxRate < 0 ? 0 : rawTaxRate;

      const effectiveTaxRate = (cgstRate + sgstRate + igstRate) > 0
        ? (cgstRate + sgstRate + igstRate)
        : fallbackTaxRate;

      const cgstAmount = cgstRate > 0 ? Math.round(lineTaxable * (cgstRate / 100) * 100) / 100 : 0;
      const sgstAmount = sgstRate > 0 ? Math.round(lineTaxable * (sgstRate / 100) * 100) / 100 : 0;
      const igstAmount = igstRate > 0 ? Math.round(lineTaxable * (igstRate / 100) * 100) / 100 : 0;

      let lineTax = Math.round((cgstAmount + sgstAmount + igstAmount) * 100) / 100;
      if (lineTax === 0 && effectiveTaxRate > 0) {
        lineTax = Math.round(lineTaxable * (effectiveTaxRate / 100) * 100) / 100;
      }

      const lineTotal = Math.round((lineTaxable + lineTax) * 100) / 100;

      validatedItems.push({
        productId: item.productId,
        productName: prodName,
        itemDescription: item.itemDescription?.trim() || null,
        barcode: prodBarcode,
        categoryName: prodCategoryName,
        hsnCode: item.hsnCode?.trim() || null,
        quantityBought: qty,
        unitCost: Math.round(cost * 100) / 100,
        discount,
        taxableAmount: lineTaxable,
        taxRate: effectiveTaxRate,
        taxAmount: lineTax,
        cgstRate,
        cgstAmount,
        sgstRate,
        sgstAmount,
        igstRate,
        igstAmount,
        totalAmount: lineTotal,
        detailsJson,
        productDraft: item.productDraft,
      });

      billSubtotal += lineTaxable;
      billTaxAmount += lineTax;
    }

    billSubtotal = Math.round(billSubtotal * 100) / 100;
    billTaxAmount = Math.round(billTaxAmount * 100) / 100;
    const billGrandTotal = Math.round((billSubtotal + billTaxAmount) * 100) / 100;

    // 5. Payment details calculation
    const purchaseDate = input.purchaseDate?.trim() || getLocalDateString();
    const rawMethod = input.paymentMethod || 'CASH';
    const paymentMethod: PurchasePaymentMethod =
      rawMethod === 'ONLINE' || rawMethod === 'UPI' || rawMethod === 'BANK_TRANSFER' || rawMethod === 'CARD'
        ? 'ONLINE'
        : rawMethod === 'NO_PAYMENT' || rawMethod === 'CREDIT'
        ? 'NO_PAYMENT'
        : 'CASH';

    let amountPaid = 0;
    let paymentDate: string | null = null;
    const rawPaid = input.amountPaid !== undefined && input.amountPaid !== null
      ? input.amountPaid
      : (input as any).paidAmount;

    if (paymentMethod === 'NO_PAYMENT') {
      amountPaid = 0;
      paymentDate = null;
    } else if (rawPaid !== undefined && rawPaid !== null && String(rawPaid).trim() !== '') {
      const parsedPaid = parseFloat(String(rawPaid));
      amountPaid = isNaN(parsedPaid) ? 0 : Math.max(0, parsedPaid);
      paymentDate = input.paymentDate?.trim() || purchaseDate;
    } else {
      amountPaid = billGrandTotal;
      paymentDate = input.paymentDate?.trim() || purchaseDate;
    }
    amountPaid = Math.round(amountPaid * 100) / 100;

    const balanceAmount = Math.max(0, Math.round((billGrandTotal - amountPaid) * 100) / 100);

    let paymentStatus: PurchasePaymentStatus = 'PAID';
    if (balanceAmount <= 0.001) {
      paymentStatus = 'PAID';
    } else if (amountPaid > 0) {
      paymentStatus = 'PARTIAL';
    } else {
      paymentStatus = 'UNPAID';
    }

    // 6. Idempotency & Duplicate prevention: Check if duplicate bill was already submitted
    const duplicateBill = await prisma.purchase.findFirst({
      where: {
        companyId,
        vendorId: vendor.id,
        invoiceNumber,
      },
    });

    if (duplicateBill) {
      throw new Error(
        `A purchase bill with invoice number "${invoiceNumber}" for vendor "${vendor.name}" already exists (${duplicateBill.purchaseNumber || duplicateBill.id}). To prevent duplicate inventory increments, please verify or use a different invoice number.`
      );
    }

    // 7. Atomic transaction: create purchase header, items, and increment product stocks
    const purchaseId = await prisma.$transaction(async (tx) => {
      const purchaseNumber = await this.generatePurchaseNumber(tx, companyId, purchaseDate);

      const purchase = await tx.purchase.create({
        data: {
          purchaseNumber,
          companyId,
          vendorId: vendor.id,
          invoiceNumber,
          purchaseDate,
          ewayBillNumber: input.ewayBillNumber?.trim() || null,
          transporterName: input.transporterName?.trim() || null,
          vehicleNumber: input.vehicleNumber?.trim() || null,
          subtotal: billSubtotal,
          taxAmount: billTaxAmount,
          totalAmount: billGrandTotal,
          paidAmount: amountPaid,
          balanceAmount: balanceAmount,
          paymentMethod,
          paymentStatus,
          paymentDate,
          notes: input.notes?.trim() || null,
        } as any,
      });

      // Insert all purchase items
      for (const item of validatedItems) {
        let finalProductId = item.productId;

        // If product was drafted in purchase entry (not yet in DB), create it now atomically
        if (item.productDraft) {
          const createdProduct = await productService.createProductWithTx(
            tx,
            companyId,
            {
              ...item.productDraft,
              stockQuantity: item.quantityBought,
              vendorId: vendor.id,
              purchaseDate,
            },
            item.quantityBought
          );
          finalProductId = createdProduct.id;
        }

        await tx.purchaseItem.create({
          data: {
            purchaseId: purchase.id,
            productId: finalProductId,
            productName: item.productName,
            itemDescription: item.itemDescription,
            barcode: item.barcode,
            categoryName: item.categoryName,
            hsnCode: item.hsnCode,
            quantityBought: item.quantityBought,
            unitCost: item.unitCost,
            discount: item.discount,
            taxableAmount: item.taxableAmount,
            taxRate: item.taxRate,
            taxAmount: item.taxAmount,
            cgstRate: item.cgstRate,
            cgstAmount: item.cgstAmount,
            sgstRate: item.sgstRate,
            sgstAmount: item.sgstAmount,
            igstRate: item.igstRate,
            igstAmount: item.igstAmount,
            totalAmount: item.totalAmount,
            detailsJson: item.detailsJson,
          },
        });

        // Reconcile stock for existing products: if existing product with previous purchases, increment stock
        if (!item.productDraft) {
          const previousPurchaseCount = await tx.purchaseItem.count({
            where: {
              productId: finalProductId,
              purchaseId: { not: purchase.id },
            },
          });

          if (previousPurchaseCount > 0) {
            await tx.product.update({
              where: { id: finalProductId },
              data: {
                stockQuantity: {
                  increment: item.quantityBought,
                },
                vendorId: vendor.id,
                purchaseDate,
              },
            });
          } else {
            await tx.product.update({
              where: { id: finalProductId },
              data: {
                stockQuantity: item.quantityBought,
                vendorId: vendor.id,
                purchaseDate,
              },
            });
          }
        }

        // Synchronize latest purchase pricing into productFieldValue so Products & Barcodes reflects it
        if (item.unitCost > 0) {
          const prod = productMap.get(item.productId);
          const catId = prod?.categoryId || item.productDraft?.categoryId;
          if (catId) {
            const pricingFields = await productService.ensurePurchaseCategoryFields(tx, catId);
            const existingAddFv = await tx.productFieldValue.findUnique({
              where: {
                productId_categoryFieldId: {
                  productId: finalProductId,
                  categoryFieldId: pricingFields.additionalChargesField.id,
                },
              },
            });
            const addPercent = existingAddFv?.valueNumber ?? (item.productDraft?.additionalChargesPercentage ?? 0);
            const actualPrice = Math.round((item.unitCost + (item.unitCost * addPercent / 100)) * 100) / 100;
            const actualCode = generateActualPurchasePriceCode(actualPrice);

            await tx.productFieldValue.upsert({
              where: {
                productId_categoryFieldId: {
                  productId: finalProductId,
                  categoryFieldId: pricingFields.purchasePriceField.id,
                },
              },
              create: {
                productId: finalProductId,
                categoryFieldId: pricingFields.purchasePriceField.id,
                valueNumber: item.unitCost,
              },
              update: {
                valueNumber: item.unitCost,
              },
            });

            await tx.productFieldValue.upsert({
              where: {
                productId_categoryFieldId: {
                  productId: finalProductId,
                  categoryFieldId: pricingFields.actualPurchasePriceField.id,
                },
              },
              create: {
                productId: finalProductId,
                categoryFieldId: pricingFields.actualPurchasePriceField.id,
                valueNumber: actualPrice,
              },
              update: {
                valueNumber: actualPrice,
              },
            });

            await tx.productFieldValue.upsert({
              where: {
                productId_categoryFieldId: {
                  productId: finalProductId,
                  categoryFieldId: pricingFields.actualPurchasePriceCodeField.id,
                },
              },
              create: {
                productId: finalProductId,
                categoryFieldId: pricingFields.actualPurchasePriceCodeField.id,
                valueText: actualCode,
              },
              update: {
                valueText: actualCode,
              },
            });
          }
        }
      }

      return purchase.id;
    });

    const fullRecord = await this.getPurchaseById(purchaseId);
    if (!fullRecord) {
      throw new Error('Failed to retrieve newly created purchase bill.');
    }
    return fullRecord;
  }

  /**
   * Updates an entire purchase bill:
   * - Updates vendor, invoice number, purchase date, payment method/status/amount
   * - Reconciles purchased product line items
   * - Atomically rolls back inventory stock for removed/previous quantities
   *   and applies new inventory increments for updated quantities
   */
  public async updatePurchase(input: UpdatePurchaseRequest): Promise<PurchaseDto> {
    const companyId = authService.getAuthenticatedCompanyId();
    const prisma = getPrismaClient();

    if (!input.id) {
      throw new Error('Purchase ID is required for editing.');
    }

    const existing = await prisma.purchase.findUnique({
      where: { id: input.id },
      include: {
        items: true,
      },
    });

    if (!existing || existing.companyId !== companyId) {
      throw new Error('Purchase record not found or access denied.');
    }

    if (!input.vendorId) {
      throw new Error('Vendor is required.');
    }

    // 1. Verify vendor belongs to company
    const vendor = await prisma.vendor.findUnique({
      where: { id: input.vendorId },
    });
    if (!vendor || vendor.companyId !== companyId) {
      throw new Error('Selected vendor is invalid or does not belong to your store.');
    }

    // 2. Validate vendor invoice number
    const invoiceNumber = (input.invoiceNumber || '').trim();
    if (!invoiceNumber) {
      throw new Error('Vendor invoice / bill number is required.');
    }

    // Check for duplicate invoice number under the same vendor for another purchase
    const duplicateBill = await prisma.purchase.findFirst({
      where: {
        companyId,
        vendorId: vendor.id,
        invoiceNumber,
        id: { not: existing.id },
      },
    });

    if (duplicateBill) {
      throw new Error(
        `Another purchase bill with invoice number "${invoiceNumber}" for vendor "${vendor.name}" already exists (${duplicateBill.purchaseNumber || duplicateBill.id}).`
      );
    }

    // 3. Normalise item list
    const rawItems: CreatePurchaseItemInput[] = Array.isArray(input.items) ? input.items : [];
    if (rawItems.length === 0) {
      throw new Error('Please add at least one product to the purchase bill.');
    }

    // 4. Validate and resolve all products
    const productIds = rawItems
      .filter((it) => !it.productDraft && !it.productId.startsWith('draft_'))
      .map((it) => it.productId);
    const existingProducts = await prisma.product.findMany({
      where: {
        id: { in: productIds },
        companyId,
      },
      include: {
        category: { select: { name: true } },
        fieldValues: { include: { categoryField: true } },
      },
    });

    const productMap = new Map<string, (typeof existingProducts)[0]>();
    for (const prod of existingProducts) {
      productMap.set(prod.id, prod);
    }

    const validatedItems: Array<{
      productId: string;
      productName: string;
      itemDescription: string | null;
      barcode: string;
      categoryName: string | null;
      hsnCode: string | null;
      quantityBought: number;
      unitCost: number;
      discount: number;
      taxableAmount: number;
      taxRate: number;
      taxAmount: number;
      cgstRate: number;
      cgstAmount: number;
      sgstRate: number;
      sgstAmount: number;
      igstRate: number;
      igstAmount: number;
      totalAmount: number;
      detailsJson: string | null;
      productDraft?: CreateProductRequest;
    }> = [];

    let billSubtotal = 0;
    let billTaxAmount = 0;

    for (const item of rawItems) {
      const isDraft = Boolean(item.productDraft || item.productId.startsWith('draft_'));
      let prodName = item.productName || '';
      let prodBarcode = item.barcode || '';
      let prodCategoryName: string | null = item.categoryName || null;
      let detailsJson: string | null = item.detailsJson || null;

      if (!isDraft) {
        const prod = productMap.get(item.productId);
        if (!prod) {
          throw new Error(`Product with ID "${item.productId}" was not found or does not belong to your company.`);
        }
        prodName = prod.name;
        prodBarcode = prod.barcode;
        prodCategoryName = prod.category?.name || null;

        // Extract details snapshot
        const snapshot: Record<string, any> = {
          name: prod.name,
          barcode: prod.barcode,
          category: prod.category?.name,
        };
        for (const fv of prod.fieldValues) {
          if (fv.categoryField?.fieldKey) {
            snapshot[fv.categoryField.fieldKey] = fv.valueNumber ?? fv.valueText ?? fv.valueBoolean;
          }
        }
        detailsJson = JSON.stringify(snapshot);
      } else if (item.productDraft) {
        prodName = item.productDraft.name || item.productName || 'New Product';
        prodBarcode = item.productDraft.barcode || item.barcode || '';
        const cat = item.productDraft.categoryId
          ? await prisma.category.findUnique({ where: { id: item.productDraft.categoryId }, select: { name: true } })
          : null;
        if (cat) prodCategoryName = cat.name;
        detailsJson = JSON.stringify({
          name: prodName,
          barcode: prodBarcode,
          category: prodCategoryName,
        });
      }

      const rawQty = item.quantityBought !== undefined && item.quantityBought !== null ? item.quantityBought : (item as any).quantity;
      const qty = typeof rawQty === 'number' ? rawQty : parseFloat(String(rawQty));
      if (isNaN(qty) || qty <= 0) {
        throw new Error(`Purchased quantity for "${prodName || 'Item'}" must be greater than 0.`);
      }

      const cost = typeof item.unitCost === 'number' ? item.unitCost : parseFloat(String(item.unitCost || 0));
      if (isNaN(cost) || cost < 0) {
        throw new Error(`Unit cost for "${prodName || 'Item'}" cannot be negative.`);
      }

      const rawDiscount = typeof item.discount === 'number' ? item.discount : parseFloat(String(item.discount || 0));
      const discount = isNaN(rawDiscount) || rawDiscount < 0 ? 0 : Math.round(rawDiscount * 100) / 100;

      const grossSubtotal = Math.round(qty * cost * 100) / 100;
      const lineTaxable = Math.max(0, Math.round((grossSubtotal - discount) * 100) / 100);

      // Taxes: CGST, SGST, IGST
      const rawCgstRate = typeof item.cgstRate === 'number' ? item.cgstRate : parseFloat(String(item.cgstRate || 0));
      const cgstRate = isNaN(rawCgstRate) || rawCgstRate < 0 ? 0 : rawCgstRate;

      const rawSgstRate = typeof item.sgstRate === 'number' ? item.sgstRate : parseFloat(String(item.sgstRate || 0));
      const sgstRate = isNaN(rawSgstRate) || rawSgstRate < 0 ? 0 : rawSgstRate;

      const rawIgstRate = typeof item.igstRate === 'number' ? item.igstRate : parseFloat(String(item.igstRate || 0));
      const igstRate = isNaN(rawIgstRate) || rawIgstRate < 0 ? 0 : rawIgstRate;

      const rawTaxRate = typeof item.taxRate === 'number' ? item.taxRate : parseFloat(String(item.taxRate || 0));
      const fallbackTaxRate = isNaN(rawTaxRate) || rawTaxRate < 0 ? 0 : rawTaxRate;

      const effectiveTaxRate = (cgstRate + sgstRate + igstRate) > 0
        ? (cgstRate + sgstRate + igstRate)
        : fallbackTaxRate;

      const cgstAmount = cgstRate > 0 ? Math.round(lineTaxable * (cgstRate / 100) * 100) / 100 : 0;
      const sgstAmount = sgstRate > 0 ? Math.round(lineTaxable * (sgstRate / 100) * 100) / 100 : 0;
      const igstAmount = igstRate > 0 ? Math.round(lineTaxable * (igstRate / 100) * 100) / 100 : 0;

      let lineTax = Math.round((cgstAmount + sgstAmount + igstAmount) * 100) / 100;
      if (lineTax === 0 && effectiveTaxRate > 0) {
        lineTax = Math.round(lineTaxable * (effectiveTaxRate / 100) * 100) / 100;
      }

      const lineTotal = Math.round((lineTaxable + lineTax) * 100) / 100;

      validatedItems.push({
        productId: item.productId,
        productName: prodName,
        itemDescription: item.itemDescription?.trim() || null,
        barcode: prodBarcode,
        categoryName: prodCategoryName,
        hsnCode: item.hsnCode?.trim() || null,
        quantityBought: qty,
        unitCost: Math.round(cost * 100) / 100,
        discount,
        taxableAmount: lineTaxable,
        taxRate: effectiveTaxRate,
        taxAmount: lineTax,
        cgstRate,
        cgstAmount,
        sgstRate,
        sgstAmount,
        igstRate,
        igstAmount,
        totalAmount: lineTotal,
        detailsJson,
        productDraft: item.productDraft,
      });

      billSubtotal += lineTaxable;
      billTaxAmount += lineTax;
    }

    billSubtotal = Math.round(billSubtotal * 100) / 100;
    billTaxAmount = Math.round(billTaxAmount * 100) / 100;
    const billGrandTotal = Math.round((billSubtotal + billTaxAmount) * 100) / 100;

    // 5. Payment details calculation
    const purchaseDate = input.purchaseDate?.trim() || existing.purchaseDate || getLocalDateString();
    const rawMethod = input.paymentMethod || (existing.paymentMethod as PurchasePaymentMethod) || 'CASH';
    const paymentMethod: PurchasePaymentMethod =
      rawMethod === 'ONLINE' || rawMethod === 'UPI' || rawMethod === 'BANK_TRANSFER' || rawMethod === 'CARD'
        ? 'ONLINE'
        : rawMethod === 'NO_PAYMENT' || rawMethod === 'CREDIT'
        ? 'NO_PAYMENT'
        : 'CASH';

    let amountPaid = 0;
    let paymentDate: string | null = null;
    const rawPaid = input.amountPaid !== undefined && input.amountPaid !== null
      ? input.amountPaid
      : (input as any).paidAmount;

    if (paymentMethod === 'NO_PAYMENT') {
      amountPaid = 0;
      paymentDate = null;
    } else if (rawPaid !== undefined && rawPaid !== null && String(rawPaid).trim() !== '') {
      const parsedPaid = parseFloat(String(rawPaid));
      amountPaid = isNaN(parsedPaid) ? 0 : Math.max(0, parsedPaid);
      paymentDate = input.paymentDate?.trim() || (existing as any).paymentDate || purchaseDate;
    } else {
      amountPaid = billGrandTotal;
      paymentDate = input.paymentDate?.trim() || (existing as any).paymentDate || purchaseDate;
    }
    amountPaid = Math.round(amountPaid * 100) / 100;

    const balanceAmount = Math.max(0, Math.round((billGrandTotal - amountPaid) * 100) / 100);

    let paymentStatus: PurchasePaymentStatus = 'PAID';
    if (balanceAmount <= 0.001) {
      paymentStatus = 'PAID';
    } else if (amountPaid > 0) {
      paymentStatus = 'PARTIAL';
    } else {
      paymentStatus = 'UNPAID';
    }

    // 6. Transaction: Revert old inventory increments, delete old items, insert new items & increment new inventory, update purchase
    await prisma.$transaction(async (tx) => {
      // Revert stock from old items
      for (const oldItem of existing.items) {
        if (oldItem.productId) {
          await tx.product.update({
            where: { id: oldItem.productId },
            data: {
              stockQuantity: {
                decrement: oldItem.quantityBought,
              },
            },
          });
        }
      }

      // Delete existing purchase items
      await tx.purchaseItem.deleteMany({
        where: { purchaseId: existing.id },
      });

      // Insert new items and apply new inventory increments
      for (const item of validatedItems) {
        let finalProductId = item.productId;

        // If product was drafted in purchase entry (not yet in DB), create it now atomically
        if (item.productDraft) {
          const createdProduct = await productService.createProductWithTx(
            tx,
            companyId,
            {
              ...item.productDraft,
              stockQuantity: item.quantityBought,
              vendorId: vendor.id,
              purchaseDate,
            },
            item.quantityBought
          );
          finalProductId = createdProduct.id;
        }

        await tx.purchaseItem.create({
          data: {
            purchaseId: existing.id,
            productId: finalProductId,
            productName: item.productName,
            itemDescription: item.itemDescription,
            barcode: item.barcode,
            categoryName: item.categoryName,
            hsnCode: item.hsnCode,
            quantityBought: item.quantityBought,
            unitCost: item.unitCost,
            discount: item.discount,
            taxableAmount: item.taxableAmount,
            taxRate: item.taxRate,
            taxAmount: item.taxAmount,
            cgstRate: item.cgstRate,
            cgstAmount: item.cgstAmount,
            sgstRate: item.sgstRate,
            sgstAmount: item.sgstAmount,
            igstRate: item.igstRate,
            igstAmount: item.igstAmount,
            totalAmount: item.totalAmount,
            detailsJson: item.detailsJson,
          },
        });

        if (!item.productDraft) {
          await tx.product.update({
            where: { id: finalProductId },
            data: {
              stockQuantity: {
                increment: item.quantityBought,
              },
              vendorId: vendor.id,
              purchaseDate,
            },
          });
        }

        // Synchronize latest purchase pricing into productFieldValue so Products & Barcodes reflects it
        if (item.unitCost > 0) {
          const prod = productMap.get(item.productId);
          const catId = prod?.categoryId || item.productDraft?.categoryId;
          if (catId) {
            const pricingFields = await productService.ensurePurchaseCategoryFields(tx, catId);
            const existingAddFv = await tx.productFieldValue.findUnique({
              where: {
                productId_categoryFieldId: {
                  productId: finalProductId,
                  categoryFieldId: pricingFields.additionalChargesField.id,
                },
              },
            });
            const addPercent = existingAddFv?.valueNumber ?? 0;
            const actualPrice = Math.round((item.unitCost + (item.unitCost * addPercent / 100)) * 100) / 100;
            const actualCode = generateActualPurchasePriceCode(actualPrice);

            await tx.productFieldValue.upsert({
              where: {
                productId_categoryFieldId: {
                  productId: finalProductId,
                  categoryFieldId: pricingFields.purchasePriceField.id,
                },
              },
              create: {
                productId: finalProductId,
                categoryFieldId: pricingFields.purchasePriceField.id,
                valueNumber: item.unitCost,
              },
              update: {
                valueNumber: item.unitCost,
              },
            });

            await tx.productFieldValue.upsert({
              where: {
                productId_categoryFieldId: {
                  productId: finalProductId,
                  categoryFieldId: pricingFields.actualPurchasePriceField.id,
                },
              },
              create: {
                productId: finalProductId,
                categoryFieldId: pricingFields.actualPurchasePriceField.id,
                valueNumber: actualPrice,
              },
              update: {
                valueNumber: actualPrice,
              },
            });

            await tx.productFieldValue.upsert({
              where: {
                productId_categoryFieldId: {
                  productId: finalProductId,
                  categoryFieldId: pricingFields.actualPurchasePriceCodeField.id,
                },
              },
              create: {
                productId: finalProductId,
                categoryFieldId: pricingFields.actualPurchasePriceCodeField.id,
                valueText: actualCode,
              },
              update: {
                valueText: actualCode,
              },
            });
          }
        }
      }

      // Update purchase header
      await tx.purchase.update({
        where: { id: existing.id },
        data: {
          vendorId: vendor.id,
          invoiceNumber,
          purchaseDate,
          ewayBillNumber: input.ewayBillNumber !== undefined ? (input.ewayBillNumber?.trim() || null) : (existing as any).ewayBillNumber,
          transporterName: input.transporterName !== undefined ? (input.transporterName?.trim() || null) : (existing as any).transporterName,
          vehicleNumber: input.vehicleNumber !== undefined ? (input.vehicleNumber?.trim() || null) : (existing as any).vehicleNumber,
          subtotal: billSubtotal,
          taxAmount: billTaxAmount,
          totalAmount: billGrandTotal,
          paidAmount: amountPaid,
          balanceAmount: balanceAmount,
          paymentMethod,
          paymentStatus,
          paymentDate,
          notes: input.notes !== undefined ? input.notes?.trim() || null : existing.notes,
        } as any,
      });
    });

    const updated = await this.getPurchaseById(existing.id);
    if (!updated) {
      throw new Error('Failed to retrieve updated purchase bill.');
    }
    return updated;
  }

  /**
   * Updates payment details (Paid / Partial / Unpaid, payment method, paid amount, notes) of a purchase order.
   */
  public async updatePurchasePayment(input: UpdatePurchasePaymentRequest): Promise<PurchaseDto> {
    const companyId = authService.getAuthenticatedCompanyId();
    const prisma = getPrismaClient();

    const existing = await prisma.purchase.findUnique({
      where: { id: input.id },
    });

    if (!existing || existing.companyId !== companyId) {
      throw new Error('Purchase record not found or access denied.');
    }

    const rawMethod = input.paymentMethod || (existing.paymentMethod as PurchasePaymentMethod) || 'CASH';
    const paymentMethod: PurchasePaymentMethod =
      rawMethod === 'ONLINE' || rawMethod === 'UPI' || rawMethod === 'BANK_TRANSFER' || rawMethod === 'CARD'
        ? 'ONLINE'
        : rawMethod === 'NO_PAYMENT' || rawMethod === 'CREDIT'
        ? 'NO_PAYMENT'
        : 'CASH';

    let paidAmount = existing.paidAmount;
    if (paymentMethod === 'NO_PAYMENT') {
      paidAmount = 0;
    } else if (input.paidAmount !== undefined && input.paidAmount !== null) {
      paidAmount = Math.max(0, Math.round(Number(input.paidAmount) * 100) / 100);
    } else if (input.paymentStatus === 'PAID' || paidAmount === 0) {
      paidAmount = existing.totalAmount;
    }

    const balanceAmount = Math.max(0, Math.round((existing.totalAmount - paidAmount) * 100) / 100);
    let paymentStatus: PurchasePaymentStatus = input.paymentStatus;
    if (paymentMethod === 'NO_PAYMENT') {
      paymentStatus = 'UNPAID';
    } else if (balanceAmount <= 0.001) {
      paymentStatus = 'PAID';
    } else if (paidAmount > 0) {
      paymentStatus = 'PARTIAL';
    } else {
      paymentStatus = 'UNPAID';
    }

    let paymentDate: string | null = (existing as any).paymentDate || null;
    if (paymentMethod === 'NO_PAYMENT') {
      paymentDate = null;
    } else if (input.paymentDate !== undefined) {
      paymentDate = input.paymentDate ? input.paymentDate.trim() : null;
    } else if (!paymentDate && (paymentMethod === 'CASH' || paymentMethod === 'ONLINE')) {
      paymentDate = getLocalDateString();
    }

    const finalNote = input.notes !== undefined ? input.notes.trim() || null : existing.notes;

    await prisma.purchase.update({
      where: { id: existing.id },
      data: {
        paymentStatus,
        paymentMethod,
        paymentDate,
        paidAmount,
        balanceAmount,
        notes: finalNote,
      } as any,
    });

    const updated = await this.getPurchaseById(existing.id);
    if (!updated) {
      throw new Error('Failed to retrieve updated purchase record.');
    }
    return updated;
  }

  /**
   * Deletes a purchase record (cascading to purchase items).
   */
  public async deletePurchase(id: string): Promise<{ id: string }> {
    const companyId = authService.getAuthenticatedCompanyId();
    const prisma = getPrismaClient();

    const existing = await prisma.purchase.findUnique({
      where: { id },
    });

    if (!existing || existing.companyId !== companyId) {
      throw new Error('Purchase record not found or access denied.');
    }

    await prisma.purchase.delete({
      where: { id },
    });

    return { id };
  }

  /**
   * Helper to map Prisma Purchase model to PurchaseDto.
   */
  private mapPurchaseToDto(p: any): PurchaseDto {
    const items: PurchaseItemDto[] = (p.items || []).map((item: any) => ({
      id: item.id,
      purchaseId: item.purchaseId,
      productId: item.productId,
      productName: item.productName,
      itemDescription: item.itemDescription || null,
      barcode: item.barcode,
      categoryName: item.categoryName,
      hsnCode: item.hsnCode || null,
      quantityBought: item.quantityBought,
      currentStock: item.product ? item.product.stockQuantity : 0,
      unitCost: item.unitCost,
      discount: item.discount || 0,
      taxableAmount: item.taxableAmount !== undefined && item.taxableAmount !== null ? item.taxableAmount : (item.quantityBought * item.unitCost),
      taxRate: item.taxRate || 0,
      taxAmount: item.taxAmount || 0,
      cgstRate: item.cgstRate || 0,
      cgstAmount: item.cgstAmount || 0,
      sgstRate: item.sgstRate || 0,
      sgstAmount: item.sgstAmount || 0,
      igstRate: item.igstRate || 0,
      igstAmount: item.igstAmount || 0,
      totalAmount: item.totalAmount,
      detailsJson: item.detailsJson || null,
      createdAt: item.createdAt instanceof Date ? item.createdAt.toISOString() : String(item.createdAt),
      updatedAt: item.updatedAt instanceof Date ? item.updatedAt.toISOString() : String(item.updatedAt),
    }));

    const totalProductsCount = items.length;
    const totalUnitsBought = items.reduce((acc, it) => acc + it.quantityBought, 0);

    const purchaseNumber = p.purchaseNumber || `PUR-${p.purchaseDate.replace(/-/g, '')}-${p.id.slice(0, 6).toUpperCase()}`;
    const invoiceNumber = p.invoiceNumber || `INV-${p.id.slice(0, 6).toUpperCase()}`;

    // Normalize payment status & method
    let paymentStatus: PurchasePaymentStatus = 'PAID';
    if (p.paymentStatus === 'PAID' || p.paymentStatus === 'PARTIAL' || p.paymentStatus === 'UNPAID') {
      paymentStatus = p.paymentStatus;
    } else {
      // Decode legacy note if present
      try {
        if (p.notes && p.notes.startsWith('{')) {
          const parsed = JSON.parse(p.notes);
          if (parsed.status === 'PAID') paymentStatus = 'PAID';
          else paymentStatus = 'UNPAID';
        }
      } catch {}
    }

    let paymentMethod: PurchasePaymentMethod = 'CASH';
    if (p.paymentMethod === 'ONLINE' || p.paymentMethod === 'UPI' || p.paymentMethod === 'BANK_TRANSFER' || p.paymentMethod === 'CARD') {
      paymentMethod = 'ONLINE';
    } else if (p.paymentMethod === 'NO_PAYMENT' || p.paymentMethod === 'CREDIT') {
      paymentMethod = 'NO_PAYMENT';
    } else {
      paymentMethod = 'CASH';
    }

    const subtotal = typeof p.subtotal === 'number' && p.subtotal > 0 ? p.subtotal : p.totalAmount;
    const taxAmount = typeof p.taxAmount === 'number' ? p.taxAmount : 0;
    const totalAmount = p.totalAmount || 0;
    const paidAmount = typeof p.paidAmount === 'number' ? p.paidAmount : (paymentStatus === 'PAID' ? totalAmount : 0);
    const balanceAmount = typeof p.balanceAmount === 'number' ? p.balanceAmount : Math.max(0, totalAmount - paidAmount);

    let paymentDate: string | null = (p as any).paymentDate || (p as any).payment_date || null;
    if (!paymentDate && (paymentStatus === 'PAID' || paidAmount > 0) && paymentMethod !== 'NO_PAYMENT') {
      paymentDate = p.purchaseDate;
    }

    return {
      id: p.id,
      purchaseNumber,
      companyId: p.companyId,
      vendorId: p.vendorId,
      vendorName: p.vendor?.name || 'Unknown Vendor',
      vendorPhone: p.vendor?.phoneNumber || null,
      vendorAddress: p.vendor?.address || null,
      vendorGstNumber: p.vendor?.gstNumber || null,
      vendorBankName: p.vendor?.bankName || null,
      vendorAccountNumber: p.vendor?.accountNumber || null,
      vendorIfscCode: p.vendor?.ifscCode || null,
      invoiceNumber,
      purchaseDate: p.purchaseDate,
      ewayBillNumber: p.ewayBillNumber || null,
      transporterName: p.transporterName || null,
      vehicleNumber: p.vehicleNumber || null,
      paymentDate,
      subtotal,
      taxAmount,
      totalAmount,
      paidAmount,
      balanceAmount,
      totalProductsCount,
      totalUnitsBought,
      paymentStatus,
      paymentMethod,
      notes: p.notes,
      createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : String(p.createdAt),
      updatedAt: p.updatedAt instanceof Date ? p.updatedAt.toISOString() : String(p.updatedAt),
      items,
    };
  }
}

export const purchaseService = new PurchaseService();
