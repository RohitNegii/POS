import React, { useEffect, useState } from 'react';
import type { AuthSessionPayload, BillDto } from '../../shared/types/ipc';
import { useToast } from '../context/ToastContext';
import { ipcClient } from '../services/ipcClient';

interface BillsHistoryPageProps {
  session: AuthSessionPayload;
  onNavigateToBilling?: () => void;
}

export const BillsHistoryPage: React.FC<BillsHistoryPageProps> = ({ session: _session, onNavigateToBilling }) => {
  const { showError } = useToast();
  const [bills, setBills] = useState<BillDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedBill, setSelectedBill] = useState<BillDto | null>(null);

  const fetchBills = async (searchTerm = '') => {
    setLoading(true);
    try {
      const res = await ipcClient.listBills({ search: searchTerm });
      if (res.success) {
        setBills(res.data);
      } else {
        showError(res.error || 'Failed to load invoices.');
      }
    } catch {
      showError('Error fetching bills history.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchBills();
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void fetchBills(search);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="flex h-full flex-col gap-6">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-cream-300 bg-white p-5 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-stone-900">Bills & Invoices Archive</h2>
            <span className="rounded-full bg-cream-100 px-2.5 py-0.5 text-xs font-semibold text-stone-600 border border-cream-300">
              {bills.length} total invoices
            </span>
          </div>
          <p className="text-xs text-stone-500">
            View, search, and reprint customer receipts generated across both Company A & Company B
          </p>
        </div>

        {onNavigateToBilling && (
          <button
            type="button"
            onClick={onNavigateToBilling}
            className="flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-amber-600/20 hover:bg-amber-500 transition"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17" />
            </svg>
            <span>Back to POS Terminal</span>
          </button>
        )}
      </div>

      {/* Search Input */}
      <form onSubmit={handleSearchSubmit} className="flex gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by invoice number, customer name, mobile, or cashier..."
          className="flex-1 rounded-xl border border-cream-300 bg-white px-4 py-2.5 text-xs text-stone-900 placeholder-stone-400 focus:border-amber-600 focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-xl bg-stone-800 px-5 py-2.5 text-xs font-bold text-white hover:bg-stone-700 transition"
        >
          Search
        </button>
        {search && (
          <button
            type="button"
            onClick={() => {
              setSearch('');
              void fetchBills('');
            }}
            className="rounded-xl border border-cream-300 bg-white px-4 py-2.5 text-xs font-semibold text-stone-600 hover:bg-cream-100"
          >
            Clear
          </button>
        )}
      </form>

      {/* Invoices List */}
      <div className="flex-1 overflow-hidden rounded-2xl border border-cream-300 bg-white shadow-sm flex flex-col">
        {loading ? (
          <div className="flex flex-1 items-center justify-center py-16 text-stone-500 text-xs">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-amber-600 border-t-transparent mr-2" />
            Loading invoices...
          </div>
        ) : bills.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center py-16 text-center text-stone-500 text-xs">
            <svg className="h-10 w-10 text-stone-300 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="font-semibold text-stone-700">No invoices found</p>
            <p className="text-stone-400 mt-0.5">Bills completed in the POS terminal will appear here.</p>
          </div>
        ) : (
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-cream-200 bg-cream-50/70 text-[11px] font-bold uppercase tracking-wider text-stone-600">
                  <th className="py-3 px-4">Invoice #</th>
                  <th className="py-3 px-4">Date & Time</th>
                  <th className="py-3 px-4">Cashier</th>
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">Company Breakdown</th>
                  <th className="py-3 px-4 text-right">Discount</th>
                  <th className="py-3 px-4 text-right">Grand Total</th>
                  <th className="py-3 px-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-100">
                {bills.map((bill) => (
                  <tr key={bill.id} className="hover:bg-cream-50/50 transition">
                    <td className="py-3.5 px-4 font-mono font-bold text-stone-900">
                      {bill.invoiceNumber}
                    </td>

                    <td className="py-3.5 px-4 text-stone-600">
                      {new Date(bill.createdAt).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>

                    <td className="py-3.5 px-4 text-stone-700 font-medium">
                      {bill.billingUserName}
                    </td>

                    <td className="py-3.5 px-4 text-stone-700">
                      {bill.customerName ? (
                        <div>
                          <div className="font-medium text-stone-900">{bill.customerName}</div>
                          {bill.customerPhone && (
                            <div className="text-[11px] text-stone-500 font-mono">{bill.customerPhone}</div>
                          )}
                        </div>
                      ) : (
                        <span className="text-stone-400 italic">Walk-in Customer</span>
                      )}
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="flex flex-wrap gap-1.5">
                        {bill.companyBreakdowns?.map((cb) => {
                          const isA = cb.companyName.includes('Company A');
                          return (
                            <span
                              key={cb.companyId}
                              className={`rounded-md px-2 py-0.5 text-[10px] font-bold border ${
                                isA
                                  ? 'bg-amber-50 text-amber-900 border-amber-300'
                                  : 'bg-indigo-50 text-indigo-900 border-indigo-300'
                              }`}
                            >
                              {cb.companyName}: ₹{cb.subtotal.toLocaleString()} ({cb.itemCount})
                            </span>
                          );
                        })}
                      </div>
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      {bill.discount > 0 ? (
                        <div className="text-emerald-700 font-semibold">
                          <div>-₹{bill.discount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                          {bill.discountPercentage ? (
                            <div className="text-[10px] text-emerald-600 font-bold">({bill.discountPercentage}%)</div>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-stone-400">0%</span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <div className="text-sm font-bold text-stone-900">
                        ₹{bill.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                      <div className="text-[10px] font-bold text-stone-500 uppercase">
                        {bill.paymentMethod}
                      </div>
                    </td>

                    <td className="py-3.5 px-4 text-center">
                      <button
                        type="button"
                        onClick={() => setSelectedBill(bill)}
                        className="rounded-lg border border-cream-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-cream-100 shadow-2xs transition"
                      >
                        View Receipt
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Bill Receipt Modal */}
      {selectedBill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-3xl border border-cream-300 bg-white p-6 shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between pb-3 border-b border-cream-200 print:hidden">
              <span className="text-xs font-bold text-stone-700">Receipt Details</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePrint}
                  className="rounded-xl border border-cream-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-cream-100 shadow-2xs transition flex items-center gap-1"
                >
                  <svg className="h-4 w-4 text-stone-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  <span>Print Receipt</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedBill(null)}
                  className="rounded-xl border border-cream-300 bg-white px-3.5 py-1.5 text-xs font-bold text-stone-700 hover:bg-cream-100 shadow-2xs transition"
                >
                  Close
                </button>
              </div>
            </div>

            {/* Printable Receipt Body */}
            <div id="printable-receipt" className="overflow-y-auto p-4 space-y-4 font-mono text-xs text-stone-850">
              <div className="text-center border-b border-dashed border-stone-300 pb-3">
                <h2 className="text-lg font-black tracking-tight font-sans text-stone-900">
                  RETAIL STORE POS
                </h2>
                <p className="text-[11px] text-stone-500 font-sans">
                  Unified Multi-Company Retail Counter
                </p>
                <div className="mt-2 text-[10px] text-stone-600">
                  <span>Invoice #: </span>
                  <span className="font-bold text-stone-900">{selectedBill.invoiceNumber}</span>
                </div>
                <div className="text-[10px] text-stone-500">
                  {new Date(selectedBill.createdAt).toLocaleString()} • Cashier: {selectedBill.billingUserName}
                </div>
              </div>

              {(selectedBill.customerName || selectedBill.customerPhone) && (
                <div className="text-[11px] border-b border-dashed border-stone-300 pb-2 font-sans">
                  {selectedBill.customerName && (
                    <div><span className="text-stone-500">Customer:</span> <span className="font-bold">{selectedBill.customerName}</span></div>
                  )}
                  {selectedBill.customerPhone && (
                    <div><span className="text-stone-500">Phone:</span> {selectedBill.customerPhone}</div>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <div className="flex justify-between font-bold text-[10px] uppercase border-b border-stone-200 pb-1 text-stone-600">
                  <span>Item / Company</span>
                  <span>Qty x Rate</span>
                  <span>Amount</span>
                </div>

                {selectedBill.items.map((it) => (
                  <div key={it.id} className="border-b border-stone-100 pb-1.5">
                    <div className="flex justify-between font-bold text-stone-900">
                      <span>{it.productName}</span>
                      <span>₹{it.totalPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between text-[10px] text-stone-500">
                      <span>
                        [{it.companyName}] {it.barcode}
                        {it.discountPercentage && it.discountPercentage > 0 ? (
                          <span className="text-emerald-700 font-bold ml-1">
                            (Orig: ₹{it.unitPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} -{it.discountPercentage}%)
                          </span>
                        ) : null}
                      </span>
                      <span>
                        {it.quantity} x ₹{(it.netUnitPrice ?? it.unitPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {selectedBill.companyBreakdowns && selectedBill.companyBreakdowns.length > 0 && (
                <div className="rounded-lg bg-stone-50 p-2.5 space-y-1 text-[11px] font-sans border border-stone-200">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-stone-500">
                    Company Breakdown:
                  </div>
                  {selectedBill.companyBreakdowns.map((cb) => (
                    <div key={cb.companyId} className="flex justify-between text-stone-700">
                      <span>• {cb.companyName} ({cb.itemCount} items):</span>
                      <span className="font-semibold">₹{cb.subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="border-t border-dashed border-stone-300 pt-2 space-y-1 text-xs">
                <div className="flex justify-between text-stone-600">
                  <span>Gross Subtotal:</span>
                  <span>₹{selectedBill.subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                {selectedBill.discount > 0 && (
                  <div className="flex justify-between text-emerald-700 font-semibold">
                    <span>
                      Discount {selectedBill.discountPercentage ? `(${selectedBill.discountPercentage}%)` : ''}:
                    </span>
                    <span>-₹{selectedBill.discount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                )}
                {selectedBill.tax > 0 && (
                  <div className="flex justify-between text-stone-600">
                    <span>Tax / GST:</span>
                    <span>+₹{selectedBill.tax.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                )}
                <div className="flex justify-between border-t-2 border-stone-900 pt-1 text-base font-black text-stone-900">
                  <span>Grand Total:</span>
                  <span>₹{selectedBill.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between text-[11px] text-stone-600 pt-1">
                  <span>Payment Mode:</span>
                  <span className="font-bold">{selectedBill.paymentMethod} (PAID)</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
