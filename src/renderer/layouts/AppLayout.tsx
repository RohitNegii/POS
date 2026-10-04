import React from 'react';
import type { AuthSessionPayload } from '../../shared/types/ipc';

export type AppNavView = 'products' | 'categories' | 'rates';

interface AppLayoutProps {
  children: React.ReactNode;
  session: AuthSessionPayload;
  currentView: AppNavView;
  onNavigate: (view: AppNavView) => void;
  onLogout: () => Promise<void>;
  loggingOut?: boolean;
}

const upcomingModules = [
  { name: 'Stock & Inventory', status: 'Coming Soon' },
  { name: 'POS Billing Terminal', status: 'Coming Soon' },
];

function getCleanDisplayName(name?: string): string {
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
}) => {
  const adminDisplayName = getCleanDisplayName(session.adminName);

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
              Store Management
            </div>
          </div>
        </div>

        {/* Navigation & Store Workspace */}
        <nav className="flex-1 space-y-6 overflow-y-auto p-4">
          <div>
            <div className="px-2.5 text-[11px] font-bold uppercase tracking-wider text-stone-600">
              Store Workspace
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

          <div>
            <div className="px-2.5 text-[11px] font-bold uppercase tracking-wider text-stone-600">
              Future Modules
            </div>
            <ul className="mt-2 space-y-1">
              {upcomingModules.map((mod) => (
                <li
                  key={mod.name}
                  className="flex items-center justify-between rounded-lg px-3 py-2 text-xs text-stone-600 cursor-not-allowed"
                >
                  <span>{mod.name}</span>
                  <span className="rounded bg-cream-200/70 border border-cream-300/60 px-1.5 py-0.5 text-[10px] text-stone-600 font-medium">
                    {mod.status}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </nav>

        {/* Sidebar Footer with Admin Session & Logout */}
        <div className="border-t border-cream-300/80 p-4 text-xs bg-white/40">
          <div className="rounded-xl border border-cream-300 bg-white p-3 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-stone-900 truncate">{adminDisplayName}</span>
              <span className="rounded bg-cream-100 px-1.5 py-0.5 text-[9px] font-bold text-stone-600 border border-cream-300">
                Admin
              </span>
            </div>
            <div className="text-[11px] text-stone-500 truncate mt-0.5">{session.email}</div>
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
                {currentView === 'products'
                  ? 'Product Catalog & Barcodes'
                  : currentView === 'categories'
                  ? 'Category & Attribute Management'
                  : 'Daily Metal Rates'}
              </h1>
            </div>
            <p className="text-xs text-stone-500">
              Logged in as <span className="font-medium text-stone-700">{adminDisplayName}</span>
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-cream-200 bg-white px-3.5 py-1.5 text-xs font-medium text-stone-600 shadow-2xs">
              {new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
            </div>
          </div>
        </header>

        {/* Scrollable Page Content */}
        <main className="flex-1 overflow-y-auto p-8 select-text">{children}</main>
      </div>
    </div>
  );
};
