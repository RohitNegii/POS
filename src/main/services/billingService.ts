import { getPrismaClient } from '../database/prisma';
import { authService } from './authService';
import { metalRateService } from './metalRateService';
import type {
  BillDto,
  BillItemDto,
  CompanyBreakdownDto,
  CreateBillRequest,
  CustomerRecordDto,
  ListBillsFilter,
  ScannedProductDto,
  UpdateBillRequest,
} from '../../shared/types/ipc';

/**
 * Billing Service — Unified Multi-Company POS Billing Terminal.
 *
 * Capabilities:
 * - Scans and retrieves products across Company A and Company B by permanent barcode.
 * - Dynamically evaluates jewellery rates per company or fixed category prices.
 * - Constructs a single unified customer bill combining products from both companies.
 * - Atomically persists bills, bill line items, and updates stock inventory in both companies.
 */
export class BillingService {
  /**
   * Helper to detect if an item is sold per linear meter based on its category, name, or attributes.
   */
  private isMeterItem(item: {
    categoryName?: string | null;
    productName?: string | null;
    detailsJson?: string | null;
  }): boolean {
    if (/meter|fabric|linear|cloth|wire/i.test(item.categoryName || '')) return true;
    if (/per meter|\/meter|\/m/i.test(item.productName || '')) return true;
    if (item.detailsJson && /sellingPricePerMeter|ratePerMeter/i.test(item.detailsJson)) return true;
    return false;
  }

  /**
   * Helper to compute dynamic product selling price based on category and dynamic attributes.
   */
  private async calculateProductPrice(product: any): Promise<{
    unitPrice: number;
    priceType: 'JEWELLERY_DYNAMIC' | 'FIXED' | 'PER_METER' | 'CUSTOM';
    pricingBreakdown: string;
    details: Record<string, any>;
  }> {
    const details: Record<string, any> = {};
    const catName = product.category?.name || '';
    const fieldValues = product.fieldValues || [];

    for (const fv of fieldValues) {
      const key = fv.categoryField?.fieldKey || '';
      if (key) {
        details[key] = fv.valueNumber ?? fv.valueText ?? fv.valueBoolean;
      }
    }

    // 1. Gold / Silver Jewellery dynamic valuation (purity field check)
    if (Boolean(details.purity) || (catName.toLowerCase().includes('jewellery') && (catName.toLowerCase().includes('gold') || catName.toLowerCase().includes('silver')) && !catName.toLowerCase().includes('german silver'))) {
      const purity = details.purity as string | undefined;
      const weight = typeof details.weight === 'number' ? details.weight : parseFloat(String(details.weight || 0));
      const makingCharge = typeof details.makingChargesPerGram === 'number' ? details.makingChargesPerGram : parseFloat(String(details.makingChargesPerGram || 0));

      if (purity && weight > 0) {
        try {
          // Metal rate calculation scoped to this product's company
          const calc = await metalRateService.calculatePriceForJewellery({
            purity,
            weightGrams: weight,
            makingChargePerGram: isNaN(makingCharge) ? 0 : makingCharge,
          }, product.companyId);

          return {
            unitPrice: calc.finalPrice,
            priceType: 'JEWELLERY_DYNAMIC',
            pricingBreakdown: `${purity} • ${weight}g • MC ₹${calc.makingChargePerGram}/g (Rate ₹${calc.ratePerGram}/g)`,
            details: {
              ...details,
              calculatedMetalValue: calc.metalValue,
              calculatedMakingCharges: calc.totalMakingCharges,
              ratePerGram: calc.ratePerGram,
            },
          };
        } catch {
          // Fallback if rate not set today
          const fallbackPrice = weight * 7000;
          return {
            unitPrice: fallbackPrice,
            priceType: 'JEWELLERY_DYNAMIC',
            pricingBreakdown: `${purity} • ${weight}g (Estimated ₹7,000/g)`,
            details,
          };
        }
      }
    }

    // 2. Fixed selling price
    const sPrice = details.sellingPrice ?? product.sellingPrice;
    if (typeof sPrice === 'number' && !isNaN(sPrice) && sPrice > 0) {
      return {
        unitPrice: sPrice,
        priceType: 'FIXED',
        pricingBreakdown: `Fixed Price ₹${sPrice.toLocaleString()}`,
        details: { ...details, sellingPrice: sPrice },
      };
    }

    // 3. Selling price per meter
    if (typeof details.sellingPricePerMeter === 'number' && !isNaN(details.sellingPricePerMeter) && details.sellingPricePerMeter > 0) {
      return {
        unitPrice: details.sellingPricePerMeter,
        priceType: 'PER_METER',
        pricingBreakdown: `₹${details.sellingPricePerMeter.toLocaleString()}/meter`,
        details,
      };
    }

    // 4. Fallback to purchase price or 0
    if (typeof details.actualPurchasePrice === 'number' && details.actualPurchasePrice > 0) {
      return {
        unitPrice: details.actualPurchasePrice,
        priceType: 'CUSTOM',
        pricingBreakdown: `Base ₹${details.actualPurchasePrice.toLocaleString()}`,
        details,
      };
    }

    return {
      unitPrice: 0,
      priceType: 'CUSTOM',
      pricingBreakdown: 'Price to be set',
      details,
    };
  }

  /**
   * Scans a product by barcode across ALL companies (Company A and Company B).
   */
  public async scanProduct(barcode: string): Promise<ScannedProductDto> {
    const rawBarcode = barcode?.trim();
    if (!rawBarcode) {
      throw new Error('Please enter or scan a valid barcode.');
    }

    const prisma = getPrismaClient();

    // Barcode is globally unique in products table
    const product = await prisma.product.findFirst({
      where: {
        barcode: {
          equals: rawBarcode,
        },
        isArchived: false,
      },
      include: {
        company: true,
        category: true,
        fieldValues: {
          include: {
            categoryField: true,
          },
        },
      },
    });

    if (!product) {
      throw new Error(`Product with barcode "${rawBarcode}" not found.`);
    }

    const priceInfo = await this.calculateProductPrice(product);

    return {
      id: product.id,
      companyId: product.company.id,
      companyName: product.company.name,
      companyCode: product.company.code,
      categoryId: product.categoryId,
      categoryName: product.category.name,
      name: product.name,
      barcode: product.barcode,
      stockQuantity: product.stockQuantity,
      unitPrice: priceInfo.unitPrice,
      priceType: priceInfo.priceType,
      pricingBreakdown: priceInfo.pricingBreakdown,
      details: priceInfo.details,
    };
  }

  /**
   * Searches products across both companies by name or barcode for POS item selection.
   */
  public async searchProducts(query?: string): Promise<ScannedProductDto[]> {
    const prisma = getPrismaClient();
    const cleanQuery = query?.trim();

    const where: any = {
      isArchived: false,
    };

    if (cleanQuery) {
      where.OR = [
        { name: { contains: cleanQuery } },
        { barcode: { contains: cleanQuery } },
      ];
    }

    const products = await prisma.product.findMany({
      where,
      include: {
        company: true,
        category: true,
        fieldValues: {
          include: {
            categoryField: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 25,
    });

    const results: ScannedProductDto[] = [];
    for (const p of products) {
      const priceInfo = await this.calculateProductPrice(p);
      results.push({
        id: p.id,
        companyId: p.company.id,
        companyName: p.company.name,
        companyCode: p.company.code,
        categoryId: p.categoryId,
        categoryName: p.category.name,
        name: p.name,
        barcode: p.barcode,
        stockQuantity: p.stockQuantity,
        unitPrice: priceInfo.unitPrice,
        priceType: priceInfo.priceType,
        pricingBreakdown: priceInfo.pricingBreakdown,
        details: priceInfo.details,
      });
    }

    return results;
  }

  /**
   * Generates a sequential, professional invoice number, e.g. INV-20261006-0001.
   * Finds the maximum sequence number for the day and checks collisions to ensure uniqueness.
   */
  private async generateInvoiceNumber(): Promise<string> {
    const prisma = getPrismaClient();
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0].replace(/-/g, ''); // YYYYMMDD
    const prefix = `INV-${dateStr}-`;

    const existing = await prisma.bill.findMany({
      where: {
        invoiceNumber: {
          startsWith: prefix,
        },
      },
      select: { invoiceNumber: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    let highestSeq = 0;
    const regex = new RegExp(`^${prefix}(\\d+)$`);
    for (const b of existing) {
      const match = b.invoiceNumber.match(regex);
      if (match && match[1]) {
        const seq = parseInt(match[1], 10);
        if (!isNaN(seq) && seq > highestSeq) {
          highestSeq = seq;
        }
      }
    }

    const nextSeq = highestSeq + 1;
    let candidate = `${prefix}${String(nextSeq).padStart(4, '0')}`;

    let attempts = 0;
    while (attempts < 50) {
      const collision = await prisma.bill.findUnique({
        where: { invoiceNumber: candidate },
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
   * Creates a unified single bill for the customer containing products from both companies.
   * Atomically saves the invoice and reduces stock inventory for each product.
   */
  public async createBill(request: CreateBillRequest): Promise<BillDto> {
    if (!request.items || request.items.length === 0) {
      throw new Error('Cannot create an empty bill. Please add at least one product.');
    }

    const prisma = getPrismaClient();
    const session = authService.getSession();
    const cashierName = request.billingUserName?.trim() || (session ? session.adminName : 'Store Cashier');
    const cashierId = request.billingUserId || (session ? session.adminId : null);

    // Calculate subtotal
    let subtotal = 0;
    for (const item of request.items) {
      if (item.quantity <= 0) {
        throw new Error(`Quantity for "${item.productName}" must be greater than zero.`);
      }
      if (item.unitPrice < 0) {
        throw new Error(`Unit price for "${item.productName}" cannot be negative.`);
      }
      subtotal += item.unitPrice * item.quantity;
    }

    subtotal = Math.round(subtotal * 100) / 100;

    // Percent-wise discount logic (supports discountPercentage as primary, with fallback)
    let discountPct = 0;
    if (request.discountPercentage !== undefined && request.discountPercentage !== null) {
      discountPct = Math.max(0, Math.min(100, Number(request.discountPercentage) || 0));
    } else if (request.discount && subtotal > 0) {
      discountPct = Math.max(0, Math.min(100, (Number(request.discount) / subtotal) * 100));
    }

    // Apply percentage discount to each item:
    // e.g., 10% discount on ₹50 item gives ₹5 discount per unit, net unit price ₹45
    let totalDiscount = 0;
    const computedItems = request.items.map((item) => {
      const itemDiscPct =
        item.discountPercentage !== undefined && item.discountPercentage !== null
          ? Math.max(0, Math.min(100, Number(item.discountPercentage) || 0))
          : discountPct;
      const itemDiscAmount = Math.round((item.unitPrice * (itemDiscPct / 100)) * 100) / 100;
      const netUnitPrice = Math.round((item.unitPrice - itemDiscAmount) * 100) / 100;
      const lineTotal = Math.round((netUnitPrice * item.quantity) * 100) / 100;
      totalDiscount += Math.round((itemDiscAmount * item.quantity) * 100) / 100;

      return {
        ...item,
        discountPercentage: itemDiscPct,
        discountAmount: itemDiscAmount,
        netUnitPrice,
        totalPrice: lineTotal,
      };
    });

    totalDiscount = Math.round(totalDiscount * 100) / 100;
    const netSubtotal = Math.max(0, subtotal - totalDiscount);
    let taxPct = 0;
    let tax = 0;
    if (request.taxPercentage !== undefined && request.taxPercentage !== null) {
      taxPct = Math.max(0, Number(request.taxPercentage) || 0);
      tax =
        request.tax !== undefined && request.tax !== null
          ? Math.max(0, Number(request.tax) || 0)
          : Math.round(netSubtotal * (taxPct / 100) * 100) / 100;
    } else if (request.tax !== undefined && request.tax !== null) {
      tax = Math.max(0, Number(request.tax) || 0);
      taxPct = netSubtotal > 0 ? Math.round((tax / netSubtotal) * 100 * 100) / 100 : 0;
    }
    const totalAmount = Math.round(Math.max(0, netSubtotal + tax) * 100) / 100;
    const paymentMethod = request.paymentMethod || 'CASH';

    const invoiceNumber = await this.generateInvoiceNumber();

    // Execute atomic transaction: Save Bill + Line items + Decrement Stock
    const result = await prisma.$transaction(async (tx) => {
      // 1. Group total requested quantities by productId to validate against actual available stock
      const requestedQtyByProduct = new Map<string, { totalQty: number; item: typeof computedItems[0] }>();
      for (const item of computedItems) {
        if (item.productId) {
          const existing = requestedQtyByProduct.get(item.productId);
          if (existing) {
            existing.totalQty += item.quantity;
          } else {
            requestedQtyByProduct.set(item.productId, { totalQty: item.quantity, item });
          }
        }
      }

      // 2. Validate that every product has sufficient stock available in database
      for (const [prodId, { totalQty, item }] of requestedQtyByProduct.entries()) {
        const product = await tx.product.findUnique({
          where: { id: prodId },
          include: { category: true },
        });

        if (!product) {
          throw new Error(`Product "${item.productName}" (Barcode: ${item.barcode}) was not found in the database.`);
        }

        if (product.isArchived) {
          throw new Error(`Product "${item.productName}" is archived and cannot be billed.`);
        }

        const isMeter = this.isMeterItem({
          categoryName: product.category?.name || item.categoryName,
          productName: product.name,
          detailsJson: item.detailsJson,
        });
        const unit = isMeter ? 'meters' : 'units';

        // Check if requested quantity exceeds actual stock present in backend
        if (product.stockQuantity < totalQty) {
          if (product.stockQuantity <= 0) {
            throw new Error(
              `Cannot complete bill. Product "${item.productName}" is completely out of stock (Available: 0 ${unit}).`
            );
          }
          throw new Error(
            `Cannot complete bill. Insufficient stock for "${item.productName}". Available in stock: ${product.stockQuantity} ${unit}, but requested: ${totalQty} ${unit}.`
          );
        }
      }

      const createdBill = await tx.bill.create({
        data: {
          invoiceNumber,
          billingUserId: cashierId,
          billingUserName: cashierName,
          customerName: request.customerName?.trim() || null,
          customerPhone: request.customerPhone?.trim() || null,
          subtotal,
          discountPercentage: discountPct,
          discount: totalDiscount,
          taxPercentage: taxPct,
          tax,
          totalAmount,
          paymentMethod,
          status: 'COMPLETED',
          notes: request.notes?.trim() || null,
        },
      });

      const billItemRecords: any[] = [];
      for (const item of computedItems) {
        const billItem = await tx.billItem.create({
          data: {
            billId: createdBill.id,
            productId: item.productId || null,
            companyId: item.companyId,
            companyName: item.companyName,
            barcode: item.barcode,
            productName: item.productName,
            categoryName: item.categoryName || null,
            unitPrice: item.unitPrice,
            discountPercentage: item.discountPercentage,
            discountAmount: item.discountAmount,
            netUnitPrice: item.netUnitPrice,
            quantity: item.quantity,
            totalPrice: item.totalPrice,
            detailsJson: item.detailsJson || null,
          },
        });
        billItemRecords.push(billItem);

        // Deduct inventory from product in database
        if (item.productId) {
          await tx.product.update({
            where: { id: item.productId },
            data: {
              stockQuantity: {
                decrement: item.quantity,
              },
            },
          });
        }
      }

      return { bill: createdBill, items: billItemRecords };
    });

    return this.formatBillDto(result.bill, result.items);
  }

  /**
   * Updates an existing bill and reconciles product stock quantities atomically.
   */
  public async updateBill(billId: string, request: UpdateBillRequest): Promise<BillDto> {
    if (!billId) {
      throw new Error('Bill ID is required for editing.');
    }
    if (!request.items || request.items.length === 0) {
      throw new Error('Cannot update bill to have 0 items. Please add at least one product.');
    }

    const prisma = getPrismaClient();

    // Calculate subtotal
    let subtotal = 0;
    for (const item of request.items) {
      if (item.quantity <= 0) {
        throw new Error(`Quantity for "${item.productName}" must be greater than zero.`);
      }
      if (item.unitPrice < 0) {
        throw new Error(`Unit price for "${item.productName}" cannot be negative.`);
      }
      subtotal += item.unitPrice * item.quantity;
    }
    subtotal = Math.round(subtotal * 100) / 100;

    let discountPct = 0;
    if (request.discountPercentage !== undefined && request.discountPercentage !== null) {
      discountPct = Math.max(0, Math.min(100, Number(request.discountPercentage) || 0));
    } else if (request.discount && subtotal > 0) {
      discountPct = Math.max(0, Math.min(100, (Number(request.discount) / subtotal) * 100));
    }

    let totalDiscount = 0;
    const computedItems = request.items.map((item) => {
      const itemDiscPct =
        item.discountPercentage !== undefined && item.discountPercentage !== null
          ? Math.max(0, Math.min(100, Number(item.discountPercentage) || 0))
          : discountPct;
      const itemDiscAmount = Math.round((item.unitPrice * (itemDiscPct / 100)) * 100) / 100;
      const netUnitPrice = Math.round((item.unitPrice - itemDiscAmount) * 100) / 100;
      const lineTotal = Math.round((netUnitPrice * item.quantity) * 100) / 100;
      totalDiscount += Math.round((itemDiscAmount * item.quantity) * 100) / 100;

      return {
        ...item,
        discountPercentage: itemDiscPct,
        discountAmount: itemDiscAmount,
        netUnitPrice,
        totalPrice: lineTotal,
      };
    });

    totalDiscount = Math.round(totalDiscount * 100) / 100;
    const netSubtotal = Math.max(0, subtotal - totalDiscount);
    let taxPct = 0;
    let tax = 0;
    if (request.taxPercentage !== undefined && request.taxPercentage !== null) {
      taxPct = Math.max(0, Number(request.taxPercentage) || 0);
      tax =
        request.tax !== undefined && request.tax !== null
          ? Math.max(0, Number(request.tax) || 0)
          : Math.round(netSubtotal * (taxPct / 100) * 100) / 100;
    } else if (request.tax !== undefined && request.tax !== null) {
      tax = Math.max(0, Number(request.tax) || 0);
      taxPct = netSubtotal > 0 ? Math.round((tax / netSubtotal) * 100 * 100) / 100 : 0;
    }
    const grandTotal = Math.max(0, Math.round((netSubtotal + tax) * 100) / 100);

    const result = await prisma.$transaction(async (tx) => {
      const existingBill = await tx.bill.findUnique({
        where: { id: billId },
        include: { items: true },
      });

      if (!existingBill) {
        throw new Error(`Bill with ID "${billId}" not found.`);
      }

      if (existingBill.status === 'CANCELLED') {
        throw new Error('Cannot edit a cancelled bill.');
      }

      // Stock Reconciliation:
      // Map existing items: productId -> total old quantity
      const oldStockMap = new Map<string, number>();
      for (const oldIt of existingBill.items) {
        if (oldIt.productId) {
          const prev = oldStockMap.get(oldIt.productId) || 0;
          oldStockMap.set(oldIt.productId, prev + oldIt.quantity);
        }
      }

      // Map new items: productId -> total new quantity
      const newStockMap = new Map<string, number>();
      for (const newIt of computedItems) {
        if (newIt.productId) {
          const prev = newStockMap.get(newIt.productId) || 0;
          newStockMap.set(newIt.productId, prev + newIt.quantity);
        }
      }

      // Products to reconcile: Union of oldStockMap and newStockMap keys
      const allProductIds = new Set<string>([...oldStockMap.keys(), ...newStockMap.keys()]);

      // 1. First validate stock availability for any product where quantity is being increased (newQty > oldQty, diff < 0)
      for (const prodId of allProductIds) {
        const oldQty = oldStockMap.get(prodId) || 0;
        const newQty = newStockMap.get(prodId) || 0;
        const diff = oldQty - newQty;

        if (diff < 0) {
          const additionalNeeded = Math.round(Math.abs(diff) * 100) / 100;
          const product = await tx.product.findUnique({
            where: { id: prodId },
            include: { category: true },
          });

          if (!product) {
            throw new Error(`Product not found for ID: ${prodId}`);
          }

          if (product.stockQuantity < additionalNeeded) {
            const isMeter = this.isMeterItem({
              categoryName: product.category?.name,
              productName: product.name,
            });
            const unit = isMeter ? 'meters' : 'units';
            throw new Error(
              `Cannot update bill. Insufficient stock to increase quantity of "${product.name}". Available in stock: ${product.stockQuantity} ${unit}, but additional ${additionalNeeded} ${unit} requested.`
            );
          }
        }
      }

      // 2. Perform the stock adjustments atomically
      for (const prodId of allProductIds) {
        const oldQty = oldStockMap.get(prodId) || 0;
        const newQty = newStockMap.get(prodId) || 0;
        const diff = oldQty - newQty;
        // diff > 0 means oldQty > newQty: items returned to stock (+ diff)
        // diff < 0 means newQty > oldQty: more items sold, deduct from stock (- Math.abs(diff))
        if (diff !== 0) {
          await tx.product.update({
            where: { id: prodId },
            data: {
              stockQuantity: {
                increment: diff,
              },
            },
          });
        }
      }

      // Delete old BillItem records
      await tx.billItem.deleteMany({
        where: { billId },
      });

      // Insert new BillItem records
      const billItemRecords = [];
      for (const item of computedItems) {
        const created = await tx.billItem.create({
          data: {
            billId,
            productId: item.productId || null,
            companyId: item.companyId,
            companyName: item.companyName,
            barcode: item.barcode,
            productName: item.productName,
            categoryName: item.categoryName || null,
            unitPrice: item.unitPrice,
            discountPercentage: item.discountPercentage,
            discountAmount: item.discountAmount,
            netUnitPrice: item.netUnitPrice,
            quantity: item.quantity,
            totalPrice: item.totalPrice,
            detailsJson: item.detailsJson || null,
          },
        });
        billItemRecords.push(created);
      }

      // Update Bill record
      const updatedBill = await tx.bill.update({
        where: { id: billId },
        data: {
          ...(request.billingUserName ? { billingUserName: request.billingUserName.trim() } : {}),
          ...(request.billingUserId ? { billingUserId: request.billingUserId } : {}),
          customerName: request.customerName ? request.customerName.trim() : null,
          customerPhone: request.customerPhone ? request.customerPhone.trim() : null,
          paymentMethod: request.paymentMethod || existingBill.paymentMethod,
          subtotal,
          discountPercentage: discountPct,
          discount: totalDiscount,
          taxPercentage: taxPct,
          tax,
          totalAmount: grandTotal,
          notes: request.notes ? request.notes.trim() : null,
        },
      });

      return { bill: updatedBill, items: billItemRecords };
    });

    return this.formatBillDto(result.bill, result.items);
  }

  /**
   * Cancels/voids an existing bill and restores 100% of product inventory.
   */
  public async cancelBill(billId: string, reason?: string): Promise<BillDto> {
    if (!billId) {
      throw new Error('Bill ID is required to cancel bill.');
    }

    const prisma = getPrismaClient();

    const result = await prisma.$transaction(async (tx) => {
      const bill = await tx.bill.findUnique({
        where: { id: billId },
        include: { items: true },
      });

      if (!bill) {
        throw new Error(`Bill with ID "${billId}" not found.`);
      }

      if (bill.status === 'CANCELLED') {
        throw new Error(`Bill "${bill.invoiceNumber}" is already cancelled.`);
      }

      // Return all items back to stock
      for (const it of bill.items) {
        if (it.productId) {
          const product = await tx.product.findUnique({
            where: { id: it.productId },
            select: { id: true },
          });
          if (product) {
            await tx.product.update({
              where: { id: it.productId },
              data: {
                stockQuantity: {
                  increment: it.quantity,
                },
              },
            });
          }
        }
      }

      const updatedNotes = [
        bill.notes,
        reason ? `Cancelled: ${reason}` : 'Cancelled by Cashier',
      ].filter(Boolean).join(' | ');

      const updatedBill = await tx.bill.update({
        where: { id: billId },
        data: {
          status: 'CANCELLED',
          notes: updatedNotes,
        },
      });

      return { bill: updatedBill, items: bill.items };
    });

    return this.formatBillDto(result.bill, result.items);
  }

  /**
   * Helper to format Bill and calculate company-wise breakdown.
   * If scopedCompanyId is supplied, restricts items and totals to that specific company.
   */
  private formatBillDto(bill: any, items: any[], scopedCompanyId?: string): BillDto {
    const breakdownMap = new Map<string, CompanyBreakdownDto>();

    const itemsDto: BillItemDto[] = items.map((it) => {
      const compId = it.companyId;
      const current = breakdownMap.get(compId) || {
        companyId: compId,
        companyName: it.companyName,
        itemCount: 0,
        totalQuantity: 0,
        subtotal: 0,
      };

      current.itemCount += 1;
      current.totalQuantity += it.quantity;
      current.subtotal = Math.round((current.subtotal + it.totalPrice) * 100) / 100;
      breakdownMap.set(compId, current);

      return {
        id: it.id,
        billId: it.billId,
        productId: it.productId,
        companyId: it.companyId,
        companyName: it.companyName,
        barcode: it.barcode,
        productName: it.productName,
        categoryName: it.categoryName,
        unitPrice: it.unitPrice,
        discountPercentage: it.discountPercentage ?? 0,
        discountAmount: it.discountAmount ?? 0,
        netUnitPrice: it.netUnitPrice ?? it.unitPrice,
        quantity: it.quantity,
        totalPrice: it.totalPrice,
        detailsJson: it.detailsJson,
        createdAt: it.createdAt.toISOString(),
      };
    });

    if (scopedCompanyId && scopedCompanyId !== 'ALL') {
      const companyItems = itemsDto.filter((it) => it.companyId === scopedCompanyId);
      const companyBreakdown = breakdownMap.get(scopedCompanyId);
      const compSubtotal = companyItems.reduce(
        (sum, it) => sum + Math.round(it.unitPrice * it.quantity * 100) / 100,
        0
      );
      const compDiscount = companyItems.reduce(
        (sum, it) => sum + Math.round((it.discountAmount || 0) * it.quantity * 100) / 100,
        0
      );
      const compTotal = companyItems.reduce((sum, it) => sum + (it.totalPrice || 0), 0);

      return {
        id: bill.id,
        invoiceNumber: bill.invoiceNumber,
        billingUserId: bill.billingUserId,
        billingUserName: bill.billingUserName,
        customerName: bill.customerName,
        customerPhone: bill.customerPhone,
        subtotal: Math.round(compSubtotal * 100) / 100,
        discountPercentage: bill.discountPercentage ?? 0,
        discount: Math.round(compDiscount * 100) / 100,
        tax: 0,
        totalAmount: Math.round(compTotal * 100) / 100,
        paymentMethod: bill.paymentMethod,
        status: bill.status,
        notes: bill.notes,
        createdAt: bill.createdAt.toISOString(),
        updatedAt: bill.updatedAt.toISOString(),
        items: companyItems,
        companyBreakdowns: companyBreakdown ? [companyBreakdown] : [],
      };
    }

    return {
      id: bill.id,
      invoiceNumber: bill.invoiceNumber,
      billingUserId: bill.billingUserId,
      billingUserName: bill.billingUserName,
      customerName: bill.customerName,
      customerPhone: bill.customerPhone,
      subtotal: bill.subtotal,
      discountPercentage: bill.discountPercentage ?? 0,
      discount: bill.discount,
      taxPercentage: bill.taxPercentage ?? 0,
      tax: bill.tax,
      totalAmount: bill.totalAmount,
      paymentMethod: bill.paymentMethod,
      status: bill.status,
      notes: bill.notes,
      createdAt: bill.createdAt.toISOString(),
      updatedAt: bill.updatedAt.toISOString(),
      items: itemsDto,
      companyBreakdowns: Array.from(breakdownMap.values()),
    };
  }

  /**
   * Lists past bills with optional search, date range, and companyId scoping.
   */
  public async listBills(filter?: ListBillsFilter): Promise<BillDto[]> {
    const prisma = getPrismaClient();
    const search = filter?.search?.trim();

    const andConditions: any[] = [];

    if (search) {
      andConditions.push({
        OR: [
          { invoiceNumber: { contains: search } },
          { customerName: { contains: search } },
          { customerPhone: { contains: search } },
          { billingUserName: { contains: search } },
        ],
      });
    }

    if (filter?.startDate || filter?.endDate) {
      const dateCond: any = {};
      if (filter.startDate) {
        const start = new Date(filter.startDate);
        if (!isNaN(start.getTime())) {
          dateCond.gte = start;
        }
      }
      if (filter.endDate) {
        const end = new Date(filter.endDate);
        if (!isNaN(end.getTime())) {
          dateCond.lte = end;
        }
      }
      andConditions.push({ createdAt: dateCond });
    }

    if (filter?.companyId && filter.companyId !== 'ALL') {
      andConditions.push({
        items: {
          some: {
            companyId: filter.companyId,
          },
        },
      });
    }

    if (filter?.billingUserId || filter?.billingUserName) {
      const userConditions: any[] = [];
      if (filter.billingUserId) {
        userConditions.push({ billingUserId: filter.billingUserId });
      }
      if (filter.billingUserName) {
        userConditions.push({ billingUserName: filter.billingUserName });
      }
      andConditions.push({
        OR: userConditions,
      });
    }

    const where: any = andConditions.length > 0 ? { AND: andConditions } : {};

    const bills = await prisma.bill.findMany({
      where,
      include: {
        items: true,
      },
      orderBy: { createdAt: 'desc' },
      take: filter?.limit || 300,
    });

    return bills.map((b) =>
      this.formatBillDto(
        b,
        b.items,
        filter?.companyId && filter.companyId !== 'ALL' ? filter.companyId : undefined
      )
    );
  }

  /**
   * Fetches a single bill by ID with optional company scoping.
   */
  public async getBillById(id: string, scopedCompanyId?: string): Promise<BillDto> {
    const prisma = getPrismaClient();
    const bill = await prisma.bill.findUnique({
      where: { id },
      include: {
        items: true,
      },
    });

    if (!bill) {
      throw new Error(`Bill with ID "${id}" not found.`);
    }

    return this.formatBillDto(bill, bill.items, scopedCompanyId);
  }

  /**
   * Normalizes a phone number for consistent grouping.
   * Strips non-digits; if 12 digits starting with 91, normalizes to 10 digits.
   */
  private normalizePhoneNumber(phone?: string | null): string {
    if (!phone) return '';
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 12 && digits.startsWith('91')) {
      return digits.slice(2);
    }
    return digits || phone.trim();
  }

  /**
   * Retrieves all customer records grouped strictly by phone number.
   * A customer visiting across multiple different days will appear as a single entry,
   * containing their full purchase history of separate bills.
   */
  public async listCustomerRecords(search?: string): Promise<CustomerRecordDto[]> {
    const prisma = getPrismaClient();

    const bills = await prisma.bill.findMany({
      include: {
        items: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Grouping strictly by phone number
    const customerMap = new Map<string, {
      customerPhone: string;
      customerName: string;
      totalBillsCount: number;
      totalSpent: number;
      firstVisitDate: string;
      lastVisitDate: string;
      bills: BillDto[];
    }>();

    for (const rawBill of bills) {
      const billDto = this.formatBillDto(rawBill, rawBill.items);
      const normalizedPhone = this.normalizePhoneNumber(rawBill.customerPhone);
      const displayPhone = (rawBill.customerPhone || '').trim();
      const rawName = (rawBill.customerName || '').trim();

      // Key strictly by normalized phone number; if none, group as 'NO_PHONE'
      const phoneKey = normalizedPhone || 'NO_PHONE';

      let customer = customerMap.get(phoneKey);
      if (!customer) {
        customer = {
          customerPhone: normalizedPhone ? (displayPhone || normalizedPhone) : 'Walk-in / No Phone',
          customerName: rawName || (normalizedPhone ? `Customer (${displayPhone || normalizedPhone})` : 'Walk-in Customer'),
          totalBillsCount: 0,
          totalSpent: 0,
          firstVisitDate: billDto.createdAt,
          lastVisitDate: billDto.createdAt,
          bills: [],
        };
        customerMap.set(phoneKey, customer);
      } else {
        // If an entry didn't have a specific name and this bill has one, adopt the non-empty name
        if ((!customer.customerName || customer.customerName.startsWith('Customer (')) && rawName) {
          customer.customerName = rawName;
        }
      }

      customer.totalBillsCount += 1;
      customer.totalSpent = Math.round((customer.totalSpent + (billDto.totalAmount || 0)) * 100) / 100;
      customer.bills.push(billDto);

      if (new Date(billDto.createdAt).getTime() < new Date(customer.firstVisitDate).getTime()) {
        customer.firstVisitDate = billDto.createdAt;
      }
      if (new Date(billDto.createdAt).getTime() > new Date(customer.lastVisitDate).getTime()) {
        customer.lastVisitDate = billDto.createdAt;
      }
    }

    let result = Array.from(customerMap.values());

    // Sort: most recent visit first, with NO_PHONE at the end if present
    result.sort((a, b) => {
      if (a.customerPhone === 'Walk-in / No Phone') return 1;
      if (b.customerPhone === 'Walk-in / No Phone') return -1;
      return new Date(b.lastVisitDate).getTime() - new Date(a.lastVisitDate).getTime();
    });

    const trimmedSearch = (search || '').trim().toLowerCase();
    if (trimmedSearch) {
      result = result.filter(
        (c) =>
          c.customerPhone.toLowerCase().includes(trimmedSearch) ||
          c.customerName.toLowerCase().includes(trimmedSearch)
      );
    }

    return result;
  }
}

export const billingService = new BillingService();
