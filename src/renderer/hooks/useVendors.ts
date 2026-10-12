import { useCallback, useEffect, useState } from 'react';
import type { CreateVendorRequest, UpdateVendorRequest, VendorDto } from '../../shared/types/ipc';
import { ipcClient } from '../services/ipcClient';

export function useVendors() {
  const [vendors, setVendors] = useState<VendorDto[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const refreshVendors = useCallback(async (search?: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await ipcClient.listVendors(search);
      if (res.success) {
        setVendors(res.data);
      } else {
        setError(res.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load vendors');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshVendors();
  }, [refreshVendors]);

  const createVendor = async (input: CreateVendorRequest): Promise<VendorDto | null> => {
    try {
      const res = await ipcClient.createVendor(input);
      if (res.success) {
        await refreshVendors();
        return res.data;
      } else {
        setError(res.error);
        return null;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create vendor');
      return null;
    }
  };

  const updateVendor = async (input: UpdateVendorRequest): Promise<VendorDto | null> => {
    try {
      const res = await ipcClient.updateVendor(input);
      if (res.success) {
        await refreshVendors();
        return res.data;
      } else {
        setError(res.error);
        return null;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update vendor');
      return null;
    }
  };

  const deleteVendor = async (id: string): Promise<boolean> => {
    try {
      const res = await ipcClient.deleteVendor(id);
      if (res.success) {
        await refreshVendors();
        return true;
      } else {
        setError(res.error);
        return false;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete vendor');
      return false;
    }
  };

  return {
    vendors,
    loading,
    error,
    refreshVendors,
    createVendor,
    updateVendor,
    deleteVendor,
    clearError: () => setError(null),
  };
}
