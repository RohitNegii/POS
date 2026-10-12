import { Prisma } from '@prisma/client';
import { getPrismaClient } from '../database/prisma';
import { authService } from './authService';
import type {
  BuyerDto,
  CreateBuyerRequest,
  UpdateBuyerRequest,
} from '../../shared/types/ipc';

export class BuyerService {
  public async listBuyers(search?: string): Promise<BuyerDto[]> {
    const companyId = authService.getAuthenticatedCompanyId();
    const prisma = getPrismaClient();

    const where: Prisma.BuyerWhereInput = {
      ...(companyId !== 'ALL' ? { companyId } : {}),
    };

    const trimmedSearch = search?.trim();
    if (trimmedSearch) {
      where.OR = [
        { name: { contains: trimmedSearch } },
        { phoneNumber: { contains: trimmedSearch } },
        { email: { contains: trimmedSearch } },
        { address: { contains: trimmedSearch } },
      ];
    }

    const buyers = await prisma.buyer.findMany({
      where,
      orderBy: { name: 'asc' },
    });

    return buyers.map((b) => ({
      id: b.id,
      companyId: b.companyId,
      name: b.name,
      phoneNumber: b.phoneNumber,
      email: b.email,
      address: b.address,
      notes: b.notes,
      createdAt: b.createdAt.toISOString(),
      updatedAt: b.updatedAt.toISOString(),
    }));
  }

  public async getBuyerById(id: string): Promise<BuyerDto> {
    const companyId = authService.getAuthenticatedCompanyId();
    const prisma = getPrismaClient();

    const buyer = await prisma.buyer.findUnique({
      where: { id },
    });

    if (!buyer || (companyId !== 'ALL' && buyer.companyId !== companyId)) {
      throw new Error('Buyer not found or access denied.');
    }

    return {
      id: buyer.id,
      companyId: buyer.companyId,
      name: buyer.name,
      phoneNumber: buyer.phoneNumber,
      email: buyer.email,
      address: buyer.address,
      notes: buyer.notes,
      createdAt: buyer.createdAt.toISOString(),
      updatedAt: buyer.updatedAt.toISOString(),
    };
  }

  public async createBuyer(input: CreateBuyerRequest): Promise<BuyerDto> {
    const companyId = authService.getAuthenticatedCompanyId();
    const prisma = getPrismaClient();

    const targetCompanyId = companyId === 'ALL'
      ? (await prisma.company.findFirst({ orderBy: { code: 'asc' } }))?.id || ''
      : companyId;

    const name = input.name?.trim();
    if (!name) {
      throw new Error('Buyer name is required.');
    }
    if (name.length < 2 || name.length > 100) {
      throw new Error('Buyer name must be between 2 and 100 characters.');
    }

    const phoneNumber = input.phoneNumber?.trim() || null;
    if (phoneNumber && phoneNumber.length > 30) {
      throw new Error('Phone number cannot exceed 30 characters.');
    }

    const email = input.email?.trim() || null;
    const address = input.address?.trim() || null;
    const notes = input.notes?.trim() || null;

    const existing = await prisma.buyer.findFirst({
      where: {
        companyId: targetCompanyId,
        name: { equals: name },
      },
    });

    if (existing) {
      throw new Error(`A buyer with the name "${name}" already exists.`);
    }

    const buyer = await prisma.buyer.create({
      data: {
        companyId: targetCompanyId,
        name,
        phoneNumber,
        email,
        address,
        notes,
      },
    });

    return {
      id: buyer.id,
      companyId: buyer.companyId,
      name: buyer.name,
      phoneNumber: buyer.phoneNumber,
      email: buyer.email,
      address: buyer.address,
      notes: buyer.notes,
      createdAt: buyer.createdAt.toISOString(),
      updatedAt: buyer.updatedAt.toISOString(),
    };
  }

  public async updateBuyer(input: UpdateBuyerRequest): Promise<BuyerDto> {
    const companyId = authService.getAuthenticatedCompanyId();
    const prisma = getPrismaClient();

    const { id } = input;
    if (!id) {
      throw new Error('Buyer ID is required.');
    }

    const existing = await prisma.buyer.findUnique({
      where: { id },
    });

    if (!existing || (companyId !== 'ALL' && existing.companyId !== companyId)) {
      throw new Error('Buyer not found or access denied.');
    }

    const name = input.name?.trim() || existing.name;
    if (name.length < 2 || name.length > 100) {
      throw new Error('Buyer name must be between 2 and 100 characters.');
    }

    // Check duplicate name if renamed
    if (name !== existing.name) {
      const duplicate = await prisma.buyer.findFirst({
        where: {
          companyId: existing.companyId,
          name: { equals: name },
          NOT: { id },
        },
      });
      if (duplicate) {
        throw new Error(`A buyer with the name "${name}" already exists.`);
      }
    }

    const phoneNumber = input.phoneNumber !== undefined ? (input.phoneNumber?.trim() || null) : existing.phoneNumber;
    const email = input.email !== undefined ? (input.email?.trim() || null) : existing.email;
    const address = input.address !== undefined ? (input.address?.trim() || null) : existing.address;
    const notes = input.notes !== undefined ? (input.notes?.trim() || null) : existing.notes;

    const updated = await prisma.buyer.update({
      where: { id },
      data: {
        name,
        phoneNumber,
        email,
        address,
        notes,
      },
    });

    return {
      id: updated.id,
      companyId: updated.companyId,
      name: updated.name,
      phoneNumber: updated.phoneNumber,
      email: updated.email,
      address: updated.address,
      notes: updated.notes,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  public async deleteBuyer(id: string): Promise<boolean> {
    const companyId = authService.getAuthenticatedCompanyId();
    const prisma = getPrismaClient();

    const existing = await prisma.buyer.findUnique({
      where: { id },
    });

    if (!existing || (companyId !== 'ALL' && existing.companyId !== companyId)) {
      throw new Error('Buyer not found or access denied.');
    }

    await prisma.buyer.delete({
      where: { id },
    });

    return true;
  }
}

export const buyerService = new BuyerService();
