import React, { useEffect, useState } from 'react';
import type {
  AuthSessionPayload,
  CurrentMetalRatesDto,
  MetalRateHistoryItemDto,
} from '../../shared/types/ipc';
import { ipcClient } from '../services/ipcClient';
import { useToast } from '../context/ToastContext';

interface MetalRatesPageProps {
  session: AuthSessionPayload;
}

export const MetalRatesPage: React.FC<MetalRatesPageProps> = ({ session }) => {
  const { showError, showSuccess } = useToast();

  const getTodayString = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [effectiveDate, setEffectiveDate] = useState<string>(getTodayString());
  const [goldRate, setGoldRate] = useState<string>('');
  const [silverRate, setSilverRate] = useState<string>('');
  const [currentRates, setCurrentRates] = useState<CurrentMetalRatesDto | null>(null);
  const [history, setHistory] = useState<MetalRateHistoryItemDto[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);

  const loadRatesAndHistory = async () => {
    setLoading(true);
    try {
      const [ratesRes, histRes] = await Promise.all([
        ipcClient.getCurrentMetalRates(),
        ipcClient.getMetalRateHistory(),
      ]);

      if (ratesRes.success) {
        setCurrentRates(ratesRes.data);
        if (ratesRes.data.goldRate) {
          setGoldRate(String(ratesRes.data.goldRate.ratePerGram));
        }
        if (ratesRes.data.silverRate) {
          setSilverRate(String(ratesRes.data.silverRate.ratePerGram));
        }
      }

      if (histRes.success) {
        setHistory(histRes.data);
      }
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to load metal rates.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRatesAndHistory();
  }, [session.companyId]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    const parsedGold = goldRate.trim() ? parseFloat(goldRate) : undefined;
    const parsedSilver = silverRate.trim() ? parseFloat(silverRate) : undefined;

    if (parsedGold === undefined && parsedSilver === undefined) {
      showError('Please enter at least one rate (Gold or Silver).');
      return;
    }

    if (parsedGold !== undefined && (isNaN(parsedGold) || parsedGold <= 0)) {
      showError('Gold rate must be a valid number greater than 0.');
      return;
    }

    if (parsedSilver !== undefined && (isNaN(parsedSilver) || parsedSilver <= 0)) {
      showError('Silver rate must be a valid number greater than 0.');
      return;
    }

    setSaving(true);
    try {
      const res = await ipcClient.saveDailyMetalRates({
        effectiveDate,
        goldRatePerGram: parsedGold,
        silverRatePerGram: parsedSilver,
      });

      if (res.success) {
        setCurrentRates(res.data);
        showSuccess(
          `Daily rates saved successfully (${effectiveDate}). Gold & Silver product prices are automatically recalculated.`
        );
        const histRes = await ipcClient.getMetalRateHistory();
        if (histRes.success) {
          setHistory(histRes.data);
        }
      } else {
        showError(res.error);
      }
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to save daily rates.');
    } finally {
      setSaving(false);
    }
  };

  const formatDateDisplay = (dateStr: string) => {
    try {
      const [year, month, day] = dateStr.split('-');
      const d = new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10));
      return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-6 select-text">
      {/* Top Header */}
      <div className="flex items-center justify-between border-b border-cream-300 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold tracking-tight text-stone-900">
              Daily Metal Rates
            </h1>
          </div>
          <p className="mt-1 text-xs text-stone-500">
            Set today's Gold and Silver market rates. Product selling prices are automatically calculated from these rates, product weight, purity, and making charges.
          </p>
        </div>
      </div>

      {/* Current Active Rates Overview Card */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-amber-300 bg-amber-50/70 p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-600 text-white font-bold text-xs shadow-xs">
                Au
              </span>
              <span className="text-xs font-bold uppercase tracking-wider text-amber-900">
                Current Gold Rate
              </span>
            </div>
            {currentRates?.goldRate && (
              <span className="text-[10px] font-mono font-semibold text-amber-700 bg-white/80 border border-amber-200 px-2 py-0.5 rounded-full">
                Effective: {formatDateDisplay(currentRates.goldRate.effectiveDate)}
              </span>
            )}
          </div>
          <div className="mt-3.5 flex items-baseline gap-1.5">
            <span className="font-mono text-3xl font-black text-amber-950">
              {currentRates?.goldRate
                ? `₹${currentRates.goldRate.ratePerGram.toLocaleString()}`
                : 'Not Set'}
            </span>
            <span className="text-xs font-semibold text-amber-800">/ gram (24K basis)</span>
          </div>
        </div>

        <div className="rounded-2xl border border-cream-300 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-stone-700 text-white font-bold text-xs shadow-xs">
                Ag
              </span>
              <span className="text-xs font-bold uppercase tracking-wider text-stone-700">
                Current Silver Rate
              </span>
            </div>
            {currentRates?.silverRate && (
              <span className="text-[10px] font-mono font-semibold text-stone-600 bg-cream-100 border border-cream-300 px-2 py-0.5 rounded-full">
                Effective: {formatDateDisplay(currentRates.silverRate.effectiveDate)}
              </span>
            )}
          </div>
          <div className="mt-3.5 flex items-baseline gap-1.5">
            <span className="font-mono text-3xl font-black text-stone-900">
              {currentRates?.silverRate
                ? `₹${currentRates.silverRate.ratePerGram.toLocaleString()}`
                : 'Not Set'}
            </span>
            <span className="text-xs font-semibold text-stone-500">/ gram (Pure Silver basis)</span>
          </div>
        </div>
      </div>

      {/* Rate Entry Form */}
      <div className="rounded-2xl border border-cream-300 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-bold text-stone-900">Update Daily Market Rates</h2>
        <p className="text-xs text-stone-500 mt-0.5">
          Enter new rates for today or a specific effective date. Previous rates are preserved in history.
        </p>

        <form onSubmit={handleSave} className="mt-5 space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {/* Effective Date */}
            <div>
              <label htmlFor="input-effective-date" className="block text-xs font-semibold text-stone-700">
                Effective Date <span className="text-rose-500">*</span>
              </label>
              <input
                id="input-effective-date"
                type="date"
                required
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-cream-300 bg-cream-50/50 px-3.5 py-2 text-xs text-stone-900 focus:border-amber-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-600/20 font-mono"
              />
            </div>

            {/* Gold Rate */}
            <div>
              <label htmlFor="input-gold-rate" className="block text-xs font-semibold text-amber-900">
                Gold Rate (₹ / gram) <span className="text-rose-500">*</span>
              </label>
              <div className="mt-1.5 relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-stone-400 text-xs font-bold">
                  ₹
                </span>
                <input
                  id="input-gold-rate"
                  type="number"
                  step="any"
                  min="1"
                  required
                  placeholder="e.g. 7250"
                  value={goldRate}
                  onChange={(e) => setGoldRate(e.target.value)}
                  className="w-full rounded-xl border border-cream-300 bg-cream-50/50 pl-7 pr-3.5 py-2 text-xs text-stone-900 placeholder-stone-400 focus:border-amber-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-600/20 font-mono font-bold"
                />
              </div>
            </div>

            {/* Silver Rate */}
            <div>
              <label htmlFor="input-silver-rate" className="block text-xs font-semibold text-stone-700">
                Silver Rate (₹ / gram) <span className="text-rose-500">*</span>
              </label>
              <div className="mt-1.5 relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-stone-400 text-xs font-bold">
                  ₹
                </span>
                <input
                  id="input-silver-rate"
                  type="number"
                  step="any"
                  min="1"
                  required
                  placeholder="e.g. 95"
                  value={silverRate}
                  onChange={(e) => setSilverRate(e.target.value)}
                  className="w-full rounded-xl border border-cream-300 bg-cream-50/50 pl-7 pr-3.5 py-2 text-xs text-stone-900 placeholder-stone-400 focus:border-amber-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-600/20 font-mono font-bold"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              id="btn-save-rates"
              type="submit"
              disabled={saving}
              className="rounded-xl bg-amber-600 hover:bg-amber-500 px-5 py-2.5 text-xs font-bold text-white shadow-sm shadow-amber-600/20 transition disabled:opacity-50"
            >
              {saving ? 'Saving Rates...' : 'Save Rates'}
            </button>
          </div>
        </form>
      </div>

      {/* Historical Rates Section */}
      <div className="rounded-2xl border border-cream-300 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-bold text-stone-900">Rate History</h2>
            <p className="text-xs text-stone-500 mt-0.5">
              Historical record of configured daily rates.
            </p>
          </div>
          <span className="text-xs font-mono font-semibold text-stone-500 bg-cream-100 border border-cream-300 px-2.5 py-0.5 rounded-full">
            {history.length} record{history.length === 1 ? '' : 's'}
          </span>
        </div>

        {loading ? (
          <div className="flex h-32 items-center justify-center text-xs text-stone-500">
            Loading rate records...
          </div>
        ) : history.length === 0 ? (
          <div className="flex h-32 flex-col items-center justify-center text-xs text-stone-500">
            No historical rates found. Use the form above to enter the first rate record.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-cream-200 bg-cream-50/75 uppercase tracking-wider text-stone-600 font-bold text-[11px]">
                <tr>
                  <th className="px-5 py-3">Effective Date</th>
                  <th className="px-5 py-3 text-amber-900">Gold Rate (₹ / gram)</th>
                  <th className="px-5 py-3 text-stone-800">Silver Rate (₹ / gram)</th>
                  <th className="px-5 py-3 text-stone-500">Last Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-200/80 font-mono">
                {history.map((item) => (
                  <tr key={item.effectiveDate} className="hover:bg-cream-50/60 transition">
                    <td className="px-5 py-3 font-bold text-stone-900 font-sans">
                      {formatDateDisplay(item.effectiveDate)}
                    </td>
                    <td className="px-5 py-3 text-amber-800 font-bold">
                      {item.goldRatePerGram !== null ? `₹${item.goldRatePerGram.toLocaleString()}` : '—'}
                    </td>
                    <td className="px-5 py-3 text-stone-800 font-bold">
                      {item.silverRatePerGram !== null ? `₹${item.silverRatePerGram.toLocaleString()}` : '—'}
                    </td>
                    <td className="px-5 py-3 text-stone-500 text-[11px] font-sans">
                      {new Date(item.lastUpdated).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
