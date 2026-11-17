import { useCallback, useEffect, useState } from 'react';
import type { OverduePurchasesSummary } from '../../shared/types/ipc';
import { ipcClient } from '../services/ipcClient';

export function useOverduePurchases(companyId?: string, enabled = true) {
  const [summary, setSummary] = useState<OverduePurchasesSummary>({
    overdueCount: 0,
    totalOverdueAmount: 0,
    thresholdDays: 7,
    items: [],
  });
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const refreshOverdue = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const res = await ipcClient.getOverduePurchases(7);
      if (res.success) {
        setSummary(res.data);

        // Daily desktop notification if overdue bills exist
        if (res.data.overdueCount > 0) {
          const today = new Date().toISOString().slice(0, 10);
          const key = `pos_overdue_notif_${companyId || 'company'}_${today}`;
          if (!localStorage.getItem(key)) {
            try {
              if ('Notification' in window) {
                if (Notification.permission === 'granted') {
                  new Notification('⚠️ Overdue Vendor Bills Reminder', {
                    body: `You have ${res.data.overdueCount} vendor bill(s) pending payment for over 7 days (Total: ₹${res.data.totalOverdueAmount.toLocaleString('en-IN')}).`,
                  });
                  localStorage.setItem(key, 'true');
                } else if (Notification.permission !== 'denied') {
                  void Notification.requestPermission().then((permission) => {
                    if (permission === 'granted') {
                      new Notification('⚠️ Overdue Vendor Bills Reminder', {
                        body: `You have ${res.data.overdueCount} vendor bill(s) pending payment for over 7 days (Total: ₹${res.data.totalOverdueAmount.toLocaleString('en-IN')}).`,
                      });
                      localStorage.setItem(key, 'true');
                    }
                  });
                }
              }
            } catch {
              // Ignore notification errors in restricted environments
            }
          }
        }
      } else {
        setError(res.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch overdue purchases.');
    } finally {
      setLoading(false);
    }
  }, [enabled, companyId]);

  useEffect(() => {
    if (enabled) {
      void refreshOverdue();
      // Periodically refresh every 5 minutes
      const timer = setInterval(() => {
        void refreshOverdue();
      }, 5 * 60 * 1000);
      return () => clearInterval(timer);
    }
  }, [refreshOverdue, enabled]);

  return {
    summary,
    loading,
    error,
    refreshOverdue,
  };
}
