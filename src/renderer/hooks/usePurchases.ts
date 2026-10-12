import { useCallback, useEffect, useState } from 'react';
import type {
  CreatePurchaseRequest,
  ListPurchasesFilter,
  PurchaseDto,
  UpdatePurchasePaymentRequest,
} from '../../shared/types/ipc';
import { ipcClient } from '../services/ipcClient';

export function usePurchases() {
  const [purchases, setPurchases] = useState<PurchaseDto[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<ListPurchasesFilter>({});

  const refreshPurchases = useCallback(async (customFilter?: ListPurchasesFilter) => {
    setLoading(true);
    setError(null);
    try {
      const activeFilter = customFilter !== undefined ? customFilter : filter;
      const res = await ipcClient.listPurchases(activeFilter);
      if (res.success) {
        setPurchases(res.data);
      } else {
        setError(res.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load purchase history');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void refreshPurchases();
  }, [refreshPurchases]);

  const createPurchase = async (input: CreatePurchaseRequest): Promise<PurchaseDto | null> => {
    try {
      const res = await ipcClient.createPurchase(input);
      if (res.success) {
        await refreshPurchases();
        return res.data;
      } else {
        setError(res.error);
        return null;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record purchase');
      return null;
    }
  };

  const updatePurchasePayment = async (input: UpdatePurchasePaymentRequest): Promise<PurchaseDto | null> => {
    try {
      const res = await ipcClient.updatePurchasePayment(input);
      if (res.success) {
        await refreshPurchases();
        return res.data;
      } else {
        setError(res.error);
        return null;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update payment');
      return null;
    }
  };

  const deletePurchase = async (id: string): Promise<boolean> => {
    try {
      const res = await ipcClient.deletePurchase(id);
      if (res.success) {
        await refreshPurchases();
        return true;
      } else {
        setError(res.error);
        return false;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete purchase');
      return false;
    }
  };

  return {
    purchases,
    loading,
    error,
    filter,
    setFilter,
    refreshPurchases,
    createPurchase,
    updatePurchasePayment,
    deletePurchase,
    clearError: () => setError(null),
  };
}
