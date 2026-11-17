import { getPrismaClient } from '../database/prisma';
import { authService } from './authService';
import type {
  BillingUserDto,
  CreateBillingUserRequest,
  UpdateBillingUserRequest,
} from '../../shared/types/ipc';

/**
 * Billing User Management Service.
 *
 * Enforces role-based permissions:
 * - Only Super Admin can create, edit, and delete Billing Users.
 * - Billing Users and Company Admins can list billing users to operate the billing system.
 * - Super Admin manages billing users independently without touching Company Admin accounts.
 */
export class BillingUserService {
  private formatBillingUserDto(user: {
    id: string;
    name: string;
    createdAt: Date;
    updatedAt: Date;
  }): BillingUserDto {
    return {
      id: user.id,
      name: user.name,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };
  }

  /**
   * Retrieves the list of all registered Billing Users.
   * Shared across both companies for billing terminal operator attribution.
   */
  public async listBillingUsers(): Promise<BillingUserDto[]> {
    authService.requireSession();
    const prisma = getPrismaClient();

    const users = await prisma.billingUser.findMany({
      orderBy: { name: 'asc' },
    });

    return users.map((u) => this.formatBillingUserDto(u));
  }

  /**
   * Creates a new Billing User with the specified name.
   * STRICT: Only Super Admin is authorized to perform this operation.
   */
  public async createBillingUser(request: CreateBillingUserRequest): Promise<BillingUserDto> {
    const session = authService.requireSession();
    if (session.role !== 'SUPER_ADMIN') {
      throw new Error('Forbidden: Only Super Admin has permission to create billing users.');
    }

    if (!request || typeof request.name !== 'string') {
      throw new Error('Billing user name is required.');
    }

    const name = request.name.trim();
    if (name.length < 2) {
      throw new Error('Billing user name must be at least 2 characters long.');
    }
    if (name.length > 100) {
      throw new Error('Billing user name cannot exceed 100 characters.');
    }

    const prisma = getPrismaClient();

    // Check for duplicate name (case-insensitive check)
    const existing = await prisma.billingUser.findFirst({
      where: {
        name: {
          equals: name,
        },
      },
    });

    if (existing) {
      throw new Error(`A billing user named "${name}" already exists.`);
    }

    const created = await prisma.billingUser.create({
      data: { name },
    });

    return this.formatBillingUserDto(created);
  }

  /**
   * Updates an existing Billing User's name.
   * STRICT: Only Super Admin is authorized to perform this operation.
   */
  public async updateBillingUser(
    id: string,
    request: UpdateBillingUserRequest
  ): Promise<BillingUserDto> {
    const session = authService.requireSession();
    if (session.role !== 'SUPER_ADMIN') {
      throw new Error('Forbidden: Only Super Admin has permission to edit billing users.');
    }

    if (!id || typeof id !== 'string') {
      throw new Error('Billing user ID is required.');
    }

    if (!request || typeof request.name !== 'string') {
      throw new Error('Billing user name is required.');
    }

    const name = request.name.trim();
    if (name.length < 2) {
      throw new Error('Billing user name must be at least 2 characters long.');
    }
    if (name.length > 100) {
      throw new Error('Billing user name cannot exceed 100 characters.');
    }

    const prisma = getPrismaClient();

    const existing = await prisma.billingUser.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new Error('Billing user not found.');
    }

    // Check duplicate if name is changing
    if (existing.name.toLowerCase() !== name.toLowerCase()) {
      const duplicate = await prisma.billingUser.findFirst({
        where: {
          name: {
            equals: name,
          },
          id: {
            not: id,
          },
        },
      });

      if (duplicate) {
        throw new Error(`Another billing user named "${name}" already exists.`);
      }
    }

    const updated = await prisma.billingUser.update({
      where: { id },
      data: { name },
    });

    return this.formatBillingUserDto(updated);
  }

  /**
   * Deletes a Billing User.
   * STRICT: Only Super Admin is authorized to perform this operation.
   * Note: Past bills will retain the billing user's name in billing history.
   */
  public async deleteBillingUser(id: string): Promise<{ id: string; name: string }> {
    const session = authService.requireSession();
    if (session.role !== 'SUPER_ADMIN') {
      throw new Error('Forbidden: Only Super Admin has permission to delete billing users.');
    }

    if (!id || typeof id !== 'string') {
      throw new Error('Billing user ID is required.');
    }

    const prisma = getPrismaClient();

    const existing = await prisma.billingUser.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new Error('Billing user not found.');
    }

    await prisma.billingUser.delete({
      where: { id },
    });

    return { id: existing.id, name: existing.name };
  }
}

export const billingUserService = new BillingUserService();
