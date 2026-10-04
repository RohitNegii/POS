import { getPrismaClient } from '../database/prisma';
import { authService } from './authService';
import type {
  CategoryFieldDto,
  CategoryFieldType,
  CreateCategoryFieldRequest,
  ReorderCategoryFieldsRequest,
  UpdateCategoryFieldRequest,
} from '../../shared/types/ipc';

export const SUPPORTED_FIELD_TYPES: readonly CategoryFieldType[] = [
  'text',
  'number',
  'select',
  'boolean',
] as const;

// Safe fieldKey regex: starts with a letter, followed by letters, numbers, or underscores (no spaces)
const FIELD_KEY_REGEX = /^[a-zA-Z][a-zA-Z0-9_]*$/;

/**
 * CategoryField Service — Phase 4 Dynamic Category Product Field System.
 *
 * ARCHITECTURAL CONSTRAINTS & COMPANY ISOLATION:
 * - CategoryField belongs to Category, which belongs to Company.
 * - Every operation resolves the authenticated admin's companyId from session.
 * - Ownership of the parent Category is strictly verified before any read/mutation.
 * - Cross-company access is strictly rejected.
 * - fieldKey is unique within the category and immutable after creation.
 * - fieldType is immutable after creation to protect future product data stability.
 * - Options for select fields are stored as JSON arrays.
 */
export class CategoryFieldService {
  /**
   * Helper to parse stored JSON options safely.
   */
  private parseOptions(rawOptions: string | null): string[] | null {
    if (!rawOptions) return null;
    try {
      const parsed = JSON.parse(rawOptions);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  /**
   * Validates and verifies that the given category belongs to the authenticated admin's company.
   * Throws an authorization error if the category does not exist or belongs to another company.
   */
  private async verifyCategoryOwnership(categoryId: string): Promise<string> {
    const companyId = authService.getAuthenticatedCompanyId();
    const prisma = getPrismaClient();

    if (!categoryId || typeof categoryId !== 'string') {
      throw new Error('Valid category ID is required.');
    }

    const category = await prisma.category.findUnique({
      where: { id: categoryId },
      select: { id: true, companyId: true },
    });

    if (!category || category.companyId !== companyId) {
      throw new Error(
        'Forbidden: You do not have permission to access fields for this category.'
      );
    }

    return companyId;
  }

  /**
   * Retrieves all dynamic fields for a category, ordered by displayOrder then createdAt.
   */
  public async listFields(categoryId: string): Promise<CategoryFieldDto[]> {
    await this.verifyCategoryOwnership(categoryId);
    const prisma = getPrismaClient();

    const fields = await prisma.categoryField.findMany({
      where: { categoryId },
      orderBy: [
        { displayOrder: 'asc' },
        { createdAt: 'asc' },
      ],
    });

    return fields.map((f) => ({
      id: f.id,
      categoryId: f.categoryId,
      name: f.name,
      fieldKey: f.fieldKey,
      fieldType: f.fieldType as CategoryFieldType,
      required: f.required,
      displayOrder: f.displayOrder,
      options: this.parseOptions(f.options),
      createdAt: f.createdAt.toISOString(),
      updatedAt: f.updatedAt.toISOString(),
    }));
  }

  /**
   * Creates a new dynamic field for a category.
   */
  public async createField(
    input: CreateCategoryFieldRequest
  ): Promise<CategoryFieldDto> {
    await this.verifyCategoryOwnership(input.categoryId);
    const prisma = getPrismaClient();

    // 1. Validate Field Name
    const name = input.name?.trim();
    if (!name) {
      throw new Error('Field name is required.');
    }
    if (name.length > 100) {
      throw new Error('Field name cannot exceed 100 characters.');
    }

    // 2. Validate Field Key
    const fieldKey = input.fieldKey?.trim();
    if (!fieldKey) {
      throw new Error('Field key is required.');
    }
    if (fieldKey.length > 50) {
      throw new Error('Field key cannot exceed 50 characters.');
    }
    if (!FIELD_KEY_REGEX.test(fieldKey)) {
      throw new Error(
        `Invalid field key "${fieldKey}". Field key must start with a letter, contain no spaces, and only use alphanumeric characters and underscores (e.g. "productName", "selling_price").`
      );
    }

    // 3. Validate Field Type
    const fieldType = input.fieldType;
    if (!SUPPORTED_FIELD_TYPES.includes(fieldType)) {
      throw new Error(
        `Invalid field type "${fieldType}". Supported types are: ${SUPPORTED_FIELD_TYPES.join(', ')}.`
      );
    }

    // 4. Validate Select Options
    let serializedOptions: string | null = null;
    if (fieldType === 'select') {
      if (!input.options || !Array.isArray(input.options)) {
        throw new Error('Options are required for "select" field type.');
      }
      const sanitizedOptions = input.options
        .map((opt) => (typeof opt === 'string' ? opt.trim() : ''))
        .filter((opt) => opt.length > 0);

      if (sanitizedOptions.length === 0) {
        throw new Error('Select field must contain at least one valid option.');
      }
      // Deduplicate options while preserving order
      const uniqueOptions = Array.from(new Set(sanitizedOptions));
      serializedOptions = JSON.stringify(uniqueOptions);
    }

    // 5. Check Uniqueness of fieldKey within this category
    const existingWithKey = await prisma.categoryField.findFirst({
      where: {
        categoryId: input.categoryId,
        fieldKey,
      },
    });

    if (existingWithKey) {
      throw new Error(
        `A field with key "${fieldKey}" already exists in this category.`
      );
    }

    // 6. Determine Display Order
    let displayOrder = input.displayOrder;
    if (displayOrder === undefined || displayOrder === null || displayOrder < 0) {
      const highestField = await prisma.categoryField.findFirst({
        where: { categoryId: input.categoryId },
        orderBy: { displayOrder: 'desc' },
        select: { displayOrder: true },
      });
      displayOrder = (highestField?.displayOrder ?? 0) + 1;
    }

    // 7. Persist Field
    const created = await prisma.categoryField.create({
      data: {
        categoryId: input.categoryId,
        name,
        fieldKey,
        fieldType,
        required: Boolean(input.required),
        displayOrder,
        options: serializedOptions,
      },
    });

    return {
      id: created.id,
      categoryId: created.categoryId,
      name: created.name,
      fieldKey: created.fieldKey,
      fieldType: created.fieldType as CategoryFieldType,
      required: created.required,
      displayOrder: created.displayOrder,
      options: this.parseOptions(created.options),
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    };
  }

  /**
   * Updates an existing field.
   * fieldKey and fieldType are immutable to safeguard future product data.
   */
  public async updateField(
    input: UpdateCategoryFieldRequest
  ): Promise<CategoryFieldDto> {
    const companyId = authService.getAuthenticatedCompanyId();
    const prisma = getPrismaClient();

    if (!input.id || typeof input.id !== 'string') {
      throw new Error('Valid field ID is required.');
    }

    const field = await prisma.categoryField.findUnique({
      where: { id: input.id },
      include: { category: true },
    });

    if (!field) {
      throw new Error('Field not found.');
    }

    if (field.category.companyId !== companyId) {
      throw new Error(
        'Forbidden: You do not have permission to modify fields for this category.'
      );
    }

    // Validate Name
    const name = input.name?.trim();
    if (!name) {
      throw new Error('Field name is required.');
    }
    if (name.length > 100) {
      throw new Error('Field name cannot exceed 100 characters.');
    }

    // Validate Options if select type
    let serializedOptions: string | null = field.options;
    if (field.fieldType === 'select') {
      if (input.options !== undefined) {
        if (!Array.isArray(input.options)) {
          throw new Error('Options must be an array for "select" field type.');
        }
        const sanitizedOptions = input.options
          .map((opt) => (typeof opt === 'string' ? opt.trim() : ''))
          .filter((opt) => opt.length > 0);

        if (sanitizedOptions.length === 0) {
          throw new Error('Select field must contain at least one valid option.');
        }
        const uniqueOptions = Array.from(new Set(sanitizedOptions));
        serializedOptions = JSON.stringify(uniqueOptions);
      }
    } else {
      serializedOptions = null;
    }

    const displayOrder =
      typeof input.displayOrder === 'number' && input.displayOrder >= 0
        ? input.displayOrder
        : field.displayOrder;

    const required =
      input.required !== undefined ? Boolean(input.required) : field.required;

    const updated = await prisma.categoryField.update({
      where: { id: input.id },
      data: {
        name,
        required,
        displayOrder,
        options: serializedOptions,
      },
    });

    return {
      id: updated.id,
      categoryId: updated.categoryId,
      name: updated.name,
      fieldKey: updated.fieldKey,
      fieldType: updated.fieldType as CategoryFieldType,
      required: updated.required,
      displayOrder: updated.displayOrder,
      options: this.parseOptions(updated.options),
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  /**
   * Deletes a category field.
   * Enforces backend category ownership.
   */
  public async deleteField(fieldId: string): Promise<{ id: string }> {
    const companyId = authService.getAuthenticatedCompanyId();
    const prisma = getPrismaClient();

    if (!fieldId || typeof fieldId !== 'string') {
      throw new Error('Valid field ID is required.');
    }

    const field = await prisma.categoryField.findUnique({
      where: { id: fieldId },
      include: { category: true },
    });

    if (!field) {
      throw new Error('Field not found.');
    }

    if (field.category.companyId !== companyId) {
      throw new Error(
        'Forbidden: You do not have permission to delete fields for this category.'
      );
    }

    await prisma.categoryField.delete({
      where: { id: fieldId },
    });

    return { id: fieldId };
  }

  /**
   * Reorders the fields of a category according to an ordered list of field IDs.
   */
  public async reorderFields(
    input: ReorderCategoryFieldsRequest
  ): Promise<CategoryFieldDto[]> {
    await this.verifyCategoryOwnership(input.categoryId);
    const prisma = getPrismaClient();

    if (!Array.isArray(input.orderedFieldIds) || input.orderedFieldIds.length === 0) {
      throw new Error('An ordered array of field IDs is required.');
    }

    // Verify all field IDs belong to this category
    const existingFields = await prisma.categoryField.findMany({
      where: { categoryId: input.categoryId },
      select: { id: true },
    });

    const existingIds = new Set(existingFields.map((f) => f.id));
    for (const id of input.orderedFieldIds) {
      if (!existingIds.has(id)) {
        throw new Error(
          `Field ID "${id}" does not exist in category "${input.categoryId}".`
        );
      }
    }

    // Update displayOrder sequentially in a transaction
    await prisma.$transaction(
      input.orderedFieldIds.map((id, index) =>
        prisma.categoryField.update({
          where: { id },
          data: { displayOrder: index + 1 },
        })
      )
    );

    return this.listFields(input.categoryId);
  }
}

export const categoryFieldService = new CategoryFieldService();
