import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from './hooks/useAuth';
import { AppLayout, AppNavView } from './layouts/AppLayout';
import { BillingPage } from './pages/BillingPage';
import { BillsHistoryPage } from './pages/BillsHistoryPage';
import { CategoryPage } from './pages/CategoryPage';
import { LoginPage } from './pages/LoginPage';
import { MetalRatesPage } from './pages/MetalRatesPage';
import { ProductsPage } from './pages/ProductsPage';
import { VendorsPage } from './pages/VendorsPage';
import { PurchaseEntryPage } from './pages/PurchaseEntryPage';
import { PurchaseHistoryPage } from './pages/PurchaseHistoryPage';
import { BillingUsersPage } from './pages/BillingUsersPage';
import { CustomerRecordsPage } from './pages/CustomerRecordsPage';
import { ExpenseManagementPage } from './pages/ExpenseManagementPage';
import { useOverduePurchases } from './hooks/useOverduePurchases';

import { ToastProvider } from './context/ToastContext';

const AppContent: React.FC = () => {
  const auth = useAuth();
  const isSuperAdmin = auth.session?.role === 'SUPER_ADMIN';
  const isBillingUser = auth.session?.role === 'BILLING_USER';
  const isCompanyAdmin = !isBillingUser && !isSuperAdmin;
  const overduePurchases = useOverduePurchases(auth.session?.companyId, isCompanyAdmin);

  const [currentView, setCurrentView] = useState<AppNavView>(() => {
    if (auth.session?.role === 'SUPER_ADMIN') return 'billing-users';
    if (auth.session?.role === 'BILLING_USER') return 'billing';
    return 'products';
  });
  const [editingPurchaseId, setEditingPurchaseId] = useState<string | null>(null);
  const [targetPurchaseId, setTargetPurchaseId] = useState<string | null>(null);
  const [editingBillId, setEditingBillId] = useState<string | null>(null);
  const prevAdminIdRef = useRef<string | null>(null);

  // Set default view based on user role and sanitize view when switching users/roles
  useEffect(() => {
    if (auth.session) {
      const isNewLogin = prevAdminIdRef.current !== auth.session.adminId;
      prevAdminIdRef.current = auth.session.adminId;

      if (auth.session.role === 'SUPER_ADMIN') {
        if (isNewLogin) {
          setCurrentView('billing-users');
        } else {
          setCurrentView((prev) =>
            prev === 'billing-users' || prev === 'expenses' ? prev : 'billing-users'
          );
        }
      } else if (auth.session.role === 'BILLING_USER') {
        if (isNewLogin) {
          setCurrentView('billing');
        } else {
          setCurrentView((prev) =>
            prev === 'billing' || prev === 'bills-history' || prev === 'customer-records'
              ? prev
              : 'billing'
          );
        }
      } else {
        // Company Admin: always reset to Products on new login, and forbid cashier/super-admin views
        if (isNewLogin) {
          setCurrentView('products');
        } else {
          setCurrentView((prev) =>
            prev === 'billing' ||
            prev === 'customer-records' ||
            prev === 'billing-users' ||
            prev === 'expenses'
              ? 'products'
              : prev
          );
        }
      }
    } else {
      prevAdminIdRef.current = null;
    }
  }, [auth.session?.adminId, auth.session?.role]);

  const handleLogout = async () => {
    setEditingPurchaseId(null);
    setTargetPurchaseId(null);
    setEditingBillId(null);
    setCurrentView('products');
    prevAdminIdRef.current = null;
    await auth.logout();
  };

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
      onNavigate={(view) => {
        // Block non-super-admins from navigating to billing users or expenses
        if (!isSuperAdmin && (view === 'billing-users' || view === 'expenses')) {
          return;
        }
        // Super admin only has access to billing users and expenses
        if (isSuperAdmin && view !== 'billing-users' && view !== 'expenses') {
          return;
        }
        // Block company admins from navigating to cashier billing terminal or customer records
        if (!isBillingUser && (view === 'billing' || view === 'customer-records')) {
          return;
        }
        // Block billing users from navigating to admin catalog/purchases
        if (isBillingUser && view !== 'billing' && view !== 'bills-history' && view !== 'customer-records') {
          return;
        }
        if (view !== 'purchase-entry') {
          setEditingPurchaseId(null);
        }
        if (view !== 'billing') {
          setEditingBillId(null);
        }
        setCurrentView(view);
      }}
      onLogout={handleLogout}
      loggingOut={auth.loggingOut}
      overdueSummary={overduePurchases.summary}
      overdueLoading={overduePurchases.loading}
      onRefreshOverdue={overduePurchases.refreshOverdue}
      onSelectOverduePurchase={(purchaseId) => {
        setTargetPurchaseId(purchaseId);
        setCurrentView('purchases');
      }}
    >
      {currentView === 'billing-users' && isSuperAdmin ? (
        <BillingUsersPage session={auth.session} />
      ) : currentView === 'expenses' && isSuperAdmin ? (
        <ExpenseManagementPage session={auth.session} />
      ) : currentView === 'billing' && isBillingUser ? (
        <BillingPage
          session={auth.session}
          onNavigateToHistory={() => {
            setEditingBillId(null);
            setCurrentView('bills-history');
          }}
          editingBillId={editingBillId}
          onCancelEdit={() => {
            setEditingBillId(null);
          }}
        />
      ) : currentView === 'bills-history' ? (
        <BillsHistoryPage
          session={auth.session}
          onNavigateToBilling={
            isBillingUser
              ? () => {
                  setEditingBillId(null);
                  setCurrentView('billing');
                }
              : undefined
          }
          onEditBill={
            isBillingUser
              ? (billId: string) => {
                  setEditingBillId(billId);
                  setCurrentView('billing');
                }
              : undefined
          }
        />
      ) : currentView === 'customer-records' && isBillingUser ? (
        <CustomerRecordsPage
          session={auth.session}
          onEditBill={
            isBillingUser
              ? (billId: string) => {
                  setEditingBillId(billId);
                  setCurrentView('billing');
                }
              : undefined
          }
          onNavigateToBilling={
            isBillingUser
              ? () => {
                  setEditingBillId(null);
                  setCurrentView('billing');
                }
              : undefined
          }
        />
      ) : currentView === 'categories' && !isBillingUser ? (
        <CategoryPage session={auth.session} />
      ) : currentView === 'rates' && !isBillingUser ? (
        <MetalRatesPage session={auth.session} />
      ) : currentView === 'vendors' && !isBillingUser ? (
        <VendorsPage session={auth.session} />
      ) : currentView === 'purchase-entry' && !isBillingUser ? (
        <PurchaseEntryPage
          session={auth.session}
          onPurchaseSaved={() => {
            void overduePurchases.refreshOverdue();
          }}
          onNavigateToHistory={() => {
            setEditingPurchaseId(null);
            setCurrentView('purchases');
          }}
          editingPurchaseId={editingPurchaseId}
          onCancelEdit={() => {
            setEditingPurchaseId(null);
            setCurrentView('purchases');
          }}
        />
      ) : currentView === 'purchases' && !isBillingUser ? (
        <PurchaseHistoryPage
          session={auth.session}
          targetPurchaseId={targetPurchaseId}
          onClearTargetPurchaseId={() => setTargetPurchaseId(null)}
          onPaymentSettled={() => {
            void overduePurchases.refreshOverdue();
          }}
          onNavigateToEntry={() => {
            setEditingPurchaseId(null);
            setCurrentView('purchase-entry');
          }}
          onEditPurchase={(purchaseId: string) => {
            setEditingPurchaseId(purchaseId);
            setCurrentView('purchase-entry');
          }}
        />
      ) : isBillingUser ? (
        <BillingPage
          session={auth.session}
          onNavigateToHistory={() => {
            setEditingBillId(null);
            setCurrentView('bills-history');
          }}
          editingBillId={editingBillId}
          onCancelEdit={() => {
            setEditingBillId(null);
          }}
        />
      ) : (
        <ProductsPage
          session={auth.session}
          onNavigateToPurchaseEntry={() => {
            setEditingPurchaseId(null);
            setCurrentView('purchase-entry');
          }}
        />
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


