import { useCallback, useEffect, useState } from 'react';
import type {
  CategoryDto,
  CreateCategoryRequest,
  UpdateCategoryRequest,
} from '../../shared/types/ipc';
import { ipcClient } from '../services/ipcClient';

export interface UseCategoriesReturn {
  categories: CategoryDto[];
  loading: boolean;
  saving: boolean;
  error: string | null;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  refreshCategories: () => Promise<void>;
  createCategory: (input: CreateCategoryRequest) => Promise<CategoryDto>;
  updateCategory: (input: UpdateCategoryRequest) => Promise<CategoryDto>;
  deleteCategory: (id: string) => Promise<{ id: string; name: string }>;
  clearError: () => void;
}

export function useCategories(): UseCategoriesReturn {
  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  const fetchCategories = useCallback(async (query: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await ipcClient.listCategories(
        query ? { search: query } : undefined
      );
      if (result.success) {
        setCategories(result.data);
      } else {
        setError(result.error);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch categories.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = setTimeout(() => {
      void fetchCategories(searchQuery);
    }, 200);

    return () => clearTimeout(handler);
  }, [searchQuery, fetchCategories]);

  const refreshCategories = useCallback(async () => {
    await fetchCategories(searchQuery);
  }, [fetchCategories, searchQuery]);

  const createCategory = useCallback(
    async (input: CreateCategoryRequest): Promise<CategoryDto> => {
      setSaving(true);
      setError(null);
      try {
        const result = await ipcClient.createCategory(input);
        if (result.success) {
          await fetchCategories(searchQuery);
          return result.data;
        } else {
          const errMsg = result.error || 'Failed to create category.';
          setError(errMsg);
          throw new Error(errMsg);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to create category.';
        setError(msg);
        throw err;
      } finally {
        setSaving(false);
      }
    },
    [fetchCategories, searchQuery]
  );

  const updateCategory = useCallback(
    async (input: UpdateCategoryRequest): Promise<CategoryDto> => {
      setSaving(true);
      setError(null);
      try {
        const result = await ipcClient.updateCategory(input);
        if (result.success) {
          await fetchCategories(searchQuery);
          return result.data;
        } else {
          const errMsg = result.error || 'Failed to update category.';
          setError(errMsg);
          throw new Error(errMsg);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to update category.';
        setError(msg);
        throw err;
      } finally {
        setSaving(false);
      }
    },
    [fetchCategories, searchQuery]
  );

  const deleteCategory = useCallback(
    async (id: string): Promise<{ id: string; name: string }> => {
      setSaving(true);
      setError(null);
      try {
        const result = await ipcClient.deleteCategory(id);
        if (result.success) {
          await fetchCategories(searchQuery);
          return result.data;
        } else {
          const errMsg = result.error || 'Failed to delete category.';
          setError(errMsg);
          throw new Error(errMsg);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to delete category.';
        setError(msg);
        throw err;
      } finally {
        setSaving(false);
      }
    },
    [fetchCategories, searchQuery]
  );

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    categories,
    loading,
    saving,
    error,
    searchQuery,
    setSearchQuery,
    refreshCategories,
    createCategory,
    updateCategory,
    deleteCategory,
    clearError,
  };
}
