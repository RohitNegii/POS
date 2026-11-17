import React, { useEffect, useState } from 'react';
import type { AuthSessionPayload, BillingUserDto } from '../../shared/types/ipc';
import { useToast } from '../context/ToastContext';
import { ipcClient } from '../services/ipcClient';

interface BillingUsersPageProps {
  session: AuthSessionPayload;
}

export const BillingUsersPage: React.FC<BillingUsersPageProps> = ({ session }) => {
  const { showSuccess, showError } = useToast();

  const [billingUsers, setBillingUsers] = useState<BillingUserDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Add modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [submittingAdd, setSubmittingAdd] = useState(false);

  // Edit modal state
  const [editingUser, setEditingUser] = useState<BillingUserDto | null>(null);
  const [editUserName, setEditUserName] = useState('');
  const [submittingEdit, setSubmittingEdit] = useState(false);

  // Delete modal state
  const [deletingUser, setDeletingUser] = useState<BillingUserDto | null>(null);
  const [submittingDelete, setSubmittingDelete] = useState(false);

  const fetchBillingUsers = async () => {
    setLoading(true);
    try {
      const res = await ipcClient.listBillingUsers();
      if (res.success) {
        setBillingUsers(res.data);
      } else {
        showError(res.error || 'Failed to load billing users.');
      }
    } catch {
      showError('Error loading billing users.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchBillingUsers();
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newUserName.trim();
    if (!trimmed) {
      showError('Please enter a billing user name.');
      return;
    }
    if (trimmed.length < 2) {
      showError('Billing user name must be at least 2 characters.');
      return;
    }

    setSubmittingAdd(true);
    try {
      const res = await ipcClient.createBillingUser({ name: trimmed });
      if (res.success) {
        showSuccess(`Billing User "${res.data.name}" registered successfully.`);
        setNewUserName('');
        setShowAddModal(false);
        void fetchBillingUsers();
      } else {
        showError(res.error || 'Failed to create billing user.');
      }
    } catch {
      showError('Error creating billing user.');
    } finally {
      setSubmittingAdd(false);
    }
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    const trimmed = editUserName.trim();
    if (!trimmed) {
      showError('Please enter a valid name.');
      return;
    }
    if (trimmed.length < 2) {
      showError('Billing user name must be at least 2 characters.');
      return;
    }

    setSubmittingEdit(true);
    try {
      const res = await ipcClient.updateBillingUser({
        id: editingUser.id,
        name: trimmed,
      });
      if (res.success) {
        showSuccess(`Billing User updated to "${res.data.name}".`);
        setEditingUser(null);
        setEditUserName('');
        void fetchBillingUsers();
      } else {
        showError(res.error || 'Failed to update billing user.');
      }
    } catch {
      showError('Error updating billing user.');
    } finally {
      setSubmittingEdit(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!deletingUser) return;

    setSubmittingDelete(true);
    try {
      const res = await ipcClient.deleteBillingUser(deletingUser.id);
      if (res.success) {
        showSuccess(`Billing User "${deletingUser.name}" deleted.`);
        setDeletingUser(null);
        void fetchBillingUsers();
      } else {
        showError(res.error || 'Failed to delete billing user.');
      }
    } catch {
      showError('Error deleting billing user.');
    } finally {
      setSubmittingDelete(false);
    }
  };

  const filteredUsers = billingUsers.filter((u) =>
    u.name.toLowerCase().includes(search.toLowerCase().trim())
  );

  return (
    <div className="space-y-6">
      {/* Top Banner & Action */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-xl font-bold tracking-tight text-stone-900">
              Billing User Management
            </h2>
            <span className="rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-bold text-purple-800 border border-purple-200">
              Super Admin Area
            </span>
          </div>
          <p className="mt-1 text-xs text-stone-500">
            Logged in as <span className="font-semibold text-stone-700">{session.adminName}</span>. Create, view, edit, and delete Billing Users who operate the POS billing terminal across both companies.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            id="btn-add-billing-user"
            type="button"
            onClick={() => {
              setNewUserName('');
              setShowAddModal(true);
            }}
            className="flex items-center gap-2 rounded-xl bg-purple-600 hover:bg-purple-700 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition focus:outline-none focus:ring-2 focus:ring-purple-600 focus:ring-offset-2"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span>Add Billing User</span>
          </button>
        </div>
      </div>

      {/* Info Card explaining Super Admin Scope */}
      <div className="rounded-2xl border border-purple-200 bg-purple-50/60 p-4 text-xs text-purple-900">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-purple-100 p-2 text-purple-700">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <div className="flex-1">
            <div className="font-bold text-purple-950">Super Admin Billing User Authority</div>
            <p className="mt-0.5 text-[11px] text-purple-800 leading-relaxed">
              Billing Users created here are available for attribution when operators ring up sales in the POS terminal.
              This list is shared across Company A and Company B. As Super Admin, you manage billing operators
              independently without modifying company admin configurations or catalog items.
            </p>
          </div>
        </div>
      </div>

      {/* Search and Stats Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full max-w-sm">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-stone-400">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
          <input
            id="search-billing-users"
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search billing users by name..."
            className="w-full rounded-xl border border-cream-300 bg-white pl-9 pr-3.5 py-2 text-xs text-stone-800 placeholder-stone-400 transition focus:border-purple-600 focus:outline-none focus:ring-2 focus:ring-purple-600/20"
          />
        </div>

        <div className="flex items-center gap-2 text-xs text-stone-500">
          <span>Registered Operators:</span>
          <span className="rounded-lg bg-white px-2.5 py-1 font-bold text-stone-800 border border-cream-300 shadow-2xs">
            {billingUsers.length}
          </span>
        </div>
      </div>

      {/* Billing Users Table */}
      <div className="overflow-hidden rounded-2xl border border-cream-300 bg-white shadow-xs">
        {loading ? (
          <div className="flex h-48 items-center justify-center">
            <div className="flex flex-col items-center gap-2">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-purple-600 border-t-transparent" />
              <span className="text-xs text-stone-500">Loading Billing Users...</span>
            </div>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-50 text-purple-600 border border-purple-200">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                />
              </svg>
            </div>
            <h3 className="mt-3 text-sm font-bold text-stone-800">
              {search ? 'No matching billing users' : 'No billing users registered yet'}
            </h3>
            <p className="mt-1 max-w-sm text-xs text-stone-500">
              {search
                ? 'Try searching with a different name or keyword.'
                : 'Click "Add Billing User" above to create the first operator for the counter terminal.'}
            </p>
            {!search && (
              <button
                type="button"
                onClick={() => {
                  setNewUserName('');
                  setShowAddModal(true);
                }}
                className="mt-4 rounded-xl bg-purple-600 hover:bg-purple-700 px-4 py-2 text-xs font-semibold text-white transition"
              >
                Add First Billing User
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-cream-200 bg-cream-50/70 font-semibold uppercase tracking-wider text-stone-500 text-[10px]">
                <tr>
                  <th className="py-3 px-4">Billing User / Operator Name</th>
                  <th className="py-3 px-4">Registered On</th>
                  <th className="py-3 px-4">Last Updated</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-100">
                {filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-cream-50/50 transition">
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-100 text-purple-700 font-bold text-xs uppercase shadow-2xs">
                          {user.name.slice(0, 2)}
                        </div>
                        <div>
                          <div className="font-bold text-stone-900 text-sm">{user.name}</div>
                          <div className="text-[10px] text-stone-400">ID: {user.id.slice(0, 8)}...</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-stone-600">
                      {new Date(user.createdAt).toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </td>
                    <td className="py-3.5 px-4 text-stone-600">
                      {new Date(user.updatedAt).toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingUser(user);
                            setEditUserName(user.name);
                          }}
                          className="flex items-center gap-1 rounded-lg border border-cream-300 bg-white hover:bg-cream-100 px-2.5 py-1.5 text-[11px] font-semibold text-stone-700 transition shadow-2xs"
                          title="Edit User Name"
                        >
                          <svg className="h-3.5 w-3.5 text-stone-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                            />
                          </svg>
                          <span>Edit</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setDeletingUser(user)}
                          className="flex items-center gap-1 rounded-lg border border-rose-200 bg-white hover:bg-rose-50 px-2.5 py-1.5 text-[11px] font-semibold text-rose-700 transition shadow-2xs"
                          title="Delete User"
                        >
                          <svg className="h-3.5 w-3.5 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                            />
                          </svg>
                          <span>Delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Billing User Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl border border-cream-300 bg-white p-6 shadow-xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-cream-200 pb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-100 text-purple-700 font-bold">
                  +
                </div>
                <div>
                  <h3 className="text-sm font-bold text-stone-900">Add New Billing User</h3>
                  <p className="text-[11px] text-stone-500">Register a staff operator for billing counter duties</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="rounded-lg p-1 text-stone-400 hover:bg-cream-100 hover:text-stone-700"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-stone-700">
                  Billing User / Operator Name <span className="text-rose-500">*</span>
                </label>
                <input
                  id="input-new-billing-user-name"
                  type="text"
                  required
                  autoFocus
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  placeholder="e.g., Rahul Sharma, Pooja Verma, Counter 1"
                  className="mt-1.5 w-full rounded-xl border border-cream-300 bg-cream-50/50 px-3.5 py-2.5 text-xs text-stone-900 placeholder-stone-400 transition focus:border-purple-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-600/20"
                />
                <p className="mt-1 text-[11px] text-stone-400">
                  This name will appear on the bill operator selection popup and on all customer receipts created by this user.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2.5 border-t border-cream-200 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  disabled={submittingAdd}
                  className="rounded-xl border border-cream-300 bg-white px-4 py-2 text-xs font-semibold text-stone-700 hover:bg-cream-100 transition"
                >
                  Cancel
                </button>
                <button
                  id="btn-submit-add-billing-user"
                  type="submit"
                  disabled={submittingAdd}
                  className="flex items-center gap-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 px-4 py-2 text-xs font-semibold text-white shadow-sm transition disabled:opacity-50"
                >
                  {submittingAdd ? (
                    <>
                      <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>Create Billing User</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Billing User Modal */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl border border-cream-300 bg-white p-6 shadow-xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-cream-200 pb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-100 text-amber-700 font-bold">
                  ✎
                </div>
                <div>
                  <h3 className="text-sm font-bold text-stone-900">Edit Billing User</h3>
                  <p className="text-[11px] text-stone-500">Update the registered operator name</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="rounded-lg p-1 text-stone-400 hover:bg-cream-100 hover:text-stone-700"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdateUser} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-stone-700">
                  Billing User Name <span className="text-rose-500">*</span>
                </label>
                <input
                  id="input-edit-billing-user-name"
                  type="text"
                  required
                  autoFocus
                  value={editUserName}
                  onChange={(e) => setEditUserName(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-cream-300 bg-cream-50/50 px-3.5 py-2.5 text-xs text-stone-900 placeholder-stone-400 transition focus:border-purple-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-600/20"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 border-t border-cream-200 pt-3">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  disabled={submittingEdit}
                  className="rounded-xl border border-cream-300 bg-white px-4 py-2 text-xs font-semibold text-stone-700 hover:bg-cream-100 transition"
                >
                  Cancel
                </button>
                <button
                  id="btn-submit-edit-billing-user"
                  type="submit"
                  disabled={submittingEdit}
                  className="flex items-center gap-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 px-4 py-2 text-xs font-semibold text-white shadow-sm transition disabled:opacity-50"
                >
                  {submittingEdit ? (
                    <>
                      <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      <span>Updating...</span>
                    </>
                  ) : (
                    <span>Save Changes</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl border border-cream-300 bg-white p-6 shadow-xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-rose-100 text-rose-600">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-bold text-stone-900">Delete Billing User?</h3>
                <p className="mt-0.5 text-xs text-stone-500">
                  Are you sure you want to delete <strong className="text-stone-800">"{deletingUser.name}"</strong>?
                </p>
              </div>
            </div>

            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-[11px] text-amber-900">
              <strong>Notice:</strong> This user will no longer be selectable for future bills. Any past bills already created by this user will preserve the operator's name in billing history and reports for audit integrity.
            </div>

            <div className="mt-5 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setDeletingUser(null)}
                disabled={submittingDelete}
                className="rounded-xl border border-cream-300 bg-white px-4 py-2 text-xs font-semibold text-stone-700 hover:bg-cream-100 transition"
              >
                Cancel
              </button>
              <button
                id="btn-confirm-delete-billing-user"
                type="button"
                onClick={handleDeleteUser}
                disabled={submittingDelete}
                className="flex items-center gap-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 px-4 py-2 text-xs font-semibold text-white shadow-sm transition disabled:opacity-50"
              >
                {submittingDelete ? (
                  <>
                    <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <span>Yes, Delete</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
