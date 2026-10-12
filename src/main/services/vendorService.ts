import { Prisma } from '@prisma/client';
import { getPrismaClient } from '../database/prisma';
import { authService } from './authService';
import type {
  CreateVendorRequest,
  UpdateVendorRequest,
  VendorDto,
} from '../../shared/types/ipc';

export class VendorService {
  /**
   * Retrieves all vendors for the authenticated admin's company.
   */
  public async listVendors(search?: string): Promise<VendorDto[]> {
    const companyId = authService.getAuthenticatedCompanyId();
    const prisma = getPrismaClient();

    const where: Prisma.VendorWhereInput = {
      companyId,
    };

    const trimmedSearch = search?.trim();
    if (trimmedSearch) {
      where.OR = [
        { name: { contains: trimmedSearch } },
        { phoneNumber: { contains: trimmedSearch } },
      ];
    }

    const vendors = await prisma.vendor.findMany({
      where,
      include: {
        purchases: {
          select: {
            totalAmount: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    return vendors.map((v) => {
      const purchasesCount = v.purchases.length;
      const totalPurchasedAmount = Math.round(
        v.purchases.reduce((acc, p) => acc + (p.totalAmount || 0), 0) * 100
      ) / 100;

      return {
        id: v.id,
        companyId: v.companyId,
        name: v.name,
        phoneNumber: v.phoneNumber,
        createdAt: v.createdAt.toISOString(),
        updatedAt: v.updatedAt.toISOString(),
        purchasesCount,
        totalPurchasedAmount,
      };
    });
  }

  /**
   * Retrieves a single vendor by ID, ensuring company isolation.
   */
  public async getVendorById(id: string): Promise<VendorDto> {
    const companyId = authService.getAuthenticatedCompanyId();
    const prisma = getPrismaClient();

    const vendor = await prisma.vendor.findUnique({
      where: { id },
      include: {
        purchases: {
          select: {
            totalAmount: true,
          },
        },
      },
    });

    if (!vendor || vendor.companyId !== companyId) {
      throw new Error('Vendor not found or access denied.');
    }

    const purchasesCount = vendor.purchases.length;
    const totalPurchasedAmount = Math.round(
      vendor.purchases.reduce((acc, p) => acc + (p.totalAmount || 0), 0) * 100
    ) / 100;

    return {
      id: vendor.id,
      companyId: vendor.companyId,
      name: vendor.name,
      phoneNumber: vendor.phoneNumber,
      createdAt: vendor.createdAt.toISOString(),
      updatedAt: vendor.updatedAt.toISOString(),
      purchasesCount,
      totalPurchasedAmount,
    };
  }

  /**
   * Creates a new Vendor for the authenticated company.
   */
  public async createVendor(input: CreateVendorRequest): Promise<VendorDto> {
    const companyId = authService.getAuthenticatedCompanyId();
    const prisma = getPrismaClient();

    const name = input.name?.trim();
    if (!name) {
      throw new Error('Vendor name is required.');
    }
    if (name.length < 2 || name.length > 100) {
      throw new Error('Vendor name must be between 2 and 100 characters.');
    }

    const phoneNumber = input.phoneNumber?.trim() || null;
    if (phoneNumber && phoneNumber.length > 30) {
      throw new Error('Phone number cannot exceed 30 characters.');
    }

    // Check duplicate name within company
    const existing = await prisma.vendor.findFirst({
      where: {
        companyId,
        name: { equals: name },
      },
    });

    if (existing) {
      throw new Error(`A vendor with the name "${name}" already exists.`);
    }

    const vendor = await prisma.vendor.create({
      data: {
        companyId,
        name,
        phoneNumber,
      },
    });

    return {
      id: vendor.id,
      companyId: vendor.companyId,
      name: vendor.name,
      phoneNumber: vendor.phoneNumber,
      createdAt: vendor.createdAt.toISOString(),
      updatedAt: vendor.updatedAt.toISOString(),
      purchasesCount: 0,
      totalPurchasedAmount: 0,
    };
  }

  /**
   * Updates an existing Vendor.
   */
  public async updateVendor(input: UpdateVendorRequest): Promise<VendorDto> {
    const companyId = authService.getAuthenticatedCompanyId();
    const prisma = getPrismaClient();

    if (!input.id) {
      throw new Error('Vendor ID is required.');
    }

    const existing = await prisma.vendor.findUnique({
      where: { id: input.id },
    });

    if (!existing || existing.companyId !== companyId) {
      throw new Error('Vendor not found or access denied.');
    }

    const name = input.name?.trim();
    if (!name) {
      throw new Error('Vendor name is required.');
    }
    if (name.length < 2 || name.length > 100) {
      throw new Error('Vendor name must be between 2 and 100 characters.');
    }

    const phoneNumber = input.phoneNumber?.trim() || null;
    if (phoneNumber && phoneNumber.length > 30) {
      throw new Error('Phone number cannot exceed 30 characters.');
    }

    // Check duplicate name if renamed
    if (name.toLowerCase() !== existing.name.toLowerCase()) {
      const duplicate = await prisma.vendor.findFirst({
        where: {
          companyId,
          name: { equals: name },
          id: { not: existing.id },
        },
      });

      if (duplicate) {
        throw new Error(`Another vendor with the name "${name}" already exists.`);
      }
    }

    const updated = await prisma.vendor.update({
      where: { id: input.id },
      data: {
        name,
        phoneNumber,
      },
      include: {
        purchases: {
          select: {
            totalAmount: true,
          },
        },
      },
    });

    const purchasesCount = updated.purchases.length;
    const totalPurchasedAmount = Math.round(
      updated.purchases.reduce((acc, p) => acc + (p.totalAmount || 0), 0) * 100
    ) / 100;

    return {
      id: updated.id,
      companyId: updated.companyId,
      name: updated.name,
      phoneNumber: updated.phoneNumber,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
      purchasesCount,
      totalPurchasedAmount,
    };
  }

  /**
   * Deletes a Vendor if no active purchases exist.
   */
  public async deleteVendor(id: string): Promise<{ id: string; name: string }> {
    const companyId = authService.getAuthenticatedCompanyId();
    const prisma = getPrismaClient();

    const existing = await prisma.vendor.findUnique({
      where: { id },
      include: {
        _count: {
          select: { purchases: true },
        },
      },
    });

    if (!existing || existing.companyId !== companyId) {
      throw new Error('Vendor not found or access denied.');
    }

    if (existing._count.purchases > 0) {
      throw new Error(
        `Cannot delete vendor "${existing.name}": This vendor is linked to ${existing._count.purchases} purchase record(s).`
      );
    }

    await prisma.vendor.delete({
      where: { id },
    });

    return {
      id: existing.id,
      name: existing.name,
    };
  }
}

export const vendorService = new VendorService();
