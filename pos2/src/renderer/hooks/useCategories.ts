import { useCallback, useEffect, useState } from 'react';
import type { CategoryDto, CreateCategoryRequest, UpdateCategoryRequest } from '../../shared/types/ipc';
import { ipcClient } from '../services/ipcClient';

export function useCategories() {
  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const refreshCategories = useCallback(async (search?: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await ipcClient.listCategories({ search });
      setCategories(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch categories.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshCategories(searchQuery.trim() || undefined);
  }, [refreshCategories, searchQuery]);

  const createCategory = useCallback(async (input: CreateCategoryRequest): Promise<CategoryDto | null> => {
    setError(null);
    try {
      const res = await ipcClient.createCategory(input);
      await refreshCategories(searchQuery.trim() || undefined);
      return res;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create category.');
      return null;
    }
  }, [refreshCategories, searchQuery]);

  const updateCategory = useCallback(async (input: UpdateCategoryRequest): Promise<CategoryDto | null> => {
    setError(null);
    try {
      const res = await ipcClient.updateCategory(input);
      await refreshCategories(searchQuery.trim() || undefined);
      return res;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update category.');
      return null;
    }
  }, [refreshCategories, searchQuery]);

  const deleteCategory = useCallback(async (id: string): Promise<boolean> => {
    setError(null);
    try {
      await ipcClient.deleteCategory(id);
      await refreshCategories(searchQuery.trim() || undefined);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete category.');
      return false;
    }
  }, [refreshCategories, searchQuery]);

  const clearError = useCallback(() => setError(null), []);

  return {
    categories,
    loading,
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
