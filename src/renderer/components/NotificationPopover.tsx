import React, { useEffect, useRef, useState } from 'react';
import type { OverduePurchaseDto, OverduePurchasesSummary } from '../../shared/types/ipc';

interface NotificationPopoverProps {
  summary: OverduePurchasesSummary;
  loading: boolean;
  onRefresh: () => void;
  onSelectPurchase: (purchaseId: string) => void;
}

export const NotificationPopover: React.FC<NotificationPopoverProps> = ({
  summary,
  loading,
  onRefresh,
  onSelectPurchase,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const hasOverdue = summary.overdueCount > 0;

  return (
    <div className="relative inline-block" ref={dropdownRef}>
      {/* Notification Bell Trigger Button */}
      <button
        id="btn-vendor-notifications"
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`relative flex h-9 w-9 items-center justify-center rounded-xl border transition ${
          hasOverdue
            ? 'border-rose-200 bg-rose-50/70 text-rose-700 hover:bg-rose-100 shadow-2xs'
            : 'border-cream-300 bg-white text-stone-600 hover:bg-cream-100'
        }`}
        title={
          hasOverdue
            ? `${summary.overdueCount} vendor bill(s) pending payment (> 7 days)`
            : 'Vendor Payment Notifications (All Clear)'
        }
      >
        <svg
          className={`h-4.5 w-4.5 ${hasOverdue ? 'text-rose-600' : 'text-stone-500'}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.8}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>

        {/* Counter Badge */}
        {hasOverdue && (
          <span
            id="badge-overdue-count"
            className="absolute -top-1 -right-1 flex h-4.5 min-w-[18px] items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white shadow-xs ring-2 ring-white animate-pulse"
          >
            {summary.overdueCount}
          </span>
        )}
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-96 rounded-2xl border border-cream-300 bg-white shadow-xl shadow-stone-900/10 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-cream-200 bg-cream-50/80 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-rose-100 text-rose-700 text-xs font-bold">
                🔔
              </span>
              <div>
                <h3 className="text-xs font-bold text-stone-900">Vendor Payment Alerts</h3>
                <p className="text-[10px] text-stone-500">Unsettled credit bills &gt; 7 days old</p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={onRefresh}
                disabled={loading}
                className="rounded-lg p-1 text-stone-400 hover:bg-white hover:text-stone-700 transition"
                title="Refresh alerts"
              >
                <svg
                  className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-amber-600' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-lg p-1 text-stone-400 hover:bg-white hover:text-stone-700 transition"
                title="Close"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Overdue Total Banner */}
          {hasOverdue && (
            <div className="flex items-center justify-between bg-rose-50/60 border-b border-rose-100 px-4 py-2">
              <span className="text-[11px] font-semibold text-rose-800">
                {summary.overdueCount} {summary.overdueCount === 1 ? 'Bill Overdue' : 'Bills Overdue'}
              </span>
              <span className="text-[11px] font-bold text-rose-900 font-mono">
                Total Due: ₹{summary.totalOverdueAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
          )}

          {/* Content List */}
          <div className="max-h-80 overflow-y-auto divide-y divide-cream-100 p-1">
            {!hasOverdue ? (
              <div className="flex flex-col items-center justify-center p-8 text-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 mb-2">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-xs font-semibold text-stone-800">All Payments Settled</p>
                <p className="text-[11px] text-stone-500 mt-0.5">
                  No vendor purchases have been pending payment for more than 7 days.
                </p>
              </div>
            ) : (
              summary.items.map((item: OverduePurchaseDto) => (
                <div
                  key={item.id}
                  className="p-3 transition hover:bg-cream-50/80 rounded-xl flex flex-col gap-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-stone-900 truncate">{item.vendorName}</div>
                      <div className="flex items-center gap-1.5 text-[11px] text-stone-500 mt-0.5">
                        <span className="font-mono text-stone-700">Inv: {item.invoiceNumber}</span>
                        <span>•</span>
                        <span>Date: {item.purchaseDate}</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs font-mono font-bold text-rose-700">
                        ₹{item.balanceAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </div>
                      <div className="text-[10px] text-stone-400">Balance Due</div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-cream-100">
                    <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700 border border-rose-200">
                      <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                      {item.daysElapsed} days since bill ({item.daysOverdue === 0 ? '7 days pending' : `${item.daysOverdue} days overdue`})
                    </span>

                    <button
                      type="button"
                      onClick={() => {
                        setIsOpen(false);
                        onSelectPurchase(item.id);
                      }}
                      className="inline-flex items-center gap-1 rounded-lg bg-amber-600 hover:bg-amber-700 px-2.5 py-1 text-[11px] font-bold text-white shadow-2xs transition"
                    >
                      <span>Settle Payment</span>
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
