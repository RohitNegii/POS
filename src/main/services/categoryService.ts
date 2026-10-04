import { getPrismaClient } from '../database/prisma';
import { authService } from './authService';

export interface CategorySummary {
  id: string;
  companyId: string;
  name: string;
  description: string | null;
  fieldCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCategoryInput {
  name: string;
  description?: string;
}

export interface UpdateCategoryInput {
  name: string;
  description?: string;
}

export interface ListCategoriesOptions {
  search?: string;
}

/**
 * Category Service — Phase 3 Company-Scoped Category Management.
 *
 * ARCHITECTURAL CONSTRAINTS & COMPANY ISOLATION:
 * - The authenticated session's companyId is the exclusive source of truth.
 * - The renderer NEVER sends companyId.
 * - Queries and mutations are strictly scoped to the authenticated admin's company.
 * - Cross-company category read or update attempts are rejected with an authorization error.
 * - Category names are unique within the same company.
 */
export class CategoryService {
  /**
   * Retrieves all categories for the authenticated admin's company.
   * Optionally filters by search query matching category name.
   */
  public async listCategories(
    options?: ListCategoriesOptions
  ): Promise<CategorySummary[]> {
    const companyId = authService.getAuthenticatedCompanyId();
    const prisma = getPrismaClient();

    const search = options?.search?.trim();

    const categories = await prisma.category.findMany({
      where: {
        companyId,
        ...(search
          ? {
              name: {
                contains: search,
              },
            }
          : {}),
      },
      include: {
        _count: {
          select: {
            fields: {
              where: {
                fieldKey: {
                  notIn: [
                    'purchasePrice',
                    'additionalChargesPercentage',
                    'actualPurchasePrice',
                    'actualPurchasePriceCode',
                  ],
                },
              },
            },
          },
        },
      },
      orderBy: {
        name: 'asc',
      },
    });

    return categories.map((cat) => ({
      id: cat.id,
      companyId: cat.companyId,
      name: cat.name,
      description: cat.description,
      fieldCount: cat._count.fields,
      createdAt: cat.createdAt.toISOString(),
      updatedAt: cat.updatedAt.toISOString(),
    }));
  }

  /**
   * Creates a new category under the authenticated admin's company.
   */
  public async createCategory(
    input: CreateCategoryInput
  ): Promise<CategorySummary> {
    const companyId = authService.getAuthenticatedCompanyId();
    const prisma = getPrismaClient();

    const name = input?.name?.trim();
    if (!name) {
      throw new Error('Category name is required.');
    }

    if (name.length > 100) {
      throw new Error('Category name cannot exceed 100 characters.');
    }

    const description = input.description?.trim() || null;
    if (description && description.length > 500) {
      throw new Error('Description cannot exceed 500 characters.');
    }

    // Check for duplicate category name within this company (case-insensitive in SQLite)
    const existing = await prisma.category.findFirst({
      where: {
        companyId,
        name: {
          equals: name,
        },
      },
    });

    if (existing) {
      throw new Error(
        `A category named "${name}" already exists for your company.`
      );
    }

    const category = await prisma.category.create({
      data: {
        companyId,
        name,
        description,
      },
    });

    return {
      id: category.id,
      companyId: category.companyId,
      name: category.name,
      description: category.description,
      createdAt: category.createdAt.toISOString(),
      updatedAt: category.updatedAt.toISOString(),
    };
  }

  /**
   * Updates an existing category belonging to the authenticated admin's company.
   * Enforces backend company ownership: rejects if category belongs to another company.
   */
  public async updateCategory(
    id: string,
    input: UpdateCategoryInput
  ): Promise<CategorySummary> {
    const companyId = authService.getAuthenticatedCompanyId();
    const prisma = getPrismaClient();

    if (!id || typeof id !== 'string') {
      throw new Error('Valid category ID is required.');
    }

    const name = input?.name?.trim();
    if (!name) {
      throw new Error('Category name is required.');
    }

    if (name.length > 100) {
      throw new Error('Category name cannot exceed 100 characters.');
    }

    const description = input.description?.trim() || null;
    if (description && description.length > 500) {
      throw new Error('Description cannot exceed 500 characters.');
    }

    // Retrieve category to verify existence and company ownership
    const targetCategory = await prisma.category.findUnique({
      where: { id },
    });

    if (!targetCategory) {
      throw new Error('Category not found.');
    }

    // STRICT COMPANY ISOLATION ENFORCEMENT
    if (targetCategory.companyId !== companyId) {
      throw new Error(
        'Forbidden: You do not have permission to modify categories belonging to another company.'
      );
    }

    // Check for duplicate name in this company (excluding the category itself)
    const duplicate = await prisma.category.findFirst({
      where: {
        companyId,
        name: {
          equals: name,
        },
        NOT: {
          id,
        },
      },
    });

    if (duplicate) {
      throw new Error(
        `A category named "${name}" already exists for your company.`
      );
    }

    const updated = await prisma.category.update({
      where: { id },
      data: {
        name,
        description,
      },
    });

    return {
      id: updated.id,
      companyId: updated.companyId,
      name: updated.name,
      description: updated.description,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  /**
   * Retrieves a single category by ID, verifying that it belongs to the authenticated company.
   */
  public async getCategoryById(id: string): Promise<CategorySummary> {
    const companyId = authService.getAuthenticatedCompanyId();
    const prisma = getPrismaClient();

    if (!id || typeof id !== 'string') {
      throw new Error('Valid category ID is required.');
    }

    const category = await prisma.category.findUnique({
      where: { id },
    });

    if (!category || category.companyId !== companyId) {
      throw new Error('Category not found or unauthorized.');
    }

    return {
      id: category.id,
      companyId: category.companyId,
      name: category.name,
      description: category.description,
      createdAt: category.createdAt.toISOString(),
      updatedAt: category.updatedAt.toISOString(),
    };
  }

  /**
   * Permanently deletes a category if and only if it has no active products.
   * If the category has active products, deletion is rejected with an error so the UI can display a toast.
   * If the category has 0 active products (meaning it has 0 products or only deleted/archived products),
   * any archived products, their dynamic field values, and category fields are cleaned up in an atomic transaction,
   * and the category is permanently deleted.
   */
  public async deleteCategory(id: string): Promise<{ id: string; name: string }> {
    const companyId = authService.getAuthenticatedCompanyId();
    const prisma = getPrismaClient();

    if (!id || typeof id !== 'string') {
      throw new Error('Valid category ID is required.');
    }

    const targetCategory = await prisma.category.findUnique({
      where: { id },
    });

    if (!targetCategory || targetCategory.companyId !== companyId) {
      throw new Error('Category not found or unauthorized.');
    }

    // Check if category contains any active (non-archived) products
    const activeProductsCount = await prisma.product.count({
      where: {
        categoryId: id,
        companyId,
        isArchived: false,
      },
    });

    if (activeProductsCount > 0) {
      throw new Error(
        `Category cannot be deleted because it contains ${activeProductsCount} active product${activeProductsCount === 1 ? '' : 's'}.`
      );
    }

    // Atomic transaction: clean up any archived products, field values, category fields, and the category itself
    await prisma.$transaction(async (tx) => {
      // 1. Fetch any archived product IDs for this category
      const archivedProducts = await tx.product.findMany({
        where: {
          categoryId: id,
          companyId,
        },
        select: { id: true },
      });
      const archivedProductIds = archivedProducts.map((p) => p.id);

      if (archivedProductIds.length > 0) {
        // Delete field values for these products
        await tx.productFieldValue.deleteMany({
          where: {
            productId: { in: archivedProductIds },
          },
        });

        // Permanently delete archived products
        await tx.product.deleteMany({
          where: {
            id: { in: archivedProductIds },
          },
        });
      }

      // 2. Fetch category fields
      const categoryFields = await tx.categoryField.findMany({
        where: { categoryId: id },
        select: { id: true },
      });
      const fieldIds = categoryFields.map((f) => f.id);

      if (fieldIds.length > 0) {
        // Delete any remaining product field values tied to these category fields
        await tx.productFieldValue.deleteMany({
          where: {
            categoryFieldId: { in: fieldIds },
          },
        });

        // Delete the category fields
        await tx.categoryField.deleteMany({
          where: { categoryId: id },
        });
      }

      // 3. Permanently delete the category
      await tx.category.delete({
        where: { id },
      });
    });

    return {
      id: targetCategory.id,
      name: targetCategory.name,
    };
  }
}

export const categoryService = new CategoryService();
