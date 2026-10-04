import React, { createContext, useCallback, useContext, useState } from 'react';

export type ToastType = 'error' | 'success' | 'info';

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType, durationMs?: number) => void;
  showError: (message: string, durationMs?: number) => void;
  showSuccess: (message: string, durationMs?: number) => void;
  showInfo: (message: string, durationMs?: number) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastType = 'info', durationMs = 4500) => {
      if (!message || !message.trim()) return;
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const newToast: ToastItem = { id, type, message: message.trim() };

      setToasts((prev) => [...prev, newToast]);

      if (durationMs > 0) {
        setTimeout(() => {
          removeToast(id);
        }, durationMs);
      }
    },
    [removeToast]
  );

  const showError = useCallback(
    (message: string, durationMs = 5000) => {
      showToast(message, 'error', durationMs);
    },
    [showToast]
  );

  const showSuccess = useCallback(
    (message: string, durationMs = 3500) => {
      showToast(message, 'success', durationMs);
    },
    [showToast]
  );

  const showInfo = useCallback(
    (message: string, durationMs = 4000) => {
      showToast(message, 'info', durationMs);
    },
    [showToast]
  );

  return (
    <ToastContext.Provider value={{ showToast, showError, showSuccess, showInfo, removeToast }}>
      {children}
      {/* Floating Toast Container - Above all modals with z-[9999] */}
      <div
        aria-live="assertive"
        className="pointer-events-none fixed top-5 right-5 z-[9999] flex max-h-screen w-full max-w-sm flex-col gap-2.5 px-4 sm:px-0 select-text"
      >
        {toasts.map((toast) => {
          const isError = toast.type === 'error';
          const isSuccess = toast.type === 'success';

          return (
            <div
              key={toast.id}
              className={`pointer-events-auto flex items-start gap-3 rounded-2xl border p-4 shadow-2xl backdrop-blur-md transition-all duration-300 animate-in fade-in slide-in-from-top-4 ${
                isError
                  ? 'border-rose-300 bg-rose-50/95 text-rose-900 shadow-rose-950/10'
                  : isSuccess
                  ? 'border-emerald-300 bg-emerald-50/95 text-emerald-900 shadow-emerald-950/10'
                  : 'border-amber-300 bg-amber-50/95 text-amber-900 shadow-amber-950/10'
              }`}
            >
              {/* Toast Icon */}
              <div className="shrink-0 mt-0.5">
                {isError ? (
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-200/80 text-rose-700">
                    <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                ) : isSuccess ? (
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-200/80 text-emerald-700">
                    <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                      <path
                        fillRule="evenodd"
                        d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                ) : (
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-200/80 text-amber-700">
                    <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                      <path
                        fillRule="evenodd"
                        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.75.75 0 01.747.75v3.25a.75.75 0 01-.75.75H9a.75.75 0 000 1.5h2a.75.75 0 00.75-.75V11a2.25 2.25 0 00-2.25-2.25H9z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                )}
              </div>

              {/* Toast Message */}
              <div className="flex-1 text-xs font-semibold leading-relaxed">
                {toast.message}
              </div>

              {/* Close Button */}
              <button
                type="button"
                onClick={() => removeToast(toast.id)}
                className="shrink-0 -mr-1 -mt-1 rounded-lg p-1 text-stone-400 hover:bg-black/5 hover:text-stone-700 transition"
                aria-label="Close notification"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
