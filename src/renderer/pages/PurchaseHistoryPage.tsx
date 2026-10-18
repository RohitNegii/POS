import React, { useEffect, useState } from 'react';
import type {
  AuthSessionPayload,
  ProductDto,
  PurchaseDto,
  PurchasePaymentMethod,
  PurchasePaymentStatus,
} from '../../shared/types/ipc';
import { useToast } from '../context/ToastContext';
import { usePurchases } from '../hooks/usePurchases';
import { useVendors } from '../hooks/useVendors';
import { useProducts } from '../hooks/useProducts';
import { getLocalDateString } from '../../shared/utils/date';
import { BarcodePrintModal } from '../components/BarcodePrintModal';
import { BatchBarcodePrintModal } from '../components/BatchBarcodePrintModal';
import { PurchaseBillModal } from '../components/PurchaseBillModal';

interface PurchaseHistoryPageProps {
  session: AuthSessionPayload;
  onNavigateToEntry?: () => void;
  onEditPurchase?: (purchaseId: string) => void;
}

export const PurchaseHistoryPage: React.FC<PurchaseHistoryPageProps> = ({
  session,
  onNavigateToEntry,
  onEditPurchase,
}) => {
  const { showError, showSuccess } = useToast();
  const {
    purchases,
    loading,
    error,
    setFilter,
    updatePurchasePayment,
    deletePurchase,
    refreshPurchases,
    clearError,
  } = usePurchases();

  const { vendors } = useVendors();
  const { products } = useProducts();

  // Filter Form State
  const [searchVal, setSearchVal] = useState<string>('');
  const [selectedVendorFilter, setSelectedVendorFilter] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Bill View Modal State
  const [billPurchase, setBillPurchase] = useState<PurchaseDto | null>(null);

  // Edit Payment Modal State
  const [editingPurchase, setEditingPurchase] = useState<PurchaseDto | null>(null);
  const [editStatus, setEditStatus] = useState<PurchasePaymentStatus>('PAID');
  const [editMethod, setEditMethod] = useState<PurchasePaymentMethod>('CASH');
  const [editPaymentDate, setEditPaymentDate] = useState<string>('');
  const [editPaidAmount, setEditPaidAmount] = useState<string>('');
  const [editNotes, setEditNotes] = useState<string>('');
  const [updatingPayment, setUpdatingPayment] = useState<boolean>(false);

  // Delete Purchase State
  const [purchaseToDelete, setPurchaseToDelete] = useState<PurchaseDto | null>(null);
  const [deletingPurchase, setDeletingPurchase] = useState<boolean>(false);

  const handleConfirmDeletePurchase = async () => {
    if (!purchaseToDelete) return;
    setDeletingPurchase(true);
    try {
      const ok = await deletePurchase(purchaseToDelete.id);
      if (ok) {
        showSuccess(
          `Purchase bill "${purchaseToDelete.invoiceNumber}" deleted successfully. Inward stock has been rolled back.`
        );
        setPurchaseToDelete(null);
        if (billPurchase?.id === purchaseToDelete.id) {
          setBillPurchase(null);
        }
        void refreshPurchases();
      } else {
        showError(error || 'Failed to delete purchase bill.');
      }
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to delete purchase bill.');
    } finally {
      setDeletingPurchase(false);
    }
  };

  const formatPaymentMethod = (method?: string | null): string => {
    if (!method) return 'Cash';
    if (method === 'ONLINE' || method === 'UPI' || method === 'BANK_TRANSFER' || method === 'CARD') {
      return 'Online';
    }
    if (method === 'NO_PAYMENT' || method === 'CREDIT') {
      return 'No Payment';
    }
    return 'Cash';
  };

  // Barcode Printing from Purchase History
  const [printingProduct, setPrintingProduct] = useState<ProductDto | null>(null);
  const [printingCopies, setPrintingCopies] = useState<number>(1);
  const [batchPrintingPurchase, setBatchPrintingPurchase] = useState<PurchaseDto | null>(null);

  useEffect(() => {
    if (error) {
      showError(error);
      clearError();
    }
  }, [error, showError, clearError]);

  const handleFilterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFilter({
      search: searchVal.trim() || undefined,
      vendorId: selectedVendorFilter || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    });
  };

  const handleClearFilters = () => {
    setSearchVal('');
    setSelectedVendorFilter('');
    setStartDate('');
    setEndDate('');
    setFilter({});
  };

  const handleOpenEditPayment = (p: PurchaseDto) => {
    const normMethod: PurchasePaymentMethod =
      p.paymentMethod === 'ONLINE' || p.paymentMethod === 'UPI' || p.paymentMethod === 'BANK_TRANSFER' || p.paymentMethod === 'CARD'
        ? 'ONLINE'
        : p.paymentMethod === 'NO_PAYMENT' || p.paymentMethod === 'CREDIT'
        ? 'NO_PAYMENT'
        : 'CASH';

    setEditingPurchase(p);
    setEditStatus(p.paymentStatus || (normMethod === 'NO_PAYMENT' ? 'UNPAID' : 'PAID'));
    setEditMethod(normMethod);
    setEditPaidAmount(String(p.paidAmount ?? (normMethod === 'NO_PAYMENT' ? 0 : p.totalAmount)));
    setEditPaymentDate(
      p.paymentDate ||
      (normMethod !== 'NO_PAYMENT' ? (p.purchaseDate || getLocalDateString()) : '')
    );
    setEditNotes(p.notes || '');
  };

  const handleEditMethodChange = (newMethod: PurchasePaymentMethod) => {
    setEditMethod(newMethod);
    if (newMethod === 'NO_PAYMENT') {
      setEditStatus('UNPAID');
      setEditPaidAmount('0');
      setEditPaymentDate('');
    } else {
      setEditStatus('PAID');
      if (!editPaymentDate) {
        setEditPaymentDate(getLocalDateString());
      }
      if (editingPurchase) {
        const cur = parseFloat(editPaidAmount) || 0;
        if (cur === 0) {
          setEditPaidAmount(String(editingPurchase.totalAmount));
        }
      }
    }
  };

  const handleSaveEditPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPurchase) return;

    setUpdatingPayment(true);
    try {
      const parsedPaid = parseFloat(editPaidAmount);
      const isNoPay = editMethod === 'NO_PAYMENT';
      const finalPaymentDate = isNoPay
        ? null
        : (editPaymentDate.trim() || getLocalDateString());

      const updated = await updatePurchasePayment({
        id: editingPurchase.id,
        paymentStatus: isNoPay ? 'UNPAID' : editStatus,
        paymentMethod: editMethod,
        paymentDate: finalPaymentDate,
        paidAmount: isNoPay ? 0 : (isNaN(parsedPaid) ? undefined : parsedPaid),
        notes: editNotes.trim() || undefined,
      });

      if (updated) {
        showSuccess(
          `Payment details updated for ${updated.vendorName} (Bill: ${updated.purchaseNumber}).`
        );
        if (billPurchase && billPurchase.id === updated.id) {
          setBillPurchase(updated);
        }
        setEditingPurchase(null);
      } else {
        showError(error || 'Failed to update payment details.');
      }
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to update payment details.');
    } finally {
      setUpdatingPayment(false);
    }
  };

  // Trigger Barcode Print for a specific item
  const handlePrintItemBarcode = (productId: string | null, barcode: string, qty: number) => {
    let targetProd = products.find((p) => p.id === productId || p.barcode === barcode);
    if (!targetProd) {
      // Fallback synthetic product dto for barcode printing
      targetProd = {
        id: productId || 'temp',
        companyId: session.companyId,
        categoryId: '',
        name: barcode,
        barcode: barcode,
        stockQuantity: qty,
        isArchived: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        categoryName: 'General',
        fieldValues: [],
        stockDisplay: qty,
        calculatedJewelleryPrice: null,
        pricingError: null,
        purchasePrice: null,
        purchaseRatePerGram: null,
        purchaseMakingChargesPerGram: null,
        additionalChargesPercentage: null,
        actualPurchasePrice: null,
        actualPurchasePriceCode: null,
        sellingPrice: null,
        marginPercentage: null,
        vendorId: null,
        vendorName: null,
        vendorPhone: null,
        purchaseDate: null,
      };
    }
    setPrintingProduct(targetProd);
    setPrintingCopies(Math.max(1, Math.round(qty)));
  };

  // Metrics
  const totalOrders = purchases.length;
  const totalSpend = purchases.reduce((acc, p) => acc + (p.totalAmount || 0), 0);
  const paidSpend = purchases.reduce((acc, p) => acc + (p.paidAmount || 0), 0);
  const pendingSpend = purchases.reduce((acc, p) => acc + (p.balanceAmount || 0), 0);

  return (
    <div className="space-y-6 select-text max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-cream-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-md border border-amber-200">
              Purchases Register
            </span>
            <span className="text-[11px] font-semibold text-stone-500">
              {session.companyName || 'Store Admin'}
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-stone-900">
            Purchase History
          </h1>
          <p className="mt-0.5 text-xs text-stone-500">
            View all saved vendor purchase bills, invoice numbers, products inward, payment tracking, and print bills or barcode labels.
          </p>
        </div>

        {onNavigateToEntry && (
          <button
            id="btn-goto-purchase-entry"
            type="button"
            onClick={onNavigateToEntry}
            className="inline-flex items-center gap-2 rounded-xl bg-amber-600 hover:bg-amber-500 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition shadow-amber-600/20"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
            + New Purchase Bill
          </button>
        )}
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="rounded-2xl border border-cream-300 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider">Purchase Bills</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-50 text-amber-600 border border-amber-200">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
          </div>
          <div className="mt-3 text-2xl font-bold text-stone-900">{totalOrders}</div>
          <div className="mt-1 text-[11px] text-stone-400">Total vendor bills recorded</div>
        </div>

        <div className="rounded-2xl border border-cream-300 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider">Total Inward Value</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-stone-100 text-stone-700 border border-cream-300">
              <span className="text-xs font-bold">₹</span>
            </div>
          </div>
          <div className="mt-3 text-2xl font-bold text-stone-900">₹{totalSpend.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
          <div className="mt-1 text-[11px] text-stone-400">Cumulative bill amount</div>
        </div>

        <div className="rounded-2xl border border-cream-300 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider">Amount Paid</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
          </div>
          <div className="mt-3 text-2xl font-bold text-emerald-700">₹{paidSpend.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
          <div className="mt-1 text-[11px] text-stone-400">Cleared to vendors</div>
        </div>

        <div className="rounded-2xl border border-cream-300 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider">Outstanding Balance</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-50 text-rose-600 border border-rose-200">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <div className="mt-3 text-2xl font-bold text-rose-700">₹{pendingSpend.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
          <div className="mt-1 text-[11px] text-stone-400">Due / credit pending</div>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="rounded-2xl border border-cream-300 bg-white p-4 shadow-xs">
        <form onSubmit={handleFilterSubmit} className="flex flex-col gap-3 lg:flex-row lg:items-center">
          {/* Search Input */}
          <div className="relative flex-1 max-w-sm">
            <input
              id="purchase-search-input"
              type="text"
              value={searchVal}
              onChange={(e) => setSearchVal(e.target.value)}
              placeholder="Search vendor, invoice no, purchase ID, barcode..."
              className="w-full rounded-xl border border-cream-300 bg-cream-50/50 px-3.5 py-2 pl-9 text-xs text-stone-900 placeholder-stone-400 focus:border-amber-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-600/20"
            />
            <svg
              className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-stone-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>

          {/* Vendor Filter */}
          <div className="w-full sm:w-52">
            <select
              value={selectedVendorFilter}
              onChange={(e) => setSelectedVendorFilter(e.target.value)}
              className="w-full rounded-xl border border-cream-300 bg-cream-50/50 px-3 py-2 text-xs text-stone-900 focus:border-amber-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-600/20"
            >
              <option value="">All Vendors</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>

          {/* Date Range */}
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              title="Start Date"
              className="rounded-xl border border-cream-300 bg-cream-50/50 px-3 py-2 text-xs text-stone-900 focus:border-amber-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-600/20"
            />
            <span className="text-xs text-stone-400">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              title="End Date"
              className="rounded-xl border border-cream-300 bg-cream-50/50 px-3 py-2 text-xs text-stone-900 focus:border-amber-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-600/20"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              id="btn-filter-purchases"
              type="submit"
              className="rounded-xl border border-cream-300 bg-cream-100 hover:bg-cream-200 px-4 py-2 text-xs font-semibold text-stone-700 transition"
            >
              Apply Filter
            </button>

            {(searchVal || selectedVendorFilter || startDate || endDate) && (
              <button
                type="button"
                onClick={handleClearFilters}
                className="text-xs font-medium text-stone-500 hover:text-stone-800 transition underline underline-offset-2"
              >
                Clear
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Main Saved Purchases Table */}
      <div className="overflow-hidden rounded-2xl border border-cream-300 bg-white shadow-sm">
        {loading && purchases.length === 0 ? (
          <div className="flex h-64 items-center justify-center text-xs text-stone-500">
            <div className="flex items-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-amber-600 border-t-transparent" />
              Loading purchase history...
            </div>
          </div>
        ) : purchases.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cream-100 text-stone-500 border border-cream-300">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
              </svg>
            </div>
            <h3 className="mt-4 text-sm font-bold text-stone-800">
              No purchase bills found
            </h3>
            <p className="mt-1 text-xs text-stone-500 max-w-sm">
              {searchVal || selectedVendorFilter || startDate || endDate
                ? 'No purchases match your selected filters.'
                : 'No vendor purchases logged yet. Click "+ New Purchase Bill" to record your first inward stock invoice.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-cream-200 bg-cream-50/75 uppercase tracking-wider text-stone-600 font-bold">
                <tr>
                  <th className="px-4 py-3.5 whitespace-nowrap">Purchase ID</th>
                  <th className="px-4 py-3.5">Vendor Name</th>
                  <th className="px-4 py-3.5">Vendor Invoice No.</th>
                  <th className="px-4 py-3.5 whitespace-nowrap">Purchase Date</th>
                  <th className="px-4 py-3.5 text-center">Products</th>
                  <th className="px-4 py-3.5 text-center">Total Qty</th>
                  <th className="px-4 py-3.5 text-right">Bill Amount (₹)</th>
                  <th className="px-4 py-3.5 text-right">Paid (₹)</th>
                  <th className="px-4 py-3.5 text-right">Balance (₹)</th>
                  <th className="px-4 py-3.5 text-center">Payment Status</th>
                  <th className="px-4 py-3.5 text-center whitespace-nowrap">Payment Date</th>
                  <th className="px-4 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-200/80">
                {purchases.map((purchase) => {
                  const isPaid = purchase.paymentStatus === 'PAID';
                  const isPartial = purchase.paymentStatus === 'PARTIAL';
                  const isPaymentDone =
                    (isPaid || purchase.paidAmount > 0) && purchase.paymentMethod !== 'NO_PAYMENT';
                  const effectivePaymentDate =
                    purchase.paymentDate || (isPaymentDone ? purchase.purchaseDate : null);

                  return (
                    <tr
                      key={purchase.id}
                      className="transition hover:bg-cream-50/60"
                    >
                      {/* Purchase ID */}
                      <td className="px-4 py-4 whitespace-nowrap font-mono font-bold text-amber-900">
                        {purchase.purchaseNumber}
                      </td>

                      {/* Vendor Name */}
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="font-bold text-stone-900 text-xs">{purchase.vendorName}</div>
                        <div className="flex items-center gap-2 text-[11px] text-stone-500 mt-0.5">
                          {purchase.vendorPhone && <span>📞 {purchase.vendorPhone}</span>}
                          {purchase.vendorGstNumber && (
                            <span className="font-mono text-amber-900 font-semibold bg-amber-50 px-1 py-0.2 rounded border border-amber-200">
                              GST: {purchase.vendorGstNumber}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Vendor Invoice Number & E-Way Bill */}
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="font-mono font-semibold text-stone-800">{purchase.invoiceNumber}</div>
                        {purchase.ewayBillNumber && (
                          <div className="text-[10px] font-mono text-emerald-800 font-medium bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.2 mt-0.5 inline-block">
                            E-Way: {purchase.ewayBillNumber}
                          </div>
                        )}
                      </td>

                      {/* Purchase Date */}
                      <td className="px-4 py-4 whitespace-nowrap font-medium text-stone-700">
                        {purchase.purchaseDate}
                      </td>

                      {/* Products Count */}
                      <td className="px-4 py-4 text-center whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-bold text-amber-800 border border-amber-200">
                          {purchase.totalProductsCount} {purchase.totalProductsCount === 1 ? 'item' : 'items'}
                        </span>
                      </td>

                      {/* Total Units Bought */}
                      <td className="px-4 py-4 text-center whitespace-nowrap font-bold text-stone-800">
                        {purchase.totalUnitsBought}
                      </td>

                      {/* Bill Total Amount */}
                      <td className="px-4 py-4 text-right whitespace-nowrap font-bold text-sm text-stone-900 font-mono">
                        ₹{purchase.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>

                      {/* Paid Amount */}
                      <td className="px-4 py-4 text-right whitespace-nowrap font-semibold text-emerald-700 font-mono">
                        ₹{purchase.paidAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>

                      {/* Balance Due */}
                      <td className="px-4 py-4 text-right whitespace-nowrap font-bold font-mono">
                        <span className={purchase.balanceAmount > 0 ? 'text-rose-700' : 'text-stone-400'}>
                          ₹{purchase.balanceAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                      </td>

                      {/* Payment Status */}
                      <td className="px-4 py-4 text-center whitespace-nowrap">
                        {isPaid ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-0.5 text-[11px] font-bold">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            Paid ({formatPaymentMethod(purchase.paymentMethod)})
                          </span>
                        ) : isPartial ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-0.5 text-[11px] font-bold">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                            Partial ({formatPaymentMethod(purchase.paymentMethod)})
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200 px-2.5 py-0.5 text-[11px] font-bold">
                            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                            No Payment
                          </span>
                        )}
                      </td>

                      {/* Payment Date (if payment was done) */}
                      <td className="px-4 py-4 text-center whitespace-nowrap">
                        {effectivePaymentDate ? (
                          <div className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800 border border-emerald-200 shadow-2xs">
                            <svg className="h-3.5 w-3.5 text-emerald-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            <span>{effectivePaymentDate}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-stone-400 font-medium italic" title="No payment recorded">—</span>
                        )}
                      </td>

                      {/* Actions: Print Barcodes, View Bill & Edit Complete Purchase */}
                      <td className="px-4 py-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            id={`btn-print-barcodes-${purchase.id}`}
                            onClick={() => setBatchPrintingPurchase(purchase)}
                            className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-900 shadow-2xs transition"
                            title={`Print all product barcodes for this purchase (${purchase.totalUnitsBought} stickers)`}
                          >
                            <svg className="h-3.5 w-3.5 text-amber-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                            </svg>
                            Print Barcodes
                          </button>

                          <button
                            type="button"
                            onClick={() => setBillPurchase(purchase)}
                            className="inline-flex items-center gap-1 rounded-lg bg-amber-600 hover:bg-amber-500 px-2.5 py-1 text-xs font-bold text-white shadow-xs transition"
                          >
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            View Bill
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              if (onEditPurchase) {
                                onEditPurchase(purchase.id);
                              } else {
                                handleOpenEditPayment(purchase);
                              }
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border border-cream-300 bg-white hover:bg-cream-100 px-2.5 py-1 text-xs font-bold text-stone-700 shadow-xs transition"
                            title="Edit Complete Purchase Bill (Vendor, products, costs, quantities)"
                          >
                            <svg className="h-3.5 w-3.5 text-stone-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                            Edit Bill
                          </button>

                          <button
                            type="button"
                            onClick={() => setPurchaseToDelete(purchase)}
                            className="inline-flex items-center gap-1 rounded-lg border border-cream-300 bg-white hover:bg-rose-50 hover:border-rose-200 px-2 py-1 text-xs font-bold text-stone-400 hover:text-rose-600 shadow-xs transition"
                            title="Delete purchase bill and roll back inventory stock"
                          >
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* VIEW COMPLETE PURCHASE BILL MODAL */}
      <PurchaseBillModal
        isOpen={Boolean(billPurchase)}
        onClose={() => setBillPurchase(null)}
        purchase={billPurchase}
        session={session}
        vendors={vendors}
        onEditPurchase={onEditPurchase}
        onOpenEditPayment={handleOpenEditPayment}
        onDeletePurchase={(p) => setPurchaseToDelete(p)}
        onBatchPrintBarcodes={(p) => setBatchPrintingPurchase(p)}
        onPrintItemBarcode={handlePrintItemBarcode}
      />

      {/* EDIT PAYMENT MODAL */}
      {editingPurchase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl border border-cream-300 bg-white p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-cream-200 pb-3.5">
              <div>
                <h2 className="text-base font-bold text-stone-900">
                  Update Purchase Payment
                </h2>
                <p className="text-xs text-stone-500 mt-0.5">
                  Bill {editingPurchase.purchaseNumber} • Invoice {editingPurchase.invoiceNumber}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingPurchase(null)}
                className="rounded-lg p-1 text-stone-400 hover:bg-cream-100 hover:text-stone-700 transition"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 rounded-xl border border-cream-300 bg-cream-50/70 p-3.5 space-y-1.5 text-xs text-stone-600">
              <div className="flex justify-between">
                <span>Vendor:</span>
                <strong className="text-stone-900">{editingPurchase.vendorName}</strong>
              </div>
              <div className="flex justify-between">
                <span>Bill Total Amount:</span>
                <strong className="text-amber-700 font-bold font-mono">
                  ₹{editingPurchase.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </strong>
              </div>
            </div>

            <form onSubmit={handleSaveEditPayment} className="mt-4 space-y-4">
              {/* Payment Method */}
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1.5">
                  Payment Method *
                </label>
                <select
                  value={editMethod}
                  onChange={(e) => handleEditMethodChange(e.target.value as PurchasePaymentMethod)}
                  className="w-full rounded-xl border border-cream-300 bg-cream-50/50 px-3 py-2 text-xs font-semibold text-stone-900 focus:border-amber-600 focus:bg-white focus:outline-none"
                >
                  <option value="CASH">Cash</option>
                  <option value="ONLINE">Online</option>
                  <option value="NO_PAYMENT">No Payment</option>
                </select>
              </div>

              {/* Payment Date - Shown & stored when changing to Cash or Online */}
              {editMethod !== 'NO_PAYMENT' && (
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1.5">
                    Payment Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={editPaymentDate}
                    onChange={(e) => setEditPaymentDate(e.target.value)}
                    className="w-full rounded-xl border border-cream-300 bg-cream-50/50 px-3 py-2 text-xs font-semibold text-stone-900 focus:border-amber-600 focus:bg-white focus:outline-none"
                  />
                  <p className="text-[11px] text-stone-400 mt-1">
                    Recorded settlement date for cash or online payment.
                  </p>
                </div>
              )}

              {/* Amount Paid Input */}
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1.5">
                  Amount Paid (₹)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={editPaidAmount}
                  onChange={(e) => {
                    setEditPaidAmount(e.target.value);
                    const val = parseFloat(e.target.value) || 0;
                    if (val >= editingPurchase.totalAmount) {
                      setEditStatus('PAID');
                    } else if (val > 0) {
                      setEditStatus('PARTIAL');
                    } else {
                      setEditStatus('UNPAID');
                    }
                  }}
                  className="w-full rounded-xl border border-cream-300 bg-cream-50/50 px-3 py-2 text-xs font-bold text-stone-900 focus:border-amber-600 focus:bg-white focus:outline-none"
                />
              </div>

              {/* Remarks / Notes */}
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  Payment Reference / Remarks
                </label>
                <input
                  type="text"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="e.g. Bank Ref #192837 or Paid by Manager"
                  className="w-full rounded-xl border border-cream-300 bg-cream-50/50 px-3.5 py-2 text-xs text-stone-900 focus:border-amber-600 focus:bg-white focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-cream-200">
                <button
                  type="button"
                  onClick={() => setEditingPurchase(null)}
                  disabled={updatingPayment}
                  className="rounded-xl border border-cream-300 bg-white hover:bg-cream-100 px-4 py-2 text-xs font-semibold text-stone-700 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updatingPayment}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 px-4 py-2 text-xs font-bold text-white shadow-sm transition disabled:opacity-50"
                >
                  {updatingPayment && (
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  )}
                  Save Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* BARCODE PRINT MODAL INTEGRATION */}
      {printingProduct && (
        <BarcodePrintModal
          isOpen={Boolean(printingProduct)}
          onClose={() => setPrintingProduct(null)}
          product={printingProduct}
          session={session}
          initialCopies={printingCopies}
        />
      )}

      {/* BATCH BARCODE PRINT MODAL INTEGRATION (Prints all products in this purchase entry) */}
      {batchPrintingPurchase && (
        <BatchBarcodePrintModal
          isOpen={Boolean(batchPrintingPurchase)}
          onClose={() => setBatchPrintingPurchase(null)}
          purchase={batchPrintingPurchase}
          session={session}
          products={products}
        />
      )}

      {/* DELETE PURCHASE BILL CONFIRMATION MODAL */}
      {purchaseToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl border border-cream-300 bg-white p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-100 text-rose-600 border border-rose-200 shrink-0">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-bold text-stone-900">
                  Delete Purchase Bill?
                </h3>
                <p className="text-xs text-stone-500 mt-0.5">
                  Are you sure you want to delete invoice{' '}
                  <strong className="text-stone-800 font-mono">{purchaseToDelete.invoiceNumber}</strong> (
                  {purchaseToDelete.purchaseNumber})?
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-rose-100 bg-rose-50/60 p-3.5 text-xs text-rose-800 space-y-1.5">
              <p className="font-semibold text-rose-900">Inventory Stock & Catalog Effect:</p>
              <ul className="list-disc list-inside space-y-1 text-[11px] text-rose-700">
                <li>
                  Inward stock for <strong>{purchaseToDelete.totalProductsCount} products</strong> ({purchaseToDelete.totalUnitsBought} units) will be automatically rolled back.
                </li>
                <li>
                  Any products created solely for this purchase bill (with no other bills or sales) will be cleaned up from your product catalog and barcode list.
                </li>
              </ul>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2.5">
              <button
                type="button"
                disabled={deletingPurchase}
                onClick={() => setPurchaseToDelete(null)}
                className="rounded-xl border border-cream-300 bg-white hover:bg-cream-100 px-4 py-2 text-xs font-semibold text-stone-700 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deletingPurchase}
                onClick={handleConfirmDeletePurchase}
                className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 px-4 py-2 text-xs font-bold text-white shadow-xs transition disabled:opacity-50"
              >
                {deletingPurchase && (
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                )}
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
