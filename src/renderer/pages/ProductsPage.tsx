import React, { useEffect, useState } from 'react';
import type { AuthSessionPayload, ProductDto } from '../../shared/types/ipc';
import { BarcodePrintModal } from '../components/BarcodePrintModal';
import { ProductDetailModal } from '../components/ProductDetailModal';
import { ProductFormModal } from '../components/ProductFormModal';
import { useCategories } from '../hooks/useCategories';
import { useProducts } from '../hooks/useProducts';
import { formatDateTime } from '../utils/formatters';
import { generateActualPurchasePriceCode } from '../../shared/utils/purchaseCode';
import { useToast } from '../context/ToastContext';

interface ProductsPageProps {
  session: AuthSessionPayload;
}

export const ProductsPage: React.FC<ProductsPageProps> = ({ session }) => {
  const { showError, showSuccess } = useToast();
  const { categories } = useCategories();
  const {
    products,
    loading,
    error,
    filter,
    setFilter,
    refreshProducts,
    upsertProductInList,
    deleteProduct,
    clearError,
  } = useProducts();

  // Surface product errors via toast instead of inline banner
  useEffect(() => {
    if (error) {
      showError(error);
      clearError();
    }
  }, [error, showError, clearError]);

  const [searchVal, setSearchVal] = useState<string>('');
  const [selectedCatFilter, setSelectedCatFilter] = useState<string>('');

  // Modal States
  const [isFormModalOpen, setIsFormModalOpen] = useState<boolean>(false);
  const [editingProduct, setEditingProduct] = useState<ProductDto | null>(null);
  const [viewingProduct, setViewingProduct] = useState<ProductDto | null>(null);
  const [printingProduct, setPrintingProduct] = useState<ProductDto | null>(null);
  const [productToDelete, setProductToDelete] = useState<ProductDto | null>(null);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFilter({
      ...filter,
      search: searchVal.trim() || undefined,
      categoryId: selectedCatFilter || undefined,
    });
  };

  const handleCategoryFilterChange = (catId: string) => {
    setSelectedCatFilter(catId);
    setFilter({
      ...filter,
      search: searchVal.trim() || undefined,
      categoryId: catId || undefined,
    });
  };

  const handleOpenAddModal = () => {
    setEditingProduct(null);
    clearError();
    setIsFormModalOpen(true);
  };

  const handleOpenEditModal = (prod: ProductDto) => {
    setEditingProduct(prod);
    clearError();
    setIsFormModalOpen(true);
  };

  const handlePrintBarcode = (prod: ProductDto) => {
    setPrintingProduct(prod);
  };

  const handleProductSaved = async (saved: ProductDto) => {
    upsertProductInList(saved);
    void refreshProducts();
    showSuccess(`Product "${saved.name}" saved successfully.`);
  };

  const handleConfirmDelete = async () => {
    if (!productToDelete) return;
    const target = productToDelete;
    setProductToDelete(null);
    if (viewingProduct?.id === target.id) {
      setViewingProduct(null);
    }
    const success = await deleteProduct(target.id);
    if (success) {
      showSuccess(`Product "${target.name}" removed from catalog.`);
    } else {
      showError(`Failed to delete product "${target.name}".`);
    }
  };

  return (
    <div className="space-y-6 select-text">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold tracking-tight text-stone-900">
              Products
            </h1>
          </div>
          <p className="mt-1 text-xs text-stone-500">
            Manage your product catalog, prices, and printable barcodes.
          </p>
        </div>

        <button
          id="btn-add-product"
          type="button"
          onClick={handleOpenAddModal}
          className="inline-flex items-center gap-2 rounded-xl bg-amber-600 hover:bg-amber-500 px-4 py-2.5 text-xs font-bold text-white shadow-sm shadow-amber-600/20 transition hover:shadow"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Product
        </button>
      </div>

      {/* Search & Filter Bar */}
      <div className="rounded-2xl border border-cream-300 bg-white p-4 shadow-xs">
        <form onSubmit={handleSearchSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <input
                id="product-search-input"
                type="text"
                value={searchVal}
                onChange={(e) => setSearchVal(e.target.value)}
                placeholder="Search by product name or barcode..."
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

            {/* Category Filter */}
            <div className="w-full sm:w-56">
              <select
                id="product-category-filter"
                value={selectedCatFilter}
                onChange={(e) => handleCategoryFilterChange(e.target.value)}
                className="w-full rounded-xl border border-cream-300 bg-cream-50/50 px-3 py-2 text-xs text-stone-900 focus:border-amber-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-600/20"
              >
                <option value="">All Categories ({categories.length})</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <button
              id="btn-search-products"
              type="submit"
              className="rounded-xl border border-cream-300 bg-cream-100 hover:bg-cream-200 px-3.5 py-2 text-xs font-semibold text-stone-700 transition"
            >
              Filter
            </button>
          </div>
        </form>
      </div>

      {/* Products Table */}
      <div className="overflow-hidden rounded-2xl border border-cream-300 bg-white shadow-sm">
        {loading && products.length === 0 ? (
          <div className="flex h-64 items-center justify-center text-xs text-stone-500">
            <div className="flex items-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-amber-600 border-t-transparent" />
              Loading products...
            </div>
          </div>
        ) : products.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cream-100 text-stone-500 border border-cream-300">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
            <h3 className="mt-4 text-sm font-bold text-stone-800">
              No products found
            </h3>
            <p className="mt-1 text-xs text-stone-500 max-w-sm">
              {searchVal || selectedCatFilter
                ? 'No products match your current search or category filter.'
                : 'No products registered yet. Click Add Product to add your first product.'}
            </p>
            {!searchVal && !selectedCatFilter && (
              <button
                type="button"
                onClick={handleOpenAddModal}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-amber-600 hover:bg-amber-500 px-4 py-2 text-xs font-bold text-white shadow-sm hover:shadow transition"
              >
                + Add First Product
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-cream-200 bg-cream-50/75 uppercase tracking-wider text-stone-600 font-bold">
                <tr>
                  <th className="px-6 py-3.5">Product Name</th>
                  <th className="px-6 py-3.5">Category</th>
                  <th className="px-6 py-3.5">Barcode</th>
                  <th className="px-6 py-3.5">Stock</th>
                  <th className="px-6 py-3.5">Price</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5">Created Date</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-200/80">
                {products.map((prod) => (
                  <tr
                    key={prod.id}
                    className="transition hover:bg-cream-50/60 group"
                  >
                    {/* Name */}
                    <td className="px-6 py-4">
                      <div className="font-bold text-stone-900">{prod.name}</div>
                    </td>

                    {/* Category */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="rounded-full bg-cream-100 px-2.5 py-1 text-xs font-semibold text-stone-700 border border-cream-300">
                        {prod.categoryName}
                      </span>
                    </td>

                    {/* Barcode */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="font-mono text-xs font-bold text-stone-800 bg-cream-50 border border-cream-300 px-2 py-1 rounded-lg">
                        {prod.barcode}
                      </span>
                    </td>

                    {/* Stock */}
                    <td className="px-6 py-4 whitespace-nowrap font-mono text-xs font-bold text-stone-800">
                      {prod.stockQuantity !== null && prod.stockQuantity !== undefined
                        ? prod.stockQuantity
                        : <span className="text-stone-400">0</span>}
                    </td>

                    {/* Price */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      {prod.calculatedJewelleryPrice ? (
                        <div>
                          <div className="font-mono text-xs font-bold text-amber-800">
                            ₹{prod.calculatedJewelleryPrice.finalPrice.toLocaleString()}
                          </div>
                          <span className="text-[10px] text-amber-600 font-semibold">
                            Live {prod.calculatedJewelleryPrice.metalType} Rate
                          </span>
                        </div>
                      ) : prod.pricingError ? (
                        <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700 border border-rose-200" title={prod.pricingError}>
                          Rate Missing
                        </span>
                      ) : (() => {
                        const priceFv = prod.fieldValues?.find(
                          (fv) =>
                            fv.categoryField?.fieldKey === 'sellingPrice' ||
                            fv.categoryField?.fieldKey === 'sellingPricePerMeter'
                        );
                        if (priceFv && priceFv.valueNumber !== null && priceFv.valueNumber !== undefined) {
                          return (
                            <span className="font-mono text-xs font-bold text-stone-900">
                              ₹{priceFv.valueNumber.toLocaleString()}
                              {priceFv.categoryField?.fieldKey === 'sellingPricePerMeter' ? '/m' : ''}
                            </span>
                          );
                        }
                        return <span className="text-stone-400">—</span>;
                      })()}
                      {prod.actualPurchasePrice !== null && prod.actualPurchasePrice !== undefined && (
                        <div
                          className="text-[10px] text-stone-500 font-mono mt-0.5 flex items-center gap-1.5"
                          title={`Purchase Price: ₹${prod.purchasePrice ?? '—'}, Charges: ${prod.additionalChargesPercentage ?? 0}%`}
                        >
                          <span>Cost: <span className="font-semibold text-stone-700">₹{Number(prod.actualPurchasePrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></span>
                          {(() => {
                            const code = prod.actualPurchasePriceCode || generateActualPurchasePriceCode(prod.actualPurchasePrice);
                            return code ? (
                              <span className="rounded bg-amber-100/90 px-1.5 py-0.2 text-[9px] font-mono font-bold text-amber-900 border border-amber-300/80" title="Purchase Price Code (COMPLISENT)">
                                {code}
                              </span>
                            ) : null;
                          })()}
                        </div>
                      )}
                    </td>

                    {/* Status */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
                        Active
                      </span>
                    </td>

                    {/* Created Date */}
                    <td className="px-6 py-4 whitespace-nowrap text-stone-500">
                      {formatDateTime(prod.createdAt)}
                    </td>

                    {/* Actions */}
                    <td className="px-6 py-4 text-right whitespace-nowrap space-x-1.5">
                      <button
                        type="button"
                        id={`btn-view-${prod.id}`}
                        onClick={() => setViewingProduct(prod)}
                        className="inline-flex items-center gap-1 rounded-xl bg-cream-100 hover:bg-cream-200 border border-cream-300 px-2.5 py-1 text-xs font-semibold text-stone-700 transition"
                      >
                        View
                      </button>

                      <button
                        type="button"
                        id={`btn-print-${prod.id}`}
                        onClick={() => handlePrintBarcode(prod)}
                        title="Print Barcode Slip"
                        className="inline-flex items-center gap-1 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2.5 py-1 text-xs font-semibold text-amber-800 transition"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                        </svg>
                        Print
                      </button>

                      <button
                        type="button"
                        id={`btn-edit-${prod.id}`}
                        onClick={() => handleOpenEditModal(prod)}
                        className="inline-flex items-center gap-1 rounded-xl bg-cream-100 hover:bg-cream-200 border border-cream-300 px-2.5 py-1 text-xs font-semibold text-stone-700 transition"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        id={`btn-delete-${prod.id}`}
                        onClick={() => setProductToDelete(prod)}
                        className="inline-flex items-center gap-1 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 px-2.5 py-1 text-xs font-semibold text-rose-700 transition"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Product Form Modal (Add / Edit) */}
      <ProductFormModal
        isOpen={isFormModalOpen}
        onClose={() => {
          setIsFormModalOpen(false);
          setEditingProduct(null);
        }}
        onSaved={handleProductSaved}
        editingProduct={editingProduct}
        session={session}
        categories={categories}
      />

      {/* Product Detail Modal (View / Print) */}
      <ProductDetailModal
        isOpen={Boolean(viewingProduct)}
        onClose={() => setViewingProduct(null)}
        product={viewingProduct}
        session={session}
        onEdit={(prod) => {
          setViewingProduct(null);
          handleOpenEditModal(prod);
        }}
        onDelete={(id) => {
          const prod = products.find((p) => p.id === id) || viewingProduct;
          if (prod) {
            setViewingProduct(null);
            setProductToDelete(prod);
          }
        }}
        onPrintBarcode={() => {
          if (viewingProduct) {
            handlePrintBarcode(viewingProduct);
          }
        }}
      />

      {/* Barcode Label Print Size & Layout Modal */}
      {printingProduct && (
        <BarcodePrintModal
          product={printingProduct}
          session={session}
          isOpen={Boolean(printingProduct)}
          onClose={() => setPrintingProduct(null)}
        />
      )}

      {/* Product Delete Confirmation Modal */}
      {productToDelete && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-stone-900/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-sm rounded-2xl border border-cream-300 bg-white p-6 shadow-2xl">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 border border-rose-200 mb-3.5">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </div>
            <h3 className="text-sm font-bold text-stone-900">
              Confirm Product Removal
            </h3>
            <p className="mt-2 text-xs text-stone-600 leading-relaxed">
              Are you sure you want to remove <span className="font-semibold text-stone-900">{productToDelete.name}</span> from the active catalog?
              <br /><br />
              This product will no longer appear in the catalog. Its historical data and barcode will be preserved for sales and order integrity.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setProductToDelete(null)}
                className="rounded-xl border border-cream-300 bg-white px-4 py-2 text-xs font-semibold text-stone-700 hover:bg-cream-100 shadow-xs transition"
              >
                Cancel
              </button>
              <button
                type="button"
                id="btn-confirm-delete-product"
                onClick={handleConfirmDelete}
                className="rounded-xl bg-rose-600 hover:bg-rose-500 px-4 py-2 text-xs font-bold text-white shadow-sm transition"
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
