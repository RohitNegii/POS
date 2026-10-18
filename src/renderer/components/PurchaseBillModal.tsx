import React from 'react';
import { createPortal } from 'react-dom';
import type { AuthSessionPayload, PurchaseDto, VendorDto } from '../../shared/types/ipc';

export interface PurchaseBillModalProps {
  isOpen: boolean;
  onClose: () => void;
  purchase: PurchaseDto | null;
  session: AuthSessionPayload;
  vendors?: VendorDto[];
  onEditPurchase?: (purchaseId: string) => void;
  onOpenEditPayment?: (purchase: PurchaseDto) => void;
  onDeletePurchase?: (purchase: PurchaseDto) => void;
  onBatchPrintBarcodes?: (purchase: PurchaseDto) => void;
  onPrintItemBarcode?: (productId: string | null, barcode: string, qty: number) => void;
}

const formatPaymentMethod = (m: string) => {
  switch (m) {
    case 'CASH':
      return 'Cash';
    case 'BANK_TRANSFER':
      return 'Bank Transfer / RTGS';
    case 'CHEQUE':
      return 'Cheque / DD';
    case 'UPI':
      return 'UPI';
    case 'NO_PAYMENT':
      return 'Credit / Deferred';
    default:
      return m;
  }
};

export const PurchaseBillModal: React.FC<PurchaseBillModalProps> = ({
  isOpen,
  onClose,
  purchase,
  session,
  vendors = [],
  onEditPurchase,
  onOpenEditPayment,
  onDeletePurchase,
  onBatchPrintBarcodes,
  onPrintItemBarcode,
}) => {
  if (!isOpen || !purchase) return null;

  const handlePrint = () => {
    document.body.classList.add('printing-purchase-bill');

    const cleanup = () => {
      document.body.classList.remove('printing-purchase-bill');
      window.removeEventListener('afterprint', cleanup);
    };

    window.addEventListener('afterprint', cleanup);
    setTimeout(cleanup, 60000);

    window.print();
  };

  const matchedVendor = vendors.find((v) => v.id === purchase.vendorId);
  const vendorName = purchase.vendorName || matchedVendor?.name || 'Unknown Vendor';
  const creditorAddress = purchase.vendorAddress || matchedVendor?.address;
  const creditorGst = purchase.vendorGstNumber || matchedVendor?.gstNumber;
  const creditorPhone = purchase.vendorPhone || matchedVendor?.phoneNumber;
  const bankName = purchase.vendorBankName || matchedVendor?.bankName;
  const accountNo = purchase.vendorAccountNumber || matchedVendor?.accountNumber;
  const ifscCode = purchase.vendorIfscCode || matchedVendor?.ifscCode;
  const hasBank = Boolean(bankName || accountNo || ifscCode);
  const hasTransport = Boolean(purchase.ewayBillNumber || purchase.transporterName || purchase.vehicleNumber);

  const billPaymentDone =
    (purchase.paymentStatus === 'PAID' || purchase.paidAmount > 0) &&
    purchase.paymentMethod !== 'NO_PAYMENT';
  const effectiveBillPaymentDate =
    purchase.paymentDate || (billPaymentDone ? purchase.purchaseDate : null);

  const billTaxableTotal =
    purchase.subtotal && purchase.subtotal > 0
      ? purchase.subtotal
      : Math.round(
          purchase.items.reduce(
            (acc, it) =>
              acc +
              (it.taxableAmount !== undefined && it.taxableAmount !== null
                ? it.taxableAmount
                : Math.max(0, it.quantityBought * it.unitCost - (it.discount || 0))),
            0
          ) * 100
        ) / 100;

  const hasBillLevelTaxes =
    (purchase.cgstRate !== undefined && purchase.cgstRate > 0) ||
    (purchase.sgstRate !== undefined && purchase.sgstRate > 0) ||
    (purchase.igstRate !== undefined && purchase.igstRate > 0) ||
    (purchase.cgstAmount !== undefined && purchase.cgstAmount > 0) ||
    (purchase.sgstAmount !== undefined && purchase.sgstAmount > 0) ||
    (purchase.igstAmount !== undefined && purchase.igstAmount > 0);

  const billCgstRate = purchase.cgstRate ?? 0;
  const billCgstAmount = hasBillLevelTaxes
    ? purchase.cgstAmount ?? 0
    : Math.round(purchase.items.reduce((acc, it) => acc + (it.cgstAmount || 0), 0) * 100) / 100;

  const billSgstRate = purchase.sgstRate ?? 0;
  const billSgstAmount = hasBillLevelTaxes
    ? purchase.sgstAmount ?? 0
    : Math.round(purchase.items.reduce((acc, it) => acc + (it.sgstAmount || 0), 0) * 100) / 100;

  const billIgstRate = purchase.igstRate ?? 0;
  const billIgstAmount = hasBillLevelTaxes
    ? purchase.igstAmount ?? 0
    : Math.round(purchase.items.reduce((acc, it) => acc + (it.igstAmount || 0), 0) * 100) / 100;

  const totalGst =
    purchase.taxAmount > 0
      ? purchase.taxAmount
      : Math.round((billCgstAmount + billSgstAmount + billIgstAmount) * 100) / 100;

  const totalDiscount = Math.round(
    purchase.items.reduce((acc, it) => acc + (it.discount || 0), 0) * 100
  ) / 100;

  return createPortal(
    <div
      data-printable-modal="purchase-bill"
      className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-stone-900/60 p-2 sm:p-4 md:p-6 overflow-hidden print:p-0 print:static print:bg-white print:overflow-visible"
    >
      <div className="w-full max-w-5xl rounded-2xl border border-cream-300 bg-white shadow-2xl flex flex-col max-h-[96vh] sm:max-h-[92vh] print:max-h-none print:border-none print:shadow-none print:m-0 print:overflow-visible">
        {/* Modal Top Bar (Screen Only) */}
        <div className="flex items-center justify-between border-b border-cream-200/90 bg-cream-50/80 px-5 py-3 rounded-t-2xl shrink-0 print:hidden">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-900 bg-amber-100/90 px-2.5 py-0.5 rounded border border-amber-300/80 font-mono">
              {purchase.purchaseNumber}
            </span>
            <span className="text-xs font-bold text-stone-800">
              Invoice: <strong className="font-mono text-stone-900">{purchase.invoiceNumber}</strong>
            </span>
            <span className="text-xs text-stone-500 hidden sm:inline">• {vendorName}</span>
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold border ${
                purchase.paymentStatus === 'PAID'
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                  : purchase.paymentStatus === 'PARTIAL'
                  ? 'bg-amber-50 text-amber-800 border-amber-300'
                  : 'bg-rose-50 text-rose-800 border-rose-300'
              }`}
            >
              {purchase.paymentStatus === 'UNPAID' ? 'Credit / Unpaid' : purchase.paymentStatus}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 bg-white hover:bg-stone-50 px-3 py-1.5 text-xs font-bold text-stone-800 shadow-2xs transition"
              title="Print Official Purchase Invoice"
            >
              <svg className="h-4 w-4 text-stone-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              <span>Print Bill</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-stone-400 hover:text-stone-700 hover:bg-cream-200 transition"
              title="Close Modal"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Scrollable Bill Content Body */}
        <div className="overflow-y-auto flex-1 p-5 sm:p-7 print:p-0 print:overflow-visible bg-white">
          {/* Printable Bill Container */}
          <div
            id="printable-purchase-bill"
            className="space-y-5 text-stone-900 font-sans print:space-y-4 print:text-black"
          >
            {/* 1. OFFICIAL INVOICE HEADER */}
            <div className="border-b-2 border-stone-900 pb-3 flex flex-row items-start justify-between gap-4">
              <div className="flex-1">
                <span className="inline-block text-[10px] font-bold uppercase tracking-widest text-amber-900 bg-amber-100/80 px-2.5 py-0.5 rounded border border-amber-300 font-mono print:border-stone-800 print:bg-stone-100 print:text-black">
                  INWARD TAX INVOICE / GOODS RECEIPT VOUCHER
                </span>
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-stone-900 mt-1 uppercase print:text-2xl print:text-black">
                  {session.companyName || 'RETAIL POS STORE'}
                </h1>
                <p className="text-xs text-stone-600 print:text-stone-800">
                  Stock Inventory Inward Register & Tax Accounting Voucher
                </p>
              </div>

              {/* Invoice Metadata Box */}
              <div className="text-right shrink-0">
                <div className="rounded-lg border border-stone-300 bg-stone-50/80 p-2.5 space-y-1 text-xs font-mono print:bg-white print:border-stone-400 print:p-2">
                  <div className="flex justify-between gap-3 text-stone-600">
                    <span className="font-sans font-medium text-[11px]">Voucher No:</span>
                    <strong className="text-stone-900 font-bold">{purchase.purchaseNumber}</strong>
                  </div>
                  <div className="flex justify-between gap-3 text-stone-600">
                    <span className="font-sans font-medium text-[11px]">Vendor Inv No:</span>
                    <strong className="text-stone-900 font-bold">{purchase.invoiceNumber}</strong>
                  </div>
                  <div className="flex justify-between gap-3 text-stone-600">
                    <span className="font-sans font-medium text-[11px]">Date:</span>
                    <strong className="text-stone-900">{purchase.purchaseDate}</strong>
                  </div>
                  <div className="flex justify-between gap-3 border-t border-stone-200 pt-1 text-[11px]">
                    <span className="font-sans font-medium">Status:</span>
                    <strong
                      className={
                        purchase.paymentStatus === 'PAID'
                          ? 'text-emerald-700'
                          : purchase.paymentStatus === 'PARTIAL'
                          ? 'text-amber-800'
                          : 'text-rose-700'
                      }
                    >
                      {purchase.paymentStatus === 'UNPAID' ? 'CREDIT (UNPAID)' : purchase.paymentStatus}
                    </strong>
                  </div>
                </div>
              </div>
            </div>

            {/* 2. PARTIES SECTION (SUPPLIER & RECIPIENT DETAILS) */}
            <div className="grid grid-cols-2 gap-3 text-xs border border-stone-300 rounded-xl overflow-hidden print:border-stone-400">
              {/* Supplier / Creditor Card */}
              <div className="p-3 bg-stone-50/60 border-r border-stone-300 print:bg-white print:border-stone-400 space-y-1.5">
                <div className="flex items-center justify-between border-b border-stone-200 pb-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-950 font-mono">
                    Supplier / Vendor Details (Billed From)
                  </span>
                  {creditorGst && (
                    <span className="text-[10px] font-mono font-bold text-stone-800">
                      GSTIN: {creditorGst}
                    </span>
                  )}
                </div>
                <div className="font-bold text-sm text-stone-900">{vendorName}</div>
                {creditorPhone && (
                  <div className="text-stone-700">
                    <span className="text-stone-500 text-[11px]">Phone: </span>
                    <span className="font-mono">{creditorPhone}</span>
                  </div>
                )}
                {creditorAddress && (
                  <div className="text-stone-700 leading-snug">
                    <span className="text-stone-500 text-[11px]">Address: </span>
                    {creditorAddress}
                  </div>
                )}
                {hasBank && (
                  <div className="text-[11px] font-mono text-stone-600 border-t border-stone-200/80 pt-1">
                    <span className="font-sans text-[10px] text-stone-400 block">Bank Settlement:</span>
                    <span>
                      {bankName ? `${bankName} • ` : ''}
                      {accountNo ? `A/C: ${accountNo} • ` : ''}
                      {ifscCode ? `IFSC: ${ifscCode}` : ''}
                    </span>
                  </div>
                )}
              </div>

              {/* Recipient / Store Card */}
              <div className="p-3 bg-stone-50/60 print:bg-white space-y-1.5">
                <div className="flex items-center justify-between border-b border-stone-200 pb-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-stone-600 font-mono">
                    Recipient / Store Details (Billed To)
                  </span>
                  <span className="text-[10px] font-mono text-stone-500">
                    Store Code: {session.companyId.slice(-6).toUpperCase()}
                  </span>
                </div>
                <div className="font-bold text-sm text-stone-900">
                  {session.companyName || 'Retail POS Store'}
                </div>
                <div className="text-stone-700">
                  <span className="text-stone-500 text-[11px]">Payment Mode: </span>
                  <strong className="font-mono text-stone-900">
                    {formatPaymentMethod(purchase.paymentMethod)}
                  </strong>
                  {effectiveBillPaymentDate && (
                    <span className="text-[11px] text-stone-500 ml-1">
                      (Date: {effectiveBillPaymentDate})
                    </span>
                  )}
                </div>
                {hasTransport && (
                  <div className="text-[11px] font-mono text-stone-700 border-t border-stone-200/80 pt-1 space-y-0.5">
                    <span className="font-sans text-[10px] text-stone-400 block">Transport / Logistics:</span>
                    {purchase.ewayBillNumber && <div>E-Way: <strong>{purchase.ewayBillNumber}</strong></div>}
                    {purchase.transporterName && <div>Transporter: {purchase.transporterName}</div>}
                    {purchase.vehicleNumber && <div>Vehicle No: <strong>{purchase.vehicleNumber}</strong></div>}
                  </div>
                )}
              </div>
            </div>

            {/* 3. ITEM DETAILS TABLE */}
            <div className="rounded-xl border border-stone-300 overflow-hidden print:border-stone-400">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-stone-100 text-stone-800 uppercase tracking-wider font-bold text-[11px] border-b-2 border-stone-300 print:bg-stone-200 print:border-stone-800">
                  <tr>
                    <th className="px-3 py-2 text-center w-8 border-r border-stone-300 print:border-stone-400">#</th>
                    <th className="px-3 py-2 min-w-[200px] border-r border-stone-300 print:border-stone-400">Item Name & Description</th>
                    <th className="px-3 py-2 w-20 text-center border-r border-stone-300 print:border-stone-400">HSN</th>
                    <th className="px-3 py-2 w-16 text-center border-r border-stone-300 print:border-stone-400">Qty</th>
                    <th className="px-3 py-2 w-24 text-right border-r border-stone-300 print:border-stone-400">Rate (₹)</th>
                    <th className="px-3 py-2 w-28 text-right border-r border-stone-300 print:border-stone-400">Disc (%)</th>
                    <th className="px-3 py-2 w-28 text-right">Line Total (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-200 print:divide-stone-300">
                  {purchase.items.map((item, idx) => {
                    const gross = Math.round(item.quantityBought * item.unitCost * 100) / 100;
                    const discount = item.discount || 0;
                    const discPercent =
                      gross > 0 && discount > 0
                        ? Math.round((discount / gross) * 100 * 100) / 100
                        : 0;

                    const taxable =
                      item.taxableAmount !== undefined && item.taxableAmount !== null
                        ? item.taxableAmount
                        : Math.max(0, gross - discount);

                    return (
                      <tr key={item.id} className="hover:bg-stone-50/50 print:hover:bg-transparent">
                        <td className="px-3 py-2 text-center text-stone-500 font-mono font-bold border-r border-stone-200 print:border-stone-300">
                          {idx + 1}
                        </td>
                        <td className="px-3 py-2 border-r border-stone-200 print:border-stone-300">
                          <div className="font-bold text-stone-900">{item.productName}</div>
                          <div className="flex items-center gap-2 text-[10px] text-stone-500 mt-0.5">
                            <span className="font-medium text-stone-700">{item.categoryName || 'General'}</span>
                            <span className="font-mono text-stone-700 bg-stone-100 px-1 rounded border border-stone-200 print:border-none print:bg-transparent">
                              {item.barcode}
                            </span>
                            {onPrintItemBarcode && (
                              <button
                                type="button"
                                onClick={() => onPrintItemBarcode(item.productId, item.barcode, item.quantityBought)}
                                className="print:hidden text-[10px] text-amber-700 hover:text-amber-800 underline font-semibold cursor-pointer ml-1"
                                title={`Print barcode labels for ${item.productName}`}
                              >
                                Print Barcode
                              </button>
                            )}
                          </div>
                          {item.itemDescription && (
                            <div className="text-[11px] text-stone-600 italic mt-0.5">{item.itemDescription}</div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center font-mono text-stone-700 border-r border-stone-200 print:border-stone-300">
                          {item.hsnCode || '—'}
                        </td>
                        <td className="px-3 py-2 text-center font-mono font-bold text-stone-900 border-r border-stone-200 print:border-stone-300">
                          {item.quantityBought}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-stone-900 border-r border-stone-200 print:border-stone-300">
                          ₹{item.unitCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-3 py-2 text-right font-mono border-r border-stone-200 print:border-stone-300">
                          {discount > 0 ? (
                            <div>
                              <span className="font-bold text-rose-700 text-xs">
                                {discPercent > 0 ? `${discPercent}%` : ''}
                              </span>
                              <span className="block text-[10px] text-stone-500">
                                -₹{discount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </span>
                            </div>
                          ) : (
                            <span className="text-stone-400">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-stone-900">
                          ₹{taxable.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {/* Table Total Summary Row */}
                <tfoot className="border-t-2 border-stone-300 bg-stone-50 font-bold text-xs print:bg-stone-100 print:border-stone-800">
                  <tr>
                    <td colSpan={3} className="px-3 py-2 text-stone-600">
                      Total Items: {purchase.totalProductsCount} products
                    </td>
                    <td className="px-3 py-2 text-center font-mono font-black text-stone-900">
                      {purchase.totalUnitsBought}
                    </td>
                    <td colSpan={2} className="px-3 py-2 text-right text-stone-600">
                      {totalDiscount > 0 ? `Total Discount: -₹${totalDiscount.toFixed(2)}` : ''}
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-black text-stone-900">
                      ₹{billTaxableTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* 4. TOTALS, TAX BREAKDOWN & NOTES */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1 items-start">
              {/* Left Column: Notes, Terms, and Declarations */}
              <div className="space-y-3">
                {purchase.notes && (
                  <div className="rounded-xl border border-stone-300 bg-stone-50 p-3 text-xs print:bg-white print:border-stone-400">
                    <strong className="text-stone-800 block text-[11px] uppercase tracking-wider mb-0.5">
                      Bill Remarks / Notes:
                    </strong>
                    <p className="text-stone-700 leading-relaxed">{purchase.notes}</p>
                  </div>
                )}

                <div className="rounded-xl border border-stone-200 bg-stone-50/40 p-3 text-[11px] text-stone-600 space-y-1 print:border-stone-300 print:bg-white">
                  <div className="font-bold text-stone-800 uppercase tracking-wider text-[10px]">
                    Inward Goods & Tax Declaration:
                  </div>
                  <p className="leading-snug">
                    Certified that the items and quantities entered above have been physically inspected, counted, and verified in sound condition. Tax liability recorded under GST applicable rules.
                  </p>
                </div>
              </div>

              {/* Right Column: Financial Totals Box */}
              <div className="rounded-xl border-2 border-stone-400 bg-stone-50/70 p-3.5 space-y-1.5 text-xs font-mono print:bg-white print:border-stone-800">
                <div className="flex justify-between text-stone-700">
                  <span className="font-sans">Gross Subtotal:</span>
                  <span className="font-bold text-stone-900">
                    ₹{(billTaxableTotal + totalDiscount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>

                {totalDiscount > 0 && (
                  <div className="flex justify-between text-rose-700 font-semibold">
                    <span className="font-sans">Total Discount:</span>
                    <span>-₹{totalDiscount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                )}

                <div className="flex justify-between text-stone-800 font-semibold border-t border-stone-200 pt-1">
                  <span className="font-sans">Taxable Subtotal:</span>
                  <span>₹{billTaxableTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>

                {billCgstAmount > 0 && (
                  <div className="flex justify-between text-emerald-800">
                    <span className="font-sans">CGST {billCgstRate > 0 ? `(${billCgstRate}%)` : ''}:</span>
                    <span>+ ₹{billCgstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                )}

                {billSgstAmount > 0 && (
                  <div className="flex justify-between text-emerald-800">
                    <span className="font-sans">SGST {billSgstRate > 0 ? `(${billSgstRate}%)` : ''}:</span>
                    <span>+ ₹{billSgstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                )}

                {billIgstAmount > 0 && (
                  <div className="flex justify-between text-blue-800">
                    <span className="font-sans">IGST {billIgstRate > 0 ? `(${billIgstRate}%)` : ''}:</span>
                    <span>+ ₹{billIgstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                )}

                {totalGst > 0 && (
                  <div className="flex justify-between text-stone-700 font-medium border-t border-dashed border-stone-300 pt-1 text-[11px]">
                    <span className="font-sans">Total GST Tax Amount:</span>
                    <span>+ ₹{totalGst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                )}

                <div className="border-t-2 border-stone-800 pt-1.5 flex justify-between text-sm sm:text-base font-black text-stone-900">
                  <span className="font-sans uppercase">Final Bill Total:</span>
                  <span className="text-amber-900 print:text-black">
                    ₹{purchase.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>

                <div className="flex justify-between text-stone-700 pt-1 text-xs border-t border-stone-200">
                  <span className="font-sans">Amount Paid:</span>
                  <span className="font-bold text-emerald-800">
                    ₹{purchase.paidAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>

                <div className="flex justify-between text-stone-700 text-xs">
                  <span className="font-sans">Balance Payable:</span>
                  <span className={`font-bold ${purchase.balanceAmount > 0 ? 'text-rose-700' : 'text-stone-700'}`}>
                    ₹{purchase.balanceAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>

            {/* 5. VERIFICATION & SIGNATURE BLOCK (PRINT & SCREEN) */}
            <div className="pt-6 grid grid-cols-2 gap-8 text-center text-xs print:pt-10">
              <div className="border-t border-stone-400 pt-2">
                <span className="font-bold text-stone-800 block">Checked & Received By</span>
                <span className="text-[10px] text-stone-500 block mt-0.5">Storekeeper / Inventory Manager</span>
              </div>
              <div className="border-t border-stone-400 pt-2">
                <span className="font-bold text-stone-800 block">
                  For {session.companyName || 'RETAIL POS STORE'}
                </span>
                <span className="text-[10px] text-stone-500 block mt-0.5">Authorized Signatory & Stamp</span>
              </div>
            </div>
          </div>
        </div>

        {/* Sticky Bill Modal Actions Footer (Screen Only) */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-cream-200/90 bg-cream-50/80 px-5 py-3.5 rounded-b-2xl shrink-0 print:hidden">
          <div className="flex flex-wrap items-center gap-2">
            {onEditPurchase && (
              <button
                type="button"
                onClick={() => {
                  const pid = purchase.id;
                  onClose();
                  onEditPurchase(pid);
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 px-3.5 py-2 text-xs font-bold text-white shadow-xs transition"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Edit Complete Bill
              </button>
            )}

            {onOpenEditPayment && (
              <button
                type="button"
                onClick={() => onOpenEditPayment(purchase)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-cream-300 bg-white hover:bg-cream-100 px-3 py-2 text-xs font-semibold text-stone-600 transition"
                title="Quickly update payment status without modifying products"
              >
                Update Payment Status
              </button>
            )}

            {onDeletePurchase && (
              <button
                type="button"
                onClick={() => onDeletePurchase(purchase)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 px-3 py-2 text-xs font-semibold text-rose-700 transition"
                title="Delete this purchase bill and roll back inventory stock"
              >
                <svg className="h-3.5 w-3.5 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Delete Bill
              </button>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            {onBatchPrintBarcodes && (
              <button
                type="button"
                onClick={() => onBatchPrintBarcodes(purchase)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 px-3.5 py-2 text-xs font-bold text-amber-900 shadow-xs transition"
                title="Print barcode labels for all products in this bill"
              >
                <svg className="h-4 w-4 text-amber-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                </svg>
                Print Entry Barcodes
              </button>
            )}

            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 rounded-xl bg-stone-900 hover:bg-stone-800 px-4 py-2 text-xs font-bold text-white shadow-xs transition"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              Print Bill
            </button>

            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center rounded-xl border border-cream-300 bg-white hover:bg-cream-100 px-3.5 py-2 text-xs font-semibold text-stone-700 transition"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
