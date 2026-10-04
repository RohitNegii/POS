import { useCallback, useEffect, useState } from 'react';
import type {
  CategoryFieldDto,
  CreateCategoryFieldRequest,
  UpdateCategoryFieldRequest,
} from '../../shared/types/ipc';
import { ipcClient } from '../services/ipcClient';

export function useCategoryFields(categoryId: string | null) {
  const [fields, setFields] = useState<CategoryFieldDto[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const loadFields = useCallback(async (catId: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await ipcClient.listCategoryFields(catId);
      if (result.success) {
        setFields(result.data);
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load category fields.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (categoryId) {
      void loadFields(categoryId);
    } else {
      setFields([]);
      setError(null);
    }
  }, [categoryId, loadFields]);

  const createField = async (
    input: Omit<CreateCategoryFieldRequest, 'categoryId'>
  ): Promise<boolean> => {
    if (!categoryId) return false;
    setSaving(true);
    setError(null);
    try {
      const result = await ipcClient.createCategoryField({
        ...input,
        categoryId,
      });
      if (result.success) {
        await loadFields(categoryId);
        return true;
      } else {
        setError(result.error);
        return false;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create field.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const updateField = async (
    input: UpdateCategoryFieldRequest
  ): Promise<boolean> => {
    if (!categoryId) return false;
    setSaving(true);
    setError(null);
    try {
      const result = await ipcClient.updateCategoryField(input);
      if (result.success) {
        await loadFields(categoryId);
        return true;
      } else {
        setError(result.error);
        return false;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update field.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const deleteField = async (fieldId: string): Promise<boolean> => {
    if (!categoryId) return false;
    setSaving(true);
    setError(null);
    try {
      const result = await ipcClient.deleteCategoryField(fieldId);
      if (result.success) {
        await loadFields(categoryId);
        return true;
      } else {
        setError(result.error);
        return false;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete field.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const moveField = async (
    fieldId: string,
    direction: 'up' | 'down'
  ): Promise<boolean> => {
    if (!categoryId) return false;
    const currentIndex = fields.findIndex((f) => f.id === fieldId);
    if (currentIndex === -1) return false;

    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= fields.length) return false;

    // Swap field positions in ordered ID list
    const newOrderedIds = [...fields.map((f) => f.id)];
    const temp = newOrderedIds[currentIndex];
    newOrderedIds[currentIndex] = newOrderedIds[targetIndex];
    newOrderedIds[targetIndex] = temp;

    setSaving(true);
    setError(null);
    try {
      const result = await ipcClient.reorderCategoryFields({
        categoryId,
        orderedFieldIds: newOrderedIds,
      });
      if (result.success) {
        setFields(result.data);
        return true;
      } else {
        setError(result.error);
        return false;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reorder fields.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const clearError = () => setError(null);

  return {
    fields,
    loading,
    saving,
    error,
    refreshFields: () => (categoryId ? loadFields(categoryId) : Promise.resolve()),
    createField,
    updateField,
    deleteField,
    moveField,
    clearError,
  };
}
