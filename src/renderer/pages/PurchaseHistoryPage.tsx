import React, { useEffect, useState } from 'react';
import type {
  AuthSessionPayload,
  PurchaseDto,
  PurchasePaymentMethod,
  PurchasePaymentStatus,
} from '../../shared/types/ipc';
import { useToast } from '../context/ToastContext';
import { usePurchases } from '../hooks/usePurchases';
import { useVendors } from '../hooks/useVendors';

interface PurchaseHistoryPageProps {
  session: AuthSessionPayload;
}

export const PurchaseHistoryPage: React.FC<PurchaseHistoryPageProps> = ({ session }) => {
  const { showError, showSuccess } = useToast();
  const {
    purchases,
    loading,
    error,
    setFilter,
    updatePurchasePayment,
    clearError,
  } = usePurchases();

  const { vendors } = useVendors();

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
  const [editNotes, setEditNotes] = useState<string>('');
  const [updatingPayment, setUpdatingPayment] = useState<boolean>(false);

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
    setEditingPurchase(p);
    setEditStatus(p.paymentStatus || 'UNPAID');
    setEditMethod(p.paymentMethod || 'CASH');
    setEditNotes(p.notes || '');
  };

  const handleSaveEditPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPurchase) return;

    setUpdatingPayment(true);
    try {
      const updated = await updatePurchasePayment({
        id: editingPurchase.id,
        paymentStatus: editStatus,
        paymentMethod: editStatus === 'PAID' ? editMethod : null,
        notes: editNotes.trim() || undefined,
      });

      if (updated) {
        showSuccess(`Payment details updated for ${updated.vendorName} on ${updated.purchaseDate}.`);
        if (billPurchase && billPurchase.id === updated.id) {
          setBillPurchase(updated);
        }
        setEditingPurchase(null);
      }
    } finally {
      setUpdatingPayment(false);
    }
  };

  // Metrics
  const totalOrders = purchases.length;
  const totalSpend = purchases.reduce((acc, p) => acc + (p.totalAmount || 0), 0);
  const paidSpend = purchases
    .filter((p) => p.paymentStatus === 'PAID')
    .reduce((acc, p) => acc + (p.totalAmount || 0), 0);
  const pendingSpend = purchases
    .filter((p) => p.paymentStatus !== 'PAID')
    .reduce((acc, p) => acc + (p.totalAmount || 0), 0);

  return (
    <div className="space-y-6 select-text">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-stone-900">
            Purchase History
          </h1>
          <p className="mt-1 text-xs text-stone-500">
            Unified vendor purchase orders with itemized product bills, payment completion tracking (Cash / Online), and billing invoices.
          </p>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="rounded-2xl border border-cream-300 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider">Purchase Orders</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-50 text-amber-600 border border-amber-200">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
          </div>
          <div className="mt-3 text-2xl font-bold text-stone-900">{totalOrders}</div>
          <div className="mt-1 text-[11px] text-stone-400">Total vendor bills logged</div>
        </div>

        <div className="rounded-2xl border border-cream-300 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider">Total Purchase Cost</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-stone-100 text-stone-700 border border-cream-300">
              <span className="text-xs font-bold">₹</span>
            </div>
          </div>
          <div className="mt-3 text-2xl font-bold text-stone-900">₹{totalSpend.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
          <div className="mt-1 text-[11px] text-stone-400">Cumulative order value</div>
        </div>

        <div className="rounded-2xl border border-cream-300 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider">Payments Cleared</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
          </div>
          <div className="mt-3 text-2xl font-bold text-emerald-700">₹{paidSpend.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
          <div className="mt-1 text-[11px] text-stone-400">Paid in Cash or Online</div>
        </div>

        <div className="rounded-2xl border border-cream-300 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider">Pending Due Amount</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-50 text-rose-600 border border-rose-200">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <div className="mt-3 text-2xl font-bold text-rose-700">₹{pendingSpend.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
          <div className="mt-1 text-[11px] text-stone-400">Unpaid / pending payment</div>
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
              placeholder="Search product, barcode, vendor..."
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

      {/* Main Grouped Purchase Orders Table */}
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
              No purchases found
            </h3>
            <p className="mt-1 text-xs text-stone-500 max-w-sm">
              {searchVal || selectedVendorFilter || startDate || endDate
                ? 'No purchases match your selected filters.'
                : 'No vendor purchases logged yet. When products are added with a vendor in the Products tab, daily vendor purchase orders will appear here automatically.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-cream-200 bg-cream-50/75 uppercase tracking-wider text-stone-600 font-bold">
                <tr>
                  <th className="px-5 py-3.5 whitespace-nowrap">Purchase Date</th>
                  <th className="px-5 py-3.5">Vendor / Supplier</th>
                  <th className="px-5 py-3.5 text-center">Products Count</th>
                  <th className="px-5 py-3.5 text-center">Total Units Bought</th>
                  <th className="px-5 py-3.5 text-right">Total Amount (₹)</th>
                  <th className="px-5 py-3.5 text-center">Payment Status</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-200/80">
                {purchases.map((purchase) => {
                  const isPaid = purchase.paymentStatus === 'PAID';

                  return (
                    <tr
                      key={purchase.id}
                      className="transition hover:bg-cream-50/60"
                    >
                      {/* Date */}
                      <td className="px-5 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-cream-100 text-stone-600 border border-cream-300">
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                          </div>
                          <span className="font-bold text-stone-900">{purchase.purchaseDate}</span>
                        </div>
                      </td>

                      {/* Vendor */}
                      <td className="px-5 py-4 whitespace-nowrap">
                        <div className="font-bold text-stone-900 text-sm">{purchase.vendorName}</div>
                        {purchase.vendorPhone ? (
                          <div className="text-[11px] text-stone-500 mt-0.5 flex items-center gap-1">
                            <svg className="h-3 w-3 text-stone-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                            </svg>
                            {purchase.vendorPhone}
                          </div>
                        ) : (
                          <div className="text-[11px] text-stone-400 mt-0.5">No phone number</div>
                        )}
                      </td>

                      {/* Products Count Badge */}
                      <td className="px-5 py-4 text-center whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100/80 px-2.5 py-1 text-xs font-bold text-amber-800 border border-amber-300">
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                          </svg>
                          {purchase.totalProductsCount} {purchase.totalProductsCount === 1 ? 'Product' : 'Products'}
                        </span>
                      </td>

                      {/* Total Units Bought */}
                      <td className="px-5 py-4 text-center whitespace-nowrap">
                        <span className="inline-flex items-center justify-center rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-800 border border-blue-200">
                          {purchase.totalUnitsBought} units
                        </span>
                      </td>

                      {/* Total Amount */}
                      <td className="px-5 py-4 text-right whitespace-nowrap font-bold text-sm text-stone-900">
                        ₹{purchase.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>

                      {/* Payment Status (Paid / Cash / Online / Unpaid) */}
                      <td className="px-5 py-4 text-center whitespace-nowrap">
                        {isPaid ? (
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold border ${
                            purchase.paymentMethod === 'ONLINE'
                              ? 'bg-blue-50 text-blue-700 border-blue-200'
                              : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          }`}>
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                            </svg>
                            Paid ({purchase.paymentMethod === 'ONLINE' ? 'Online' : 'Cash'})
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 px-2.5 py-1 text-xs font-bold">
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            Payment Pending
                          </span>
                        )}
                      </td>

                      {/* Actions: View Bill & Edit Payment Only */}
                      <td className="px-5 py-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          {/* View Bill Button */}
                          <button
                            type="button"
                            onClick={() => setBillPurchase(purchase)}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 px-3 py-1.5 text-xs font-bold text-white shadow-xs transition"
                          >
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            View Bill
                          </button>

                          {/* Edit Payment Button */}
                          <button
                            type="button"
                            onClick={() => handleOpenEditPayment(purchase)}
                            className="inline-flex items-center gap-1 rounded-xl border border-cream-300 bg-white hover:bg-cream-100 px-2.5 py-1.5 text-xs font-semibold text-stone-700 transition"
                            title="Edit Payment Status (Cash / Online)"
                          >
                            <svg className="h-3.5 w-3.5 text-stone-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                            Edit
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

      {/* VIEW BILL MODAL (Shows complete vendor bill for that date) */}
      {billPurchase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-3xl rounded-2xl border border-cream-300 bg-white p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150 my-6">
            {/* Printable Bill Area */}
            <div id="printable-purchase-bill" className="space-y-6">
              {/* Bill Header */}
              <div className="border-b-2 border-stone-800 pb-4 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-md border border-amber-200">
                    Purchase Order & Vendor Bill
                  </span>
                  <h2 className="text-2xl font-black tracking-tight text-stone-900 mt-1">
                    {session.companyName || 'STORE PURCHASE INVOICE'}
                  </h2>
                  <p className="text-xs text-stone-500">
                    Official Inward Purchase Register & Inventory Stocking Slip
                  </p>
                </div>

                <div className="text-right sm:text-right">
                  <div className="text-xs font-semibold text-stone-500">Invoice Reference</div>
                  <div className="text-sm font-mono font-bold text-stone-900">
                    PINV-{billPurchase.purchaseDate.replace(/-/g, '')}-{billPurchase.id.slice(0, 6).toUpperCase()}
                  </div>
                  <div className="mt-1 text-xs text-stone-600">
                    <strong>Date: </strong>{billPurchase.purchaseDate}
                  </div>
                </div>
              </div>

              {/* Vendor & Payment Info Bar */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-xl border border-cream-300 bg-cream-50/70 p-4">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 block">Vendor / Supplier</span>
                  <div className="text-sm font-bold text-stone-900 mt-0.5">{billPurchase.vendorName}</div>
                  <div className="text-xs text-stone-600 mt-0.5">
                    Phone: {billPurchase.vendorPhone || 'Not provided'}
                  </div>
                </div>

                <div className="sm:text-right">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 block">Payment Details</span>
                  <div className="mt-1">
                    {billPurchase.paymentStatus === 'PAID' ? (
                      <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold border ${
                        billPurchase.paymentMethod === 'ONLINE'
                          ? 'bg-blue-100 text-blue-800 border-blue-300'
                          : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                      }`}>
                        ✓ Fully Paid via {billPurchase.paymentMethod === 'ONLINE' ? 'Online / UPI' : 'Cash'}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 text-rose-800 border-rose-300 px-3 py-1 text-xs font-bold">
                        ⏳ Payment Pending (Unpaid)
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Products Table */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-stone-700 mb-2">
                  Purchased Products Breakdown ({billPurchase.items.length} items)
                </h3>
                <div className="overflow-hidden rounded-xl border border-cream-300">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-cream-200 bg-cream-100/70 uppercase tracking-wider text-[11px] text-stone-600 font-bold">
                      <tr>
                        <th className="px-3.5 py-2.5 w-8 text-center">#</th>
                        <th className="px-3.5 py-2.5">Product Description</th>
                        <th className="px-3.5 py-2.5">Barcode</th>
                        <th className="px-3.5 py-2.5 text-center">Bought Stock</th>
                        <th className="px-3.5 py-2.5 text-center">Live Remaining</th>
                        <th className="px-3.5 py-2.5 text-right">Unit Rate (₹)</th>
                        <th className="px-3.5 py-2.5 text-right">Total (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-cream-200">
                      {billPurchase.items.map((item, idx) => (
                        <tr key={item.id} className="hover:bg-cream-50/40">
                          <td className="px-3.5 py-3 text-center text-stone-400 font-mono text-[11px]">
                            {idx + 1}
                          </td>
                          <td className="px-3.5 py-3">
                            <div className="font-bold text-stone-900">{item.productName}</div>
                            {item.categoryName && (
                              <span className="text-[10px] text-stone-500 font-medium">
                                Category: {item.categoryName}
                              </span>
                            )}
                          </td>
                          <td className="px-3.5 py-3 font-mono font-semibold text-stone-700">
                            {item.barcode}
                          </td>
                          <td className="px-3.5 py-3 text-center">
                            <span className="inline-block rounded-md bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-800 border border-blue-200">
                              {item.quantityBought}
                            </span>
                          </td>
                          <td className="px-3.5 py-3 text-center">
                            <span className="inline-block rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-800 border border-emerald-200">
                              {item.currentStock} left
                            </span>
                          </td>
                          <td className="px-3.5 py-3 text-right font-medium text-stone-800">
                            ₹{item.unitCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-3.5 py-3 text-right font-bold text-stone-900">
                            ₹{item.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Bill Totals Summary */}
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 pt-2">
                <div className="text-xs text-stone-500 max-w-sm">
                  {billPurchase.notes && (
                    <div className="rounded-xl border border-cream-300 bg-cream-50 p-3">
                      <strong className="text-stone-800 block mb-0.5">Order Remarks / Notes:</strong>
                      {billPurchase.notes}
                    </div>
                  )}
                </div>

                <div className="w-full sm:w-64 space-y-2 rounded-xl border border-cream-300 bg-cream-50/50 p-4">
                  <div className="flex justify-between text-xs text-stone-600">
                    <span>Total Products:</span>
                    <span className="font-bold text-stone-900">{billPurchase.totalProductsCount}</span>
                  </div>
                  <div className="flex justify-between text-xs text-stone-600">
                    <span>Total Units:</span>
                    <span className="font-bold text-stone-900">{billPurchase.totalUnitsBought}</span>
                  </div>
                  <div className="border-t border-cream-300 pt-2 flex justify-between text-sm font-black text-stone-900">
                    <span>Grand Total:</span>
                    <span className="text-amber-700">₹{billPurchase.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between text-xs text-stone-600">
                    <span>Amount Cleared:</span>
                    <span className="font-bold text-emerald-700">
                      ₹{(billPurchase.paymentStatus === 'PAID' ? billPurchase.totalAmount : 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs text-stone-600">
                    <span>Balance Due:</span>
                    <span className={`font-bold ${billPurchase.paymentStatus === 'PAID' ? 'text-stone-500' : 'text-rose-700'}`}>
                      ₹{(billPurchase.paymentStatus === 'PAID' ? 0 : billPurchase.totalAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Bill Modal Actions */}
            <div className="mt-6 flex items-center justify-between border-t border-cream-200 pt-4">
              <button
                type="button"
                onClick={() => handleOpenEditPayment(billPurchase)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-cream-300 bg-white hover:bg-cream-100 px-3.5 py-2 text-xs font-semibold text-stone-700 transition"
              >
                <svg className="h-4 w-4 text-stone-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Change Payment Status
              </button>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-stone-800 hover:bg-stone-700 px-4 py-2 text-xs font-bold text-white shadow-xs transition"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  Print Bill
                </button>

                <button
                  type="button"
                  onClick={() => setBillPurchase(null)}
                  className="rounded-xl border border-cream-300 bg-white hover:bg-cream-100 px-4 py-2 text-xs font-semibold text-stone-700 transition"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* EDIT PAYMENT MODAL (Allows editing ONLY Payment Status and Cash / Online) */}
      {editingPurchase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl border border-cream-300 bg-white p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-cream-200 pb-3.5">
              <div>
                <h2 className="text-base font-bold text-stone-900">
                  Edit Purchase Payment Status
                </h2>
                <p className="text-xs text-stone-500 mt-0.5">
                  Update payment status (Paid / Pending) and payment method (Cash / Online).
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingPurchase(null)}
                className="rounded-lg p-1 text-stone-400 hover:bg-cream-100 hover:text-stone-700 transition"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Read-only Order Summary Info */}
            <div className="mt-4 rounded-xl border border-cream-300 bg-cream-50/70 p-3.5 space-y-1.5 text-xs text-stone-600">
              <div className="flex justify-between">
                <span>Vendor:</span>
                <strong className="text-stone-900">{editingPurchase.vendorName}</strong>
              </div>
              <div className="flex justify-between">
                <span>Purchase Date:</span>
                <strong className="text-stone-900">{editingPurchase.purchaseDate}</strong>
              </div>
              <div className="flex justify-between">
                <span>Total Amount:</span>
                <strong className="text-amber-700 font-bold">
                  ₹{editingPurchase.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </strong>
              </div>
              <div className="flex justify-between">
                <span>Items:</span>
                <span className="text-stone-700">
                  {editingPurchase.totalProductsCount} products ({editingPurchase.totalUnitsBought} units)
                </span>
              </div>
            </div>

            <form onSubmit={handleSaveEditPayment} className="mt-4 space-y-4">
              {/* Payment Status */}
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-2">
                  Payment Status <span className="text-amber-600">*</span>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label
                    className={`flex items-center justify-center gap-2 rounded-xl border p-3 cursor-pointer text-xs font-bold transition ${
                      editStatus === 'PAID'
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-300 ring-2 ring-emerald-500/20'
                        : 'bg-white text-stone-700 border-cream-300 hover:bg-cream-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="editPaymentStatusRadio"
                      value="PAID"
                      checked={editStatus === 'PAID'}
                      onChange={() => setEditStatus('PAID')}
                      className="text-emerald-600 focus:ring-emerald-500"
                    />
                    ✓ Yes, Paid
                  </label>

                  <label
                    className={`flex items-center justify-center gap-2 rounded-xl border p-3 cursor-pointer text-xs font-bold transition ${
                      editStatus === 'UNPAID'
                        ? 'bg-rose-50 text-rose-800 border-rose-300 ring-2 ring-rose-500/20'
                        : 'bg-white text-stone-700 border-cream-300 hover:bg-cream-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="editPaymentStatusRadio"
                      value="UNPAID"
                      checked={editStatus === 'UNPAID'}
                      onChange={() => setEditStatus('UNPAID')}
                      className="text-rose-600 focus:ring-rose-500"
                    />
                    ⏳ Pending / Unpaid
                  </label>
                </div>
              </div>

              {/* If Paid: Payment Method */}
              {editStatus === 'PAID' && (
                <div className="rounded-xl border border-cream-300 bg-cream-50/50 p-3.5 space-y-2 animate-in fade-in duration-150">
                  <label className="block text-xs font-bold text-stone-700">
                    Payment Method <span className="text-amber-600">*</span>
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label
                      className={`flex items-center justify-center gap-2 rounded-xl border p-2.5 cursor-pointer text-xs font-bold transition ${
                        editMethod === 'CASH'
                          ? 'bg-amber-100 text-amber-900 border-amber-400 ring-2 ring-amber-500/20'
                          : 'bg-white text-stone-700 border-cream-300 hover:bg-cream-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="editPaymentMethodRadio"
                        value="CASH"
                        checked={editMethod === 'CASH'}
                        onChange={() => setEditMethod('CASH')}
                        className="text-amber-600 focus:ring-amber-500"
                      />
                      💵 Cash
                    </label>

                    <label
                      className={`flex items-center justify-center gap-2 rounded-xl border p-2.5 cursor-pointer text-xs font-bold transition ${
                        editMethod === 'ONLINE'
                          ? 'bg-blue-100 text-blue-900 border-blue-400 ring-2 ring-blue-500/20'
                          : 'bg-white text-stone-700 border-cream-300 hover:bg-cream-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="editPaymentMethodRadio"
                        value="ONLINE"
                        checked={editMethod === 'ONLINE'}
                        onChange={() => setEditMethod('ONLINE')}
                        className="text-blue-600 focus:ring-blue-500"
                      />
                      💳 Online / UPI
                    </label>
                  </div>
                </div>
              )}

              {/* Remarks / Notes */}
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  Payment Reference / Remarks (Optional)
                </label>
                <input
                  type="text"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="e.g. UPI Ref #192837 or Paid by Cashier"
                  className="w-full rounded-xl border border-cream-300 bg-cream-50/50 px-3.5 py-2 text-xs text-stone-900 focus:border-amber-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-600/20"
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
                  Save Payment Status
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
