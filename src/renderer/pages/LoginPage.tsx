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

  // Surface auth errors via toast instead of inline banner
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
      showError('Please enter your admin email.');
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
              Retail POS Desktop
            </h1>
            <p className="mt-1 text-xs text-stone-500">
              Store Admin Login
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="mt-8 space-y-4 select-text">
            <div>
              <label
                htmlFor="admin-email"
                className="block text-xs font-semibold text-stone-700"
              >
                Admin Email
              </label>
              <div className="mt-1.5">
                <input
                  id="admin-email"
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
                htmlFor="admin-password"
                className="block text-xs font-semibold text-stone-700"
              >
                Password
              </label>
              <div className="mt-1.5">
                <input
                  id="admin-password"
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
              className="mt-3 flex w-full items-center justify-center rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-amber-600/25 transition hover:bg-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
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

          {/* Secure Notice */}
          <div className="mt-6 rounded-xl border border-cream-300 bg-cream-50/70 p-3 text-center text-[11px] text-stone-600">
            Secure offline store management system
          </div>
        </div>

        <div className="mt-4 text-center text-xs text-stone-500">
          Retail POS System
        </div>
      </div>
    </div>
  );
};
