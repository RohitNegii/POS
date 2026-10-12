import { useCallback, useEffect, useState } from 'react';
import type {
  CategoryFieldDto,
  CreateCategoryFieldRequest,
  UpdateCategoryFieldRequest,
} from '../../shared/types/ipc';
import { ipcClient } from '../services/ipcClient';

export function useCategoryFields(categoryId: string | null) {
  const [fields, setFields] = useState<CategoryFieldDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshFields = useCallback(async () => {
    if (!categoryId) {
      setFields([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await ipcClient.listCategoryFields(categoryId);
      setFields(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch fields.');
    } finally {
      setLoading(false);
    }
  }, [categoryId]);

  useEffect(() => {
    void refreshFields();
  }, [refreshFields]);

  const createField = useCallback(async (input: CreateCategoryFieldRequest): Promise<CategoryFieldDto | null> => {
    setSaving(true);
    setError(null);
    try {
      const res = await ipcClient.createCategoryField(input);
      await refreshFields();
      return res;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create field.');
      return null;
    } finally {
      setSaving(false);
    }
  }, [refreshFields]);

  const updateField = useCallback(async (input: UpdateCategoryFieldRequest): Promise<CategoryFieldDto | null> => {
    setSaving(true);
    setError(null);
    try {
      const res = await ipcClient.updateCategoryField(input);
      await refreshFields();
      return res;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update field.');
      return null;
    } finally {
      setSaving(false);
    }
  }, [refreshFields]);

  const deleteField = useCallback(async (id: string): Promise<boolean> => {
    setSaving(true);
    setError(null);
    try {
      await ipcClient.deleteCategoryField(id);
      await refreshFields();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete field.');
      return false;
    } finally {
      setSaving(false);
    }
  }, [refreshFields]);

  const moveField = useCallback(async (fieldId: string, direction: 'up' | 'down'): Promise<boolean> => {
    if (!categoryId || fields.length < 2) return false;
    const index = fields.findIndex((f) => f.id === fieldId);
    if (index === -1) return false;
    if (direction === 'up' && index === 0) return false;
    if (direction === 'down' && index === fields.length - 1) return false;

    const newFields = [...fields];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const [moved] = newFields.splice(index, 1);
    newFields.splice(targetIndex, 0, moved);

    const orderedFieldIds = newFields.map((f) => f.id);
    try {
      setSaving(true);
      await ipcClient.reorderCategoryFields({ categoryId, orderedFieldIds });
      await refreshFields();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reorder fields.');
      return false;
    } finally {
      setSaving(false);
    }
  }, [categoryId, fields, refreshFields]);

  const clearError = useCallback(() => setError(null), []);

  return {
    fields,
    loading,
    saving,
    error,
    refreshFields,
    createField,
    updateField,
    deleteField,
    moveField,
    clearError,
  };
}
