import React, { useEffect, useState } from 'react';
import type {
  AuthSessionPayload,
  BillDto,
  BillingUserDto,
  CompanyExpenseTotalsDto,
  PurchaseDto,
  PurchaseReturnDto,
} from '../../shared/types/ipc';
import { useToast } from '../context/ToastContext';
import { ipcClient } from '../services/ipcClient';
import { SalesReceiptModal } from '../components/SalesReceiptModal';

interface BillsHistoryPageProps {
  session: AuthSessionPayload;
  onNavigateToBilling?: () => void;
  onEditBill?: (billId: string) => void;
}

type DateFilterType = 'TODAY' | 'CUSTOM' | 'ALL';

const formatDateForInput = (d: Date) => {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

export const BillsHistoryPage: React.FC<BillsHistoryPageProps> = ({ session, onNavigateToBilling, onEditBill }) => {
  const { showError, showSuccess } = useToast();
  const isCompanyAdmin = session.role === 'COMPANY_ADMIN';
  const isBillingUser = session.role === 'BILLING_USER';
  const [bills, setBills] = useState<BillDto[]>([]);
  const [purchases, setPurchases] = useState<PurchaseDto[]>([]);
  const [purchaseReturns, setPurchaseReturns] = useState<PurchaseReturnDto[]>([]);
  const [billingUsers, setBillingUsers] = useState<BillingUserDto[]>([]);
  const [selectedBillingUserId, setSelectedBillingUserId] = useState<string>('');
  const [expenseTotals, setExpenseTotals] = useState<CompanyExpenseTotalsDto>({
    cashExpenses: 0,
    onlineExpenses: 0,
    totalExpenses: 0,
    count: 0,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedBill, setSelectedBill] = useState<BillDto | null>(null);
  const [cancellingBillId, setCancellingBillId] = useState<string | null>(null);

  // Date Filter State: Default to 'TODAY'
  const [filterType, setFilterType] = useState<DateFilterType>('TODAY');
  const [customStartDate, setCustomStartDate] = useState<string>(() => formatDateForInput(new Date()));
  const [customEndDate, setCustomEndDate] = useState<string>(() => formatDateForInput(new Date()));

  const getDateRangeForFilter = (
    type: DateFilterType,
    fromStr: string,
    toStr: string
  ): { startDate?: string; endDate?: string } => {
    if (type === 'ALL') {
      return {};
    }
    if (type === 'TODAY') {
      const today = new Date();
      const start = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
      const end = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
      return {
        startDate: start.toISOString(),
        endDate: end.toISOString(),
      };
    }
    if (type === 'CUSTOM') {
      if (!fromStr || !toStr) return {};
      const [fY, fM, fD] = fromStr.split('-').map(Number);
      const [tY, tM, tD] = toStr.split('-').map(Number);
      const start = new Date(fY, fM - 1, fD, 0, 0, 0, 0);
      const end = new Date(tY, tM - 1, tD, 23, 59, 59, 999);
      return {
        startDate: start.toISOString(),
        endDate: end.toISOString(),
      };
    }
    return {};
  };

  // Load registered billing users for the filter dropdown
  useEffect(() => {
    let isCurrent = true;
    const loadUsers = async () => {
      try {
        const res = await ipcClient.listBillingUsers();
        if (isCurrent && res.success) {
          setBillingUsers(res.data);
        }
      } catch (err) {
        console.error('Failed to load billing users:', err);
      }
    };
    void loadUsers();
    return () => {
      isCurrent = false;
    };
  }, []);

  const fetchBillsAndPurchases = async (
    searchTerm = search,
    type = filterType,
    fromStr = customStartDate,
    toStr = customEndDate,
    operatorId = selectedBillingUserId,
    usersList = billingUsers
  ) => {
    setLoading(true);
    try {
      const { startDate, endDate } = getDateRangeForFilter(type, fromStr, toStr);
      const targetCompanyId = isCompanyAdmin ? session.companyId : undefined;
      const targetOp = (usersList.length > 0 ? usersList : billingUsers).find((u) => u.id === operatorId);

      const [billsRes, purchasesRes, returnsRes, expensesRes] = await Promise.all([
        ipcClient.listBills({
          search: searchTerm.trim() || undefined,
          startDate,
          endDate,
          limit: 300,
          companyId: targetCompanyId,
          billingUserId: targetOp?.id || (operatorId ? operatorId : undefined),
          billingUserName: targetOp?.name || undefined,
        }),
        ipcClient.listPurchases({
          startDate: startDate ? startDate.slice(0, 10) : undefined,
          endDate: endDate ? endDate.slice(0, 10) : undefined,
          companyId: targetCompanyId,
        }),
        ipcClient.listPurchaseReturns({
          startDate: startDate ? startDate.slice(0, 10) : undefined,
          endDate: endDate ? endDate.slice(0, 10) : undefined,
          companyId: targetCompanyId,
        }),
        ipcClient.getCompanyExpenseTotals({
          companyId: targetCompanyId,
          startDate: startDate ? startDate.slice(0, 10) : undefined,
          endDate: endDate ? endDate.slice(0, 10) : undefined,
        }),
      ]);

      if (billsRes.success) {
        setBills(billsRes.data);
      } else {
        showError(billsRes.error || 'Failed to load invoices.');
      }

      if (purchasesRes.success) {
        setPurchases(purchasesRes.data);
      }

      if (returnsRes.success) {
        setPurchaseReturns(returnsRes.data);
      }

      if (expensesRes.success) {
        setExpenseTotals(expensesRes.data);
      }
    } catch {
      showError('Error fetching records.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchBillsAndPurchases(search, filterType, customStartDate, customEndDate, selectedBillingUserId);
  }, []);

  const handleFilterTypeChange = (newType: DateFilterType) => {
    setFilterType(newType);
    void fetchBillsAndPurchases(search, newType, customStartDate, customEndDate, selectedBillingUserId);
  };

  const handleBillingUserChange = (opId: string) => {
    setSelectedBillingUserId(opId);
    void fetchBillsAndPurchases(search, filterType, customStartDate, customEndDate, opId);
  };

  const handleApplyCustomDates = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setFilterType('CUSTOM');
    void fetchBillsAndPurchases(search, 'CUSTOM', customStartDate, customEndDate, selectedBillingUserId);
  };

  const setPresetRange = (preset: 'YESTERDAY' | 'LAST7' | 'THIS_MONTH') => {
    const now = new Date();
    if (preset === 'YESTERDAY') {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yStr = formatDateForInput(yesterday);
      setCustomStartDate(yStr);
      setCustomEndDate(yStr);
      setFilterType('CUSTOM');
      void fetchBillsAndPurchases(search, 'CUSTOM', yStr, yStr, selectedBillingUserId);
    } else if (preset === 'LAST7') {
      const past7 = new Date();
      past7.setDate(past7.getDate() - 6);
      const startStr = formatDateForInput(past7);
      const endStr = formatDateForInput(now);
      setCustomStartDate(startStr);
      setCustomEndDate(endStr);
      setFilterType('CUSTOM');
      void fetchBillsAndPurchases(search, 'CUSTOM', startStr, endStr, selectedBillingUserId);
    } else if (preset === 'THIS_MONTH') {
      const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const startStr = formatDateForInput(startMonth);
      const endStr = formatDateForInput(now);
      setCustomStartDate(startStr);
      setCustomEndDate(endStr);
      setFilterType('CUSTOM');
      void fetchBillsAndPurchases(search, 'CUSTOM', startStr, endStr, selectedBillingUserId);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void fetchBillsAndPurchases(search, filterType, customStartDate, customEndDate, selectedBillingUserId);
  };

  const handleClearFilters = () => {
    setSearch('');
    setSelectedBillingUserId('');
    void fetchBillsAndPurchases('', filterType, customStartDate, customEndDate, '');
  };

  const handleCancelBill = async (bill: BillDto) => {
    const confirmMsg = `Are you sure you want to cancel and void Invoice #${bill.invoiceNumber}?\n\nThis will restore stock inventory for all ${bill.items.length} product(s) back to the warehouse.`;
    if (!window.confirm(confirmMsg)) return;

    setCancellingBillId(bill.id);
    try {
      const res = await ipcClient.cancelBill(bill.id);
      if (res.success) {
        showSuccess(`Bill #${bill.invoiceNumber} cancelled and stock inventory restored successfully.`);
        void fetchBillsAndPurchases(search, filterType, customStartDate, customEndDate, selectedBillingUserId);
      } else {
        showError(res.error || 'Failed to cancel bill.');
      }
    } catch {
      showError('Error cancelling bill.');
    } finally {
      setCancellingBillId(null);
    }
  };

  // 1. Customer Sales Breakdown (Inflow)
  const activeBills = bills.filter((b) => b.status !== 'CANCELLED');
  const cancelledBills = bills.filter((b) => b.status === 'CANCELLED');

  const cashSalesBills = activeBills.filter((b) => b.paymentMethod === 'CASH');
  const onlineSalesBills = activeBills.filter((b) => {
    const pm = (b.paymentMethod || '').toUpperCase();
    return pm === 'ONLINE' || pm === 'UPI' || pm === 'CARD';
  });

  const totalCashSales = cashSalesBills.reduce((sum, b) => sum + (b.totalAmount || 0), 0);
  const totalOnlineSales = onlineSalesBills.reduce((sum, b) => sum + (b.totalAmount || 0), 0);
  const totalGrossSales = activeBills.reduce((sum, b) => sum + (b.totalAmount || 0), 0);

  // 2. Inward Purchases Breakdown (Outflow)
  const getPurchasePaidAmount = (p: PurchaseDto) => {
    if (p.paymentMethod === 'NO_PAYMENT' || p.paymentStatus === 'UNPAID') return 0;
    if (typeof p.paidAmount === 'number' && p.paidAmount > 0) return p.paidAmount;
    if (p.paymentStatus === 'PAID') return p.totalAmount || 0;
    return p.paidAmount || 0;
  };

  const cashPurchases = purchases.filter((p) => p.paymentMethod === 'CASH');
  const onlinePurchases = purchases.filter((p) => {
    const pm = (p.paymentMethod || '').toUpperCase();
    return pm === 'ONLINE' || pm === 'UPI' || pm === 'BANK_TRANSFER' || pm === 'CARD';
  });

  const totalCashPurchases = cashPurchases.reduce((sum, p) => sum + getPurchasePaidAmount(p), 0);
  const totalOnlinePurchases = onlinePurchases.reduce((sum, p) => sum + getPurchasePaidAmount(p), 0);
  const totalGrossPurchases = Math.round((totalCashPurchases + totalOnlinePurchases) * 100) / 100;

  // 3. Purchase Returns (Vendor Refunds / Inflow)
  const cashReturns = purchaseReturns.filter((r) => r.refundType === 'CASH');
  const onlineReturns = purchaseReturns.filter((r) => r.refundType === 'ONLINE');

  const totalCashRefunds = cashReturns.reduce((sum, r) => sum + (r.refundAmount || 0), 0);
  const totalOnlineRefunds = onlineReturns.reduce((sum, r) => sum + (r.refundAmount || 0), 0);
  const totalGrossRefunds = Math.round((totalCashRefunds + totalOnlineRefunds) * 100) / 100;

  const netCashPurchaseOutflow = Math.max(0, Math.round((totalCashPurchases - totalCashRefunds) * 100) / 100);
  const netOnlinePurchaseOutflow = Math.max(0, Math.round((totalOnlinePurchases - totalOnlineRefunds) * 100) / 100);
  const netGrossPurchaseOutflow = Math.max(0, Math.round((totalGrossPurchases - totalGrossRefunds) * 100) / 100);

  // 4. Operational Expenses Deductions
  const totalCashExpenses = expenseTotals.cashExpenses || 0;
  const totalOnlineExpenses = expenseTotals.onlineExpenses || 0;
  const totalGrossExpenses = expenseTotals.totalExpenses || 0;

  // 5. Net Matching (Cash with Cash, Online with Online, deducting expenses)
  const netCashRemaining = Math.round((totalCashSales - netCashPurchaseOutflow - totalCashExpenses) * 100) / 100;
  const netOnlineRemaining = Math.round((totalOnlineSales - netOnlinePurchaseOutflow - totalOnlineExpenses) * 100) / 100;
  const netTotalBalance = Math.round((totalGrossSales - netGrossPurchaseOutflow - totalGrossExpenses) * 100) / 100;

  const totalSalesUnits = activeBills.reduce(
    (sum, b) => sum + (b.items?.reduce((s, it) => s + (it.quantity || 1), 0) || 0),
    0
  );
  const totalPurchaseUnits = purchases.reduce(
    (sum, p) => sum + (p.totalUnitsBought || p.items?.reduce((s, it) => s + (it.quantityBought || 1), 0) || 0),
    0
  );

  const cashCount = cashSalesBills.length;
  const onlineCount = onlineSalesBills.length;
  const totalActiveCount = activeBills.length;
  const cancelledCount = cancelledBills.length;

  const todayFormatted = new Date().toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return (
    <div className="flex h-full flex-col gap-4">
      {/* 1. STATS SECTION WITH DATE FILTER TABS */}
      <div className="rounded-2xl border border-cream-300 bg-white p-5 shadow-sm space-y-4">
        {/* Filter Navigation Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-cream-200 pb-3">
          <div>
            <h3 className="text-sm font-bold text-stone-900 flex items-center gap-2">
              <span>{isCompanyAdmin ? `${session.companyName} - Customer Sales Records` : 'Payment Breakdown & Statistics'}</span>
              {isCompanyAdmin && (
                <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900 border border-amber-300">
                  {session.companyName} Records
                </span>
              )}
              {filterType === 'TODAY' && (
                <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800 border border-amber-200">
                  Today: {todayFormatted}
                </span>
              )}
              {filterType === 'CUSTOM' && (
                <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800 border border-amber-200 font-mono">
                  {customStartDate} → {customEndDate}
                </span>
              )}
              {filterType === 'ALL' && (
                <span className="rounded-md bg-stone-100 px-2 py-0.5 text-[10px] font-bold text-stone-700 border border-stone-200">
                  All Time
                </span>
              )}
              {selectedBillingUserId && (
                <span className="rounded-md bg-purple-100 px-2 py-0.5 text-[10px] font-bold text-purple-900 border border-purple-200">
                  Cashier: {billingUsers.find((u) => u.id === selectedBillingUserId)?.name || 'Selected'}
                </span>
              )}
              <span className="rounded-full bg-cream-100 px-2.5 py-0.5 text-[10px] font-bold text-stone-600 border border-cream-300">
                {bills.length} {bills.length === 1 ? 'bill' : 'bills'}
              </span>
            </h3>
            <p className="text-[11px] text-stone-500">
              {isCompanyAdmin
                ? `Live sales and revenue tracking for products sold under ${session.companyName}`
                : 'Live financial summary of cash and online receipts for the selected period'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Filter Mode Selector Pills */}
            <div className="inline-flex rounded-xl bg-cream-100 p-1 border border-cream-200/80 shadow-2xs">
              <button
                type="button"
                onClick={() => handleFilterTypeChange('TODAY')}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                  filterType === 'TODAY'
                    ? 'bg-amber-600 text-white shadow-2xs'
                    : 'text-stone-700 hover:text-stone-900 hover:bg-cream-200/50'
                }`}
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span>Today</span>
              </button>

              <button
                type="button"
                onClick={() => handleFilterTypeChange('CUSTOM')}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                  filterType === 'CUSTOM'
                    ? 'bg-amber-600 text-white shadow-2xs'
                    : 'text-stone-700 hover:text-stone-900 hover:bg-cream-200/50'
                }`}
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
                <span>Date Wise</span>
              </button>

              <button
                type="button"
                onClick={() => handleFilterTypeChange('ALL')}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                  filterType === 'ALL'
                    ? 'bg-amber-600 text-white shadow-2xs'
                    : 'text-stone-700 hover:text-stone-900 hover:bg-cream-200/50'
                }`}
              >
                <span>All Time</span>
              </button>
            </div>

            {onNavigateToBilling && (
              <button
                type="button"
                onClick={onNavigateToBilling}
                className="flex items-center gap-1.5 rounded-xl border border-cream-300 bg-white px-3 py-1.5 text-xs font-bold text-stone-700 hover:bg-cream-100 shadow-2xs transition"
                title="Go back to POS Billing Terminal"
              >
                <svg className="h-3.5 w-3.5 text-amber-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17" />
                </svg>
                <span>POS Terminal</span>
              </button>
            )}
          </div>
        </div>

        {/* Date Wise Filter Controls Bar (Visible when Date Wise is selected) */}
        {filterType === 'CUSTOM' && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-cream-50/80 p-3 border border-cream-200 animate-in fade-in duration-150">
            <form onSubmit={handleApplyCustomDates} className="flex flex-wrap items-center gap-3 text-xs">
              <div className="flex items-center gap-1.5">
                <label className="font-bold text-stone-700 text-[11px]">From:</label>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="rounded-lg border border-cream-300 bg-white px-2.5 py-1 text-xs font-medium text-stone-900 focus:border-amber-600 focus:outline-none shadow-2xs"
                />
              </div>

              <div className="flex items-center gap-1.5">
                <label className="font-bold text-stone-700 text-[11px]">To:</label>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="rounded-lg border border-cream-300 bg-white px-2.5 py-1 text-xs font-medium text-stone-900 focus:border-amber-600 focus:outline-none shadow-2xs"
                />
              </div>

              <button
                type="submit"
                className="rounded-lg bg-amber-600 px-3.5 py-1 font-bold text-white hover:bg-amber-500 shadow-2xs transition"
              >
                Apply Date Filter
              </button>
            </form>

            {/* Quick Range Chips */}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-semibold text-stone-500 uppercase">Presets:</span>
              <button
                type="button"
                onClick={() => setPresetRange('YESTERDAY')}
                className="rounded-md bg-white border border-cream-300 px-2 py-0.5 text-[11px] font-semibold text-stone-700 hover:bg-cream-100 transition shadow-2xs"
              >
                Yesterday
              </button>
              <button
                type="button"
                onClick={() => setPresetRange('LAST7')}
                className="rounded-md bg-white border border-cream-300 px-2 py-0.5 text-[11px] font-semibold text-stone-700 hover:bg-cream-100 transition shadow-2xs"
              >
                Last 7 Days
              </button>
              <button
                type="button"
                onClick={() => setPresetRange('THIS_MONTH')}
                className="rounded-md bg-white border border-cream-300 px-2 py-0.5 text-[11px] font-semibold text-stone-700 hover:bg-cream-100 transition shadow-2xs"
              >
                This Month
              </button>
            </div>
          </div>
        )}

        {/* 4 Cards Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Cash Payments & Balance */}
          <div className="rounded-2xl border border-emerald-200/90 bg-emerald-50/40 p-4 shadow-2xs flex flex-col justify-between">
            <div className="flex items-center justify-between pb-2">
              <span className="text-xs font-bold text-emerald-950 uppercase tracking-wider">
                {isCompanyAdmin ? `${session.companyName} Cash Balance` : 'Net Cash Remaining'}
              </span>
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800 shadow-2xs font-bold text-sm">
                💵
              </div>
            </div>
            <div className="space-y-1.5">
              <div className={`text-2xl font-black tracking-tight font-mono ${netCashRemaining >= 0 ? 'text-emerald-900' : 'text-rose-700'}`}>
                ₹{netCashRemaining.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="space-y-0.5 pt-1 border-t border-emerald-200/60 text-[11px]">
                <div className="flex items-center justify-between text-emerald-800 font-medium">
                  <span>Sales Inflow:</span>
                  <span className="font-bold font-mono text-emerald-900">+₹{totalCashSales.toLocaleString('en-IN', { minimumFractionDigits: 2 })} ({cashCount})</span>
                </div>
                <div className="flex items-center justify-between text-stone-600 font-medium">
                  <span>Inward Purchases:</span>
                  <span className="font-bold font-mono text-rose-700">
                    -₹{netCashPurchaseOutflow.toLocaleString('en-IN', { minimumFractionDigits: 2 })} ({cashPurchases.length})
                    {totalCashRefunds > 0 ? ` (+₹${totalCashRefunds} ret)` : ''}
                  </span>
                </div>
                {totalCashExpenses > 0 && (
                  <div className="flex items-center justify-between text-stone-600 font-medium">
                    <span>Expenses Outflow:</span>
                    <span className="font-bold font-mono text-rose-700">
                      -₹{totalCashExpenses.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Card 2: Online Payments & Balance */}
          <div className="rounded-2xl border border-sky-200/90 bg-sky-50/40 p-4 shadow-2xs flex flex-col justify-between">
            <div className="flex items-center justify-between pb-2">
              <span className="text-xs font-bold text-sky-950 uppercase tracking-wider">
                {isCompanyAdmin ? `${session.companyName} Online Balance` : 'Net Online Remaining'}
              </span>
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-sky-100 text-sky-800 shadow-2xs font-bold text-sm">
                📱
              </div>
            </div>
            <div className="space-y-1.5">
              <div className={`text-2xl font-black tracking-tight font-mono ${netOnlineRemaining >= 0 ? 'text-sky-950' : 'text-rose-700'}`}>
                ₹{netOnlineRemaining.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="space-y-0.5 pt-1 border-t border-sky-200/60 text-[11px]">
                <div className="flex items-center justify-between text-sky-800 font-medium">
                  <span>Sales Inflow:</span>
                  <span className="font-bold font-mono text-sky-950">+₹{totalOnlineSales.toLocaleString('en-IN', { minimumFractionDigits: 2 })} ({onlineCount})</span>
                </div>
                <div className="flex items-center justify-between text-stone-600 font-medium">
                  <span>Inward Purchases:</span>
                  <span className="font-bold font-mono text-rose-700">
                    -₹{netOnlinePurchaseOutflow.toLocaleString('en-IN', { minimumFractionDigits: 2 })} ({onlinePurchases.length})
                    {totalOnlineRefunds > 0 ? ` (+₹${totalOnlineRefunds} ret)` : ''}
                  </span>
                </div>
                {totalOnlineExpenses > 0 && (
                  <div className="flex items-center justify-between text-stone-600 font-medium">
                    <span>Expenses Outflow:</span>
                    <span className="font-bold font-mono text-rose-700">
                      -₹{totalOnlineExpenses.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Card 3: Net Total Balance (Cash + Online) */}
          <div className="rounded-2xl border border-amber-200/90 bg-amber-50/40 p-4 shadow-2xs flex flex-col justify-between">
            <div className="flex items-center justify-between pb-2">
              <span className="text-xs font-bold text-amber-950 uppercase tracking-wider">
                {isCompanyAdmin ? `${session.companyName} Net Balance` : 'Net Total Balance'}
              </span>
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-100 text-amber-800 shadow-2xs font-bold text-sm">
                💰
              </div>
            </div>
            <div className="space-y-1.5">
              <div className={`text-2xl font-black tracking-tight font-mono ${netTotalBalance >= 0 ? 'text-amber-950' : 'text-rose-700'}`}>
                ₹{netTotalBalance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="space-y-0.5 pt-1 border-t border-amber-200/60 text-[11px]">
                <div className="flex items-center justify-between text-amber-900 font-medium">
                  <span>Gross Sales:</span>
                  <span className="font-bold font-mono text-amber-950">+₹{totalGrossSales.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex items-center justify-between text-stone-600 font-medium">
                  <span>Total Purchases:</span>
                  <span className="font-bold font-mono text-rose-700">
                    -₹{netGrossPurchaseOutflow.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    {totalGrossRefunds > 0 ? ` (+₹${totalGrossRefunds} ret)` : ''}
                  </span>
                </div>
                {totalGrossExpenses > 0 && (
                  <div className="flex items-center justify-between text-stone-600 font-medium">
                    <span>Total Expenses:</span>
                    <span className="font-bold font-mono text-rose-700">
                      -₹{totalGrossExpenses.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Card 4: Store Activity / Units & Orders */}
          <div className="rounded-2xl border border-cream-300 bg-cream-50/50 p-4 shadow-2xs flex flex-col justify-between">
            <div className="flex items-center justify-between pb-2">
              <span className="text-xs font-bold text-stone-700 uppercase tracking-wider">
                {isCompanyAdmin ? `${session.companyName} Activity` : 'Activity & Movement'}
              </span>
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-cream-200 text-stone-700 shadow-2xs font-bold text-sm">
                📊
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="text-2xl font-black text-stone-900 tracking-tight font-mono">
                {totalSalesUnits} Units Sold
              </div>
              <div className="space-y-0.5 pt-1 border-t border-cream-200 text-[11px]">
                <div className="flex items-center justify-between text-stone-600 font-medium">
                  <span>Sales Orders:</span>
                  <span className="font-bold font-mono text-stone-900">
                    {totalActiveCount} active {cancelledCount > 0 ? `(${cancelledCount} void)` : ''}
                  </span>
                </div>
                <div className="flex items-center justify-between text-stone-600 font-medium">
                  <span>Inward Purchases:</span>
                  <span className="font-bold font-mono text-stone-900">{purchases.length} ({totalPurchaseUnits} units)</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Search & Billing User Filter Form Bar */}
      <form onSubmit={handleSearchSubmit} className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[260px]">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-stone-400">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by invoice #, customer name, mobile, or cashier..."
            className="w-full rounded-xl border border-cream-300 bg-white pl-10 pr-4 py-2.5 text-xs text-stone-900 placeholder-stone-400 focus:border-amber-600 focus:outline-none shadow-2xs"
          />
        </div>

        {/* Billing User / Cashier Filter Dropdown */}
        <div className="relative min-w-[220px]">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-amber-600">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <select
            id="filter-billing-user"
            value={selectedBillingUserId}
            onChange={(e) => handleBillingUserChange(e.target.value)}
            className={`w-full appearance-none rounded-xl border pl-9 pr-8 py-2.5 text-xs transition focus:outline-none focus:border-amber-600 shadow-2xs cursor-pointer ${
              selectedBillingUserId
                ? 'border-purple-300 bg-purple-50/80 font-bold text-purple-900 ring-1 ring-purple-300'
                : 'border-cream-300 bg-white font-medium text-stone-700'
            }`}
          >
            <option value="">All Billing Users / Cashiers</option>
            {billingUsers.map((u) => (
              <option key={u.id} value={u.id}>
                Cashier: {u.name}
              </option>
            ))}
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-stone-400">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>

        <button
          type="submit"
          className="rounded-xl bg-stone-900 px-5 py-2.5 text-xs font-bold text-white hover:bg-stone-800 transition shadow-2xs"
        >
          Search
        </button>

        {(search || selectedBillingUserId) && (
          <button
            type="button"
            onClick={handleClearFilters}
            className="rounded-xl border border-cream-300 bg-white px-4 py-2.5 text-xs font-semibold text-stone-600 hover:bg-cream-100 shadow-2xs transition"
          >
            Clear Filters
          </button>
        )}
      </form>

      {/* 4. Invoices Table */}
      <div className="flex-1 overflow-hidden rounded-2xl border border-cream-300 bg-white shadow-sm flex flex-col">
        {loading ? (
          <div className="flex flex-1 items-center justify-center py-16 text-stone-500 text-xs">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-amber-600 border-t-transparent mr-2" />
            Loading invoices for selected period...
          </div>
        ) : bills.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center py-16 text-center text-stone-500 text-xs">
            <svg className="h-10 w-10 text-stone-300 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="font-semibold text-stone-700">No invoices found</p>
            <p className="text-stone-400 mt-0.5 max-w-sm">
              {filterType === 'TODAY'
                ? `No invoices recorded for today (${todayFormatted}). Complete sales in POS terminal or switch to Date Wise / All Time.`
                : 'No invoices found matching the current search query, billing user filter, or date range.'}
            </p>
            {filterType !== 'ALL' && (
              <button
                type="button"
                onClick={() => handleFilterTypeChange('ALL')}
                className="mt-3 rounded-lg border border-cream-300 bg-cream-50 px-3 py-1.5 text-xs font-bold text-stone-700 hover:bg-cream-100 transition shadow-2xs"
              >
                View All Time Invoices
              </button>
            )}
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
                  <th className="py-3 px-4">Payment & Items Sold</th>
                  <th className="py-3 px-4 text-right">Discount</th>
                  <th className="py-3 px-4 text-right">{isCompanyAdmin ? `${session.companyName} Total` : 'Grand Total'}</th>
                  <th className="py-3 px-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-100">
                {bills.map((bill) => {
                  const isCash = bill.paymentMethod === 'CASH';
                  return (
                    <tr key={bill.id} className="hover:bg-cream-50/50 transition">
                      <td className="py-3.5 px-4 font-mono font-bold text-stone-900">
                        <div className="flex flex-col gap-1 items-start">
                          <span className={bill.status === 'CANCELLED' ? 'line-through text-stone-400' : ''}>
                            {bill.invoiceNumber}
                          </span>
                          {bill.status === 'CANCELLED' ? (
                            <span className="rounded bg-rose-100 border border-rose-300 px-1.5 py-0.2 text-[9px] font-bold text-rose-800 uppercase">
                              Cancelled / Void
                            </span>
                          ) : bill.updatedAt && bill.updatedAt !== bill.createdAt ? (
                            <span className="rounded bg-amber-100 border border-amber-300 px-1.5 py-0.2 text-[9px] font-bold text-amber-900 uppercase">
                              Revised
                            </span>
                          ) : null}
                        </div>
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
                        <div className="flex flex-col gap-1 items-start">
                          <span
                            className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold border ${
                              isCash
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                : 'bg-sky-50 text-sky-800 border-sky-300'
                            }`}
                          >
                            {isCash ? '💵 Cash' : '📱 Online'}
                          </span>
                          <span className="text-[11px] text-stone-500 font-medium">
                            {bill.items?.length || 0} items ({bill.items?.reduce((s, i) => s + (i.quantity || 1), 0) || 0} units)
                          </span>
                          {bill.items && bill.items.length > 0 && (
                            <div
                              className="text-[10px] text-stone-600 font-medium line-clamp-1 max-w-[220px]"
                              title={bill.items.map((it) => `${it.productName} (x${it.quantity})`).join(', ')}
                            >
                              {bill.items.map((it) => `${it.productName} (${it.quantity})`).join(', ')}
                            </div>
                          )}
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
                        <div className="text-sm font-bold text-stone-900 font-mono">
                          ₹{bill.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        <div className="text-[10px] font-bold text-stone-500 uppercase">
                          {bill.paymentMethod}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setSelectedBill(bill)}
                            title="View & Print Official Receipt"
                            className="rounded-lg border border-cream-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-stone-700 hover:bg-cream-100 shadow-2xs transition"
                          >
                            Receipt
                          </button>

                          {onEditBill && bill.status !== 'CANCELLED' && (
                            <button
                              type="button"
                              onClick={() => onEditBill(bill.id)}
                              title="Edit this invoice in POS terminal"
                              className="flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-bold text-amber-900 hover:bg-amber-100 shadow-2xs transition"
                            >
                              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                              <span>Edit</span>
                            </button>
                          )}

                          {isBillingUser && bill.status !== 'CANCELLED' && (
                            <button
                              type="button"
                              disabled={cancellingBillId === bill.id}
                              onClick={() => void handleCancelBill(bill)}
                              title="Cancel bill and return stock to inventory"
                              className="rounded-lg border border-rose-200 bg-white px-2 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 hover:border-rose-300 shadow-2xs transition disabled:opacity-50"
                            >
                              {cancellingBillId === bill.id ? 'Voiding...' : 'Cancel'}
                            </button>
                          )}
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

      {/* Bill Receipt Modal */}
      <SalesReceiptModal
        isOpen={Boolean(selectedBill)}
        onClose={() => setSelectedBill(null)}
        bill={selectedBill}
        session={session}
      />
    </div>
  );
};
