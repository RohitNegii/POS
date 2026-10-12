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

      setCurrentRates(ratesRes);
      if (ratesRes.goldRate) {
        setGoldRate(String(ratesRes.goldRate.ratePerGram));
      }
      if (ratesRes.silverRate) {
        setSilverRate(String(ratesRes.silverRate.ratePerGram));
      }

      setHistory(histRes);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to load metal rates.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRatesAndHistory();
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

      setCurrentRates(res);
      showSuccess(`Daily rates saved successfully (${effectiveDate}).`);
      const histRes = await ipcClient.getMetalRateHistory();
      setHistory(histRes);
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
    <div className="space-y-6 select-text max-w-6xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-3xl border border-cream-300 bg-white p-6 shadow-xs">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold tracking-tight text-stone-900">
              Daily Metal Rates
            </h1>
            <span className="rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold px-2.5 py-0.5">
              {session.companyName}
            </span>
          </div>
          <p className="mt-1 text-xs text-stone-500">
            Set and track daily Gold and Silver rates for live retail calculations.
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
      <div className="rounded-2xl border border-cream-300 bg-white p-6 shadow-xs">
        <h2 className="text-sm font-bold text-stone-900">Update Daily Market Rates</h2>
        <p className="text-xs text-stone-500 mt-0.5">
          Enter new rates for today or a specific date. Historical rates are preserved automatically.
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

          <div className="flex justify-end pt-2">
            <button
              id="btn-save-metal-rates"
              type="submit"
              disabled={saving}
              className="rounded-xl bg-amber-600 px-5 py-2 text-xs font-bold text-white shadow-sm shadow-amber-600/20 hover:bg-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:ring-offset-2 disabled:opacity-50 cursor-pointer"
            >
              {saving ? 'Saving...' : 'Save Daily Rates'}
            </button>
          </div>
        </form>
      </div>

      {/* Historical Rates Table Card */}
      <div className="overflow-hidden rounded-2xl border border-cream-300 bg-white shadow-xs">
        <div className="border-b border-cream-200 px-6 py-4">
          <h2 className="text-sm font-bold text-stone-900">Historical Rates Archive</h2>
          <p className="text-[11px] text-stone-500">Record of all previous metal rates entered for this company.</p>
        </div>

        {loading ? (
          <div className="p-12 text-center text-xs text-stone-400">Loading historical rates...</div>
        ) : history.length === 0 ? (
          <div className="p-8 text-center text-xs text-stone-400">No historical rates recorded yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-cream-200 bg-cream-50/60 font-semibold text-stone-600">
                  <th className="py-3 px-6">Effective Date</th>
                  <th className="py-3 px-6">Gold Rate (₹/g)</th>
                  <th className="py-3 px-6">Silver Rate (₹/g)</th>
                  <th className="py-3 px-6 text-right">Recorded At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-100">
                {history.map((h) => (
                  <tr key={h.effectiveDate} className="hover:bg-cream-50/40 transition">
                    <td className="py-3 px-6 font-mono font-bold text-stone-900">
                      {formatDateDisplay(h.effectiveDate)}
                    </td>
                    <td className="py-3 px-6 font-mono font-semibold text-amber-900">
                      {h.goldRatePerGram !== null ? `₹${h.goldRatePerGram.toLocaleString()}` : '—'}
                    </td>
                    <td className="py-3 px-6 font-mono font-semibold text-stone-700">
                      {h.silverRatePerGram !== null ? `₹${h.silverRatePerGram.toLocaleString()}` : '—'}
                    </td>
                    <td className="py-3 px-6 text-right text-stone-400 text-[11px]">
                      {new Date(h.lastUpdated).toLocaleDateString()}
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
