import React, { useEffect, useState } from 'react';
import { useAuth } from './hooks/useAuth';
import { AppLayout, AppNavView } from './layouts/AppLayout';
import { BillingPage } from './pages/BillingPage';
import { BillsHistoryPage } from './pages/BillsHistoryPage';
import { CategoryPage } from './pages/CategoryPage';
import { LoginPage } from './pages/LoginPage';
import { MetalRatesPage } from './pages/MetalRatesPage';
import { ProductsPage } from './pages/ProductsPage';
import { VendorsPage } from './pages/VendorsPage';
import { PurchaseHistoryPage } from './pages/PurchaseHistoryPage';

import { ToastProvider } from './context/ToastContext';

const AppContent: React.FC = () => {
  const auth = useAuth();
  const [currentView, setCurrentView] = useState<AppNavView>('billing');

  // Set default view based on user role
  useEffect(() => {
    if (auth.session) {
      if (auth.session.role === 'BILLING_USER') {
        setCurrentView('billing');
      } else {
        // Admin default view: Billing Terminal or Products
        setCurrentView('billing');
      }
    }
  }, [auth.session?.adminId, auth.session?.role]);

  // Initial session restoration state
  if (auth.loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-cream-100 text-stone-800">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-600 border-t-transparent" />
          <span className="text-xs font-medium text-stone-600">Loading Store...</span>
        </div>
      </div>
    );
  }

  // Unauthenticated: Present Login Screen
  if (!auth.session) {
    return (
      <LoginPage
        onLogin={auth.login}
        loading={auth.loggingIn}
        error={auth.authError}
        onClearError={auth.clearError}
      />
    );
  }

  // Authenticated: Present Scoped Application Workspace
  return (
    <AppLayout
      session={auth.session}
      currentView={currentView}
      onNavigate={setCurrentView}
      onLogout={auth.logout}
      loggingOut={auth.loggingOut}
    >
      {currentView === 'billing' ? (
        <BillingPage
          session={auth.session}
          onNavigateToHistory={() => setCurrentView('bills-history')}
        />
      ) : currentView === 'bills-history' ? (
        <BillsHistoryPage
          session={auth.session}
          onNavigateToBilling={() => setCurrentView('billing')}
        />
      ) : currentView === 'products' ? (
        <ProductsPage session={auth.session} />
      ) : currentView === 'categories' ? (
        <CategoryPage session={auth.session} />
      ) : currentView === 'rates' ? (
        <MetalRatesPage session={auth.session} />
      ) : currentView === 'vendors' ? (
        <VendorsPage session={auth.session} />
      ) : (
        <PurchaseHistoryPage session={auth.session} />
      )}
    </AppLayout>
  );
};

export const App: React.FC = () => {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  );
};

export default App;


