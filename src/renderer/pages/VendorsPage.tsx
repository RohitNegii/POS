import React, { useEffect, useState } from 'react';
import type { AuthSessionPayload, VendorDto } from '../../shared/types/ipc';
import { useToast } from '../context/ToastContext';
import { useVendors } from '../hooks/useVendors';
import { formatDateTime } from '../utils/formatters';

interface VendorsPageProps {
  session: AuthSessionPayload;
}

export const VendorsPage: React.FC<VendorsPageProps> = ({ session: _session }) => {
  const { showError, showSuccess } = useToast();
  const {
    vendors,
    loading,
    error,
    refreshVendors,
    createVendor,
    updateVendor,
    deleteVendor,
    clearError,
  } = useVendors();

  const [searchVal, setSearchVal] = useState<string>('');
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingVendor, setEditingVendor] = useState<VendorDto | null>(null);
  const [vendorToDelete, setVendorToDelete] = useState<VendorDto | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    phoneNumber: '',
    address: '',
    gstNumber: '',
    bankName: '',
    accountNumber: '',
    ifscCode: '',
  });
  const [submitting, setSubmitting] = useState<boolean>(false);

  useEffect(() => {
    if (error) {
      showError(error);
      clearError();
    }
  }, [error, showError, clearError]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void refreshVendors(searchVal.trim() || undefined);
  };

  const handleOpenAddModal = () => {
    setEditingVendor(null);
    setFormData({
      name: '',
      phoneNumber: '',
      address: '',
      gstNumber: '',
      bankName: '',
      accountNumber: '',
      ifscCode: '',
    });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (vendor: VendorDto) => {
    setEditingVendor(vendor);
    setFormData({
      name: vendor.name,
      phoneNumber: vendor.phoneNumber || '',
      address: vendor.address || '',
      gstNumber: vendor.gstNumber || '',
      bankName: vendor.bankName || '',
      accountNumber: vendor.accountNumber || '',
      ifscCode: vendor.ifscCode || '',
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = formData.name.trim();
    if (!trimmedName) {
      showError('Vendor name is required.');
      return;
    }
    if (trimmedName.length < 2 || trimmedName.length > 100) {
      showError('Vendor name must be between 2 and 100 characters.');
      return;
    }

    setSubmitting(true);
    try {
      if (editingVendor) {
        const res = await updateVendor({
          id: editingVendor.id,
          name: trimmedName,
          phoneNumber: formData.phoneNumber.trim() || null,
          address: formData.address.trim() || null,
          gstNumber: formData.gstNumber.trim().toUpperCase() || null,
          bankName: formData.bankName.trim() || null,
          accountNumber: formData.accountNumber.trim() || null,
          ifscCode: formData.ifscCode.trim().toUpperCase() || null,
        });
        if (res) {
          showSuccess(`Vendor "${res.name}" updated successfully.`);
          setIsModalOpen(false);
        }
      } else {
        const res = await createVendor({
          name: trimmedName,
          phoneNumber: formData.phoneNumber.trim() || null,
          address: formData.address.trim() || null,
          gstNumber: formData.gstNumber.trim().toUpperCase() || null,
          bankName: formData.bankName.trim() || null,
          accountNumber: formData.accountNumber.trim() || null,
          ifscCode: formData.ifscCode.trim().toUpperCase() || null,
        });
        if (res) {
          showSuccess(`Vendor "${res.name}" created successfully.`);
          setIsModalOpen(false);
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!vendorToDelete) return;
    const target = vendorToDelete;
    setVendorToDelete(null);
    const success = await deleteVendor(target.id);
    if (success) {
      showSuccess(`Vendor "${target.name}" removed successfully.`);
    }
  };

  return (
    <div className="space-y-6 select-text">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-stone-900">
            Vendors / Suppliers
          </h1>
          <p className="mt-1 text-xs text-stone-500">
            Register and manage vendors/buyers from whom products and inventory are purchased.
          </p>
        </div>

        <button
          id="btn-add-vendor"
          type="button"
          onClick={handleOpenAddModal}
          className="inline-flex items-center gap-2 rounded-xl bg-amber-600 hover:bg-amber-500 px-4 py-2.5 text-xs font-bold text-white shadow-sm shadow-amber-600/20 transition hover:shadow"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Vendor
        </button>
      </div>

      {/* Search & Filter Bar */}
      <div className="rounded-2xl border border-cream-300 bg-white p-4 shadow-xs">
        <form onSubmit={handleSearchSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1 max-w-md">
            <input
              id="vendor-search-input"
              type="text"
              value={searchVal}
              onChange={(e) => setSearchVal(e.target.value)}
              placeholder="Search by vendor name or phone number..."
              className="w-full rounded-xl border border-cream-300 bg-cream-50/50 px-3.5 py-2 pl-9 text-xs text-stone-900 placeholder-stone-400 focus:border-amber-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-600/20"
            />
            <svg
              className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-stone-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>

          <button
            id="btn-search-vendors"
            type="submit"
            className="rounded-xl border border-cream-300 bg-cream-100 hover:bg-cream-200 px-4 py-2 text-xs font-semibold text-stone-700 transition"
          >
            Search
          </button>

          {searchVal && (
            <button
              type="button"
              onClick={() => {
                setSearchVal('');
                void refreshVendors();
              }}
              className="text-xs font-medium text-stone-500 hover:text-stone-800 transition underline underline-offset-2"
            >
              Clear
            </button>
          )}
        </form>
      </div>

      {/* Vendors Table */}
      <div className="overflow-hidden rounded-2xl border border-cream-300 bg-white shadow-sm">
        {loading && vendors.length === 0 ? (
          <div className="flex h-64 items-center justify-center text-xs text-stone-500">
            <div className="flex items-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-amber-600 border-t-transparent" />
              Loading vendors...
            </div>
          </div>
        ) : vendors.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cream-100 text-stone-500 border border-cream-300">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <h3 className="mt-4 text-sm font-bold text-stone-800">
              No vendors found
            </h3>
            <p className="mt-1 text-xs text-stone-500 max-w-sm">
              {searchVal
                ? 'No vendors match your search.'
                : 'No vendors added yet. Click "Add Vendor" to add your first supplier partner.'}
            </p>
            {!searchVal && (
              <button
                type="button"
                onClick={handleOpenAddModal}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-amber-600 hover:bg-amber-500 px-4 py-2 text-xs font-bold text-white shadow-sm hover:shadow transition"
              >
                + Add First Vendor
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-cream-200 bg-cream-50/75 uppercase tracking-wider text-stone-600 font-bold">
                <tr>
                  <th className="px-6 py-3.5">Vendor Name</th>
                  <th className="px-6 py-3.5">Phone Number</th>
                  <th className="px-6 py-3.5 text-center">Purchases</th>
                  <th className="px-6 py-3.5 text-right">Total Purchased (₹)</th>
                  <th className="px-6 py-3.5">Date Added</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-200/80">
                {vendors.map((vendor) => (
                  <tr
                    key={vendor.id}
                    className="transition hover:bg-cream-50/60 group"
                  >
                    <td className="px-6 py-4">
                      <div className="font-bold text-stone-900">{vendor.name}</div>
                      {vendor.gstNumber && (
                        <div className="font-mono text-[11px] text-amber-800 font-semibold mt-0.5">
                          GSTIN: {vendor.gstNumber}
                        </div>
                      )}
                      {vendor.address && (
                        <div className="text-[11px] text-stone-500 truncate max-w-xs mt-0.5">
                          {vendor.address}
                        </div>
                      )}
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap">
                      {vendor.phoneNumber ? (
                        <div className="flex items-center gap-1.5 font-medium text-stone-700">
                          <svg className="h-3.5 w-3.5 text-stone-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                          </svg>
                          <span>{vendor.phoneNumber}</span>
                        </div>
                      ) : (
                        <span className="text-stone-400 font-normal italic">Optional / Not provided</span>
                      )}
                      {vendor.bankName && (
                        <div className="text-[11px] text-stone-500 mt-1 flex items-center gap-1">
                          <span className="rounded bg-cream-100 px-1.5 py-0.2 text-[10px] font-semibold text-stone-600">Bank</span>
                          <span>{vendor.bankName}</span>
                          {vendor.accountNumber ? ` • ${vendor.accountNumber.slice(-4)}` : ''}
                        </div>
                      )}
                    </td>

                    <td className="px-6 py-4 text-center whitespace-nowrap">
                      <span className="inline-flex items-center justify-center rounded-full bg-cream-100 px-2.5 py-0.5 text-xs font-semibold text-stone-700 border border-cream-300">
                        {vendor.purchasesCount || 0}
                      </span>
                    </td>

                    <td className="px-6 py-4 text-right whitespace-nowrap font-bold text-stone-900">
                      ₹{(vendor.totalPurchasedAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap text-stone-500">
                      {formatDateTime(vendor.createdAt)}
                    </td>

                    <td className="px-6 py-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleOpenEditModal(vendor)}
                          className="rounded-lg border border-cream-300 bg-white hover:bg-cream-100 px-2.5 py-1 text-xs font-medium text-stone-700 transition"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => setVendorToDelete(vendor)}
                          className="rounded-lg border border-cream-300 bg-white hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 px-2.5 py-1 text-xs font-medium text-stone-600 transition"
                        >
                          Delete
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

      {/* Add / Edit Vendor Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl border border-cream-300 bg-white p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-cream-200 pb-3.5">
              <h2 className="text-base font-bold text-stone-900">
                {editingVendor ? 'Edit Vendor Details' : 'Add New Vendor / Supplier'}
              </h2>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="rounded-lg p-1 text-stone-400 hover:bg-cream-100 hover:text-stone-700 transition"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="mt-4 space-y-3.5 max-h-[75vh] overflow-y-auto pr-1">
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  Vendor / Supplier Name <span className="text-amber-600">*</span>
                </label>
                <input
                  id="vendor-name-input"
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Ramesh Jewellers, Royal Fabrics Supplier"
                  className="w-full rounded-xl border border-cream-300 bg-cream-50/50 px-3.5 py-2 text-xs text-stone-900 placeholder-stone-400 focus:border-amber-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-600/20"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">
                    Phone Number <span className="text-stone-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    id="vendor-phone-input"
                    type="tel"
                    value={formData.phoneNumber}
                    onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
                    placeholder="e.g. +91 98765 43210"
                    className="w-full rounded-xl border border-cream-300 bg-cream-50/50 px-3.5 py-2 text-xs text-stone-900 placeholder-stone-400 focus:border-amber-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-600/20"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">
                    GSTIN Number <span className="text-stone-400 font-normal">(Vendor GST No)</span>
                  </label>
                  <input
                    id="vendor-gst-input"
                    type="text"
                    value={formData.gstNumber}
                    onChange={(e) => setFormData({ ...formData, gstNumber: e.target.value.toUpperCase() })}
                    placeholder="e.g. 07AAAAA0000A1Z5"
                    className="w-full rounded-xl border border-cream-300 bg-cream-50/50 px-3.5 py-2 text-xs text-stone-900 placeholder-stone-400 focus:border-amber-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-600/20 font-mono uppercase"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  Address of Creditor / Vendor <span className="text-stone-400 font-normal">(Billing / Dispatch)</span>
                </label>
                <textarea
                  id="vendor-address-input"
                  rows={2}
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="Street, City, State, PIN Code"
                  className="w-full rounded-xl border border-cream-300 bg-cream-50/50 px-3.5 py-2 text-xs text-stone-900 placeholder-stone-400 focus:border-amber-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-600/20"
                />
              </div>

              {/* Bank Details of Vendor */}
              <div className="rounded-xl border border-cream-300 bg-cream-50/50 p-3 space-y-2.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-stone-600 block">
                  Bank Account Details of Vendor
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-semibold text-stone-600 mb-1">
                      Bank Name
                    </label>
                    <input
                      id="vendor-bank-name-input"
                      type="text"
                      value={formData.bankName}
                      onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
                      placeholder="e.g. HDFC Bank"
                      className="w-full rounded-lg border border-cream-300 bg-white px-2.5 py-1.5 text-xs text-stone-900 placeholder-stone-400 focus:border-amber-600 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-stone-600 mb-1">
                      Account No.
                    </label>
                    <input
                      id="vendor-account-no-input"
                      type="text"
                      value={formData.accountNumber}
                      onChange={(e) => setFormData({ ...formData, accountNumber: e.target.value })}
                      placeholder="e.g. 50100234567890"
                      className="w-full rounded-lg border border-cream-300 bg-white px-2.5 py-1.5 text-xs text-stone-900 placeholder-stone-400 focus:border-amber-600 focus:outline-none font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-stone-600 mb-1">
                      IFSC Code
                    </label>
                    <input
                      id="vendor-ifsc-input"
                      type="text"
                      value={formData.ifscCode}
                      onChange={(e) => setFormData({ ...formData, ifscCode: e.target.value.toUpperCase() })}
                      placeholder="e.g. HDFC0001234"
                      className="w-full rounded-lg border border-cream-300 bg-white px-2.5 py-1.5 text-xs text-stone-900 placeholder-stone-400 focus:border-amber-600 focus:outline-none font-mono uppercase"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-cream-200">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={submitting}
                  className="rounded-xl border border-cream-300 bg-white hover:bg-cream-100 px-4 py-2 text-xs font-semibold text-stone-700 transition"
                >
                  Cancel
                </button>
                <button
                  id="btn-save-vendor"
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 px-4 py-2 text-xs font-bold text-white shadow-sm transition disabled:opacity-50"
                >
                  {submitting && (
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  )}
                  {editingVendor ? 'Save Changes' : 'Add Vendor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {vendorToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm rounded-2xl border border-cream-300 bg-white p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-100 text-rose-600 border border-rose-200">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </div>
            <h3 className="mt-3 text-sm font-bold text-stone-900">
              Delete Vendor "{vendorToDelete.name}"?
            </h3>
            <p className="mt-1 text-xs text-stone-500">
              Are you sure you want to delete this vendor? This action cannot be undone.
            </p>

            <div className="mt-5 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setVendorToDelete(null)}
                className="rounded-xl border border-cream-300 bg-white hover:bg-cream-100 px-3.5 py-1.5 text-xs font-semibold text-stone-700 transition"
              >
                Cancel
              </button>
              <button
                id="btn-confirm-delete-vendor"
                type="button"
                onClick={() => void handleConfirmDelete()}
                className="rounded-xl bg-rose-600 hover:bg-rose-500 px-3.5 py-1.5 text-xs font-bold text-white shadow-xs transition"
              >
                Delete Vendor
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
