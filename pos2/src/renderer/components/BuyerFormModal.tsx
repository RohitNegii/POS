import React, { useEffect, useState } from 'react';
import type { BuyerDto } from '../../shared/types/ipc';
import { useToast } from '../context/ToastContext';

interface BuyerFormModalProps {
  isOpen: boolean;
  buyer: BuyerDto | null;
  onClose: () => void;
  onSave: (data: {
    id?: string;
    name: string;
    phoneNumber?: string | null;
    email?: string | null;
    address?: string | null;
    notes?: string | null;
  }) => Promise<BuyerDto | null>;
}

export const BuyerFormModal: React.FC<BuyerFormModalProps> = ({
  isOpen,
  buyer,
  onClose,
  onSave,
}) => {
  const isEditing = Boolean(buyer);
  const { showError } = useToast();

  const [name, setName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (buyer) {
      setName(buyer.name);
      setPhoneNumber(buyer.phoneNumber || '');
      setEmail(buyer.email || '');
      setAddress(buyer.address || '');
      setNotes(buyer.notes || '');
    } else {
      setName('');
      setPhoneNumber('');
      setEmail('');
      setAddress('');
      setNotes('');
    }
  }, [buyer, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      showError('Buyer name is required.');
      return;
    }
    if (trimmedName.length < 2 || trimmedName.length > 100) {
      showError('Buyer name must be between 2 and 100 characters.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await onSave({
        id: buyer?.id,
        name: trimmedName,
        phoneNumber: phoneNumber.trim() || null,
        email: email.trim() || null,
        address: address.trim() || null,
        notes: notes.trim() || null,
      });
      if (res) {
        onClose();
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-md rounded-3xl border border-cream-300 bg-white p-6 shadow-2xl space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-cream-200 pb-3">
          <div>
            <h2 className="text-base font-bold text-stone-900">
              {isEditing ? `Edit Buyer: ${buyer?.name}` : 'Add New Buyer'}
            </h2>
            <p className="text-xs text-stone-500">
              Record customer or wholesale buyer details.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-stone-400 hover:bg-cream-100 hover:text-stone-700 cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="block text-xs font-semibold text-stone-700">Buyer / Business Name *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Surat Bullion & Gems Traders"
              className="mt-1 w-full rounded-xl border border-cream-300 bg-cream-50/50 px-3.5 py-2 text-xs text-stone-900 focus:border-amber-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-600/20"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-stone-700">Phone Number</label>
              <input
                type="text"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="+91 98251 44520"
                className="mt-1 w-full rounded-xl border border-cream-300 bg-cream-50/50 px-3.5 py-2 text-xs text-stone-900 focus:border-amber-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-600/20"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="buyer@example.com"
                className="mt-1 w-full rounded-xl border border-cream-300 bg-cream-50/50 px-3.5 py-2 text-xs text-stone-900 focus:border-amber-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-600/20"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700">Address / City</label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="e.g. Ring Road, Surat, Gujarat"
              className="mt-1 w-full rounded-xl border border-cream-300 bg-cream-50/50 px-3.5 py-2 text-xs text-stone-900 focus:border-amber-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-600/20"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700">Notes / Remarks</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Preferred delivery terms, credit limits, or notes..."
              className="mt-1 w-full rounded-xl border border-cream-300 bg-cream-50/50 px-3.5 py-2 text-xs text-stone-900 focus:border-amber-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-600/20"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-cream-200">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-cream-300 px-4 py-2 text-xs font-semibold text-stone-700 hover:bg-cream-100 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-xl bg-amber-600 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-amber-500 disabled:opacity-50 cursor-pointer"
            >
              {submitting ? 'Saving...' : isEditing ? 'Save Changes' : 'Add Buyer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
