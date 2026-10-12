import { useCallback, useEffect, useState } from 'react';
import type { BuyerDto, CreateBuyerRequest, UpdateBuyerRequest } from '../../shared/types/ipc';
import { ipcClient } from '../services/ipcClient';

export function useBuyers() {
  const [buyers, setBuyers] = useState<BuyerDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchVal, setSearchVal] = useState('');

  const refreshBuyers = useCallback(async (search?: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await ipcClient.listBuyers(search);
      setBuyers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch buyers.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshBuyers(searchVal.trim() || undefined);
  }, [refreshBuyers, searchVal]);

  const createBuyer = useCallback(async (input: CreateBuyerRequest): Promise<BuyerDto | null> => {
    setError(null);
    try {
      const res = await ipcClient.createBuyer(input);
      await refreshBuyers(searchVal.trim() || undefined);
      return res;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create buyer.');
      return null;
    }
  }, [refreshBuyers, searchVal]);

  const updateBuyer = useCallback(async (input: UpdateBuyerRequest): Promise<BuyerDto | null> => {
    setError(null);
    try {
      const res = await ipcClient.updateBuyer(input);
      await refreshBuyers(searchVal.trim() || undefined);
      return res;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update buyer.');
      return null;
    }
  }, [refreshBuyers, searchVal]);

  const deleteBuyer = useCallback(async (id: string): Promise<boolean> => {
    setError(null);
    try {
      const success = await ipcClient.deleteBuyer(id);
      await refreshBuyers(searchVal.trim() || undefined);
      return success;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete buyer.');
      return false;
    }
  }, [refreshBuyers, searchVal]);

  const clearError = useCallback(() => setError(null), []);

  return {
    buyers,
    loading,
    error,
    searchVal,
    setSearchVal,
    refreshBuyers,
    createBuyer,
    updateBuyer,
    deleteBuyer,
    clearError,
  };
}
