import { useCallback, useEffect, useState } from 'react';
import type { CustomerRecordDto } from '../../shared/types/ipc';
import { ipcClient } from '../services/ipcClient';

export function useCustomerRecords() {
  const [customers, setCustomers] = useState<CustomerRecordDto[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState<string>('');

  const refreshCustomerRecords = useCallback(async (customSearch?: string) => {
    setLoading(true);
    setError(null);
    try {
      const activeSearch = customSearch !== undefined ? customSearch : search;
      const res = await ipcClient.listCustomerRecords(activeSearch);
      if (res.success) {
        setCustomers(res.data);
      } else {
        setError(res.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch customer records.');
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    void refreshCustomerRecords();
  }, [refreshCustomerRecords]);

  return {
    customers,
    loading,
    error,
    search,
    setSearch,
    refreshCustomerRecords,
  };
}
