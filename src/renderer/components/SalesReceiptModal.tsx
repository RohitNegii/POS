import React, { useState } from 'react';
import type { AuthSessionPayload, BillDto } from '../../shared/types/ipc';

export interface SalesReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  bill: BillDto | null;
  session: AuthSessionPayload;
  onStartNewSale?: () => void;
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
  const [printLayout, setPrintLayout] = useState<'thermal' | 'a4'>('thermal');

  if (!isOpen || !bill) return null;

  const handlePrint = () => {
    document.body.classList.add('printing-receipt');
    if (printLayout === 'thermal') {
      document.body.classList.add('print-layout-thermal');
      document.body.classList.remove('print-layout-a4');
    } else {
      document.body.classList.add('print-layout-a4');
      document.body.classList.remove('print-layout-thermal');
    }

    window.print();

    setTimeout(() => {
      document.body.classList.remove('printing-receipt');
      document.body.classList.remove('print-layout-thermal');
      document.body.classList.remove('print-layout-a4');
    }, 1000);
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/60 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto print:p-0 print:static print:bg-white print:overflow-visible">
      <div
        className={`w-full ${
          printLayout === 'thermal' ? 'max-w-md' : 'max-w-4xl'
        } rounded-3xl border border-cream-300 bg-white shadow-2xl flex flex-col max-h-[94vh] print:max-h-none print:border-none print:shadow-none print:m-0 print:overflow-visible transition-all duration-200`}
      >
        {/* Modal Top Bar (Screen Only) */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-cream-200 bg-cream-50/90 px-5 py-3 rounded-t-3xl shrink-0 print:hidden">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 text-sm font-bold">
              ✓
            </span>
            <div>
              <h3 className="text-xs font-bold text-stone-900">
                Sales Bill: <span className="font-mono text-amber-800">{bill.invoiceNumber}</span>
              </h3>
              <p className="text-[11px] text-stone-500">
                {bill.items.length} item(s) • ₹{bill.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>

          {/* Format Selector Tabs */}
          <div className="flex items-center gap-1.5 bg-white p-1 rounded-xl border border-cream-300 shadow-2xs">
            <button
              type="button"
              onClick={() => setPrintLayout('thermal')}
              className={`px-2.5 py-1 text-xs font-bold rounded-lg transition ${
                printLayout === 'thermal'
                  ? 'bg-amber-600 text-white shadow-2xs'
                  : 'text-stone-600 hover:text-stone-900 hover:bg-cream-100'
              }`}
              title="Standard POS Roll Printer Format (80mm)"
            >
              🧾 Thermal (80mm)
            </button>
            <button
              type="button"
              onClick={() => setPrintLayout('a4')}
              className={`px-2.5 py-1 text-xs font-bold rounded-lg transition ${
                printLayout === 'a4'
                  ? 'bg-amber-600 text-white shadow-2xs'
                  : 'text-stone-600 hover:text-stone-900 hover:bg-cream-100'
              }`}
              title="Full Page Standard Tax Invoice Format (A4 / Letter)"
            >
              📄 A4 Tax Invoice
            </button>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 rounded-xl bg-stone-900 hover:bg-black px-3.5 py-1.5 text-xs font-bold text-white shadow-xs transition"
              title="Send to Printer"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
                />
              </svg>
              <span>Print Bill</span>
            </button>
            {onStartNewSale && (
              <button
                type="button"
                onClick={onStartNewSale}
                className="rounded-xl bg-amber-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-amber-500 shadow-xs transition"
              >
                + New Sale
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-cream-300 bg-white px-3 py-1.5 text-xs font-bold text-stone-700 hover:bg-cream-100 shadow-2xs transition"
            >
              Close
            </button>
          </div>
        </div>

        {/* Scrollable Bill Content Body */}
        <div className="overflow-y-auto flex-1 p-4 sm:p-6 print:p-0 print:overflow-visible bg-stone-100/50 flex justify-center">
          {/* Printable Receipt Container */}
          <div
            id="printable-receipt"
            className={`${
              printLayout === 'thermal'
                ? 'w-full max-w-[80mm] font-mono text-[11px] p-3 border border-stone-300 bg-white shadow-sm'
                : 'w-full max-w-[210mm] font-sans text-xs p-6 border border-stone-300 bg-white shadow-sm'
            } print:border-none print:shadow-none print:p-0 print:max-w-none text-stone-900 print:text-black`}
          >
            {/* ========================================================= */}
            {/* 1. THERMAL 80MM LAYOUT */}
            {/* ========================================================= */}
            {printLayout === 'thermal' ? (
              <div className="space-y-3 leading-tight">
                {/* Store Header */}
                <div className="text-center pb-2 border-b-2 border-dashed border-stone-400">
                  <h1 className="text-sm font-black tracking-tight font-sans text-stone-950 uppercase">
                    {session.companyName || 'RETAIL STORE POS'}
                  </h1>
                  <p className="text-[10px] text-stone-600 font-sans mt-0.5">
                    Retail Sales Tax Invoice / Cash Memo
                  </p>
                  <p className="text-[9px] text-stone-500 font-mono">
                    Store Code: {session.companyCode || session.companyId.slice(-6).toUpperCase()}
                  </p>
                </div>

                {/* Bill Metadata */}
                <div className="text-[10px] space-y-0.5 border-b border-dashed border-stone-300 pb-2">
                  <div className="flex justify-between">
                    <span className="text-stone-500">Invoice No:</span>
                    <strong className="font-bold font-mono text-stone-900">{bill.invoiceNumber}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-stone-500">Date & Time:</span>
                    <span>
                      {formattedDate} {formattedTime}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-stone-500">Cashier:</span>
                    <span>{bill.billingUserName || session.adminName}</span>
                  </div>
                </div>

                {/* Customer Information (if available) */}
                {(bill.customerName || bill.customerPhone) && (
                  <div className="text-[10px] bg-stone-50 p-1.5 rounded border border-dashed border-stone-300 space-y-0.5">
                    {bill.customerName && (
                      <div className="flex justify-between">
                        <span className="text-stone-500">Customer:</span>
                        <strong className="text-stone-900">{bill.customerName}</strong>
                      </div>
                    )}
                    {bill.customerPhone && (
                      <div className="flex justify-between">
                        <span className="text-stone-500">Phone:</span>
                        <span className="font-mono">{bill.customerPhone}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Itemized Table */}
                <div className="border-b-2 border-dashed border-stone-400 pb-2">
                  <table className="w-full text-[10px] border-collapse">
                    <thead>
                      <tr className="border-b border-stone-400 text-stone-700 font-bold uppercase text-[9px]">
                        <th className="text-left pb-1 w-[44%]">Item</th>
                        <th className="text-center pb-1 w-[14%]">Qty</th>
                        <th className="text-right pb-1 w-[20%]">Rate</th>
                        <th className="text-right pb-1 w-[22%]">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-dotted divide-stone-200">
                      {bill.items.map((it, idx) => (
                        <tr key={it.id || idx} className="align-top">
                          <td className="py-1 pr-1">
                            <div className="font-bold text-stone-950 leading-snug">{it.productName}</div>
                            <div className="text-[9px] text-stone-500 font-sans">
                              [{it.companyName}] {it.barcode}
                            </div>
                            {it.discountPercentage && it.discountPercentage > 0 ? (
                              <div className="text-[9px] text-emerald-800 font-semibold">
                                Disc: {it.discountPercentage}% off (₹{it.unitPrice})
                              </div>
                            ) : null}
                          </td>
                          <td className="py-1 text-center font-bold">{it.quantity}</td>
                          <td className="py-1 text-right font-mono">
                            ₹{(it.netUnitPrice ?? it.unitPrice).toFixed(2)}
                          </td>
                          <td className="py-1 text-right font-bold font-mono">
                            ₹{it.totalPrice.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Multi-Company Breakdown (if present) */}
                {bill.companyBreakdowns && bill.companyBreakdowns.length > 0 && (
                  <div className="rounded border border-stone-200 bg-stone-50 p-1.5 space-y-1 text-[9px] font-sans">
                    <div className="font-bold text-stone-600 uppercase tracking-wider">
                      Company Summary:
                    </div>
                    {bill.companyBreakdowns.map((cb) => (
                      <div key={cb.companyId} className="flex justify-between text-stone-800">
                        <span>• {cb.companyName} ({cb.totalQuantity} pcs):</span>
                        <span className="font-mono font-bold">₹{cb.subtotal.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Financial Summary */}
                <div className="space-y-1 text-[11px] pt-1 border-b-2 border-dashed border-stone-400 pb-2">
                  <div className="flex justify-between text-stone-600">
                    <span>Total Qty / Items:</span>
                    <span className="font-bold font-mono">
                      {totalQuantity} pcs / {bill.items.length} items
                    </span>
                  </div>
                  <div className="flex justify-between text-stone-600">
                    <span>Gross Subtotal:</span>
                    <span className="font-mono">₹{bill.subtotal.toFixed(2)}</span>
                  </div>
                  {totalItemDiscounts > 0 && (
                    <div className="flex justify-between text-emerald-800 font-medium">
                      <span>Item Discounts:</span>
                      <span className="font-mono">-₹{totalItemDiscounts.toFixed(2)}</span>
                    </div>
                  )}
                  {bill.discount > 0 && (
                    <div className="flex justify-between text-emerald-800 font-medium">
                      <span>
                        Bill Discount {bill.discountPercentage ? `(${bill.discountPercentage}%)` : ''}:
                      </span>
                      <span className="font-mono">-₹{bill.discount.toFixed(2)}</span>
                    </div>
                  )}
                  {bill.tax > 0 && (
                    <div className="flex justify-between text-stone-600">
                      <span>Tax / GST:</span>
                      <span className="font-mono">+₹{bill.tax.toFixed(2)}</span>
                    </div>
                  )}

                  <div className="flex justify-between items-center border-t-2 border-stone-900 pt-1.5 text-xs font-black text-stone-950">
                    <span className="uppercase text-[11px]">Grand Total:</span>
                    <span className="text-sm font-mono font-black">
                      ₹{bill.totalAmount.toFixed(2)}
                    </span>
                  </div>

                  <div className="flex justify-between text-[10px] text-stone-700 pt-1">
                    <span>Payment Mode:</span>
                    <span className="font-bold uppercase font-mono">
                      {bill.paymentMethod} (PAID ✓)
                    </span>
                  </div>
                </div>

                {/* Footer Notes */}
                {bill.notes && (
                  <div className="text-[10px] italic text-stone-600 border-b border-dashed border-stone-300 pb-1.5">
                    Note: {bill.notes}
                  </div>
                )}

                <div className="text-center text-[9px] text-stone-500 font-sans pt-1 space-y-0.5">
                  <p className="font-bold text-stone-800">*** THANK YOU FOR YOUR PURCHASE! ***</p>
                  <p>Exchange allowed within 7 days with original invoice.</p>
                  <p className="font-mono text-[8px] text-stone-400">
                    Printed: {new Date().toLocaleDateString()} {new Date().toLocaleTimeString()}
                  </p>
                </div>
              </div>
            ) : (
              /* ========================================================= */
              /* 2. FORMAL A4 TAX INVOICE LAYOUT */
              /* ========================================================= */
              <div className="space-y-4 print:space-y-3">
                {/* Official Tax Invoice Header */}
                <div className="border-b-2 border-stone-900 pb-3 flex flex-row items-start justify-between gap-4">
                  <div className="flex-1">
                    <span className="inline-block text-[10px] font-bold uppercase tracking-widest text-amber-900 bg-amber-100/80 px-2 py-0.5 rounded border border-amber-300 font-mono print:border-stone-800 print:bg-stone-100 print:text-black">
                      RETAIL SALES TAX INVOICE
                    </span>
                    <h1 className="text-xl font-black text-stone-950 uppercase mt-1">
                      {session.companyName || 'RETAIL STORE POS'}
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
                    <div className="font-bold text-sm text-stone-900">{session.companyName || 'Retail Store POS'}</div>
                    <div className="text-stone-600 text-[11px]">
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
                        <th className="px-3 py-2 w-28 text-center border-r border-stone-300 print:border-stone-400">
                          Company
                        </th>
                        <th className="px-3 py-2 w-16 text-center border-r border-stone-300 print:border-stone-400">
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
                      {bill.items.map((it, idx) => (
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
                            </div>
                          </td>
                          <td className="px-3 py-2 text-center text-[11px] text-stone-700 border-r border-stone-200 print:border-stone-300">
                            <span className="rounded bg-stone-100 px-1.5 py-0.5 font-semibold text-stone-800 border border-stone-200 print:border-none print:bg-transparent">
                              {it.companyName}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-center font-mono font-bold text-stone-900 border-r border-stone-200 print:border-stone-300">
                            {it.quantity}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-stone-900 border-r border-stone-200 print:border-stone-300">
                            ₹{it.unitPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
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
                      ))}
                    </tbody>
                    <tfoot className="bg-stone-50 font-bold text-stone-900 border-t-2 border-stone-300 print:bg-stone-100 print:border-stone-800">
                      <tr>
                        <td colSpan={3} className="px-3 py-2 text-right text-stone-600 font-sans border-r border-stone-300 print:border-stone-400">
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

                {/* Multi-Company Summary & Financial Totals Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start pt-1">
                  {/* Left Column: Multi-company breakdown and notes */}
                  <div className="space-y-3">
                    {bill.companyBreakdowns && bill.companyBreakdowns.length > 0 && (
                      <div className="rounded-xl border border-stone-300 p-3 bg-stone-50/60 print:bg-white print:border-stone-400 space-y-2 text-xs">
                        <div className="font-bold uppercase tracking-wider text-stone-700 font-mono text-[10px]">
                          Multi-Company Invoicing Breakdown:
                        </div>
                        <div className="space-y-1.5 divide-y divide-stone-200">
                          {bill.companyBreakdowns.map((cb) => (
                            <div key={cb.companyId} className="flex justify-between items-center pt-1 text-stone-700">
                              <div>
                                <span className="font-bold text-stone-900">{cb.companyName}</span>
                                <span className="text-[10px] text-stone-500 ml-1.5">
                                  ({cb.totalQuantity} units in {cb.itemCount} items)
                                </span>
                              </div>
                              <span className="font-mono font-bold text-stone-900">
                                ₹{cb.subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

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
                        <span className="font-sans">Taxes / GST:</span>
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

                {/* Signatures & Declarations */}
                <div className="pt-6 grid grid-cols-2 gap-8 text-center text-xs print:pt-10">
                  <div className="border-t border-stone-400 pt-2">
                    <span className="font-bold text-stone-800 block">Customer Signature</span>
                    <span className="text-[10px] text-stone-500 block mt-0.5">Thank you for your visit!</span>
                  </div>
                  <div className="border-t border-stone-400 pt-2">
                    <span className="font-bold text-stone-800 block">
                      For {session.companyName || 'RETAIL STORE POS'}
                    </span>
                    <span className="text-[10px] text-stone-500 block mt-0.5">Authorized Signatory</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
