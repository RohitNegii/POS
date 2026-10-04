import React, { useState } from 'react';
import { useAuth } from './hooks/useAuth';
import { AppLayout, AppNavView } from './layouts/AppLayout';
import { CategoryPage } from './pages/CategoryPage';
import { LoginPage } from './pages/LoginPage';
import { MetalRatesPage } from './pages/MetalRatesPage';
import { ProductsPage } from './pages/ProductsPage';

import { ToastProvider } from './context/ToastContext';

const AppContent: React.FC = () => {
  const auth = useAuth();
  const [currentView, setCurrentView] = useState<AppNavView>('products');

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
      {currentView === 'products' ? (
        <ProductsPage session={auth.session} />
      ) : currentView === 'categories' ? (
        <CategoryPage session={auth.session} />
      ) : (
        <MetalRatesPage session={auth.session} />
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


