import React, { useState } from 'react';
import type { AuthSessionPayload, ProductDto } from '../../shared/types/ipc';
import { BarcodeGraphic } from './BarcodeGraphic';
import { generateActualPurchasePriceCode } from '../../shared/utils/purchaseCode';

interface ProductDetailModalProps {
  product: ProductDto | null;
  session: AuthSessionPayload;
  isOpen: boolean;
  onClose: () => void;
  onEdit: (product: ProductDto) => void;
  onDelete?: (productId: string) => void;
  onPrintBarcode: (productId: string) => void;
}

export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({
  product,
  session: _session,
  isOpen,
  onClose,
  onEdit,
  onDelete,
  onPrintBarcode,
}) => {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  if (!isOpen || !product) return null;

  const formatDate = (isoStr: string) => {
    try {
      return new Date(isoStr).toLocaleString();
    } catch {
      return isoStr;
    }
  };

  const handlePrint = () => {
    onPrintBarcode(product.id);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 p-4 backdrop-blur-sm select-text">
      <div className="flex h-[90vh] max-h-[820px] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-cream-300 bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-cream-200 px-6 py-4 bg-cream-50/70">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-base font-bold text-stone-900">
                Product Details
              </h2>
              <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200">
                Active
              </span>
            </div>
            <p className="mt-0.5 text-xs text-stone-500">
              Category: <span className="font-semibold text-stone-700">{product.categoryName}</span>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              id="btn-print-barcode"
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 border border-amber-300 px-3 py-1.5 text-xs font-semibold text-amber-800 transition hover:bg-amber-100"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              Print Barcode
            </button>

            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-stone-400 hover:bg-cream-100 hover:text-stone-700 transition"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Barcode Showcase Card */}
          <div className="flex flex-col items-center justify-center rounded-2xl border border-cream-200 bg-cream-50/60 p-6 text-center">
            <h3 className="text-sm font-bold text-stone-900">{product.name}</h3>
            <p className="text-xs text-stone-500 mt-0.5">
              Category: <span className="font-semibold text-stone-700">{product.categoryName}</span>
            </p>

            <div className="mt-4 print-barcode-area">
              <BarcodeGraphic
                barcode={product.barcode}
                width={2}
                height={60}
                fontSize={14}
              />
            </div>

            <div className="mt-2 flex items-center gap-2">
              <span className="text-[11px] font-mono text-stone-500">Barcode:</span>
              <span className="font-mono text-sm font-bold text-amber-900 bg-white border border-cream-300 px-2.5 py-0.5 rounded shadow-xs">
                {product.barcode}
              </span>
            </div>
          </div>

          {/* Overview Info */}
          <div className="grid grid-cols-2 gap-4 rounded-xl border border-cream-200 bg-cream-50/40 p-4 text-xs">
            <div>
              <span className="text-stone-500 font-medium">Category:</span>
              <div className="font-semibold text-stone-800 mt-0.5">{product.categoryName}</div>
            </div>
            <div>
              <span className="text-stone-500 font-medium">Stock Quantity:</span>
              <div className="font-semibold font-mono text-emerald-700 mt-0.5">{product.stockQuantity}</div>
            </div>
            <div>
              <span className="text-stone-500 font-medium">Status:</span>
              <div className="font-semibold text-emerald-700 mt-0.5">Active</div>
            </div>
            <div>
              <span className="text-stone-500 font-medium">Created At:</span>
              <div className="font-mono text-stone-600 mt-0.5">{formatDate(product.createdAt)}</div>
            </div>
            <div>
              <span className="text-stone-500 font-medium">Last Updated:</span>
              <div className="font-mono text-stone-600 mt-0.5">{formatDate(product.updatedAt)}</div>
            </div>
          </div>

          {/* Gold / Silver Calculated Pricing Card */}
          {product.calculatedJewelleryPrice && (
            <div className="rounded-xl border border-amber-300/80 bg-amber-50/50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded bg-amber-200/60 text-amber-900 font-bold text-[10px]">
                    {product.calculatedJewelleryPrice.metalType === 'GOLD' ? 'Au' : 'Ag'}
                  </span>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-amber-900">
                    Live {product.calculatedJewelleryPrice.metalType} Jewellery Price
                  </h4>
                </div>
                <span className="rounded bg-amber-200/50 px-2 py-0.5 text-[10px] font-semibold text-amber-900 font-mono">
                  Daily Market Rate: ₹{product.calculatedJewelleryPrice.ratePerGram.toLocaleString()}/g
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-xs font-mono">
                <div className="rounded-lg bg-white p-2.5 border border-amber-200 shadow-xs">
                  <span className="text-[10px] text-stone-500 block uppercase font-sans font-semibold">Purity</span>
                  <span className="font-bold text-stone-800">
                    {product.calculatedJewelleryPrice.purity} ({product.calculatedJewelleryPrice.purityFactor})
                  </span>
                </div>
                <div className="rounded-lg bg-white p-2.5 border border-amber-200 shadow-xs">
                  <span className="text-[10px] text-stone-500 block uppercase font-sans font-semibold">Weight</span>
                  <span className="font-bold text-stone-800">
                    {product.calculatedJewelleryPrice.weightGrams}g
                  </span>
                </div>
                <div className="rounded-lg bg-white p-2.5 border border-amber-200 shadow-xs">
                  <span className="text-[10px] text-stone-500 block uppercase font-sans font-semibold">Metal Value</span>
                  <span className="font-bold text-amber-800">
                    ₹{product.calculatedJewelleryPrice.metalValue.toLocaleString()}
                  </span>
                </div>
                <div className="rounded-lg bg-white p-2.5 border border-amber-200 shadow-xs">
                  <span className="text-[10px] text-stone-500 block uppercase font-sans font-semibold">Making Charges</span>
                  <span className="font-bold text-stone-800">
                    ₹{product.calculatedJewelleryPrice.totalMakingCharges.toLocaleString()}
                  </span>
                  <span className="text-[9px] text-stone-500 block font-normal">
                    (₹{product.calculatedJewelleryPrice.makingChargePerGram}/g)
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-lg bg-amber-100/70 border border-amber-300 px-4 py-3">
                <div>
                  <span className="text-xs font-bold text-amber-950">CURRENT CALCULATED PRICE</span>
                  <p className="text-[10px] text-amber-800">
                    Automatically computed from today's market rate. Read-only.
                  </p>
                </div>
                <div className="font-mono text-xl font-black text-amber-900">
                  ₹{product.calculatedJewelleryPrice.finalPrice.toLocaleString()}
                </div>
              </div>
            </div>
          )}

          {/* Pricing Error Alert */}
          {product.pricingError && (
            <div className="rounded-xl border border-rose-300 bg-rose-50 p-3.5 text-xs text-rose-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span>⚠</span>
                <span>{product.pricingError}</span>
              </div>
              <span className="text-[11px] font-semibold text-rose-700">Rate Missing</span>
            </div>
          )}

          {/* Purchase Pricing Details Card */}
          {(product.purchasePrice !== null && product.purchasePrice !== undefined) ||
          (product.actualPurchasePrice !== null && product.actualPurchasePrice !== undefined) ||
          product.fieldValues?.some((fv) => fv.categoryField?.fieldKey === 'purchasePrice' && fv.valueNumber !== null) ? (() => {
            const pVal = product.purchasePrice ??
              product.fieldValues?.find((fv) => fv.categoryField?.fieldKey === 'purchasePrice')?.valueNumber;
            const cVal = product.additionalChargesPercentage ??
              product.fieldValues?.find((fv) => fv.categoryField?.fieldKey === 'additionalChargesPercentage')?.valueNumber;
            const aVal = product.actualPurchasePrice ??
              product.fieldValues?.find((fv) => fv.categoryField?.fieldKey === 'actualPurchasePrice')?.valueNumber;
            const codeVal = product.actualPurchasePriceCode ??
              product.fieldValues?.find((fv) => fv.categoryField?.fieldKey === 'actualPurchasePriceCode')?.valueText ??
              generateActualPurchasePriceCode(aVal);

            return (
              <div className="rounded-xl border border-cream-200 bg-cream-50/60 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded bg-amber-100 text-amber-900 font-bold text-xs">
                      ₹
                    </span>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-stone-700">
                      Purchase Pricing Breakdown
                    </h4>
                  </div>
                  <span className="rounded bg-amber-100/70 border border-amber-300 px-2 py-0.5 text-[10px] font-semibold text-amber-900 font-mono">
                    Stored in ProductFieldValue
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs font-mono">
                  <div className="rounded-lg bg-white p-3 border border-cream-200 shadow-xs">
                    <span className="text-[10px] text-stone-500 block uppercase font-sans font-semibold">Purchase Price</span>
                    <span className="font-bold text-stone-900 text-sm">
                      ₹{pVal !== null && pVal !== undefined ? Number(pVal).toLocaleString() : '—'}
                    </span>
                    <span className="text-[9px] text-stone-500 block mt-0.5">Base purchase cost</span>
                  </div>

                  <div className="rounded-lg bg-white p-3 border border-cream-200 shadow-xs">
                    <span className="text-[10px] text-stone-500 block uppercase font-sans font-semibold">Additional Charges</span>
                    <span className="font-bold text-stone-900 text-sm">
                      {cVal !== null && cVal !== undefined ? `${cVal}%` : '0%'}
                    </span>
                    <span className="text-[9px] text-stone-500 block mt-0.5">
                      {pVal !== null && pVal !== undefined && cVal
                        ? `+₹${((Number(pVal) * Number(cVal)) / 100).toFixed(2)} cost`
                        : 'No extra charges'}
                    </span>
                  </div>

                  <div className="rounded-lg bg-amber-50/70 p-3 border border-amber-300 shadow-xs">
                    <span className="text-[10px] text-amber-800 block uppercase font-sans font-semibold">Actual Purchase Price</span>
                    <span className="font-bold text-amber-950 text-sm">
                      ₹{aVal !== null && aVal !== undefined
                        ? Number(aVal).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                        : '—'}
                    </span>
                    <span className="text-[9px] text-amber-700 block mt-0.5">Calculated total cost</span>
                  </div>

                  <div className="rounded-lg bg-amber-50/70 p-3 border border-amber-300 shadow-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-amber-800 block uppercase font-sans font-semibold">Price Code</span>
                      <span className="text-[9px] text-amber-700 font-mono font-bold">COMPLISENT</span>
                    </div>
                    <span className="font-bold text-amber-950 text-sm tracking-widest block">
                      {codeVal ?? '—'}
                    </span>
                    <span className="text-[9px] text-stone-500 block mt-0.5 font-sans">Secret barcode tag code</span>
                  </div>
                </div>
              </div>
            );
          })() : null}

          {/* Dynamic Attributes */}
          {(() => {
            const displayFieldValues = (product.fieldValues || []).filter(
              (fv) => !['purchasePrice', 'additionalChargesPercentage', 'actualPurchasePrice', 'actualPurchasePriceCode'].includes(fv.categoryField?.fieldKey || '')
            );

            return (
              <div className="rounded-xl border border-cream-200 bg-cream-50/40 p-4 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-stone-600">
                  Dynamic Category Attributes
                </h4>

                {displayFieldValues.length === 0 ? (
                  <p className="text-xs text-stone-400 italic">No additional category attributes configured for this product.</p>
                ) : (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {displayFieldValues.map((fv) => {
                      let displayVal: string | React.ReactNode = '—';
                      if (fv.categoryField?.fieldType === 'boolean') {
                        displayVal = fv.valueBoolean ? (
                          <span className="text-emerald-700 font-semibold">Yes</span>
                        ) : (
                          <span className="text-stone-400">No</span>
                        );
                      } else if (fv.categoryField?.fieldType === 'number') {
                        displayVal = fv.valueNumber !== null && fv.valueNumber !== undefined ? (
                          <span className="font-mono font-semibold text-stone-900">{fv.valueNumber}</span>
                        ) : '—';
                      } else {
                        displayVal = fv.valueText || '—';
                      }

                      return (
                        <div key={fv.id} className="rounded-lg border border-cream-200 bg-white p-2.5 shadow-xs">
                          <div className="text-[11px]">
                            <span className="font-medium text-stone-600">{fv.categoryField?.name || 'Attribute'}</span>
                          </div>
                          <div className="mt-1 text-xs text-stone-900 font-medium">
                            {displayVal}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-cream-200 px-6 py-4 bg-cream-50/70">
          <div>
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition"
            >
              Delete Product
            </button>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-cream-300 bg-white px-4 py-2 text-xs font-semibold text-stone-700 hover:bg-cream-100 transition shadow-xs"
            >
              Close
            </button>
            <button
              type="button"
              onClick={() => {
                onEdit(product);
                onClose();
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-amber-500 transition"
            >
              Edit Product
            </button>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Sub-modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-stone-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl border border-cream-300 bg-white p-6 shadow-2xl">
            <h3 className="text-sm font-bold text-stone-900">
              Confirm Product Removal
            </h3>
            <p className="mt-2 text-xs text-stone-600 leading-relaxed">
              Are you sure you want to remove <span className="font-semibold text-stone-900">{product.name}</span> from the active catalog?
              <br /><br />
              This product will no longer appear in your active catalog. Past sales and order history will remain preserved.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="rounded-lg border border-cream-300 bg-white px-3.5 py-1.5 text-xs font-medium text-stone-700 hover:bg-cream-100 shadow-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onDelete?.(product.id);
                  setShowDeleteConfirm(false);
                  onClose();
                }}
                className="rounded-lg bg-rose-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-rose-500"
              >
                Delete Product
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
