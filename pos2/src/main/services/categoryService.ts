import { getPrismaClient } from '../database/prisma';
import { authService } from './authService';
import type {
  CategoryDto,
  CreateCategoryRequest,
  ListCategoriesFilter,
  UpdateCategoryRequest,
} from '../../shared/types/ipc';

export class CategoryService {
  public async listCategories(options?: ListCategoriesFilter): Promise<CategoryDto[]> {
    const companyId = authService.getAuthenticatedCompanyId();
    const prisma = getPrismaClient();

    const search = options?.search?.trim();

    const categories = await prisma.category.findMany({
      where: {
        ...(companyId !== 'ALL' ? { companyId } : {}),
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
            fields: true,
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
      fieldsCount: cat._count.fields,
      createdAt: cat.createdAt.toISOString(),
      updatedAt: cat.updatedAt.toISOString(),
    }));
  }

  public async createCategory(input: CreateCategoryRequest): Promise<CategoryDto> {
    const companyId = authService.getAuthenticatedCompanyId();
    const prisma = getPrismaClient();

    const targetCompanyId = companyId === 'ALL'
      ? (await prisma.company.findFirst({ orderBy: { code: 'asc' } }))?.id || ''
      : companyId;

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

    const existing = await prisma.category.findFirst({
      where: {
        companyId: targetCompanyId,
        name: {
          equals: name,
        },
      },
    });

    if (existing) {
      throw new Error(`A category named "${name}" already exists for this company.`);
    }

    const category = await prisma.category.create({
      data: {
        companyId: targetCompanyId,
        name,
        description,
      },
    });

    return {
      id: category.id,
      companyId: category.companyId,
      name: category.name,
      description: category.description,
      fieldsCount: 0,
      createdAt: category.createdAt.toISOString(),
      updatedAt: category.updatedAt.toISOString(),
    };
  }

  public async updateCategory(input: UpdateCategoryRequest): Promise<CategoryDto> {
    const companyId = authService.getAuthenticatedCompanyId();
    const prisma = getPrismaClient();

    const { id } = input;
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

    const targetCategory = await prisma.category.findUnique({
      where: { id },
    });

    if (!targetCategory) {
      throw new Error('Category not found.');
    }

    if (companyId !== 'ALL' && targetCategory.companyId !== companyId) {
      throw new Error('Forbidden: You do not have permission to modify this category.');
    }

    const duplicate = await prisma.category.findFirst({
      where: {
        companyId: targetCategory.companyId,
        name: {
          equals: name,
        },
        NOT: {
          id,
        },
      },
    });

    if (duplicate) {
      throw new Error(`A category named "${name}" already exists for this company.`);
    }

    const updated = await prisma.category.update({
      where: { id },
      data: {
        name,
        description,
      },
      include: {
        _count: {
          select: { fields: true },
        },
      },
    });

    return {
      id: updated.id,
      companyId: updated.companyId,
      name: updated.name,
      description: updated.description,
      fieldsCount: updated._count.fields,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  public async getCategoryById(id: string): Promise<CategoryDto> {
    const companyId = authService.getAuthenticatedCompanyId();
    const prisma = getPrismaClient();

    if (!id || typeof id !== 'string') {
      throw new Error('Valid category ID is required.');
    }

    const category = await prisma.category.findUnique({
      where: { id },
      include: {
        _count: { select: { fields: true } },
      },
    });

    if (!category || (companyId !== 'ALL' && category.companyId !== companyId)) {
      throw new Error('Category not found or unauthorized.');
    }

    return {
      id: category.id,
      companyId: category.companyId,
      name: category.name,
      description: category.description,
      fieldsCount: category._count.fields,
      createdAt: category.createdAt.toISOString(),
      updatedAt: category.updatedAt.toISOString(),
    };
  }

  public async deleteCategory(id: string): Promise<CategoryDto> {
    const companyId = authService.getAuthenticatedCompanyId();
    const prisma = getPrismaClient();

    if (!id || typeof id !== 'string') {
      throw new Error('Valid category ID is required.');
    }

    const targetCategory = await prisma.category.findUnique({
      where: { id },
    });

    if (!targetCategory || (companyId !== 'ALL' && targetCategory.companyId !== companyId)) {
      throw new Error('Category not found or unauthorized.');
    }

    const deleted = await prisma.category.delete({
      where: { id },
    });

    return {
      id: deleted.id,
      companyId: deleted.companyId,
      name: deleted.name,
      description: deleted.description,
      fieldsCount: 0,
      createdAt: deleted.createdAt.toISOString(),
      updatedAt: deleted.updatedAt.toISOString(),
    };
  }
}

export const categoryService = new CategoryService();
