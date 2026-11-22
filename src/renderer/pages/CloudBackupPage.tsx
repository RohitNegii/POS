import React, { useState } from 'react';
import type { AuthSessionPayload, BackupHistoryDto } from '../../shared/types/ipc';
import { useCloudBackup } from '../hooks/useCloudBackup';

interface CloudBackupPageProps {
  session: AuthSessionPayload;
}

export const CloudBackupPage: React.FC<CloudBackupPageProps> = ({ session: _session }) => {
  const {
    status,
    history,
    loading,
    isBackingUp,
    isRestoring,
    authWaiting,
    recoveryKey,
    error,
    refresh,
    startAuth,
    disconnect,
    saveConfig,
    triggerBackupNow,
    restoreBackup,
    fetchRecoveryKey,
    importRecoveryKey,
  } = useCloudBackup();

  // Settings form state
  const [scheduledTime, setScheduledTime] = useState<string>('22:00');
  const [schedulerEnabled, setSchedulerEnabled] = useState<boolean>(true);
  const [retentionCount, setRetentionCount] = useState<number>(30);
  const [hasFormChanges, setHasFormChanges] = useState<boolean>(false);
  const [savingSettings, setSavingSettings] = useState<boolean>(false);

  // Sync initial settings from status
  React.useEffect(() => {
    if (status) {
      setScheduledTime(status.scheduledTime || '22:00');
      setSchedulerEnabled(status.schedulerEnabled ?? true);
      setRetentionCount(status.retentionCount || 30);
    }
  }, [status]);

  // OAuth custom client modal
  const [showOAuthModal, setShowOAuthModal] = useState<boolean>(false);
  const [customClientId, setCustomClientId] = useState<string>('');
  const [customClientSecret, setCustomClientSecret] = useState<string>('');

  // Recovery Key Modal & visibility
  const [showKeyModal, setShowKeyModal] = useState<boolean>(false);
  const [keyVisible, setKeyVisible] = useState<boolean>(false);
  const [importKeyInput, setImportKeyInput] = useState<string>('');
  const [showImportKeyModal, setShowImportKeyModal] = useState<boolean>(false);
  const [copiedKey, setCopiedKey] = useState<boolean>(false);

  // Restore confirmation modal
  const [selectedRestoreBackup, setSelectedRestoreBackup] = useState<BackupHistoryDto | null>(null);
  const [restoreConfirmText, setRestoreConfirmText] = useState<string>('');

  // Disconnect confirmation modal
  const [showDisconnectModal, setShowDisconnectModal] = useState<boolean>(false);

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    const ok = await saveConfig({
      scheduledTime,
      schedulerEnabled,
      retentionCount: Number(retentionCount),
    });
    setSavingSettings(false);
    if (ok) {
      setHasFormChanges(false);
    }
  };

  const handleSaveCustomOAuth = async () => {
    const trimmedId = customClientId.trim();
    const trimmedSecret = customClientSecret.trim();

    if (!trimmedId || !trimmedSecret) {
      alert('Please enter both Google Client ID and Client Secret.');
      return;
    }

    setSavingSettings(true);
    const ok = await saveConfig({
      googleClientId: trimmedId,
      googleClientSecret: trimmedSecret,
    });
    setSavingSettings(false);
    if (ok) {
      setShowOAuthModal(false);
      // Immediately start authentication flow now that credentials are saved
      void startAuth();
    }
  };

  const handleConnectClick = () => {
    if (!status?.hasCustomCredentials) {
      setShowOAuthModal(true);
      return;
    }
    void startAuth();
  };

  const handleShowRecoveryKey = async () => {
    setShowKeyModal(true);
    if (!recoveryKey) {
      await fetchRecoveryKey();
    }
  };

  const handleCopyKey = async () => {
    if (recoveryKey) {
      await navigator.clipboard.writeText(recoveryKey);
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    }
  };

  const handleImportKeySubmit = async () => {
    const trimmed = importKeyInput.trim();
    if (!trimmed || trimmed.length !== 64) {
      alert('Key must be exactly 64 hexadecimal characters (256-bit AES key).');
      return;
    }
    const ok = await importRecoveryKey(trimmed);
    if (ok) {
      setShowImportKeyModal(false);
      setImportKeyInput('');
    }
  };

  const handleConfirmRestore = async () => {
    if (!selectedRestoreBackup) return;
    const backupId = selectedRestoreBackup.id;
    setSelectedRestoreBackup(null);
    setRestoreConfirmText('');
    await restoreBackup(backupId);
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  const formatDate = (isoString?: string | null) => {
    if (!isoString) return '—';
    try {
      const d = new Date(isoString);
      return d.toLocaleString('en-IN', {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-stone-50 p-6 text-stone-850">
      {/* Page Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-stone-200 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-600 text-white shadow-sm">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 00-9.78 2.096A4.001 4.001 0 003 15z"
                />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold text-stone-900">Google Drive Cloud Backup</h1>
              <p className="text-xs text-stone-500">
                Automated multi-company database backups, encrypted with AES-256-GCM and stored in Google Drive.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="flex items-center gap-2 rounded-xl border border-stone-300 bg-white px-3.5 py-2 text-xs font-semibold text-stone-700 shadow-sm transition hover:bg-stone-50 hover:text-stone-900 disabled:opacity-50"
          >
            <svg
              className={`h-4 w-4 ${loading ? 'animate-spin text-purple-600' : 'text-stone-500'}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            <span>Refresh</span>
          </button>

          <button
            type="button"
            onClick={() => void triggerBackupNow()}
            disabled={isBackingUp || !status?.isConnected}
            title={!status?.isConnected ? 'Connect Google Drive first' : 'Create an instant backup'}
            className="flex items-center gap-2 rounded-xl bg-purple-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isBackingUp ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                <span>Backing Up...</span>
              </>
            ) : (
              <>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                  />
                </svg>
                <span>Backup Now</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Global Error Banner */}
      {error && (
        <div className="mb-6 flex items-center justify-between rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-800 shadow-sm">
          <div className="flex items-center gap-3">
            <svg className="h-5 w-5 text-red-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => void refresh()}
            className="font-semibold text-red-700 underline hover:text-red-900"
          >
            Retry
          </button>
        </div>
      )}

      {/* 3 Top Cards Grid */}
      <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-3">
        {/* Card 1: Google Drive Connection */}
        <div className="flex flex-col justify-between rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM19 18H6c-2.21 0-4-1.79-4-4 0-2.05 1.53-3.76 3.56-3.97l1.07-.11.5-.95C8.08 7.14 9.94 6 12 6c2.62 0 4.88 1.86 5.39 4.43l.3 1.5 1.53.11c1.56.1 2.78 1.41 2.78 2.96 0 1.65-1.35 3-3 3z" />
                  </svg>
                </div>
                <h2 className="text-sm font-bold text-stone-900">Google Drive</h2>
              </div>
              {status?.isConnected ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 animate-pulse" />
                  Connected
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-stone-100 px-2.5 py-0.5 text-[11px] font-semibold text-stone-600 border border-stone-200">
                  Disconnected
                </span>
              )}
            </div>

            <div className="mt-4 space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-stone-100">
                <span className="text-stone-500">Connected Account:</span>
                <span className="font-semibold text-stone-800 truncate max-w-[160px]" title={status?.connectedEmail}>
                  {status?.connectedEmail || 'None'}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-stone-100">
                <span className="text-stone-500">Target Folder:</span>
                <span className="font-semibold text-stone-800">
                  {status?.driveFolderName || 'POS_Backups'}
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-stone-500">OAuth Client:</span>
                {status?.hasCustomCredentials ? (
                  <span className="font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    Configured
                  </span>
                ) : (
                  <span className="font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                    Setup Required
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="mt-5 flex items-center gap-2 pt-3 border-t border-stone-100">
            {status?.isConnected ? (
              <button
                type="button"
                onClick={() => setShowDisconnectModal(true)}
                className="w-full rounded-xl border border-red-200 bg-red-50 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-100"
              >
                Disconnect Drive
              </button>
            ) : !status?.hasCustomCredentials ? (
              <button
                type="button"
                onClick={() => setShowOAuthModal(true)}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-amber-600 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-amber-700"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span>Setup Google OAuth</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleConnectClick}
                disabled={authWaiting}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-blue-600 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50"
              >
                {authWaiting ? (
                  <>
                    <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    <span>Authorizing in Browser...</span>
                  </>
                ) : (
                  <>
                    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12.545,10.239v3.821h5.445c-0.712,2.315-2.647,3.972-5.445,3.972c-3.332,0-6.033-2.701-6.033-6.032s2.701-6.032,6.033-6.032c1.498,0,2.866,0.549,3.921,1.453l2.814-2.814C17.503,2.988,15.139,2,12.545,2C7.021,2,2.543,6.477,2.543,12s4.478,10,10.002,10c8.396,0,10.249-7.85,9.426-11.748L12.545,10.239z"/>
                    </svg>
                    <span>Connect Google Drive</span>
                  </>
                )}
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowOAuthModal(true)}
              title="Custom Google Cloud OAuth Client ID"
              className="rounded-xl border border-stone-200 bg-stone-100 p-2 text-stone-600 hover:bg-stone-200"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>
        </div>

        {/* Card 2: Automatic Schedule */}
        <div className="flex flex-col justify-between rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h2 className="text-sm font-bold text-stone-900">Daily Schedule (Cron)</h2>
              </div>
              <label className="relative inline-flex cursor-pointer items-center">
                <input
                  type="checkbox"
                  checked={schedulerEnabled}
                  onChange={(e) => {
                    setSchedulerEnabled(e.target.checked);
                    setHasFormChanges(true);
                  }}
                  className="peer sr-only"
                />
                <div className="peer h-5 w-9 rounded-full bg-stone-300 after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-purple-600 peer-checked:after:translate-x-full peer-focus:outline-none" />
              </label>
            </div>

            <div className="mt-4 space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-stone-500">Backup Time:</span>
                <input
                  type="time"
                  value={scheduledTime}
                  onChange={(e) => {
                    setScheduledTime(e.target.value);
                    setHasFormChanges(true);
                  }}
                  className="rounded-lg border border-stone-300 px-2.5 py-1 text-xs font-semibold text-stone-800 focus:border-purple-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-between">
                <span className="text-stone-500">Retention Policy:</span>
                <select
                  value={retentionCount}
                  onChange={(e) => {
                    setRetentionCount(Number(e.target.value));
                    setHasFormChanges(true);
                  }}
                  className="rounded-lg border border-stone-300 px-2 py-1 text-xs font-semibold text-stone-800 focus:border-purple-500 focus:outline-none"
                >
                  <option value={7}>Keep 7 days</option>
                  <option value={14}>Keep 14 days</option>
                  <option value={30}>Keep 30 days (Recommended)</option>
                  <option value={60}>Keep 60 days</option>
                  <option value={90}>Keep 90 days</option>
                </select>
              </div>

              <div className="flex justify-between py-1 border-t border-stone-100">
                <span className="text-stone-500">Next Scheduled Run:</span>
                <span className="font-semibold text-stone-800">
                  {status?.nextScheduledRun ? formatDate(status.nextScheduledRun) : 'Not scheduled'}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-5 pt-3 border-t border-stone-100">
            <button
              type="button"
              onClick={() => void handleSaveSettings()}
              disabled={!hasFormChanges || savingSettings}
              className={`w-full rounded-xl py-2 text-xs font-semibold transition shadow-sm ${
                hasFormChanges
                  ? 'bg-purple-600 text-white hover:bg-purple-700'
                  : 'bg-stone-100 text-stone-400 cursor-not-allowed'
              }`}
            >
              {savingSettings ? 'Saving...' : hasFormChanges ? 'Save Settings' : 'Settings Saved'}
            </button>
          </div>
        </div>

        {/* Card 3: Security & Encryption Key */}
        <div className="flex flex-col justify-between rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <h2 className="text-sm font-bold text-stone-900">Security & Encryption</h2>
              </div>
              <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200">
                AES-256-GCM
              </span>
            </div>

            <div className="mt-4 space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-stone-100">
                <span className="text-stone-500">Database Engine:</span>
                <span className="font-semibold text-stone-800">SQLite 3 (WAL Mode)</span>
              </div>
              <div className="flex justify-between py-1 border-b border-stone-100">
                <span className="text-stone-500">Atomic Snapshot:</span>
                <span className="font-semibold text-emerald-700">VACUUM INTO Safe</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-stone-500">Multi-Company:</span>
                <span className="font-semibold text-stone-800">Both Stores Backed Up</span>
              </div>
            </div>
          </div>

          <div className="mt-5 flex gap-2 pt-3 border-t border-stone-100">
            <button
              type="button"
              onClick={() => void handleShowRecoveryKey()}
              className="flex-1 rounded-xl border border-stone-300 bg-white py-2 text-xs font-semibold text-stone-700 shadow-sm transition hover:bg-stone-50"
            >
              View Recovery Key
            </button>
            <button
              type="button"
              onClick={() => setShowImportKeyModal(true)}
              className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs font-semibold text-stone-700 shadow-sm transition hover:bg-stone-50"
              title="Import recovery key from another PC"
            >
              Import Key
            </button>
          </div>
        </div>
      </div>

      {/* Backup History Table */}
      <div className="flex flex-1 flex-col rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-stone-900">Backup History</h2>
            <p className="text-xs text-stone-500">
              Audit log of all automatic and manual cloud snapshots.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-stone-500">
              Showing {history.length} backup{history.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-stone-200">
          <table className="w-full text-left text-xs">
            <thead className="bg-stone-100/75 text-stone-600 font-semibold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3 px-4">Date & Time</th>
                <th className="py-3 px-4">Filename</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">Size</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Google Drive</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {history.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-stone-400">
                    No cloud backups recorded yet. Click &quot;Backup Now&quot; above to create the first backup.
                  </td>
                </tr>
              ) : (
                history.map((item) => (
                  <tr key={item.id} className="hover:bg-stone-50/80 transition">
                    <td className="py-3 px-4 font-medium text-stone-800 whitespace-nowrap">
                      {formatDate(item.createdAt)}
                    </td>
                    <td className="py-3 px-4 font-mono text-stone-700 truncate max-w-[200px]" title={item.filename}>
                      {item.filename}
                    </td>
                    <td className="py-3 px-4">
                      {item.backupType === 'AUTOMATIC' ? (
                        <span className="inline-flex items-center rounded-md bg-purple-50 px-2 py-0.5 text-[11px] font-semibold text-purple-700 border border-purple-200">
                          Automatic
                        </span>
                      ) : item.backupType === 'MISSED_SCHEDULED' ? (
                        <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 border border-amber-200">
                          Startup Catch-up
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700 border border-blue-200">
                          Manual
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-stone-600 whitespace-nowrap">
                      {formatBytes(item.sizeBytes)}
                    </td>
                    <td className="py-3 px-4">
                      {item.status === 'SUCCESS' ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                          Success
                        </span>
                      ) : item.status === 'IN_PROGRESS' ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700 border border-blue-200">
                          <span className="h-1.5 w-1.5 rounded-full bg-blue-600 animate-spin" />
                          In Progress
                        </span>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1 rounded-md bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700 border border-red-200"
                          title={item.errorMessage || 'Backup failed'}
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-red-600" />
                          Failed
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-stone-600">
                      {item.driveFileId ? (
                        <span className="inline-flex items-center gap-1 font-mono text-[11px] text-blue-600">
                          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z" />
                          </svg>
                          Uploaded
                        </span>
                      ) : (
                        <span className="text-stone-400">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {item.status === 'SUCCESS' && item.driveFileId && (
                        <button
                          type="button"
                          onClick={() => setSelectedRestoreBackup(item)}
                          disabled={isRestoring}
                          className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 transition hover:bg-amber-100 disabled:opacity-50"
                        >
                          Restore
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Restore Confirmation Modal */}
      {selectedRestoreBackup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-stone-200 animate-in fade-in duration-200">
            <div className="flex items-center gap-3 text-red-600">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-100">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-stone-900">Restore Database Backup?</h3>
            </div>

            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              <p className="font-bold">Caution: This will replace current database tables!</p>
              <p className="mt-1">
                Restoring this backup snapshot will overwrite both companies&apos; current inventory, bills, and transactions.
                An emergency safety backup of the active database will be created automatically before restore starts.
              </p>
            </div>

            <div className="mt-4 space-y-2 rounded-xl bg-stone-50 p-3.5 text-xs">
              <div className="flex justify-between">
                <span className="text-stone-500">Backup File:</span>
                <span className="font-mono font-semibold text-stone-800">{selectedRestoreBackup.filename}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">Created At:</span>
                <span className="font-semibold text-stone-800">{formatDate(selectedRestoreBackup.createdAt)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">Size:</span>
                <span className="font-semibold text-stone-800">{formatBytes(selectedRestoreBackup.sizeBytes)}</span>
              </div>
            </div>

            <div className="mt-4">
              <label className="block text-xs font-semibold text-stone-700">
                To confirm, type <span className="font-bold text-red-600">RESTORE</span> below:
              </label>
              <input
                type="text"
                value={restoreConfirmText}
                onChange={(e) => setRestoreConfirmText(e.target.value)}
                placeholder="RESTORE"
                className="mt-1.5 w-full rounded-xl border border-stone-300 px-3.5 py-2 text-xs font-semibold text-stone-800 focus:border-red-500 focus:outline-none"
              />
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setSelectedRestoreBackup(null);
                  setRestoreConfirmText('');
                }}
                disabled={isRestoring}
                className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-xs font-semibold text-stone-700 transition hover:bg-stone-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmRestore()}
                disabled={restoreConfirmText !== 'RESTORE' || isRestoring}
                className="flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-red-700 disabled:opacity-50"
              >
                {isRestoring ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    <span>Restoring...</span>
                  </>
                ) : (
                  <span>Confirm & Restore</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Disconnect Google Drive Modal */}
      {showDisconnectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-stone-200">
            <h3 className="text-base font-bold text-stone-900">Disconnect Google Drive?</h3>
            <p className="mt-2 text-xs text-stone-600">
              Scheduled and manual cloud backups will be paused until Google Drive is reconnected. Existing backups in Google Drive will remain untouched.
            </p>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowDisconnectModal(false)}
                className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-xs font-semibold text-stone-700 transition hover:bg-stone-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  setShowDisconnectModal(false);
                  await disconnect();
                }}
                className="rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-red-700"
              >
                Disconnect
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Recovery Key Modal */}
      {showKeyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-stone-200">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-stone-900">Disaster Recovery Key</h3>
              <button
                type="button"
                onClick={() => setShowKeyModal(false)}
                className="text-stone-400 hover:text-stone-600"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <p className="mt-2 text-xs text-stone-600">
              This 256-bit AES master key was generated securely on this computer. It encrypts all Google Drive backup files. If you migrate this POS software to a brand new computer, you will need this key to decrypt and restore your backups.
            </p>

            <div className="mt-4 rounded-xl border border-stone-200 bg-stone-50 p-3.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-stone-500">Master Key (Hex)</span>
                <button
                  type="button"
                  onClick={() => setKeyVisible(!keyVisible)}
                  className="text-xs font-semibold text-purple-600 hover:text-purple-700"
                >
                  {keyVisible ? 'Hide' : 'Reveal'}
                </button>
              </div>
              <div className="mt-2 font-mono text-xs break-all text-stone-800 bg-white p-2.5 rounded-lg border border-stone-200">
                {keyVisible && recoveryKey
                  ? recoveryKey
                  : '••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••'}
              </div>
            </div>

            <div className="mt-6 flex justify-between gap-3">
              <button
                type="button"
                onClick={() => void handleCopyKey()}
                className="flex items-center gap-1.5 rounded-xl border border-purple-200 bg-purple-50 px-4 py-2 text-xs font-semibold text-purple-700 transition hover:bg-purple-100"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                <span>{copiedKey ? 'Copied to Clipboard!' : 'Copy Key'}</span>
              </button>

              <button
                type="button"
                onClick={() => setShowKeyModal(false)}
                className="rounded-xl bg-stone-800 px-4 py-2 text-xs font-semibold text-white transition hover:bg-stone-900"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Recovery Key Modal */}
      {showImportKeyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-stone-200">
            <h3 className="text-base font-bold text-stone-900">Import Disaster Recovery Key</h3>
            <p className="mt-2 text-xs text-stone-600">
              Paste the 64-character hexadecimal key copied from your previous computer to decrypt existing Google Drive backups.
            </p>

            <div className="mt-4">
              <textarea
                value={importKeyInput}
                onChange={(e) => setImportKeyInput(e.target.value)}
                placeholder="Paste 64-character hex key here..."
                rows={3}
                className="w-full rounded-xl border border-stone-300 p-3 font-mono text-xs text-stone-800 focus:border-purple-500 focus:outline-none"
              />
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowImportKeyModal(false)}
                className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-xs font-semibold text-stone-700 transition hover:bg-stone-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleImportKeySubmit()}
                className="rounded-xl bg-purple-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-purple-700"
              >
                Save Master Key
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Google Cloud OAuth Credentials Setup Modal */}
      {showOAuthModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl border border-stone-200">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600 font-bold">
                  G
                </div>
                <div>
                  <h3 className="text-base font-bold text-stone-900">Google Cloud OAuth Setup</h3>
                  <p className="text-[11px] text-stone-500">Connect to your official Google Drive account</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowOAuthModal(false)}
                className="text-stone-400 hover:text-stone-600"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Quick 2-Minute Guide */}
            <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50/60 p-3.5 text-xs text-blue-900 space-y-2">
              <div className="font-bold flex items-center gap-1.5 text-blue-800">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>How to get your free Google OAuth Client ID (2 Minutes):</span>
              </div>
              <ol className="list-decimal list-inside space-y-1 text-stone-700 pl-1 text-[11px] leading-relaxed">
                <li>
                  Open <span className="font-semibold text-blue-700">console.cloud.google.com</span> and sign in with your store Google account.
                </li>
                <li>
                  Create a new project (e.g. <b>&quot;POS Backup&quot;</b>) and select it.
                </li>
                <li>
                  Go to <b>APIs & Services &gt; Library</b> and enable <b>&quot;Google Drive API&quot;</b>.
                </li>
                <li>
                  Go to <b>APIs & Services &gt; OAuth consent screen</b>:
                  <div className="pl-3 text-stone-600 font-sans">
                    • User Type: <b>External</b><br />
                    • App name: <b>Retail POS</b><br />
                    • Under <b>Test users</b>, add your Google email address.
                  </div>
                </li>
                <li>
                  Go to <b>APIs & Services &gt; Credentials</b> &gt; Click <b>+ CREATE CREDENTIALS &gt; OAuth client ID</b>:
                  <div className="pl-3 text-stone-600 font-sans">
                    • Application type: <b>Desktop app</b><br />
                    • Name: <b>POS Desktop</b> &gt; Click <b>CREATE</b>.
                  </div>
                </li>
                <li>Copy the <b>Client ID</b> and <b>Client Secret</b> below.</li>
              </ol>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-stone-700">
                  Google Client ID <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={customClientId}
                  onChange={(e) => setCustomClientId(e.target.value)}
                  placeholder="e.g. 1234567890-abcdefg.apps.googleusercontent.com"
                  className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 font-mono text-xs text-stone-800 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700">
                  Google Client Secret <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  value={customClientSecret}
                  onChange={(e) => setCustomClientSecret(e.target.value)}
                  placeholder="e.g. GOCSPX-xxxxxxxxxxxxxxxxxxxxxxxx"
                  className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 font-mono text-xs text-stone-800 focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3 pt-3 border-t border-stone-100">
              <button
                type="button"
                onClick={() => setShowOAuthModal(false)}
                className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-xs font-semibold text-stone-700 transition hover:bg-stone-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSaveCustomOAuth()}
                disabled={savingSettings || !customClientId.trim() || !customClientSecret.trim()}
                className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50"
              >
                {savingSettings ? 'Saving...' : 'Save & Connect'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
