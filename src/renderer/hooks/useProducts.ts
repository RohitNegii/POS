import { useCallback, useEffect, useState } from 'react';
import type {
  CreateProductRequest,
  ListProductsFilter,
  ProductDto,
  UpdateProductRequest,
} from '../../shared/types/ipc';
import { ipcClient } from '../services/ipcClient';

export function useProducts(initialFilter?: ListProductsFilter) {
  const [products, setProducts] = useState<ProductDto[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<ListProductsFilter>(initialFilter || {});

  const loadProducts = useCallback(async (currentFilter: ListProductsFilter) => {
    setLoading(true);
    setError(null);
    try {
      const result = await ipcClient.listProducts(currentFilter);
      if (result.success) {
        setProducts(result.data);
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load products.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProducts(filter);
  }, [filter, loadProducts]);

  const createProduct = async (input: CreateProductRequest): Promise<ProductDto | null> => {
    setSaving(true);
    setError(null);
    try {
      const result = await ipcClient.createProduct(input);
      if (result.success) {
        await loadProducts(filter);
        return result.data;
      } else {
        setError(result.error);
        return null;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create product.');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const updateProduct = async (input: UpdateProductRequest): Promise<ProductDto | null> => {
    setSaving(true);
    setError(null);
    try {
      const result = await ipcClient.updateProduct(input);
      if (result.success) {
        await loadProducts(filter);
        return result.data;
      } else {
        setError(result.error);
        return null;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update product.');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const deleteProduct = async (id: string): Promise<boolean> => {
    setSaving(true);
    setError(null);
    try {
      // Optimistically remove product from local state immediately
      setProducts((prev) => prev.filter((p) => p.id !== id));
      const result = await ipcClient.deleteProduct(id);
      if (result.success) {
        await loadProducts(filter);
        return true;
      } else {
        setError(result.error);
        await loadProducts(filter);
        return false;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete product.');
      await loadProducts(filter);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const getProductById = async (id: string): Promise<ProductDto | null> => {
    try {
      const result = await ipcClient.getProductById(id);
      if (result.success) {
        return result.data;
      } else {
        setError(result.error);
        return null;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get product details.');
      return null;
    }
  };

  const clearError = () => setError(null);

  const upsertProductInList = useCallback((product: ProductDto) => {
    setProducts((prev) => {
      const idx = prev.findIndex((p) => p.id === product.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = product;
        return next;
      }
      return [product, ...prev];
    });
  }, []);

  return {
    products,
    loading,
    saving,
    error,
    filter,
    setFilter,
    refreshProducts: () => loadProducts(filter),
    upsertProductInList,
    createProduct,
    updateProduct,
    deleteProduct,
    getProductById,
    clearError,
  };
}
