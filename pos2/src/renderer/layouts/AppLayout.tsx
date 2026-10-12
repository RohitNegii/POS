import React from 'react';
import type { AuthSessionPayload } from '../../shared/types/ipc';

export type AppNavView = 'categories' | 'buyers' | 'rates';

interface AppLayoutProps {
  session: AuthSessionPayload;
  currentView: AppNavView;
  onNavigate: (view: AppNavView) => void;
  onLogout: () => void;
  children: React.ReactNode;
}

export const AppLayout: React.FC<AppLayoutProps> = ({
  session,
  currentView,
  onNavigate,
  onLogout,
  children,
}) => {
  const isCompanyA = session.companyCode === 'COMPANY_A';
  const isCompanyB = session.companyCode === 'COMPANY_B';

  const navItems: Array<{
    id: AppNavView;
    label: string;
    description: string;
    icon: React.ReactNode;
  }> = [
    {
      id: 'categories',
      label: 'Categories',
      description: 'Product schemas & fields',
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
        </svg>
      ),
    },
    {
      id: 'buyers',
      label: 'Buyers',
      description: 'Registered buyers & clients',
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
    },
    {
      id: 'rates',
      label: 'Daily Metal Rates',
      description: 'Gold & Silver daily rates',
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#FAF6EE] select-none text-stone-800">
      {/* Left Sidebar */}
      <aside className="w-64 sm:w-72 flex-shrink-0 flex flex-col justify-between border-r border-cream-300 bg-white/95 backdrop-blur-md shadow-xs z-30">
        <div>
          {/* Brand Header */}
          <div className="p-5 border-b border-cream-200">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-amber-700 text-sm font-black text-white shadow-md shadow-amber-600/25">
                POS2
              </div>
              <div>
                <h1 className="text-sm font-bold tracking-tight text-stone-900 leading-tight">
                  Retail Desktop
                </h1>
                <span className="text-[10px] text-stone-400 font-mono">v0.1.0 • Core</span>
              </div>
            </div>

            {/* Active Company Badge */}
            <div className="mt-4">
              <span
                className={`inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-bold border w-full ${
                  isCompanyA
                    ? 'bg-amber-50 text-amber-950 border-amber-300'
                    : isCompanyB
                    ? 'bg-indigo-50 text-indigo-950 border-indigo-300'
                    : 'bg-emerald-50 text-emerald-950 border-emerald-300'
                }`}
              >
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    isCompanyA
                      ? 'bg-amber-500 animate-pulse'
                      : isCompanyB
                      ? 'bg-indigo-500 animate-pulse'
                      : 'bg-emerald-500 animate-pulse'
                  }`}
                />
                <span className="truncate">{session.companyName}</span>
              </span>
            </div>
          </div>

          {/* Navigation Items */}
          <div className="p-3 space-y-1.5">
            <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-stone-400">
              Navigation
            </div>
            {navItems.map((item) => {
              const isActive = currentView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onNavigate(item.id)}
                  className={`w-full flex items-center gap-3.5 px-3.5 py-2.5 rounded-2xl text-left transition cursor-pointer ${
                    isActive
                      ? 'bg-amber-600 text-white shadow-md shadow-amber-600/20'
                      : 'text-stone-700 hover:bg-cream-100 hover:text-stone-900'
                  }`}
                >
                  <span className={isActive ? 'text-white' : 'text-stone-500'}>
                    {item.icon}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold leading-tight truncate">
                      {item.label}
                    </div>
                    <div
                      className={`text-[10px] truncate ${
                        isActive ? 'text-amber-100' : 'text-stone-400'
                      }`}
                    >
                      {item.description}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* User Card & Logout (Bottom of Sidebar) */}
        <div className="p-4 border-t border-cream-200 bg-cream-50/60">
          <div className="flex items-center justify-between mb-3">
            <div className="min-w-0 pr-2">
              <div className="text-xs font-bold text-stone-900 truncate">
                {session.name}
              </div>
              <div className="text-[10px] text-stone-500 font-mono truncate">
                {session.email}
              </div>
            </div>
            <span className="rounded bg-cream-200 px-1.5 py-0.5 text-[9px] font-bold text-stone-600 uppercase">
              {session.role === 'BILLING_USER' ? 'Cashier' : 'Admin'}
            </span>
          </div>

          <button
            onClick={onLogout}
            className="w-full flex items-center justify-center gap-2 rounded-xl border border-cream-300 bg-white py-2 text-xs font-bold text-stone-700 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 transition cursor-pointer shadow-2xs"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Sign Out
          </button>
        </div>
      </aside>

      {/* Right Side Content Container */}
      <main className="flex-1 flex flex-col h-screen overflow-y-auto">
        <div className="flex-1 p-6 md:p-8">
          {children}
        </div>
      </main>
    </div>
  );
};
