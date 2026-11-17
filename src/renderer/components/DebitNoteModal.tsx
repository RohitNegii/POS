import React from 'react';
import { createPortal } from 'react-dom';
import type { AuthSessionPayload, PurchaseReturnDto } from '../../shared/types/ipc';

export interface DebitNoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  returnRecord: PurchaseReturnDto | null;
  session: AuthSessionPayload;
}

export const DebitNoteModal: React.FC<DebitNoteModalProps> = ({
  isOpen,
  onClose,
  returnRecord,
  session,
}) => {
  if (!isOpen || !returnRecord) return null;

  const handlePrint = () => {
    document.body.classList.add('printing-debit-note');
    const cleanup = () => {
      document.body.classList.remove('printing-debit-note');
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    setTimeout(cleanup, 60000);
    window.print();
  };

  const formatRefundType = (t: string) => {
    switch (t) {
      case 'CASH':
        return 'Cash Refund';
      case 'ONLINE':
        return 'Online / Bank Transfer Refund';
      case 'BALANCE_DEDUCTION':
        return 'Deducted from Pending Balance';
      case 'STORE_CREDIT':
        return 'Vendor Store Credit';
      default:
        return t;
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 backdrop-blur-xs p-4 overflow-y-auto print:p-0 print:bg-white">
      <div className="relative w-full max-w-2xl rounded-2xl bg-white shadow-2xl border border-cream-300 print:border-none print:shadow-none flex flex-col my-auto animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Top Bar (Hidden in Print) */}
        <div className="flex items-center justify-between border-b border-cream-200 px-6 py-4 print:hidden">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-100 text-rose-800 font-bold text-sm">
              ↩️
            </span>
            <div>
              <h3 className="text-sm font-bold text-stone-900">
                Debit Note #{returnRecord.returnNumber}
              </h3>
              <p className="text-[11px] text-stone-500">
                Official Vendor Return Voucher & Proof of Inward Stock Rollback
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-1.5 rounded-xl bg-amber-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-amber-500 shadow-2xs transition"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              <span>Print Debit Note</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-cream-300 bg-white p-1.5 text-stone-400 hover:text-stone-700 hover:bg-cream-100 transition"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Printable Debit Note Body */}
        <div className="p-6 space-y-6 text-stone-900">
          {/* Document Header */}
          <div className="flex justify-between items-start border-b border-cream-200 pb-4">
            <div>
              <span className="rounded bg-rose-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-rose-900 border border-rose-300">
                Official Debit Note
              </span>
              <h2 className="text-xl font-black text-stone-900 mt-1">
                {session.companyName || returnRecord.companyName || 'Store Store'}
              </h2>
              <p className="text-xs text-stone-500">Retail & Inventory Management System</p>
            </div>
            <div className="text-right space-y-0.5">
              <div className="text-sm font-black font-mono text-stone-900">
                {returnRecord.returnNumber}
              </div>
              <div className="text-xs text-stone-600">
                <span className="font-semibold">Return Date: </span>
                {returnRecord.returnDate}
              </div>
              <div className="text-xs text-stone-500 font-mono">
                Original Invoice: #{returnRecord.invoiceNumber || '—'}
              </div>
            </div>
          </div>

          {/* Vendor Details & Refund Info Box */}
          <div className="grid grid-cols-2 gap-4 rounded-xl bg-cream-50 p-3.5 border border-cream-200 text-xs">
            <div>
              <span className="text-[10px] font-bold uppercase text-stone-400">Vendor / Supplier</span>
              <div className="font-bold text-stone-900 text-sm mt-0.5">
                {returnRecord.vendorName || 'Vendor'}
              </div>
              <div className="text-stone-500 text-[11px] mt-0.5">
                Original Bill Ref: {returnRecord.purchaseNumber || '—'}
              </div>
            </div>
            <div className="text-right">
              <span className="text-[10px] font-bold uppercase text-stone-400">Refund Settlement</span>
              <div className="font-bold text-emerald-800 text-sm mt-0.5">
                {formatRefundType(returnRecord.refundType)}
              </div>
              <div className="text-stone-600 font-mono text-xs font-bold mt-0.5">
                Amount: ₹{returnRecord.refundAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
            </div>
          </div>

          {/* Returned Items Table */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-2">
              Returned Inventory Products
            </h4>
            <div className="overflow-hidden rounded-xl border border-cream-200">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-cream-100/70 border-b border-cream-200 font-bold text-stone-700">
                    <th className="py-2.5 px-3">#</th>
                    <th className="py-2.5 px-3">Product Name & Barcode</th>
                    <th className="py-2.5 px-3 text-center">Qty Returned</th>
                    <th className="py-2.5 px-3 text-right">Unit Rate</th>
                    <th className="py-2.5 px-3 text-right">Total Debit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cream-100">
                  {returnRecord.items.map((it, idx) => (
                    <tr key={it.id || idx} className="hover:bg-cream-50/50">
                      <td className="py-2.5 px-3 text-stone-400 font-mono">{idx + 1}</td>
                      <td className="py-2.5 px-3">
                        <div className="font-bold text-stone-900">{it.productName}</div>
                        <div className="font-mono text-[10px] text-stone-500">{it.barcode}</div>
                      </td>
                      <td className="py-2.5 px-3 text-center font-bold text-stone-900">
                        {it.quantityReturned}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-stone-700">
                        ₹{it.unitCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold font-mono text-stone-900">
                        ₹{it.totalCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Reason & Grand Total */}
          <div className="flex flex-col sm:flex-row justify-between items-start gap-4 pt-2">
            <div className="flex-1 text-xs">
              <span className="font-bold text-stone-700">Reason for Return:</span>
              <p className="text-stone-600 bg-cream-50 rounded-lg p-2 mt-1 border border-cream-200/80 italic">
                {returnRecord.reason || 'Products returned back to vendor.'}
              </p>
            </div>
            <div className="w-full sm:w-64 rounded-xl bg-rose-50/60 border border-rose-200 p-3 space-y-1.5 text-right">
              <div className="flex justify-between text-xs text-stone-600">
                <span>Total Items Returned:</span>
                <span className="font-bold font-mono">
                  {returnRecord.items.reduce((s, it) => s + it.quantityReturned, 0)} units
                </span>
              </div>
              <div className="flex justify-between text-sm font-black text-rose-950 pt-1 border-t border-rose-200">
                <span>Total Debit Amount:</span>
                <span className="font-mono">
                  ₹{returnRecord.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>

          {/* Signatures */}
          <div className="pt-8 flex justify-between text-xs text-stone-500 border-t border-dashed border-cream-300">
            <div>
              <div className="h-10" />
              <div className="border-t border-stone-400 pt-1 font-semibold text-stone-700">
                Store Manager / Authorized Signature
              </div>
            </div>
            <div>
              <div className="h-10" />
              <div className="border-t border-stone-400 pt-1 font-semibold text-stone-700 text-right">
                Vendor Receiver / Stamp
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
