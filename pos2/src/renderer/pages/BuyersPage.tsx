import React, { useEffect, useState } from 'react';
import type { AuthSessionPayload, BuyerDto } from '../../shared/types/ipc';
import { BuyerFormModal } from '../components/BuyerFormModal';
import { useBuyers } from '../hooks/useBuyers';
import { useToast } from '../context/ToastContext';

interface BuyersPageProps {
  session: AuthSessionPayload;
}

export const BuyersPage: React.FC<BuyersPageProps> = ({ session }) => {
  const { showError, showSuccess } = useToast();
  const {
    buyers,
    loading,
    error,
    searchVal,
    setSearchVal,
    createBuyer,
    updateBuyer,
    deleteBuyer,
    clearError,
  } = useBuyers();

  useEffect(() => {
    if (error) {
      showError(error);
      clearError();
    }
  }, [error, showError, clearError]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBuyer, setEditingBuyer] = useState<BuyerDto | null>(null);
  const [buyerToDelete, setBuyerToDelete] = useState<BuyerDto | null>(null);

  const handleOpenAddModal = () => {
    setEditingBuyer(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (b: BuyerDto) => {
    setEditingBuyer(b);
    setIsModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!buyerToDelete) return;
    const target = buyerToDelete;
    setBuyerToDelete(null);
    const ok = await deleteBuyer(target.id);
    if (ok) {
      showSuccess(`Buyer "${target.name}" removed successfully.`);
    }
  };

  const handleSaveBuyer = async (data: {
    id?: string;
    name: string;
    phoneNumber?: string | null;
    email?: string | null;
    address?: string | null;
    notes?: string | null;
  }) => {
    if (data.id) {
      const res = await updateBuyer({
        id: data.id,
        name: data.name,
        phoneNumber: data.phoneNumber,
        email: data.email,
        address: data.address,
        notes: data.notes,
      });
      if (res) {
        showSuccess(`Buyer "${res.name}" updated successfully.`);
      }
      return res;
    } else {
      const res = await createBuyer({
        name: data.name,
        phoneNumber: data.phoneNumber,
        email: data.email,
        address: data.address,
        notes: data.notes,
      });
      if (res) {
        showSuccess(`Buyer "${res.name}" added successfully.`);
      }
      return res;
    }
  };

  return (
    <div className="space-y-6 select-text max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-3xl border border-cream-300 bg-white p-6 shadow-xs">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold tracking-tight text-stone-900">
              Buyers Directory
            </h1>
            <span className="rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold px-2.5 py-0.5">
              {session.companyName}
            </span>
          </div>
          <p className="mt-1 text-xs text-stone-500">
            Register and manage your retail and wholesale buyers.
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpenAddModal}
          className="inline-flex items-center gap-2 rounded-xl bg-amber-600 hover:bg-amber-500 px-4 py-2.5 text-xs font-bold text-white shadow-sm shadow-amber-600/20 transition cursor-pointer"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          + Add Buyer
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-cream-300 bg-white p-4 shadow-xs">
        <div className="relative w-full max-w-md">
          <input
            type="text"
            value={searchVal}
            onChange={(e) => setSearchVal(e.target.value)}
            placeholder="Search buyers by name, phone, or address..."
            className="w-full rounded-xl border border-cream-300 bg-cream-50/50 px-3.5 py-2 pl-9 text-xs text-stone-900 placeholder-stone-400 focus:border-amber-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-600/20"
          />
          <svg
            className="absolute left-3 top-2.5 h-4 w-4 text-stone-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>

        <div className="text-xs text-stone-500">
          Total Registered Buyers: <span className="font-bold text-stone-800">{buyers.length}</span>
        </div>
      </div>

      {/* Buyers List Cards */}
      {loading ? (
        <div className="flex justify-center p-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-amber-600 border-t-transparent" />
        </div>
      ) : buyers.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-cream-300 bg-white/50 p-12 text-center">
          <p className="text-sm font-semibold text-stone-700">No buyers found</p>
          <p className="mt-1 text-xs text-stone-400">
            {searchVal ? 'Try adjusting your search criteria.' : 'Click "+ Add Buyer" to register your first buyer.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {buyers.map((buyer) => (
            <div
              key={buyer.id}
              className="rounded-2xl border border-cream-300 bg-white p-5 shadow-xs hover:shadow-md transition flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-bold text-stone-900">{buyer.name}</h3>
                </div>

                <div className="mt-3 space-y-1.5 text-xs text-stone-600">
                  {buyer.phoneNumber && (
                    <div className="flex items-center gap-2">
                      <span className="text-stone-400">Phone:</span>
                      <span className="font-mono text-stone-800 font-medium">{buyer.phoneNumber}</span>
                    </div>
                  )}

                  {buyer.email && (
                    <div className="flex items-center gap-2">
                      <span className="text-stone-400">Email:</span>
                      <span className="text-stone-800">{buyer.email}</span>
                    </div>
                  )}

                  {buyer.address && (
                    <div className="flex items-start gap-2">
                      <span className="text-stone-400">Address:</span>
                      <span className="text-stone-800">{buyer.address}</span>
                    </div>
                  )}

                  {buyer.notes && (
                    <div className="mt-2 rounded-xl bg-cream-50/70 p-2 text-[11px] text-stone-500 italic">
                      "{buyer.notes}"
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-5 flex items-center justify-between border-t border-cream-200 pt-3">
                <span className="text-[10px] text-stone-400">
                  Added {new Date(buyer.createdAt).toLocaleDateString()}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleOpenEditModal(buyer)}
                    className="rounded-lg bg-cream-100 hover:bg-cream-200 px-2.5 py-1 text-xs font-semibold text-stone-700 transition cursor-pointer"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => setBuyerToDelete(buyer)}
                    className="rounded-lg p-1 text-stone-400 hover:bg-rose-50 hover:text-rose-600 transition cursor-pointer"
                    title="Delete Buyer"
                  >
                    ✕
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Buyer Modal */}
      <BuyerFormModal
        isOpen={isModalOpen}
        buyer={editingBuyer}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveBuyer}
      />

      {/* Delete Confirmation Modal */}
      {buyerToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl border border-cream-300 bg-white p-6 shadow-xl space-y-4">
            <h3 className="text-sm font-bold text-stone-900">Remove Buyer</h3>
            <p className="text-xs text-stone-600">
              Are you sure you want to remove buyer <strong>"{buyerToDelete.name}"</strong>?
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setBuyerToDelete(null)}
                className="rounded-xl border border-cream-300 px-3.5 py-1.5 text-xs font-semibold text-stone-700 hover:bg-cream-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="rounded-xl bg-rose-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-rose-500 cursor-pointer"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
