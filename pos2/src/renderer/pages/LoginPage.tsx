import React, { useEffect, useState } from 'react';
import type { LoginCredentials } from '../../shared/types/ipc';
import { useToast } from '../context/ToastContext';

interface LoginPageProps {
  onLogin: (credentials: LoginCredentials) => Promise<boolean>;
  loading: boolean;
  error: string | null;
  onClearError: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({
  onLogin,
  loading,
  error,
  onClearError,
}) => {
  const { showError } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (error) {
      showError(error);
      onClearError();
    }
  }, [error, showError, onClearError]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    onClearError();

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      showError('Please enter your email.');
      return;
    }

    if (!password) {
      showError('Please enter your password.');
      return;
    }

    await onLogin({ email: trimmedEmail, password });
  };

  return (
    <div className="flex min-h-screen w-screen items-center justify-center bg-cream-100 px-4 py-12 select-none">
      {/* Background warm glow effects */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-40 h-96 w-96 rounded-full bg-amber-400/15 blur-3xl" />
        <div className="absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-orange-300/15 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Main Card */}
        <div className="overflow-hidden rounded-3xl border border-cream-300 bg-white p-8 shadow-xl shadow-stone-900/5 backdrop-blur-xl">
          {/* Header */}
          <div className="text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-amber-700 font-bold text-white shadow-lg shadow-amber-600/25">
              POS
            </div>
            <h1 className="mt-4 text-xl font-bold tracking-tight text-stone-900">
              Retail POS 2
            </h1>
            <p className="mt-1 text-xs text-stone-500">
              Store Admin & Billing Login
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="mt-8 space-y-4 select-text">
            <div>
              <label
                htmlFor="user-email"
                className="block text-xs font-semibold text-stone-700"
              >
                User Email
              </label>
              <div className="mt-1.5">
                <input
                  id="user-email"
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@example.com"
                  disabled={loading}
                  className="w-full rounded-xl border border-cream-300 bg-cream-50/50 px-3.5 py-2.5 text-sm text-stone-900 placeholder-stone-400 transition focus:border-amber-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-600/20 disabled:opacity-50"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="user-password"
                className="block text-xs font-semibold text-stone-700"
              >
                Password
              </label>
              <div className="mt-1.5">
                <input
                  id="user-password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  disabled={loading}
                  className="w-full rounded-xl border border-cream-300 bg-cream-50/50 px-3.5 py-2.5 text-sm text-stone-900 placeholder-stone-400 transition focus:border-amber-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-600/20 disabled:opacity-50"
                />
              </div>
            </div>

            <button
              id="login-button"
              type="submit"
              disabled={loading}
              className="mt-3 flex w-full items-center justify-center rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-amber-600/25 transition hover:bg-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Authenticating...
                </span>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          {/* Quick Switcher for Demo / Seed Accounts */}
          <div className="mt-6 border-t border-cream-200 pt-4">
            <div className="text-[11px] font-bold uppercase tracking-wider text-stone-500 text-center mb-2.5">
              Select User Role to Login:
            </div>
            <div className="space-y-1.5">
              <button
                type="button"
                onClick={() => {
                  setEmail('billing@example.com');
                  setPassword('Billing@123');
                }}
                className="w-full flex items-center justify-between rounded-xl border border-amber-300 bg-amber-50/70 hover:bg-amber-100/70 p-2 text-left transition cursor-pointer"
              >
                <div>
                  <div className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    Billing User (Cross Company)
                  </div>
                  <div className="text-[10px] text-amber-800">billing@example.com • Billing@123</div>
                </div>
                <span className="rounded bg-amber-600 px-2 py-0.5 text-[10px] font-bold text-white">
                  Fill
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setEmail('adminA@example.com');
                  setPassword('Admin@123');
                }}
                className="w-full flex items-center justify-between rounded-xl border border-cream-300 bg-cream-50/60 hover:bg-cream-100 p-2 text-left transition cursor-pointer"
              >
                <div>
                  <div className="text-xs font-bold text-stone-800 flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-amber-600" />
                    Company A Admin
                  </div>
                  <div className="text-[10px] text-stone-500">adminA@example.com • Admin@123</div>
                </div>
                <span className="rounded bg-cream-200 px-2 py-0.5 text-[10px] font-semibold text-stone-700">
                  Fill
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setEmail('adminB@example.com');
                  setPassword('Admin@123');
                }}
                className="w-full flex items-center justify-between rounded-xl border border-cream-300 bg-cream-50/60 hover:bg-cream-100 p-2 text-left transition cursor-pointer"
              >
                <div>
                  <div className="text-xs font-bold text-stone-800 flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-indigo-600" />
                    Company B Admin
                  </div>
                  <div className="text-[10px] text-stone-500">adminB@example.com • Admin@123</div>
                </div>
                <span className="rounded bg-cream-200 px-2 py-0.5 text-[10px] font-semibold text-stone-700">
                  Fill
                </span>
              </button>
            </div>
          </div>

          {/* Secure Notice */}
          <div className="mt-5 rounded-xl border border-cream-300 bg-cream-50/70 p-2.5 text-center text-[11px] text-stone-600">
            Clean POS 2 Foundation • Offline SQLite & Multi-Tenant
          </div>
        </div>
      </div>
    </div>
  );
};
