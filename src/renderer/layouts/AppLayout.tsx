import React, { useState } from 'react';
import type { AuthSessionPayload, OverduePurchasesSummary } from '../../shared/types/ipc';
import { NotificationPopover } from '../components/NotificationPopover';

export type AppNavView =
  | 'billing'
  | 'bills-history'
  | 'products'
  | 'categories'
  | 'rates'
  | 'vendors'
  | 'purchase-entry'
  | 'purchases'
  | 'billing-users'
  | 'customer-records'
  | 'expenses';

interface AppLayoutProps {
  children: React.ReactNode;
  session: AuthSessionPayload;
  currentView: AppNavView;
  onNavigate: (view: AppNavView) => void;
  onLogout: () => Promise<void>;
  loggingOut?: boolean;
  overdueSummary?: OverduePurchasesSummary;
  overdueLoading?: boolean;
  onRefreshOverdue?: () => void;
  onSelectOverduePurchase?: (purchaseId: string) => void;
}

function getCleanDisplayName(name?: string, role?: string): string {
  if (role === 'SUPER_ADMIN') {
    return name || 'Super Admin';
  }
  if (role === 'BILLING_USER') {
    return name || 'Billing Cashier';
  }
  if (!name || /company/i.test(name)) {
    return 'Store Admin';
  }
  return name;
}

export const AppLayout: React.FC<AppLayoutProps> = ({
  children,
  session,
  currentView,
  onNavigate,
  onLogout,
  loggingOut = false,
  overdueSummary,
  overdueLoading = false,
  onRefreshOverdue,
  onSelectOverduePurchase,
}) => {
  const [showBanner, setShowBanner] = useState(true);
  const isSuperAdmin = session.role === 'SUPER_ADMIN';
  const isBillingUser = session.role === 'BILLING_USER';
  const isCompanyAdmin = !isBillingUser && !isSuperAdmin;
  const adminDisplayName = getCleanDisplayName(session.adminName, session.role);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-cream-100 text-stone-850 select-none">
      {/* Left Sidebar Navigation Shell */}
      <aside className="flex w-64 shrink-0 flex-col border-r border-cream-300/80 bg-cream-50/95 shadow-sm">
        {/* Brand Header */}
        <div className="flex h-16 items-center gap-3 border-b border-cream-300/80 px-5 bg-white/60">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-600 font-bold text-white shadow-sm shadow-amber-600/20">
            POS
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold tracking-tight text-stone-900 truncate">
              Retail POS
            </div>
            <div className="text-[11px] font-medium text-stone-500 truncate">
              {isSuperAdmin ? 'Super Admin' : isBillingUser ? 'Billing Counter' : 'Store Management'} • v1.0.4
            </div>
          </div>
        </div>

        {/* Navigation & Store Workspace */}
        <nav className="flex-1 space-y-6 overflow-y-auto p-4">
          {/* Super Admin Section */}
          {isSuperAdmin && (
            <div>
              <div className="px-2.5 text-[11px] font-bold uppercase tracking-wider text-purple-700">
                Administration
              </div>
              <div className="mt-2.5 space-y-1.5">
                <button
                  id="nav-billing-users"
                  type="button"
                  onClick={() => onNavigate('billing-users')}
                  className={`w-full flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-xs font-semibold transition ${
                    currentView === 'billing-users'
                      ? 'border-purple-300 bg-white text-stone-900 shadow-sm'
                      : 'border-transparent text-stone-600 hover:bg-cream-200/60 hover:text-stone-900'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <svg className="h-4 w-4 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
                      />
                    </svg>
                    <span>Billing Users</span>
                  </div>
                  {currentView === 'billing-users' && (
                    <span className="h-2 w-2 rounded-full bg-purple-600" />
                  )}
                </button>

                <button
                  id="nav-expenses"
                  type="button"
                  onClick={() => onNavigate('expenses')}
                  className={`w-full flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-xs font-semibold transition ${
                    currentView === 'expenses'
                      ? 'border-purple-300 bg-white text-stone-900 shadow-sm'
                      : 'border-transparent text-stone-600 hover:bg-cream-200/60 hover:text-stone-900'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <svg className="h-4 w-4 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
                      />
                    </svg>
                    <span>Expense Management</span>
                  </div>
                  {currentView === 'expenses' && (
                    <span className="h-2 w-2 rounded-full bg-purple-600" />
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Billing Counter - Visible ONLY to billing user / cashier */}
          {isBillingUser && (
            <div>
              <div className="px-2.5 text-[11px] font-bold uppercase tracking-wider text-stone-600">
                Billing Counter
              </div>
              <div className="mt-2.5 space-y-1.5">
                {/* POS Billing Terminal Button */}
                <button
                  id="nav-billing"
                  type="button"
                  onClick={() => onNavigate('billing')}
                  className={`w-full flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-xs font-semibold transition ${
                    currentView === 'billing'
                      ? 'border-amber-300 bg-white text-stone-900 shadow-sm'
                      : 'border-transparent text-stone-600 hover:bg-cream-200/60 hover:text-stone-900'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <svg className="h-4 w-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
                      />
                    </svg>
                    <span>POS Billing Terminal</span>
                  </div>
                  {currentView === 'billing' ? (
                    <span className="h-2 w-2 rounded-full bg-amber-600" />
                  ) : (
                    <span className="rounded bg-amber-100 px-1.5 py-0.2 text-[9px] font-bold text-amber-800">
                      Live
                    </span>
                  )}
                </button>

                {/* Bills & Invoices Archive */}
                <button
                  id="nav-bills-history"
                  type="button"
                  onClick={() => onNavigate('bills-history')}
                  className={`w-full flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-xs font-semibold transition ${
                    currentView === 'bills-history'
                      ? 'border-amber-300 bg-white text-stone-900 shadow-sm'
                      : 'border-transparent text-stone-600 hover:bg-cream-200/60 hover:text-stone-900'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <svg className="h-4 w-4 text-stone-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.75}
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    </svg>
                    <span>Bills & Invoices</span>
                  </div>
                  {currentView === 'bills-history' && (
                    <span className="h-2 w-2 rounded-full bg-amber-600" />
                  )}
                </button>

                {/* Customer Records Navigation Button */}
                <button
                  id="nav-customer-records"
                  type="button"
                  onClick={() => onNavigate('customer-records')}
                  className={`w-full flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-xs font-semibold transition ${
                    currentView === 'customer-records'
                      ? 'border-emerald-300 bg-white text-stone-900 shadow-sm'
                      : 'border-transparent text-stone-600 hover:bg-cream-200/60 hover:text-stone-900'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <svg className="h-4 w-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.75}
                        d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                      />
                    </svg>
                    <span>Customers & Records</span>
                  </div>
                  {currentView === 'customer-records' && (
                    <span className="h-2 w-2 rounded-full bg-emerald-600" />
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Company Admin Modules: Products, Categories, Rates, Purchases, Vendors */}
          {isCompanyAdmin && (
            <>
              <div>
                <div className="px-2.5 text-[11px] font-bold uppercase tracking-wider text-stone-600">
                  Catalog & Settings
                </div>
              <div className="mt-2.5 space-y-1.5">

                  {/* Products Navigation Button */}
                  <button
                    id="nav-products"
                    type="button"
                    onClick={() => onNavigate('products')}
                    className={`w-full flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-xs font-semibold transition ${
                      currentView === 'products'
                        ? 'border-amber-300 bg-white text-stone-900 shadow-sm'
                        : 'border-transparent text-stone-600 hover:bg-cream-200/60 hover:text-stone-900'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.75}
                          d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                        />
                      </svg>
                      <span>Products & Barcodes</span>
                    </div>
                    {currentView === 'products' && (
                      <span className="h-2 w-2 rounded-full bg-amber-600" />
                    )}
                  </button>

                  {/* Categories Navigation Button */}
                  <button
                    id="nav-categories"
                    type="button"
                    onClick={() => onNavigate('categories')}
                    className={`w-full flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-xs font-semibold transition ${
                      currentView === 'categories'
                        ? 'border-amber-300 bg-white text-stone-900 shadow-sm'
                        : 'border-transparent text-stone-600 hover:bg-cream-200/60 hover:text-stone-900'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.75}
                          d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                        />
                      </svg>
                      <span>Categories & Fields</span>
                    </div>
                    {currentView === 'categories' && (
                      <span className="h-2 w-2 rounded-full bg-amber-600" />
                    )}
                  </button>

                  {/* Daily Metal Rates Navigation Button */}
                  <button
                    id="nav-metal-rates"
                    type="button"
                    onClick={() => onNavigate('rates')}
                    className={`w-full flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-xs font-semibold transition ${
                      currentView === 'rates'
                        ? 'border-amber-300 bg-white text-stone-900 shadow-sm'
                        : 'border-transparent text-stone-600 hover:bg-cream-200/60 hover:text-stone-900'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.75}
                          d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                      <span>Daily Metal Rates</span>
                    </div>
                    {currentView === 'rates' && (
                      <span className="h-2 w-2 rounded-full bg-amber-600" />
                    )}
                  </button>

                </div>
              </div>

              {/* Purchases & Vendors Section */}
              <div>
                <div className="px-2.5 text-[11px] font-bold uppercase tracking-wider text-stone-600">
                  Purchases & Vendors
                </div>
                <div className="mt-2.5 space-y-1.5">
                  {/* Purchase Entry Navigation Button */}
                  <button
                    id="nav-purchase-entry"
                    type="button"
                    onClick={() => onNavigate('purchase-entry')}
                    className={`w-full flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-xs font-semibold transition ${
                      currentView === 'purchase-entry'
                        ? 'border-amber-300 bg-white text-stone-900 shadow-sm'
                        : 'border-transparent text-stone-600 hover:bg-cream-200/60 hover:text-stone-900'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <svg className="h-4 w-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.75}
                          d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                        />
                      </svg>
                      <span>Purchase Entry</span>
                    </div>
                    {currentView === 'purchase-entry' && (
                      <span className="h-2 w-2 rounded-full bg-amber-600" />
                    )}
                  </button>

                  {/* Vendors / Buyers Navigation Button */}
                  <button
                    id="nav-vendors"
                    type="button"
                    onClick={() => onNavigate('vendors')}
                    className={`w-full flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-xs font-semibold transition ${
                      currentView === 'vendors'
                        ? 'border-amber-300 bg-white text-stone-900 shadow-sm'
                        : 'border-transparent text-stone-600 hover:bg-cream-200/60 hover:text-stone-900'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.75}
                          d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                        />
                      </svg>
                      <span>Vendors / Buyers</span>
                    </div>
                    {currentView === 'vendors' && (
                      <span className="h-2 w-2 rounded-full bg-amber-600" />
                    )}
                  </button>

                  {/* Purchase History Navigation Button */}
                  <button
                    id="nav-purchases"
                    type="button"
                    onClick={() => onNavigate('purchases')}
                    className={`w-full flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-xs font-semibold transition ${
                      currentView === 'purchases'
                        ? 'border-amber-300 bg-white text-stone-900 shadow-sm'
                        : 'border-transparent text-stone-600 hover:bg-cream-200/60 hover:text-stone-900'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.75}
                          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
                        />
                      </svg>
                      <span>Purchase History</span>
                    </div>
                    {currentView === 'purchases' && (
                      <span className="h-2 w-2 rounded-full bg-amber-600" />
                    )}
                  </button>
                </div>
              </div>

              {/* Customer Sales & Bills Section for Company */}
              <div>
                <div className="px-2.5 text-[11px] font-bold uppercase tracking-wider text-stone-600">
                  Sales & Billing Records
                </div>
                <div className="mt-2.5 space-y-1.5">
                  {/* Customer Sales Bills Navigation Button */}
                  <button
                    id="nav-company-bills"
                    type="button"
                    onClick={() => onNavigate('bills-history')}
                    className={`w-full flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-xs font-semibold transition ${
                      currentView === 'bills-history'
                        ? 'border-amber-300 bg-white text-stone-900 shadow-sm'
                        : 'border-transparent text-stone-600 hover:bg-cream-200/60 hover:text-stone-900'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <svg className="h-4 w-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.75}
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                        />
                      </svg>
                      <span>Customer Sales Bills</span>
                    </div>
                    {currentView === 'bills-history' && (
                      <span className="h-2 w-2 rounded-full bg-amber-600" />
                    )}
                  </button>
                </div>
              </div>
            </>
          )}
        </nav>

        {/* Sidebar Footer with Session & Logout */}
        <div className="border-t border-cream-300/80 p-4 text-xs bg-white/40">
          <div className="rounded-xl border border-cream-300 bg-white p-3 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-stone-900 truncate">{adminDisplayName}</span>
              <span
                className={`rounded px-1.5 py-0.5 text-[9px] font-bold border ${
                  isSuperAdmin
                    ? 'bg-purple-50 text-purple-800 border-purple-300'
                    : isBillingUser
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                    : 'bg-cream-100 text-stone-600 border-cream-300'
                }`}
              >
                {isSuperAdmin ? 'Super Admin' : isBillingUser ? 'Cashier' : 'Admin'}
              </span>
            </div>
            <div className="text-[11px] text-stone-500 truncate mt-0.5">{session.email}</div>
            <div className="text-[10px] font-semibold text-amber-700 truncate mt-0.5">
              {isSuperAdmin ? 'Super Admin Workspace' : isBillingUser ? 'Retail Billing Counter' : session.companyName}
            </div>
            <button
              id="sidebar-logout-btn"
              type="button"
              onClick={() => void onLogout()}
              disabled={loggingOut}
              className="mt-2.5 w-full rounded-lg bg-cream-100 hover:bg-rose-50 border border-cream-300 hover:border-rose-200 py-1.5 text-[11px] font-semibold text-stone-700 hover:text-rose-700 transition disabled:opacity-50"
            >
              {loggingOut ? 'Signing out...' : 'Sign Out'}
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col overflow-hidden bg-cream-100">
        {/* Top Header */}
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-cream-300/80 bg-white/80 px-8 shadow-2xs backdrop-blur">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-base font-bold text-stone-900">
                {currentView === 'billing-users'
                  ? 'Billing User Management'
                  : currentView === 'customer-records'
                  ? 'Customer Purchase Records'
                  : currentView === 'billing'
                  ? 'Unified POS Billing Terminal'
                  : currentView === 'bills-history'
                  ? isBillingUser
                    ? 'Bills & Invoices Archive'
                    : `${session.companyName} - Customer Sales Bills`
                  : currentView === 'products'
                  ? 'Product Catalog & Barcodes'
                  : currentView === 'categories'
                  ? 'Category & Attribute Management'
                  : currentView === 'rates'
                  ? 'Daily Metal Rates'
                  : currentView === 'vendors'
                  ? 'Vendors / Buyers Management'
                  : currentView === 'purchase-entry'
                  ? 'Inward Purchase Entry'
                  : 'Purchase History & Inventory Audit'}
              </h1>
            </div>
            <p className="text-xs text-stone-500">
              Logged in as <span className="font-medium text-stone-700">{adminDisplayName}</span>
              {isSuperAdmin ? ' • Super Admin Workspace' : isBillingUser ? ' • Billing Counter' : ` • ${session.companyName}`}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Vendor Overdue Payment Notification Bell (Company Admin only) */}
            {isCompanyAdmin && overdueSummary && (
              <NotificationPopover
                summary={overdueSummary}
                loading={overdueLoading}
                onRefresh={onRefreshOverdue || (() => {})}
                onSelectPurchase={(purchaseId) => {
                  onSelectOverduePurchase?.(purchaseId);
                }}
              />
            )}

            <div className="rounded-xl border border-cream-200 bg-white px-3.5 py-1.5 text-xs font-medium text-stone-600 shadow-2xs">
              {new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
            </div>
          </div>
        </header>

        {/* Overdue Vendor Bills Persistent Top Banner (Company Admin only) */}
        {showBanner && isCompanyAdmin && overdueSummary && overdueSummary.overdueCount > 0 && (
          <div className="flex items-center justify-between border-b border-rose-200 bg-rose-50/95 px-8 py-2.5 text-xs text-rose-950 shadow-2xs">
            <div className="flex items-center gap-2.5">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-rose-200 text-rose-800 text-[11px] font-bold">
                ⚠️
              </span>
              <span>
                <strong>Vendor Payment Reminder:</strong> You have{' '}
                <span className="font-bold underline decoration-rose-400">
                  {overdueSummary.overdueCount} vendor bill{overdueSummary.overdueCount > 1 ? 's' : ''}
                </span>{' '}
                pending payment for more than 7 days (Total Due:{' '}
                <strong className="font-mono">
                  ₹{overdueSummary.totalOverdueAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </strong>
                ).
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  if (overdueSummary.items[0]) {
                    onSelectOverduePurchase?.(overdueSummary.items[0].id);
                  } else {
                    onNavigate('purchases');
                  }
                }}
                className="rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold px-3 py-1 text-[11px] transition shadow-2xs"
              >
                View & Settle Bills
              </button>
              <button
                type="button"
                onClick={() => setShowBanner(false)}
                className="rounded-lg p-1 text-rose-600 hover:bg-rose-100 transition"
                title="Dismiss banner for now"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Scrollable Page Content */}
        <main className="flex-1 overflow-y-auto p-8 select-text">{children}</main>
      </div>
    </div>
  );
};
