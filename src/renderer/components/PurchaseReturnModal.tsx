import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import type {
  AuthSessionPayload,
  CreatePurchaseReturnItemInput,
  PurchaseDto,
  PurchaseReturnDto,
  PurchaseReturnRefundType,
} from '../../shared/types/ipc';
import { useToast } from '../context/ToastContext';
import { ipcClient } from '../services/ipcClient';

export interface PurchaseReturnModalProps {
  isOpen: boolean;
  onClose: () => void;
  purchase: PurchaseDto | null;
  session: AuthSessionPayload;
  onSuccess: (returnDto: PurchaseReturnDto) => void;
}

export const PurchaseReturnModal: React.FC<PurchaseReturnModalProps> = ({
  isOpen,
  onClose,
  purchase,
  onSuccess,
}) => {
  const { showError, showSuccess } = useToast();

  const [returnQtys, setReturnQtys] = useState<Record<string, number>>({});
  const [refundType, setRefundType] = useState<PurchaseReturnRefundType>('CASH');
  const [customRefundAmount, setCustomRefundAmount] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [autoArchiveZeroStock, setAutoArchiveZeroStock] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);

  if (!isOpen || !purchase) return null;

  const handleQtyChange = (itemId: string, maxLimit: number, valStr: string) => {
    const val = parseFloat(valStr);
    if (isNaN(val) || val < 0) {
      setReturnQtys((prev) => ({ ...prev, [itemId]: 0 }));
      return;
    }
    const clamped = Math.min(val, maxLimit);
    setReturnQtys((prev) => ({ ...prev, [itemId]: clamped }));
  };

  // Compute calculated return debit value
  let totalDebitAmount = 0;
  let totalUnitsToReturn = 0;
  const itemsToSubmit: CreatePurchaseReturnItemInput[] = [];

  for (const it of purchase.items) {
    const qty = returnQtys[it.id] || 0;
    if (qty > 0) {
      const lineCost = Math.round(qty * it.unitCost * 100) / 100;
      totalDebitAmount += lineCost;
      totalUnitsToReturn += qty;
      itemsToSubmit.push({
        purchaseItemId: it.id,
        productId: it.productId,
        productName: it.productName,
        barcode: it.barcode,
        quantityReturned: qty,
        unitCost: it.unitCost,
      });
    }
  }
  totalDebitAmount = Math.round(totalDebitAmount * 100) / 100;

  const effectiveRefundAmount =
    customRefundAmount.trim() !== '' ? parseFloat(customRefundAmount) || 0 : totalDebitAmount;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (itemsToSubmit.length === 0) {
      showError('Please specify at least one product quantity to return to the vendor.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await ipcClient.createPurchaseReturn({
        purchaseId: purchase.id,
        refundType,
        refundAmount: effectiveRefundAmount,
        reason: reason.trim() || undefined,
        autoArchiveZeroStock,
        items: itemsToSubmit,
      });

      if (res.success) {
        showSuccess(
          `Purchase Return #${res.data.returnNumber} processed successfully. Stock inventory has been deducted.`
        );
        onSuccess(res.data);
      } else {
        showError(res.error || 'Failed to process purchase return.');
      }
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Error processing purchase return.');
    } finally {
      setSubmitting(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="relative w-full max-w-3xl rounded-2xl bg-white shadow-2xl border border-cream-300 flex flex-col my-auto max-h-[92vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-cream-200 px-6 py-4 bg-cream-50/50">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-100 text-rose-800 font-bold text-base shadow-2xs">
              ↩️
            </span>
            <div>
              <h3 className="text-sm font-bold text-stone-900">
                Return Purchased Products to Vendor
              </h3>
              <p className="text-[11px] text-stone-500 font-mono">
                Bill Ref: {purchase.invoiceNumber} • Vendor: {purchase.vendorName}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-cream-300 bg-white p-1.5 text-stone-400 hover:text-stone-700 hover:bg-cream-100 transition shadow-2xs"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5 text-xs">
          {/* Purchase Summary Chips */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-xl bg-cream-50 p-3.5 border border-cream-200">
            <div>
              <span className="text-[10px] font-bold uppercase text-stone-400">Purchase Date</span>
              <div className="font-bold text-stone-800 mt-0.5">{purchase.purchaseDate}</div>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase text-stone-400">Total Bought</span>
              <div className="font-bold text-stone-800 mt-0.5">{purchase.totalUnitsBought} units</div>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase text-stone-400">Total Paid</span>
              <div className="font-bold text-emerald-800 font-mono mt-0.5">
                ₹{purchase.paidAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase text-stone-400">Pending Balance</span>
              <div className="font-bold font-mono mt-0.5 text-stone-800">
                ₹{purchase.balanceAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
            </div>
          </div>

          {/* Items Return Table */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-bold text-stone-900 uppercase tracking-wider text-[11px]">
                Select Products to Return
              </h4>
              <span className="text-[11px] text-stone-500 font-medium">
                Max returnable = Unreturned units currently in stock
              </span>
            </div>

            <div className="overflow-hidden rounded-xl border border-cream-300">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-cream-100/70 border-b border-cream-200 font-bold text-stone-700 text-[11px]">
                    <th className="py-2.5 px-3">Product & Barcode</th>
                    <th className="py-2.5 px-3 text-center">Bought</th>
                    <th className="py-2.5 px-3 text-center">Already Returned</th>
                    <th className="py-2.5 px-3 text-center">Current Stock</th>
                    <th className="py-2.5 px-3 text-right">Unit Rate</th>
                    <th className="py-2.5 px-3 text-center w-28">Return Qty</th>
                    <th className="py-2.5 px-3 text-right">Refund Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cream-100">
                  {purchase.items.map((it) => {
                    const alreadyRet = it.quantityReturned || 0;
                    const unreturnedBought = Math.max(0, it.quantityBought - alreadyRet);
                    const maxReturnable = Math.min(unreturnedBought, it.currentStock);
                    const currentReturnQty = returnQtys[it.id] || 0;
                    const lineTotal = Math.round(currentReturnQty * it.unitCost * 100) / 100;

                    return (
                      <tr key={it.id} className="hover:bg-cream-50/60">
                        <td className="py-2.5 px-3">
                          <div className="font-bold text-stone-900">{it.productName}</div>
                          <div className="font-mono text-[10px] text-stone-500">{it.barcode}</div>
                        </td>
                        <td className="py-2.5 px-3 text-center font-bold text-stone-700">
                          {it.quantityBought}
                        </td>
                        <td className="py-2.5 px-3 text-center font-semibold text-rose-700">
                          {alreadyRet > 0 ? `${alreadyRet} ret` : '0'}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                              it.currentStock > 0
                                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                : 'bg-stone-100 text-stone-500 border border-stone-200'
                            }`}
                          >
                            {it.currentStock} in stock
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-stone-700">
                          ₹{it.unitCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {maxReturnable > 0 ? (
                            <div className="flex items-center justify-center gap-1">
                              <input
                                type="number"
                                min={0}
                                max={maxReturnable}
                                step={1}
                                value={currentReturnQty || ''}
                                placeholder="0"
                                onChange={(e) => handleQtyChange(it.id, maxReturnable, e.target.value)}
                                className="w-16 rounded-lg border border-cream-300 bg-white py-1 px-2 text-center font-bold text-stone-900 focus:border-amber-600 focus:outline-none shadow-2xs"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  setReturnQtys((prev) => ({ ...prev, [it.id]: maxReturnable }))
                                }
                                title="Return all available stock"
                                className="rounded bg-cream-200 hover:bg-cream-300 px-1.5 py-1 text-[10px] font-bold text-stone-700 transition"
                              >
                                Max
                              </button>
                            </div>
                          ) : (
                            <span className="text-[10px] text-stone-400 font-medium italic">
                              Cannot return
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold font-mono text-stone-900">
                          ₹{lineTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Refund Options & Settlement */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-xl bg-rose-50/40 p-4 border border-rose-200">
            <div>
              <label className="block font-bold text-stone-800 mb-1">
                Vendor Refund Settlement Mode:
              </label>
              <select
                value={refundType}
                onChange={(e) => setRefundType(e.target.value as PurchaseReturnRefundType)}
                className="w-full rounded-xl border border-cream-300 bg-white py-2 px-3 font-semibold text-stone-800 focus:border-amber-600 focus:outline-none shadow-2xs"
              >
                <option value="CASH">💵 Cash Refund (Added back into Cash Drawer)</option>
                <option value="ONLINE">📱 Online / Bank Transfer Refund</option>
                <option value="BALANCE_DEDUCTION">
                  ⚖️ Deduct from Pending Vendor Balance (Outstanding: ₹
                  {purchase.balanceAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })})
                </option>
                <option value="STORE_CREDIT">🏷️ Vendor Store Credit / Ledger Advance</option>
              </select>
              <p className="text-[10px] text-stone-500 mt-1">
                {refundType === 'CASH' && 'Reflects as immediate cash inflow back into your cash drawer.'}
                {refundType === 'ONLINE' && 'Reflects as digital bank refund.'}
                {refundType === 'BALANCE_DEDUCTION' &&
                  'Directly reduces what you owe the vendor on this bill.'}
                {refundType === 'STORE_CREDIT' && 'Maintains credit balance on vendor account.'}
              </p>
            </div>

            <div>
              <label className="block font-bold text-stone-800 mb-1">
                Refund Amount (₹):
              </label>
              <input
                type="number"
                min={0}
                step={0.01}
                value={customRefundAmount !== '' ? customRefundAmount : totalDebitAmount}
                onChange={(e) => setCustomRefundAmount(e.target.value)}
                placeholder={String(totalDebitAmount)}
                className="w-full rounded-xl border border-cream-300 bg-white py-2 px-3 font-mono font-bold text-stone-900 focus:border-amber-600 focus:outline-none shadow-2xs"
              />
              <span className="text-[10px] text-stone-500 mt-1 block">
                Calculated goods value: ₹{totalDebitAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {/* Reason & Options */}
          <div className="space-y-3">
            <div>
              <label className="block font-bold text-stone-800 mb-1">
                Reason for Return:
              </label>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Defective metal casting, excess stock, exchange with vendor..."
                className="w-full rounded-xl border border-cream-300 bg-white py-2 px-3 text-xs text-stone-900 placeholder-stone-400 focus:border-amber-600 focus:outline-none shadow-2xs"
              />
            </div>

            <label className="flex items-center gap-2 cursor-pointer bg-cream-50 p-2.5 rounded-xl border border-cream-200">
              <input
                type="checkbox"
                checked={autoArchiveZeroStock}
                onChange={(e) => setAutoArchiveZeroStock(e.target.checked)}
                className="h-4 w-4 rounded border-cream-300 text-amber-600 focus:ring-amber-500"
              />
              <span className="text-stone-700 font-medium">
                If the entire product stock is returned (drops to 0), automatically archive product from active catalog
              </span>
            </label>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-between border-t border-cream-200 pt-4">
            <div className="text-xs">
              <span className="text-stone-500">Returning: </span>
              <span className="font-bold text-stone-900 font-mono">
                {totalUnitsToReturn} units (₹{totalDebitAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })})
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-cream-300 bg-white px-4 py-2 text-xs font-semibold text-stone-700 hover:bg-cream-100 shadow-2xs transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || totalUnitsToReturn === 0}
                className="flex items-center gap-1.5 rounded-xl bg-rose-600 px-5 py-2 text-xs font-bold text-white hover:bg-rose-500 shadow-2xs transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? 'Processing Return...' : 'Confirm Return & Deduct Stock'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};
