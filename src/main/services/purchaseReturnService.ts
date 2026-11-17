import { Prisma } from '@prisma/client';
import { getPrismaClient } from '../database/prisma';
import { authService } from './authService';
import { getLocalDateString } from '../../shared/utils/date';
import type {
  CreatePurchaseReturnRequest,
  ListPurchaseReturnsFilter,
  PurchaseReturnDto,
  PurchaseReturnItemDto,
} from '../../shared/types/ipc';

export class PurchaseReturnService {
  /**
   * Generates a sequential, collision-free Debit Note / Purchase Return Number.
   * Format: PR-YYYYMMDD-XXXX (e.g. PR-20261031-0001)
   */
  private async generateReturnNumber(
    tx: Prisma.TransactionClient,
    companyId: string,
    returnDate: string
  ): Promise<string> {
    const dateCompact = returnDate.replace(/-/g, '');
    const prefix = `PR-${dateCompact}-`;

    const existing = await tx.purchaseReturn.findMany({
      where: {
        companyId,
        returnNumber: {
          startsWith: prefix,
        },
      },
      select: { returnNumber: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    let highestSeq = 0;
    const regex = new RegExp(`^${prefix}(\\d+)$`);
    for (const pr of existing) {
      const match = pr.returnNumber.match(regex);
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
      const collision = await tx.purchaseReturn.findUnique({
        where: { returnNumber: candidate },
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
   * Records a return of purchased products back to the vendor.
   * Atomically decreases product stock quantities, soft-archives zero-stock items if requested,
   * updates the original purchase bill balance if applicable, and logs the return audit note.
   */
  public async createPurchaseReturn(input: CreatePurchaseReturnRequest): Promise<PurchaseReturnDto> {
    const authCompanyId = authService.getAuthenticatedCompanyId();
    const prisma = getPrismaClient();

    if (!input.purchaseId) {
      throw new Error('Original purchase ID is required.');
    }

    if (!input.items || input.items.length === 0) {
      throw new Error('Please select at least one product item to return.');
    }

    // 1. Fetch original purchase
    const originalPurchase = await prisma.purchase.findUnique({
      where: { id: input.purchaseId },
      include: {
        vendor: true,
        items: {
          include: {
            returnItems: true,
            product: true,
          },
        },
      },
    });

    if (!originalPurchase) {
      throw new Error(`Original purchase bill with ID "${input.purchaseId}" not found.`);
    }

    const targetCompanyId = authCompanyId !== 'ALL' ? authCompanyId : originalPurchase.companyId;
    if (originalPurchase.companyId !== targetCompanyId) {
      throw new Error('You do not have permission to return items on this purchase bill.');
    }

    const returnDate = input.returnDate ? input.returnDate.slice(0, 10) : getLocalDateString();

    // 2. Validate all returned items against purchase items & store inventory
    let computedTotalAmount = 0;
    const validatedItems: Array<{
      purchaseItemId: string;
      productId: string | null;
      productName: string;
      barcode: string;
      quantityReturned: number;
      unitCost: number;
      totalCost: number;
    }> = [];

    for (const reqItem of input.items) {
      const qty = Number(reqItem.quantityReturned);
      if (isNaN(qty) || qty <= 0) {
        throw new Error(`Invalid return quantity for item "${reqItem.productName}". Must be greater than 0.`);
      }

      const pItem = originalPurchase.items.find((it) => it.id === reqItem.purchaseItemId);
      if (!pItem) {
        throw new Error(`Item "${reqItem.productName}" does not belong to purchase bill "${originalPurchase.invoiceNumber}".`);
      }

      // Check cumulative previously returned quantity
      const alreadyReturnedQty = pItem.returnItems.reduce((sum, rIt) => sum + rIt.quantityReturned, 0);
      const remainingBoughtQty = Math.max(0, pItem.quantityBought - alreadyReturnedQty);

      if (qty > remainingBoughtQty) {
        throw new Error(
          `Cannot return ${qty} of "${pItem.productName}". Only ${remainingBoughtQty} unreturned units remain on this purchase bill.`
        );
      }

      // Check store inventory availability
      if (pItem.productId) {
        const liveProd = await prisma.product.findUnique({
          where: { id: pItem.productId },
          select: { id: true, name: true, stockQuantity: true },
        });

        if (liveProd && liveProd.stockQuantity < qty) {
          throw new Error(
            `Cannot return ${qty} of "${liveProd.name}". Only ${liveProd.stockQuantity} currently remain in shop stock (others may have been sold).`
          );
        }
      }

      const unitCost = Number(reqItem.unitCost) >= 0 ? Number(reqItem.unitCost) : pItem.unitCost;
      const totalCost = Math.round(qty * unitCost * 100) / 100;
      computedTotalAmount += totalCost;

      validatedItems.push({
        purchaseItemId: pItem.id,
        productId: pItem.productId,
        productName: pItem.productName,
        barcode: pItem.barcode,
        quantityReturned: qty,
        unitCost,
        totalCost,
      });
    }

    computedTotalAmount = Math.round(computedTotalAmount * 100) / 100;
    const refundAmount =
      input.refundAmount !== undefined && input.refundAmount !== null
        ? Math.round(Number(input.refundAmount) * 100) / 100
        : computedTotalAmount;

    // 3. Execute atomic transaction
    const createdReturn = await prisma.$transaction(async (tx) => {
      const returnNumber = await this.generateReturnNumber(tx, targetCompanyId, returnDate);

      // Decrement product stock quantities
      for (const item of validatedItems) {
        if (item.productId) {
          const prod = await tx.product.findUnique({
            where: { id: item.productId },
            select: { id: true, stockQuantity: true },
          });

          if (prod) {
            const newStock = Math.max(0, Math.round((prod.stockQuantity - item.quantityReturned) * 100) / 100);
            const shouldArchive = Boolean(input.autoArchiveZeroStock && newStock <= 0);

            await tx.product.update({
              where: { id: item.productId },
              data: {
                stockQuantity: newStock,
                isArchived: shouldArchive ? true : undefined,
              },
            });
          }
        }
      }

      // Adjust original purchase balance if refundType === 'BALANCE_DEDUCTION'
      if (input.refundType === 'BALANCE_DEDUCTION' && originalPurchase.balanceAmount > 0) {
        const newBalance = Math.max(0, Math.round((originalPurchase.balanceAmount - refundAmount) * 100) / 100);
        const newStatus = newBalance <= 0 ? 'PAID' : originalPurchase.paymentStatus;

        await tx.purchase.update({
          where: { id: originalPurchase.id },
          data: {
            balanceAmount: newBalance,
            paymentStatus: newStatus,
          },
        });
      }

      // Create PurchaseReturn record
      const purchaseReturnRecord = await tx.purchaseReturn.create({
        data: {
          returnNumber,
          purchaseId: originalPurchase.id,
          companyId: targetCompanyId,
          vendorId: originalPurchase.vendorId,
          returnDate,
          totalAmount: computedTotalAmount,
          refundType: input.refundType,
          refundAmount,
          reason: input.reason?.trim() || null,
          notes: input.notes?.trim() || null,
          items: {
            create: validatedItems.map((it) => ({
              purchaseItemId: it.purchaseItemId,
              productId: it.productId,
              productName: it.productName,
              barcode: it.barcode,
              quantityReturned: it.quantityReturned,
              unitCost: it.unitCost,
              totalCost: it.totalCost,
            })),
          },
        },
        include: {
          vendor: true,
          company: true,
          purchase: true,
          items: true,
        },
      });

      return purchaseReturnRecord;
    });

    return this.mapToDto(createdReturn);
  }

  /**
   * Lists purchase returns / debit notes with optional filters.
   */
  public async listPurchaseReturns(filter?: ListPurchaseReturnsFilter): Promise<PurchaseReturnDto[]> {
    const authCompanyId = authService.getAuthenticatedCompanyId();
    const targetCompanyId =
      filter?.companyId && filter.companyId !== 'ALL'
        ? filter.companyId
        : authCompanyId !== 'ALL'
        ? authCompanyId
        : undefined;

    const prisma = getPrismaClient();
    const where: Prisma.PurchaseReturnWhereInput = {};

    if (targetCompanyId) {
      where.companyId = targetCompanyId;
    }

    if (filter?.vendorId) {
      where.vendorId = filter.vendorId;
    }

    if (filter?.purchaseId) {
      where.purchaseId = filter.purchaseId;
    }

    if (filter?.startDate || filter?.endDate) {
      where.returnDate = {};
      if (filter.startDate) {
        where.returnDate.gte = filter.startDate.slice(0, 10);
      }
      if (filter.endDate) {
        where.returnDate.lte = filter.endDate.slice(0, 10);
      }
    }

    const returns = await prisma.purchaseReturn.findMany({
      where,
      include: {
        vendor: true,
        company: true,
        purchase: true,
        items: true,
      },
      orderBy: [{ returnDate: 'desc' }, { createdAt: 'desc' }],
    });

    return returns.map((r) => this.mapToDto(r));
  }

  /**
   * Retrieves a single purchase return by ID.
   */
  public async getPurchaseReturnById(id: string): Promise<PurchaseReturnDto | null> {
    const prisma = getPrismaClient();
    const r = await prisma.purchaseReturn.findUnique({
      where: { id },
      include: {
        vendor: true,
        company: true,
        purchase: true,
        items: true,
      },
    });

    if (!r) return null;
    return this.mapToDto(r);
  }

  private mapToDto(r: any): PurchaseReturnDto {
    const itemsDto: PurchaseReturnItemDto[] = (r.items || []).map((it: any) => ({
      id: it.id,
      purchaseReturnId: it.purchaseReturnId,
      purchaseItemId: it.purchaseItemId,
      productId: it.productId,
      productName: it.productName,
      barcode: it.barcode,
      quantityReturned: it.quantityReturned,
      unitCost: it.unitCost,
      totalCost: it.totalCost,
      createdAt: it.createdAt.toISOString(),
    }));

    return {
      id: r.id,
      returnNumber: r.returnNumber,
      purchaseId: r.purchaseId,
      purchaseNumber: r.purchase?.purchaseNumber,
      invoiceNumber: r.purchase?.invoiceNumber,
      companyId: r.companyId,
      companyName: r.company?.name,
      vendorId: r.vendorId,
      vendorName: r.vendor?.name,
      returnDate: r.returnDate,
      totalAmount: r.totalAmount,
      refundType: r.refundType as any,
      refundAmount: r.refundAmount,
      reason: r.reason,
      notes: r.notes,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      items: itemsDto,
    };
  }
}

export const purchaseReturnService = new PurchaseReturnService();
