import { Prisma } from '@prisma/client';
import { getPrismaClient } from '../database/prisma';
import { authService } from './authService';
import type {
  CreatePurchaseRequest,
  ListPurchasesFilter,
  PurchaseDto,
  PurchaseItemDto,
  UpdatePurchasePaymentRequest,
} from '../../shared/types/ipc';

interface PurchasePaymentMetadata {
  paymentStatus: 'PAID' | 'UNPAID';
  paymentMethod?: 'CASH' | 'ONLINE' | null;
  note?: string | null;
}

function encodeNotes(meta: PurchasePaymentMetadata): string {
  return JSON.stringify({
    status: meta.paymentStatus,
    method: meta.paymentMethod || null,
    note: meta.note || null,
  });
}

function decodeNotes(rawNotes?: string | null): {
  paymentStatus: 'PAID' | 'UNPAID';
  paymentMethod: 'CASH' | 'ONLINE' | null;
  note: string | null;
} {
  if (!rawNotes) {
    return { paymentStatus: 'UNPAID', paymentMethod: null, note: null };
  }
  try {
    if (rawNotes.startsWith('{') && rawNotes.endsWith('}')) {
      const parsed = JSON.parse(rawNotes);
      return {
        paymentStatus: parsed.status === 'PAID' ? 'PAID' : 'UNPAID',
        paymentMethod: parsed.method === 'CASH' || parsed.method === 'ONLINE' ? parsed.method : null,
        note: parsed.note || null,
      };
    }
  } catch {
    // legacy non-json text
  }
  return { paymentStatus: 'UNPAID', paymentMethod: null, note: rawNotes };
}

export class PurchaseService {
  /**
   * Retrieves purchase history entries for the authenticated admin's company.
   * Grouped as 1 record per (Vendor + Date) with itemized products list and payment status.
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

    return purchases.map((p) => {
      const items: PurchaseItemDto[] = p.items.map((item) => ({
        id: item.id,
        purchaseId: item.purchaseId,
        productId: item.productId,
        productName: item.productName,
        barcode: item.barcode,
        categoryName: item.categoryName,
        quantityBought: item.quantityBought,
        currentStock: item.product ? item.product.stockQuantity : 0,
        unitCost: item.unitCost,
        totalAmount: item.totalAmount,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      }));

      const totalProductsCount = items.length;
      const totalUnitsBought = items.reduce((acc, it) => acc + it.quantityBought, 0);
      const decoded = decodeNotes(p.notes);

      return {
        id: p.id,
        companyId: p.companyId,
        vendorId: p.vendorId,
        vendorName: p.vendor?.name || 'Unknown Vendor',
        vendorPhone: p.vendor?.phoneNumber || null,
        purchaseDate: p.purchaseDate,
        totalAmount: p.totalAmount,
        totalProductsCount,
        totalUnitsBought,
        paymentStatus: decoded.paymentStatus,
        paymentMethod: decoded.paymentMethod,
        notes: decoded.note,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
        items,
      };
    });
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

    const items: PurchaseItemDto[] = p.items.map((item) => ({
      id: item.id,
      purchaseId: item.purchaseId,
      productId: item.productId,
      productName: item.productName,
      barcode: item.barcode,
      categoryName: item.categoryName,
      quantityBought: item.quantityBought,
      currentStock: item.product ? item.product.stockQuantity : 0,
      unitCost: item.unitCost,
      totalAmount: item.totalAmount,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    }));

    const decoded = decodeNotes(p.notes);

    return {
      id: p.id,
      companyId: p.companyId,
      vendorId: p.vendorId,
      vendorName: p.vendor?.name || 'Unknown Vendor',
      vendorPhone: p.vendor?.phoneNumber || null,
      purchaseDate: p.purchaseDate,
      totalAmount: p.totalAmount,
      totalProductsCount: items.length,
      totalUnitsBought: items.reduce((acc, it) => acc + it.quantityBought, 0),
      paymentStatus: decoded.paymentStatus,
      paymentMethod: decoded.paymentMethod,
      notes: decoded.note,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
      items,
    };
  }

  /**
   * Records a new purchase (or product restock) and increments the product's inventory.
   * Merges into the existing (Vendor + Date) purchase order if already present.
   */
  public async createPurchase(input: CreatePurchaseRequest): Promise<PurchaseDto> {
    const companyId = authService.getAuthenticatedCompanyId();
    const prisma = getPrismaClient();

    if (!input.vendorId) {
      throw new Error('Vendor is required.');
    }
    if (!input.productId) {
      throw new Error('Product is required.');
    }

    // 1. Verify vendor belongs to company
    const vendor = await prisma.vendor.findUnique({
      where: { id: input.vendorId },
    });
    if (!vendor || vendor.companyId !== companyId) {
      throw new Error('Selected vendor is invalid or does not belong to your store.');
    }

    // 2. Verify product belongs to company
    const product = await prisma.product.findUnique({
      where: { id: input.productId },
      include: {
        category: {
          select: { name: true },
        },
      },
    });
    if (!product || product.companyId !== companyId) {
      throw new Error('Selected product is invalid or does not belong to your store.');
    }

    // 3. Validate numbers
    const quantity = typeof input.quantityBought === 'number' ? input.quantityBought : parseFloat(String(input.quantityBought));
    if (isNaN(quantity) || quantity <= 0) {
      throw new Error('Purchased quantity must be greater than 0.');
    }

    const unitCost = typeof input.unitCost === 'number' ? input.unitCost : parseFloat(String(input.unitCost || 0));
    if (isNaN(unitCost) || unitCost < 0) {
      throw new Error('Unit cost cannot be negative.');
    }

    const itemTotal = Math.round(quantity * unitCost * 100) / 100;
    const purchaseDate = input.purchaseDate?.trim() || new Date().toISOString().split('T')[0];

    const paymentStatus = input.paymentStatus === 'PAID' ? 'PAID' : 'UNPAID';
    const paymentMethod = paymentStatus === 'PAID' ? (input.paymentMethod === 'ONLINE' ? 'ONLINE' : 'CASH') : null;

    const initialPackedNotes = encodeNotes({
      paymentStatus,
      paymentMethod,
      note: input.notes?.trim() || null,
    });

    // 4. Atomic transaction: upsert purchase header & insert item & increment stock
    const purchaseId = await prisma.$transaction(async (tx) => {
      // Find existing purchase order for this company, vendor, and date
      let purchase = await tx.purchase.findUnique({
        where: {
          companyId_vendorId_purchaseDate: {
            companyId,
            vendorId: vendor.id,
            purchaseDate,
          },
        },
      });

      if (!purchase) {
        purchase = await tx.purchase.create({
          data: {
            companyId,
            vendorId: vendor.id,
            purchaseDate,
            totalAmount: itemTotal,
            notes: initialPackedNotes,
          },
        });
      } else {
        // If paymentStatus was explicitly provided, update it; otherwise preserve existing payment details
        let updatedNotes = purchase.notes;
        if (input.paymentStatus) {
          const prev = decodeNotes(purchase.notes);
          updatedNotes = encodeNotes({
            paymentStatus,
            paymentMethod,
            note: input.notes?.trim() || prev.note,
          });
        }

        purchase = await tx.purchase.update({
          where: { id: purchase.id },
          data: {
            totalAmount: { increment: itemTotal },
            ...(updatedNotes ? { notes: updatedNotes } : {}),
          },
        });
      }

      // Add itemized purchase entry
      await tx.purchaseItem.create({
        data: {
          purchaseId: purchase.id,
          productId: product.id,
          productName: product.name,
          barcode: product.barcode,
          categoryName: product.category?.name || null,
          quantityBought: quantity,
          unitCost: Math.round(unitCost * 100) / 100,
          totalAmount: itemTotal,
        },
      });

      // Increment product inventory and update latest vendor and purchase date
      await tx.product.update({
        where: { id: product.id },
        data: {
          stockQuantity: {
            increment: quantity,
          },
          vendorId: vendor.id,
          purchaseDate,
        },
      });

      return purchase.id;
    });

    const fullRecord = await this.getPurchaseById(purchaseId);
    if (!fullRecord) {
      throw new Error('Failed to retrieve updated purchase record.');
    }
    return fullRecord;
  }

  /**
   * Updates ONLY the payment status (Paid / Unpaid) and payment method (Cash / Online) of a purchase order.
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

    const currentDecoded = decodeNotes(existing.notes);
    const newStatus = input.paymentStatus === 'PAID' ? 'PAID' : 'UNPAID';
    const newMethod = newStatus === 'PAID' ? (input.paymentMethod === 'ONLINE' ? 'ONLINE' : 'CASH') : null;
    const finalNote = input.notes !== undefined ? input.notes.trim() || null : currentDecoded.note;

    const packedNotes = encodeNotes({
      paymentStatus: newStatus,
      paymentMethod: newMethod,
      note: finalNote,
    });

    await prisma.purchase.update({
      where: { id: existing.id },
      data: {
        notes: packedNotes,
      },
    });

    const updated = await this.getPurchaseById(existing.id);
    if (!updated) {
      throw new Error('Failed to retrieve updated purchase record.');
    }
    return updated;
  }

  /**
   * Deletes a purchase record (and cascades to its purchase items).
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
}

export const purchaseService = new PurchaseService();
