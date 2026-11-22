import React, { useMemo, useState, useEffect } from 'react';
import type { AuthSessionPayload, BillDto, CustomerRecordDto } from '../../shared/types/ipc';
import { useCustomerRecords } from '../hooks/useCustomerRecords';
import { SalesReceiptModal } from '../components/SalesReceiptModal';

interface CustomerRecordsPageProps {
  session: AuthSessionPayload;
  onEditBill?: (billId: string) => void;
  onNavigateToBilling?: (customerPhone?: string, customerName?: string) => void;
}

type DirectoryFilter = 'ALL' | 'REPEAT' | 'HIGH_VALUE' | 'NO_PHONE';
type DirectorySort = 'LATEST' | 'HIGHEST_SPEND' | 'MOST_BILLS' | 'NAME_ASC';

// Avatar background colors based on phone string hash
const AVATAR_COLORS = [
  'bg-emerald-100 text-emerald-800 border-emerald-200',
  'bg-amber-100 text-amber-800 border-amber-200',
  'bg-indigo-100 text-indigo-800 border-indigo-200',
  'bg-purple-100 text-purple-800 border-purple-200',
  'bg-rose-100 text-rose-800 border-rose-200',
  'bg-cyan-100 text-cyan-800 border-cyan-200',
  'bg-blue-100 text-blue-800 border-blue-200',
];

function getAvatarColorClass(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = key.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % AVATAR_COLORS.length;
  return AVATAR_COLORS[index];
}

function getInitials(name?: string, phone?: string): string {
  const cleanName = (name || '').trim();
  if (cleanName && cleanName !== 'Walk-in Customer') {
    const parts = cleanName.split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return cleanName.slice(0, 2).toUpperCase();
  }
  const cleanPhone = (phone || '').replace(/\D/g, '');
  if (cleanPhone.length >= 2) {
    return cleanPhone.slice(-2);
  }
  return 'CU';
}

function formatRelativeTime(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

function formatFullDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

export const CustomerRecordsPage: React.FC<CustomerRecordsPageProps> = ({
  session,
  onEditBill,
  onNavigateToBilling,
}) => {
  const { customers, loading, error, search, setSearch, refreshCustomerRecords } = useCustomerRecords();

  // Filter & Sort State
  const [activeFilter, setActiveFilter] = useState<DirectoryFilter>('ALL');
  const [sortBy, setSortBy] = useState<DirectorySort>('LATEST');
  const [copiedPhone, setCopiedPhone] = useState<string | null>(null);

  // Pagination State
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  // Modal State: Selected customer whose bills are being viewed in the modal
  const [modalCustomer, setModalCustomer] = useState<CustomerRecordDto | null>(null);
  const [modalBillSearchTerm, setModalBillSearchTerm] = useState<string>('');

  // Receipt Modal State: For full tax invoice view/print
  const [receiptBill, setReceiptBill] = useState<BillDto | null>(null);

  // Overall directory metrics
  const totalCustomers = customers.length;
  const repeatCustomers = useMemo(() => customers.filter((c) => c.totalBillsCount > 1), [customers]);
  const repeatCount = repeatCustomers.length;
  const totalRevenue = useMemo(() => customers.reduce((sum, c) => sum + c.totalSpent, 0), [customers]);
  const totalBillsAcrossAll = useMemo(() => customers.reduce((sum, c) => sum + c.totalBillsCount, 0), [customers]);
  const avgBillValue = totalBillsAcrossAll > 0 ? Math.round(totalRevenue / totalBillsAcrossAll) : 0;
  const retentionRate = totalCustomers > 0 ? Math.round((repeatCount / totalCustomers) * 100) : 0;

  // Filtered & Sorted Customer List
  const filteredCustomers = useMemo(() => {
    let list = [...customers];

    if (activeFilter === 'REPEAT') {
      list = list.filter((c) => c.totalBillsCount > 1);
    } else if (activeFilter === 'HIGH_VALUE') {
      list = list.filter((c) => c.totalSpent >= 10000);
    } else if (activeFilter === 'NO_PHONE') {
      list = list.filter((c) => c.customerPhone === 'Walk-in / No Phone');
    }

    list.sort((a, b) => {
      if (sortBy === 'HIGHEST_SPEND') {
        return b.totalSpent - a.totalSpent;
      }
      if (sortBy === 'MOST_BILLS') {
        return b.totalBillsCount - a.totalBillsCount;
      }
      if (sortBy === 'NAME_ASC') {
        return a.customerName.localeCompare(b.customerName);
      }
      // Default: LATEST
      return new Date(b.lastVisitDate).getTime() - new Date(a.lastVisitDate).getTime();
    });

    return list;
  }, [customers, activeFilter, sortBy]);

  // Reset to page 1 whenever filters, search, or sorting change
  useEffect(() => {
    setCurrentPage(1);
  }, [search, activeFilter, sortBy, pageSize]);

  // Paginated Slice
  const totalPages = Math.max(1, Math.ceil(filteredCustomers.length / pageSize));
  const paginatedCustomers = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredCustomers.slice(start, start + pageSize);
  }, [filteredCustomers, currentPage, pageSize]);

  // Synchronize modalCustomer if customer records refresh
  useEffect(() => {
    if (modalCustomer) {
      const updated = customers.find((c) => c.customerPhone === modalCustomer.customerPhone);
      if (updated) {
        setModalCustomer(updated);
      }
    }
  }, [customers]);

  // Filter bills inside the Modal
  const modalVisibleBills = useMemo(() => {
    if (!modalCustomer) return [];
    if (!modalBillSearchTerm.trim()) return modalCustomer.bills;
    const term = modalBillSearchTerm.trim().toLowerCase();
    return modalCustomer.bills.filter(
      (b) =>
        b.invoiceNumber.toLowerCase().includes(term) ||
        b.paymentMethod.toLowerCase().includes(term) ||
        b.billingUserName.toLowerCase().includes(term) ||
        b.items.some((i) => i.productName.toLowerCase().includes(term) || i.barcode.toLowerCase().includes(term))
    );
  }, [modalCustomer, modalBillSearchTerm]);

  // Close modals on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (receiptBill) {
          setReceiptBill(null);
        } else if (modalCustomer) {
          setModalCustomer(null);
          setModalBillSearchTerm('');
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [receiptBill, modalCustomer]);

  const handleCopyPhone = (phone: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard?.writeText(phone);
    setCopiedPhone(phone);
    setTimeout(() => setCopiedPhone(null), 2000);
  };

  const handleOpenBillsModal = (customer: CustomerRecordDto, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setModalCustomer(customer);
    setModalBillSearchTerm('');
  };

  return (
    <div className="flex flex-col space-y-4 select-text">
      {/* 1. TOP ANALYTICS & STATS BANNER */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-3.5">
        {/* KPI 1: Unique Customers */}
        <div className="relative overflow-hidden rounded-2xl border border-cream-200 bg-white p-3.5 sm:p-4 shadow-2xs flex flex-col justify-between min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-stone-500 truncate">
              Total Customers
            </span>
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-200">
              👥
            </span>
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-1.5 flex-wrap">
            <span className="text-xl sm:text-2xl font-extrabold text-stone-900 tracking-tight font-mono truncate">
              {totalCustomers}
            </span>
            <span className="text-[10px] sm:text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-1.5 py-0.5 whitespace-nowrap shrink-0">
              By Mobile #
            </span>
          </div>
          <p className="mt-1 text-[11px] text-stone-400 truncate">Unique profiles on record</p>
        </div>

        {/* KPI 2: Repeat Buyers */}
        <div className="relative overflow-hidden rounded-2xl border border-cream-200 bg-white p-3.5 sm:p-4 shadow-2xs flex flex-col justify-between min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700 truncate">
              Repeat Customers
            </span>
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700 text-xs font-bold border border-amber-200">
              ⭐
            </span>
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-1.5 flex-wrap">
            <span className="text-xl sm:text-2xl font-extrabold text-amber-900 tracking-tight font-mono truncate">
              {repeatCount}
            </span>
            <span className="text-[10px] sm:text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-1.5 py-0.5 whitespace-nowrap shrink-0">
              {retentionRate}% Return Rate
            </span>
          </div>
          <p className="mt-1 text-[11px] text-stone-400 truncate">Visited 2 or more times</p>
        </div>

        {/* KPI 3: Lifetime Retail Sales */}
        <div className="relative overflow-hidden rounded-2xl border border-cream-200 bg-white p-3.5 sm:p-4 shadow-2xs flex flex-col justify-between min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-stone-500 truncate">
              Total Lifetime Sales
            </span>
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700 text-xs font-bold border border-indigo-200">
              💰
            </span>
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-1.5 flex-wrap">
            <span
              className="text-lg sm:text-2xl font-extrabold font-mono text-stone-900 tracking-tight truncate"
              title={`₹${totalRevenue.toLocaleString('en-IN')}`}
            >
              ₹{totalRevenue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </span>
            <span className="text-[10px] sm:text-[11px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-md px-1.5 py-0.5 whitespace-nowrap shrink-0">
              {totalBillsAcrossAll} Bills
            </span>
          </div>
          <p className="mt-1 text-[11px] text-stone-400 truncate">
            Total customer retail sales
          </p>
        </div>

        {/* KPI 4: Average Bill Size */}
        <div className="relative overflow-hidden rounded-2xl border border-cream-200 bg-white p-3.5 sm:p-4 shadow-2xs flex flex-col justify-between min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-stone-500 truncate">
              Avg Order Value (AOV)
            </span>
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-purple-50 text-purple-700 text-xs font-bold border border-purple-200">
              📊
            </span>
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-1.5 flex-wrap">
            <span className="text-lg sm:text-2xl font-extrabold font-mono text-purple-900 tracking-tight truncate">
              ₹{avgBillValue.toLocaleString('en-IN')}
            </span>
            <span className="text-[10px] sm:text-[11px] font-medium text-stone-500 whitespace-nowrap shrink-0">
              / bill avg
            </span>
          </div>
          <p className="mt-1 text-[11px] text-stone-400 truncate">Average ticket checkout</p>
        </div>
      </div>

      {/* 2. CUSTOMER DIRECTORY CARD & FULL-WIDTH TABULAR SECTION */}
      <div className="flex flex-col flex-1 min-h-0 rounded-2xl border border-cream-200 bg-white shadow-xs overflow-hidden">
        {/* Controls Header: Search, Filters & Sorters */}
        <div className="border-b border-cream-200 bg-cream-50/70 p-4 space-y-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            {/* Search Input Box */}
            <div className="relative flex-1 max-w-md">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-stone-400">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                id="search-customer-input"
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by customer phone number or name..."
                className="w-full rounded-xl border border-cream-300 bg-white py-2.5 pl-10 pr-16 text-xs font-medium text-stone-900 placeholder:text-stone-400 shadow-2xs focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 transition"
              />
              <div className="absolute inset-y-0 right-0 flex items-center pr-2.5 gap-1">
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="p-1 text-stone-400 hover:text-stone-600 transition"
                    title="Clear search"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void refreshCustomerRecords()}
                  disabled={loading}
                  className="p-1 text-stone-400 hover:text-stone-700 hover:bg-cream-100 rounded-lg transition"
                  title="Refresh customer list"
                >
                  <svg
                    className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-amber-600' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Sort & Page Size Controls */}
            <div className="flex items-center gap-2.5">
              <span className="text-[11px] font-bold text-stone-500">Sort by:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as DirectorySort)}
                className="rounded-lg border border-cream-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-stone-700 focus:outline-hidden focus:border-amber-500 shadow-2xs"
              >
                <option value="LATEST">Recent Visit</option>
                <option value="HIGHEST_SPEND">Highest Spend</option>
                <option value="MOST_BILLS">Most Bills</option>
                <option value="NAME_ASC">Name (A-Z)</option>
              </select>

              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="rounded-lg border border-cream-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-stone-700 focus:outline-hidden focus:border-amber-500 shadow-2xs"
              >
                <option value={10}>10 per page</option>
                <option value={25}>25 per page</option>
                <option value={50}>50 per page</option>
                <option value={100}>100 per page</option>
              </select>
            </div>
          </div>

          {/* Filter Pills */}
          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            <button
              type="button"
              onClick={() => setActiveFilter('ALL')}
              className={`rounded-lg px-3 py-1 text-xs font-bold transition ${
                activeFilter === 'ALL'
                  ? 'bg-stone-900 text-white shadow-2xs'
                  : 'bg-white text-stone-600 border border-cream-300 hover:bg-cream-100'
              }`}
            >
              All Customers ({customers.length})
            </button>

            <button
              type="button"
              onClick={() => setActiveFilter('REPEAT')}
              className={`rounded-lg px-3 py-1 text-xs font-bold transition flex items-center gap-1.5 ${
                activeFilter === 'REPEAT'
                  ? 'bg-amber-600 text-white shadow-2xs'
                  : 'bg-white text-amber-800 border border-amber-200 hover:bg-amber-50'
              }`}
            >
              <span>⭐ Repeat Customers</span>
              <span>({repeatCount})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveFilter('HIGH_VALUE')}
              className={`rounded-lg px-3 py-1 text-xs font-bold transition ${
                activeFilter === 'HIGH_VALUE'
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'bg-white text-emerald-800 border border-emerald-200 hover:bg-emerald-50'
              }`}
            >
              💎 High Value (&gt;₹10,000)
            </button>

            <button
              type="button"
              onClick={() => setActiveFilter('NO_PHONE')}
              className={`rounded-lg px-3 py-1 text-xs font-bold transition ${
                activeFilter === 'NO_PHONE'
                  ? 'bg-stone-700 text-white shadow-2xs'
                  : 'bg-white text-stone-600 border border-cream-300 hover:bg-cream-100'
              }`}
            >
              Walk-in / No Phone
            </button>
          </div>
        </div>

        {/* Tabular Form Content */}
        <div className="flex-1 overflow-x-auto overflow-y-auto min-h-0">
          {error && (
            <div className="m-4 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-700 font-medium">
              {error}
            </div>
          )}

          <table className="w-full border-collapse text-left text-xs">
            {/* Table Header */}
            <thead className="sticky top-0 z-10 bg-cream-100/90 backdrop-blur-xs text-stone-600 font-bold uppercase tracking-wider text-[11px] border-b border-cream-200">
              <tr>
                <th className="py-3 px-3.5 text-center w-12 border-r border-cream-200/80">#</th>
                <th className="py-3 px-4 border-r border-cream-200/80">Customer</th>
                <th className="py-3 px-4 border-r border-cream-200/80">Mobile Number</th>
                <th className="py-3 px-4 text-center border-r border-cream-200/80">Bills</th>
                <th className="py-3 px-4 text-right border-r border-cream-200/80">Total Spent</th>
                <th className="py-3 px-4 border-r border-cream-200/80">First Visit</th>
                <th className="py-3 px-4 border-r border-cream-200/80">Last Visit</th>
                <th className="py-3 px-4 text-center w-44">Actions</th>
              </tr>
            </thead>

            {/* Table Body */}
            <tbody className="divide-y divide-cream-100 bg-white">
              {filteredCustomers.length === 0 && !loading ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-stone-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <span className="text-4xl">🔍</span>
                      <span className="text-sm font-bold text-stone-700">No Customer Records Found</span>
                      <p className="text-xs text-stone-500 max-w-sm">
                        {search ? `No customer profile matches "${search}"` : 'No customers match the active filter.'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedCustomers.map((c, index) => {
                  const globalIndex = (currentPage - 1) * pageSize + index + 1;
                  const avatarCls = getAvatarColorClass(c.customerPhone);
                  const initials = getInitials(c.customerName, c.customerPhone);
                  const isRepeat = c.totalBillsCount > 1;

                  return (
                    <tr
                      key={c.customerPhone}
                      onClick={() => handleOpenBillsModal(c)}
                      className="hover:bg-amber-50/30 even:bg-cream-50/25 cursor-pointer transition"
                    >
                      {/* Row Index */}
                      <td className="py-3 px-3.5 text-center text-stone-400 font-mono text-xs border-r border-cream-100">
                        {globalIndex}
                      </td>

                      {/* Customer Name & Avatar */}
                      <td className="py-3 px-4 border-r border-cream-100">
                        <div className="flex items-center gap-3">
                          <div
                            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border font-bold text-xs shadow-2xs ${avatarCls}`}
                          >
                            {initials}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-stone-900 text-sm truncate">
                                {c.customerName}
                              </span>
                              {c.totalBillsCount >= 3 ? (
                                <span className="rounded-md bg-indigo-50 text-indigo-800 px-1.5 py-0.2 text-[9px] font-bold border border-indigo-200">
                                  💎 VIP
                                </span>
                              ) : isRepeat ? (
                                <span className="rounded-md bg-amber-50 text-amber-800 px-1.5 py-0.2 text-[9px] font-bold border border-amber-200">
                                  ⭐ Returning
                                </span>
                              ) : (
                                <span className="rounded-md bg-stone-100 text-stone-600 px-1.5 py-0.2 text-[9px] font-medium border border-stone-200">
                                  New
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Mobile Number with Copy Option */}
                      <td className="py-3 px-4 border-r border-cream-100 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-stone-800 bg-cream-50 px-2 py-0.5 rounded-md border border-cream-200">
                            {c.customerPhone}
                          </span>
                          {c.customerPhone !== 'Walk-in / No Phone' && (
                            <button
                              type="button"
                              onClick={(e) => handleCopyPhone(c.customerPhone, e)}
                              className="p-1 rounded-md text-stone-400 hover:text-stone-700 hover:bg-cream-100 transition"
                              title="Copy mobile number"
                            >
                              {copiedPhone === c.customerPhone ? (
                                <span className="text-[10px] font-bold text-emerald-600">Copied!</span>
                              ) : (
                                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                </svg>
                              )}
                            </button>
                          )}
                        </div>
                      </td>

                      {/* Total Bills */}
                      <td className="py-3 px-4 text-center border-r border-cream-100 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 font-bold text-xs px-2.5 py-0.5 rounded-full border ${
                            isRepeat
                              ? 'bg-amber-50 text-amber-800 border-amber-200'
                              : 'bg-stone-50 text-stone-700 border-stone-200'
                          }`}
                        >
                          {isRepeat && <span>⭐</span>}
                          <span>{c.totalBillsCount} {c.totalBillsCount === 1 ? 'bill' : 'bills'}</span>
                        </span>
                      </td>

                      {/* Total Spent */}
                      <td className="py-3 px-4 text-right border-r border-cream-100 whitespace-nowrap">
                        <div className="font-extrabold font-mono text-emerald-800 text-sm">
                          ₹{c.totalSpent.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </div>
                      </td>

                      {/* First Visit */}
                      <td className="py-3 px-4 border-r border-cream-100 whitespace-nowrap text-stone-600 font-medium text-xs">
                        {formatFullDate(c.firstVisitDate)}
                      </td>

                      {/* Last Visit with Relative Badge */}
                      <td className="py-3 px-4 border-r border-cream-100 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-stone-800 text-xs">
                            {formatFullDate(c.lastVisitDate)}
                          </span>
                          <span className="text-[10px] text-stone-400 bg-cream-100 px-1.5 py-0.2 rounded border border-cream-200">
                            {formatRelativeTime(c.lastVisitDate)}
                          </span>
                        </div>
                      </td>

                      {/* Action Button: Opens Customer Bills Modal */}
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={(e) => handleOpenBillsModal(c, e)}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 px-3 py-1.5 text-xs font-bold text-white shadow-2xs transition"
                            title="View all bills for this customer"
                          >
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <span>View Bills ({c.totalBillsCount})</span>
                          </button>

                          {onNavigateToBilling && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onNavigateToBilling(
                                  c.customerPhone !== 'Walk-in / No Phone' ? c.customerPhone : undefined,
                                  c.customerName
                                );
                              }}
                              className="inline-flex items-center rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 p-1.5 transition"
                              title="Create new bill for this customer"
                            >
                              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Tabular Footer: Pagination Controls */}
        <div className="border-t border-cream-200 bg-cream-50/70 px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-stone-600">
          <div>
            Showing{' '}
            <strong className="text-stone-900 font-bold">
              {filteredCustomers.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}
            </strong>{' '}
            to{' '}
            <strong className="text-stone-900 font-bold">
              {Math.min(currentPage * pageSize, filteredCustomers.length)}
            </strong>{' '}
            of <strong className="text-stone-900 font-bold">{filteredCustomers.length}</strong> customer records
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="rounded-lg border border-cream-300 bg-white px-2.5 py-1 text-xs font-semibold text-stone-700 hover:bg-cream-100 disabled:opacity-40 disabled:cursor-not-allowed shadow-2xs transition"
            >
              Previous
            </button>

            <span className="px-2 text-stone-500 font-semibold text-xs">
              Page {currentPage} of {totalPages}
            </span>

            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="rounded-lg border border-cream-300 bg-white px-2.5 py-1 text-xs font-semibold text-stone-700 hover:bg-cream-100 disabled:opacity-40 disabled:cursor-not-allowed shadow-2xs transition"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* ============================================================== */}
      {/* 3. CUSTOMER BILLS MODAL (Shown when 'View Bills' is clicked)   */}
      {/* ============================================================== */}
      {modalCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 p-4 backdrop-blur-xs select-text">
          <div className="flex h-[90vh] max-h-[850px] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-cream-300 bg-white shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header: Customer Identity & Stats */}
            <div className="border-b border-cream-200 bg-gradient-to-r from-cream-50/90 to-amber-50/40 p-5">
              <div className="flex items-start justify-between gap-4">
                {/* Avatar & Customer Details */}
                <div className="flex items-center gap-3.5 min-w-0">
                  <div
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border-2 font-black text-sm shadow-2xs ${getAvatarColorClass(
                      modalCustomer.customerPhone
                    )}`}
                  >
                    {getInitials(modalCustomer.customerName, modalCustomer.customerPhone)}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-extrabold text-stone-900 truncate">
                        {modalCustomer.customerName}
                      </h2>
                      {modalCustomer.totalBillsCount >= 3 ? (
                        <span className="rounded-full bg-indigo-100 text-indigo-800 px-2.5 py-0.5 text-[10px] font-bold border border-indigo-200 shadow-2xs">
                          💎 VIP Frequent Shopper
                        </span>
                      ) : modalCustomer.totalBillsCount > 1 ? (
                        <span className="rounded-full bg-amber-100 text-amber-800 px-2.5 py-0.5 text-[10px] font-bold border border-amber-200 shadow-2xs">
                          ⭐ Returning Customer
                        </span>
                      ) : (
                        <span className="rounded-full bg-stone-100 text-stone-700 px-2.5 py-0.5 text-[10px] font-bold border border-stone-200">
                          First-Time Buyer
                        </span>
                      )}
                    </div>

                    <div className="mt-1 flex items-center gap-2 text-xs">
                      <div className="flex items-center gap-1 font-mono font-bold text-stone-800 bg-white/90 border border-cream-300 rounded-lg px-2 py-0.5 shadow-2xs">
                        <span>📞</span>
                        <span>{modalCustomer.customerPhone}</span>
                      </div>
                      {modalCustomer.customerPhone !== 'Walk-in / No Phone' && (
                        <button
                          type="button"
                          onClick={(e) => handleCopyPhone(modalCustomer.customerPhone, e)}
                          className="rounded-lg p-1 text-stone-400 hover:text-stone-700 hover:bg-white transition"
                          title="Copy phone number"
                        >
                          {copiedPhone === modalCustomer.customerPhone ? (
                            <span className="text-[10px] font-bold text-emerald-600">Copied!</span>
                          ) : (
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Top Right Close Button */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setModalCustomer(null);
                      setModalBillSearchTerm('');
                    }}
                    className="rounded-xl border border-cream-300 bg-white p-2 text-stone-400 hover:text-stone-700 hover:bg-cream-100 shadow-2xs transition"
                    title="Close bills modal (Esc)"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Quick Customer Metrics Cards */}
              <div className="mt-3.5 grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="rounded-xl border border-cream-200 bg-white/90 p-2 sm:p-2.5 text-center shadow-2xs min-w-0">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-stone-400 truncate">Total Spent</div>
                  <div
                    className="text-xs sm:text-sm font-bold font-mono text-emerald-800 mt-0.5 truncate"
                    title={`₹${modalCustomer.totalSpent.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
                  >
                    ₹{modalCustomer.totalSpent.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                  </div>
                </div>

                <div className="rounded-xl border border-cream-200 bg-white/90 p-2 sm:p-2.5 text-center shadow-2xs min-w-0">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-stone-400 truncate">Total Visits</div>
                  <div className="text-xs sm:text-sm font-bold text-stone-900 mt-0.5 truncate">
                    {modalCustomer.totalBillsCount} {modalCustomer.totalBillsCount === 1 ? 'bill' : 'bills'}
                  </div>
                </div>

                <div className="rounded-xl border border-cream-200 bg-white/90 p-2 sm:p-2.5 text-center shadow-2xs min-w-0">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-stone-400 truncate">First Purchase</div>
                  <div className="text-[11px] sm:text-xs font-semibold text-stone-700 mt-0.5 truncate">
                    {formatFullDate(modalCustomer.firstVisitDate)}
                  </div>
                </div>

                <div className="rounded-xl border border-cream-200 bg-white/90 p-2 sm:p-2.5 text-center shadow-2xs min-w-0">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-stone-400 truncate">Last Active</div>
                  <div className="text-[11px] sm:text-xs font-semibold text-amber-900 mt-0.5 truncate">
                    {formatFullDate(modalCustomer.lastVisitDate)}
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Subheader: Search within Customer Bills */}
            <div className="border-b border-cream-200 bg-white px-5 py-2.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-stone-800">
                  Customer Bills History ({modalCustomer.bills.length})
                </span>
                <span className="text-[10px] font-medium text-stone-400">Sorted newest first</span>
              </div>

              <div className="relative w-56">
                <input
                  type="text"
                  value={modalBillSearchTerm}
                  onChange={(e) => setModalBillSearchTerm(e.target.value)}
                  placeholder="Search invoice or item name..."
                  className="w-full rounded-lg border border-cream-300 bg-cream-50/50 py-1 pl-2.5 pr-6 text-[11px] text-stone-800 placeholder:text-stone-400 focus:outline-hidden focus:border-amber-500 focus:bg-white"
                />
                {modalBillSearchTerm && (
                  <button
                    type="button"
                    onClick={() => setModalBillSearchTerm('')}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {/* Modal Body: Scrollable Bills List */}
            <div className="flex-1 overflow-y-auto p-5 space-y-3.5 bg-cream-50/30">
              {modalVisibleBills.length === 0 ? (
                <div className="p-12 text-center text-stone-400 text-xs">
                  No bills found matching "{modalBillSearchTerm}"
                </div>
              ) : (
                modalVisibleBills.map((b) => {
                  const billDate = new Date(b.createdAt);
                  const isCancelled = b.status === 'CANCELLED';

                  return (
                    <div
                      key={b.id}
                      className={`rounded-2xl border p-4 transition ${
                        isCancelled
                          ? 'border-rose-200 bg-rose-50/40'
                          : 'border-cream-200 bg-white hover:border-amber-300 shadow-2xs hover:shadow-xs'
                      }`}
                    >
                      {/* Bill Header */}
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold text-stone-900 bg-cream-100/70 border border-cream-300 px-2 py-0.5 rounded-md">
                              {b.invoiceNumber}
                            </span>
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold border ${
                                isCancelled
                                  ? 'bg-rose-100 text-rose-800 border-rose-300'
                                  : b.paymentMethod === 'ONLINE' || b.paymentMethod === 'UPI'
                                  ? 'bg-blue-50 text-blue-800 border-blue-200'
                                  : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              }`}
                            >
                              {isCancelled ? 'CANCELLED' : `PAID • ${b.paymentMethod}`}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 text-[11px] text-stone-500 mt-1.5">
                            <span>
                              📅{' '}
                              {billDate.toLocaleDateString('en-IN', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                              })}{' '}
                              at{' '}
                              {billDate.toLocaleTimeString('en-IN', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                            <span>•</span>
                            <span>
                              Cashier: <strong className="text-stone-700">{b.billingUserName}</strong>
                            </span>
                          </div>
                        </div>

                        {/* Bill Total Price */}
                        <div className="text-right">
                          <div className="text-base font-extrabold font-mono text-stone-900">
                            ₹{b.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </div>
                          <div className="flex items-center justify-end gap-1.5 text-[10px] mt-0.5">
                            {b.discount > 0 && (
                              <span className="font-semibold text-rose-700 bg-rose-50 px-1 py-0.2 rounded border border-rose-200">
                                Disc: -₹{b.discount.toLocaleString('en-IN')}
                              </span>
                            )}
                            {b.tax > 0 && (
                              <span className="font-semibold text-stone-600 bg-stone-100 px-1 py-0.2 rounded border border-stone-200">
                                GST: +₹{b.tax.toLocaleString('en-IN')}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Itemized Products Preview Table */}
                      <div className="mt-3 rounded-xl bg-cream-50/70 border border-cream-200/80 p-2.5 text-xs">
                        <div className="text-[11px] font-bold text-stone-600 mb-1.5 flex items-center justify-between border-b border-cream-200/60 pb-1">
                          <span>Item Breakdown ({b.items.length})</span>
                          <span className="text-[10px] text-stone-400">Qty × Unit Rate = Total</span>
                        </div>
                        <div className="divide-y divide-cream-100">
                          {b.items.map((item, itemIdx) => (
                            <div
                              key={itemIdx}
                              className="py-1 flex items-center justify-between text-[11px] text-stone-800"
                            >
                              <div className="truncate pr-2">
                                <span className="font-bold text-stone-900">{item.productName}</span>{' '}
                                <span className="text-[10px] text-stone-400 font-mono">({item.barcode})</span>
                                {item.categoryName && (
                                  <span className="ml-1.5 rounded bg-white px-1 py-0.2 text-[9px] font-semibold text-stone-600 border border-cream-200">
                                    {item.categoryName}
                                  </span>
                                )}
                              </div>
                              <div className="shrink-0 font-mono text-stone-700 font-semibold text-right">
                                {item.quantity} × ₹{item.unitPrice.toLocaleString('en-IN')} ={' '}
                                <span className="text-stone-900 font-bold">
                                  ₹{item.totalPrice.toLocaleString('en-IN')}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="mt-3 flex items-center justify-end gap-2 pt-2 border-t border-cream-100">
                        {onEditBill && !isCancelled && (
                          <button
                            type="button"
                            onClick={() => {
                              setModalCustomer(null);
                              onEditBill(b.id);
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border border-cream-300 bg-white hover:bg-cream-100 px-2.5 py-1 text-xs font-semibold text-stone-700 shadow-2xs transition"
                          >
                            <svg className="h-3.5 w-3.5 text-stone-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                            <span>Edit Bill</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => setReceiptBill(b)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 px-3 py-1.5 text-xs font-bold text-white shadow-2xs transition"
                        >
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          <span>View / Print Invoice</span>
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Modal Footer */}
            <div className="border-t border-cream-200 bg-cream-50/70 px-5 py-3 flex items-center justify-between">
              <span className="text-xs text-stone-500">
                Showing {modalVisibleBills.length} of {modalCustomer.bills.length} bills
              </span>
              <button
                type="button"
                onClick={() => {
                  setModalCustomer(null);
                  setModalBillSearchTerm('');
                }}
                className="rounded-xl border border-cream-300 bg-white hover:bg-cream-100 px-4 py-1.5 text-xs font-bold text-stone-700 shadow-2xs transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. A4 TAX INVOICE & RECEIPT MODAL */}
      <SalesReceiptModal
        isOpen={Boolean(receiptBill)}
        onClose={() => setReceiptBill(null)}
        bill={receiptBill}
        session={session}
      />
    </div>
  );
};
