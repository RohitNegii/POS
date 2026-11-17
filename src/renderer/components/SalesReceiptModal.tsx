import React from 'react';
import { createPortal } from 'react-dom';
import type { AuthSessionPayload, BillDto } from '../../shared/types/ipc';

export interface SalesReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  bill: BillDto | null;
  session: AuthSessionPayload;
  onStartNewSale?: () => void;
}

function isItemPerMeter(it: { categoryName?: string | null; productName?: string | null; detailsJson?: string | null }): boolean {
  if (/meter|fabric|linear|cloth|wire/i.test(it.categoryName || '')) return true;
  if (/per meter|\/meter|\/m/i.test(it.productName || '')) return true;
  if (it.detailsJson && /sellingPricePerMeter|ratePerMeter/i.test(it.detailsJson)) return true;
  return false;
}

// Convert numbers to Indian Rupee Words for formal invoice
function numberToWordsINR(num: number): string {
  const rounded = Math.round(num);
  if (rounded === 0) return 'Zero Rupees Only';

  const units = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'
  ];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function convertTwoDigits(n: number): string {
    if (n === 0) return '';
    if (n < 20) return units[n];
    const unitPart = n % 10 !== 0 ? ` ${units[n % 10]}` : '';
    return `${tens[Math.floor(n / 10)]}${unitPart}`;
  }

  function convertThreeDigits(n: number): string {
    const hundredPart = Math.floor(n / 100);
    const rest = n % 100;
    let res = '';
    if (hundredPart > 0) {
      res += `${units[hundredPart]} Hundred`;
      if (rest > 0) res += ` and ${convertTwoDigits(rest)}`;
    } else {
      res += convertTwoDigits(rest);
    }
    return res;
  }

  let crore = Math.floor(rounded / 10000000);
  let remainder = rounded % 10000000;
  let lakh = Math.floor(remainder / 100000);
  remainder = remainder % 100000;
  let thousand = Math.floor(remainder / 1000);
  remainder = remainder % 1000;

  const parts: string[] = [];
  if (crore > 0) parts.push(`${convertThreeDigits(crore)} Crore`);
  if (lakh > 0) parts.push(`${convertThreeDigits(lakh)} Lakh`);
  if (thousand > 0) parts.push(`${convertThreeDigits(thousand)} Thousand`);
  if (remainder > 0) parts.push(convertThreeDigits(remainder));

  return `${parts.join(' ')} Rupees Only`;
}

export const SalesReceiptModal: React.FC<SalesReceiptModalProps> = ({
  isOpen,
  onClose,
  bill,
  session,
  onStartNewSale,
}) => {
  if (!isOpen || !bill) return null;

  const handlePrint = () => {
    document.body.classList.add('printing-bill');
    document.body.classList.add('print-layout-a4');

    const cleanup = () => {
      document.body.classList.remove('printing-bill');
      document.body.classList.remove('print-layout-a4');
      window.removeEventListener('afterprint', cleanup);
    };

    window.addEventListener('afterprint', cleanup);
    setTimeout(cleanup, 60000);

    window.print();
  };

  const totalQuantity = bill.items.reduce((acc, it) => acc + (it.quantity || 1), 0);
  const totalItemDiscounts = bill.items.reduce((acc, it) => acc + (it.discountAmount || 0), 0);
  const formattedDate = new Date(bill.createdAt).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  const formattedTime = new Date(bill.createdAt).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  const storeName =
    !session.companyName ||
    session.companyName.includes('All Companies') ||
    session.role === 'BILLING_USER'
      ? 'RETAIL STORE POS'
      : session.companyName;

  return createPortal(
    <div
      data-printable-modal="sales-receipt"
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/60 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto print:p-0 print:static print:bg-white print:overflow-visible"
    >
      <div
        className="w-full max-w-4xl rounded-3xl border border-cream-300 bg-white shadow-2xl flex flex-col max-h-[94vh] print:max-h-none print:border-none print:shadow-none print:m-0 print:overflow-visible transition-all duration-200"
      >
        {/* Modal Top Bar (Screen Only) */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-cream-200 bg-cream-50/90 px-5 py-3 rounded-t-3xl shrink-0 print:hidden">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-100 text-amber-800 text-base font-bold shadow-2xs">
              📄
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-black tracking-tight text-stone-900 uppercase">
                  A4 Tax Invoice: <span className="font-mono text-amber-800">{bill.invoiceNumber}</span>
                </h3>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                  ✓ Paid ({bill.paymentMethod})
                </span>
              </div>
              <p className="text-[11px] text-stone-500 mt-0.5">
                {bill.items.length} item(s) • ₹{bill.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })} • Full Page A4 Tax Invoice
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 rounded-xl bg-stone-900 hover:bg-black px-4 py-2 text-xs font-bold text-white shadow-xs transition cursor-pointer"
              title="Print A4 Tax Invoice"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
                />
              </svg>
              <span>Print Invoice</span>
            </button>
            {onStartNewSale && (
              <button
                type="button"
                onClick={onStartNewSale}
                className="rounded-xl bg-amber-600 hover:bg-amber-500 px-3.5 py-2 text-xs font-bold text-white shadow-xs transition cursor-pointer"
              >
                + New Sale
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-cream-300 bg-white px-3.5 py-2 text-xs font-bold text-stone-700 hover:bg-cream-100 shadow-2xs transition cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>

        {/* Scrollable Bill Content Body */}
        <div className="overflow-y-auto flex-1 p-4 sm:p-6 print:p-0 print:overflow-visible bg-stone-100/50 flex justify-center">
          {/* Printable Receipt Container (Always Formal A4 Tax Invoice) */}
          <div
            id="printable-receipt"
            data-layout="a4"
            className="w-full max-w-[210mm] font-sans text-xs p-6 sm:p-8 border border-stone-300 bg-white shadow-sm print:border-none print:shadow-none print:p-0 print:max-w-none text-stone-900 print:text-black space-y-4 print:space-y-3"
          >
            {/* Official Tax Invoice Header */}
            <div className="border-b-2 border-stone-900 pb-3 flex flex-row items-start justify-between gap-4">
              <div className="flex-1">
                <span className="inline-block text-[10px] font-bold uppercase tracking-widest text-amber-900 bg-amber-100/80 px-2 py-0.5 rounded border border-amber-300 font-mono print:border-stone-800 print:bg-stone-100 print:text-black">
                  {bill.status === 'CANCELLED'
                    ? 'VOID / CANCELLED TAX INVOICE'
                    : bill.updatedAt && bill.updatedAt !== bill.createdAt
                    ? 'REVISED RETAIL SALES TAX INVOICE'
                    : 'RETAIL SALES TAX INVOICE'}
                </span>
                <h1 className="text-xl font-black text-stone-950 uppercase mt-1">
                  {storeName}
                </h1>
                <div className="text-xs text-stone-600 mt-0.5 space-y-0.5">
                  <p>
                    Store Code: <strong className="font-mono text-stone-900">{session.companyCode || session.companyId.slice(-6).toUpperCase()}</strong> • POS Billing Terminal
                  </p>
                  <p>Cashier: <strong className="text-stone-900">{bill.billingUserName || session.adminName}</strong></p>
                </div>
              </div>

              {/* Invoice Metadata Box */}
              <div className="text-right border border-stone-300 rounded-xl p-3 bg-stone-50/70 print:bg-white print:border-stone-400 min-w-[200px]">
                <div className="text-[10px] uppercase font-bold text-stone-500">Invoice Number</div>
                <div className="text-base font-black font-mono text-stone-900">{bill.invoiceNumber}</div>
                <div className="text-xs text-stone-600 mt-1">
                  <span>Date: </span>
                  <strong className="text-stone-900 font-mono">{formattedDate}</strong>
                </div>
                <div className="text-xs text-stone-600">
                  <span>Time: </span>
                  <span className="font-mono">{formattedTime}</span>
                </div>
                <div className="mt-1 pt-1 border-t border-stone-200">
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5 text-[10px] font-bold">
                    ✓ PAID ({bill.paymentMethod})
                  </span>
                </div>
              </div>
            </div>

            {/* Parties Section */}
            <div className="grid grid-cols-2 gap-3 text-xs border border-stone-300 rounded-xl overflow-hidden print:border-stone-400">
              {/* Store Info Card */}
              <div className="p-3 bg-stone-50/60 border-r border-stone-300 print:bg-white print:border-stone-400 space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-stone-600 font-mono block border-b border-stone-200 pb-0.5">
                  Billed From (Seller)
                </span>
                <div className="font-bold text-sm text-stone-900">{storeName}</div>
                <div className="text-stone-600 text-[11px]">
                  Authorized Store Terminal
                </div>
                <div className="text-stone-500 text-[10px]">
                  Administrator: {session.adminName} ({session.email})
                </div>
              </div>

              {/* Customer Info Card */}
              <div className="p-3 bg-stone-50/60 print:bg-white space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-stone-600 font-mono block border-b border-stone-200 pb-0.5">
                  Billed To (Customer)
                </span>
                {bill.customerName || bill.customerPhone ? (
                  <>
                    <div className="font-bold text-sm text-stone-900">
                      {bill.customerName || 'Cash Customer'}
                    </div>
                    {bill.customerPhone && (
                      <div className="text-stone-700 text-[11px]">
                        Phone: <strong className="font-mono">{bill.customerPhone}</strong>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-stone-500 italic text-[11px]">
                    Walk-in Cash Customer
                  </div>
                )}
              </div>
            </div>

            {/* Itemized Table */}
            <div className="rounded-xl border border-stone-300 overflow-hidden print:border-stone-400">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-stone-100 text-stone-800 uppercase tracking-wider font-bold text-[11px] border-b-2 border-stone-300 print:bg-stone-200 print:border-stone-800">
                  <tr>
                    <th className="px-3 py-2 text-center w-8 border-r border-stone-300 print:border-stone-400">#</th>
                    <th className="px-3 py-2 min-w-[200px] border-r border-stone-300 print:border-stone-400">
                      Item Description & Barcode
                    </th>
                    <th className="px-3 py-2 w-24 text-center border-r border-stone-300 print:border-stone-400">
                      Qty
                    </th>
                    <th className="px-3 py-2 w-24 text-right border-r border-stone-300 print:border-stone-400">
                      Rate (₹)
                    </th>
                    <th className="px-3 py-2 w-24 text-right border-r border-stone-300 print:border-stone-400">
                      Disc (%)
                    </th>
                    <th className="px-3 py-2 w-28 text-right">Total (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-200 print:divide-stone-300">
                  {bill.items.map((it, idx) => {
                    const isMeter = isItemPerMeter(it);
                    return (
                      <tr key={it.id || idx} className="hover:bg-stone-50/50 print:hover:bg-transparent">
                        <td className="px-3 py-2 text-center text-stone-500 font-mono font-bold border-r border-stone-200 print:border-stone-300">
                          {idx + 1}
                        </td>
                        <td className="px-3 py-2 border-r border-stone-200 print:border-stone-300">
                          <div className="font-bold text-stone-900">{it.productName}</div>
                          <div className="flex items-center gap-2 text-[10px] text-stone-500 mt-0.5">
                            {it.categoryName && (
                              <span className="font-medium text-stone-700">{it.categoryName}</span>
                            )}
                            <span className="font-mono text-stone-700 bg-stone-100 px-1 rounded border border-stone-200 print:border-none print:bg-transparent">
                              {it.barcode}
                            </span>
                            {isMeter && (
                              <span className="text-[9px] font-bold text-cyan-800 bg-cyan-50 border border-cyan-300 px-1 rounded">
                                Meter-Based
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-center font-mono font-bold text-stone-900 border-r border-stone-200 print:border-stone-300">
                          {it.quantity} {isMeter ? 'Meters' : 'Pcs'}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-stone-900 border-r border-stone-200 print:border-stone-300">
                          ₹{it.unitPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          {isMeter && <span className="text-[10px] text-stone-500 font-normal"> / m</span>}
                        </td>
                        <td className="px-3 py-2 text-right font-mono border-r border-stone-200 print:border-stone-300">
                          {it.discountPercentage && it.discountPercentage > 0 ? (
                            <span className="text-emerald-700 font-bold">
                              {it.discountPercentage}% (-₹{(it.discountAmount || 0).toFixed(2)})
                            </span>
                          ) : (
                            <span className="text-stone-400">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-stone-900">
                          ₹{it.totalPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-stone-50 font-bold text-stone-900 border-t-2 border-stone-300 print:bg-stone-100 print:border-stone-800">
                  <tr>
                    <td colSpan={2} className="px-3 py-2 text-right text-stone-600 font-sans border-r border-stone-300 print:border-stone-400">
                      Total Items: {bill.items.length}
                    </td>
                    <td className="px-3 py-2 text-center font-mono border-r border-stone-300 print:border-stone-400">
                      {totalQuantity}
                    </td>
                    <td colSpan={2} className="px-3 py-2 text-right text-stone-600 font-sans border-r border-stone-300 print:border-stone-400">
                      Gross Subtotal:
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      ₹{bill.subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Optional Multi-Company Breakdown */}
            {bill.companyBreakdowns && bill.companyBreakdowns.length > 1 && (
              <div className="rounded-xl border border-stone-200 bg-stone-50/50 p-3 text-xs">
                <span className="font-bold text-stone-700 block text-[11px] mb-1">
                  Company Ledger Breakdown:
                </span>
                <div className="grid grid-cols-2 gap-2">
                  {bill.companyBreakdowns.map((cb) => (
                    <div key={cb.companyId} className="flex justify-between border-b border-stone-200 py-0.5">
                      <span className="text-stone-600">{cb.companyName}:</span>
                      <span className="font-mono font-bold text-stone-800">
                        {cb.itemCount} items ({cb.totalQuantity} units) • ₹{cb.subtotal.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Financial Totals Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start pt-1">
              {/* Left Column: notes & words */}
              <div className="space-y-3">
                {bill.notes && (
                  <div className="rounded-xl border border-stone-200 p-3 text-xs text-stone-700 bg-stone-50/40">
                    <span className="font-bold block text-stone-800 text-[11px] mb-0.5">Remarks / Notes:</span>
                    <p>{bill.notes}</p>
                  </div>
                )}

                {/* Amount in words */}
                <div className="rounded-xl border border-stone-200 p-3 bg-stone-50/50 print:bg-white text-xs">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500 block">
                    Amount in Words:
                  </span>
                  <strong className="text-stone-900 font-serif italic text-xs">
                    {numberToWordsINR(bill.totalAmount)}
                  </strong>
                </div>
              </div>

              {/* Right Column: Financial Calculations Card */}
              <div className="rounded-xl border border-stone-300 bg-stone-50/60 p-4 print:bg-white print:border-stone-400 space-y-2 text-xs font-mono">
                <div className="flex justify-between text-stone-700">
                  <span className="font-sans">Gross Subtotal:</span>
                  <span>₹{bill.subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>

                {totalItemDiscounts > 0 && (
                  <div className="flex justify-between text-emerald-800">
                    <span className="font-sans">Total Item Discounts:</span>
                    <span>- ₹{totalItemDiscounts.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                )}

                {bill.discount > 0 && (
                  <div className="flex justify-between text-emerald-800 font-semibold">
                    <span className="font-sans">
                      Bill Discount {bill.discountPercentage ? `(${bill.discountPercentage}%)` : ''}:
                    </span>
                    <span>- ₹{bill.discount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                )}

                {bill.tax > 0 && (
                  <div className="flex justify-between text-stone-700">
                    <span className="font-sans">
                      Taxes / GST {bill.taxPercentage ? `(${bill.taxPercentage}%)` : ''}:
                    </span>
                    <span>+ ₹{bill.tax.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                )}

                <div className="border-t-2 border-stone-800 pt-2 flex justify-between text-base font-black text-stone-900">
                  <span className="font-sans uppercase">Grand Total:</span>
                  <span className="text-amber-900 print:text-black">
                    ₹{bill.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>

                <div className="flex justify-between text-stone-700 pt-1 text-xs border-t border-stone-200">
                  <span className="font-sans">Payment Mode:</span>
                  <span className="font-bold text-emerald-800 uppercase">
                    {bill.paymentMethod} (PAID IN FULL)
                  </span>
                </div>
              </div>
            </div>

            {/* Terms & Declarations and Signatures */}
            <div className="pt-4 border-t border-stone-300 grid grid-cols-1 sm:grid-cols-2 gap-6 items-end text-xs print:pt-6">
              <div className="space-y-1 text-stone-600 text-[10px] leading-relaxed">
                <strong className="text-stone-800 block text-[11px]">Terms & Conditions:</strong>
                <p>1. Goods once sold can be exchanged within 7 days in original condition with this invoice.</p>
                <p>2. Subject to local jurisdiction only.</p>
                <p className="font-mono text-stone-400 pt-1">This is a computer-generated tax invoice.</p>
              </div>
              <div className="grid grid-cols-2 gap-4 text-center">
                <div className="border-t border-stone-400 pt-2">
                  <span className="font-bold text-stone-800 block text-[11px]">Customer Signature</span>
                  <span className="text-[10px] text-stone-500 block">Thank you!</span>
                </div>
                <div className="border-t border-stone-400 pt-2">
                  <span className="font-bold text-stone-800 block text-[11px]">For {storeName}</span>
                  <span className="text-[10px] text-stone-500 block">Authorized Signatory</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
