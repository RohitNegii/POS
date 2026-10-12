import { getPrismaClient } from '../database/prisma';
import { authService } from './authService';
import { metalRateService } from './metalRateService';
import type {
  BillDto,
  BillItemDto,
  CompanyBreakdownDto,
  CreateBillRequest,
  ListBillsFilter,
  ScannedProductDto,
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
   */
  private async generateInvoiceNumber(): Promise<string> {
    const prisma = getPrismaClient();
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0].replace(/-/g, ''); // YYYYMMDD
    const prefix = `INV-${dateStr}-`;

    const count = await prisma.bill.count({
      where: {
        invoiceNumber: {
          startsWith: prefix,
        },
      },
    });

    const nextSeq = count + 1;
    return `${prefix}${String(nextSeq).padStart(4, '0')}`;
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
    const cashierName = session ? session.adminName : 'Store Cashier';
    const cashierId = session ? session.adminId : null;

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
    const tax = Math.max(0, Number(request.tax) || 0);
    const totalAmount = Math.round(Math.max(0, subtotal - totalDiscount + tax) * 100) / 100;
    const paymentMethod = request.paymentMethod || 'CASH';

    const invoiceNumber = await this.generateInvoiceNumber();

    // Execute atomic transaction: Save Bill + Line items + Decrement Stock
    const result = await prisma.$transaction(async (tx) => {
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

        // Deduct inventory if product exists in database
        if (item.productId) {
          const existingProd = await tx.product.findUnique({
            where: { id: item.productId },
            select: { id: true },
          });
          if (existingProd) {
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
      }

      return { bill: createdBill, items: billItemRecords };
    });

    return this.formatBillDto(result.bill, result.items);
  }

  /**
   * Helper to format Bill and calculate company-wise breakdown.
   */
  private formatBillDto(bill: any, items: any[]): BillDto {
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
   * Lists past bills with optional search.
   */
  public async listBills(filter?: ListBillsFilter): Promise<BillDto[]> {
    const prisma = getPrismaClient();
    const search = filter?.search?.trim();

    const where: any = {};
    if (search) {
      where.OR = [
        { invoiceNumber: { contains: search } },
        { customerName: { contains: search } },
        { customerPhone: { contains: search } },
        { billingUserName: { contains: search } },
      ];
    }

    const bills = await prisma.bill.findMany({
      where,
      include: {
        items: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return bills.map((b) => this.formatBillDto(b, b.items));
  }

  /**
   * Fetches a single bill by ID.
   */
  public async getBillById(id: string): Promise<BillDto> {
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

    return this.formatBillDto(bill, bill.items);
  }
}

export const billingService = new BillingService();
