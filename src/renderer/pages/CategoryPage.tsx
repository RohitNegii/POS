import React, { useEffect, useState } from 'react';
import type {
  AuthSessionPayload,
  CategoryDto,
} from '../../shared/types/ipc';
import { CategoryFormModal } from '../components/CategoryFormModal';
import { useCategories } from '../hooks/useCategories';
import { useToast } from '../context/ToastContext';

interface CategoryPageProps {
  session: AuthSessionPayload;
}

export const CategoryPage: React.FC<CategoryPageProps> = ({ session }) => {
  const { showError, showSuccess } = useToast();
  const {
    categories,
    loading,
    error,
    searchQuery,
    setSearchQuery,
    refreshCategories,
    createCategory,
    updateCategory,
    deleteCategory,
    clearError,
  } = useCategories();

  // Surface any category errors via toast instead of inline banner
  useEffect(() => {
    if (error) {
      showError(error);
      clearError();
    }
  }, [error, showError, clearError]);

  // Category Delete Confirmation State
  const [categoryToDelete, setCategoryToDelete] = useState<CategoryDto | null>(null);

  // All-in-one Category Modal State (handles category info + dynamic fields together)
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [activeModalCategory, setActiveModalCategory] = useState<CategoryDto | null>(null);

  const handleConfirmDeleteCategory = async () => {
    if (!categoryToDelete) return;
    const target = categoryToDelete;
    setCategoryToDelete(null);
    try {
      const res = await deleteCategory(target.id);
      showSuccess(`Category "${res.name}" has been permanently deleted.`);
    } catch {
      // Handled by error useEffect
    }
  };

  // Open Create Category Modal (all fields in one form)
  const handleOpenCreateModal = () => {
    setActiveModalCategory(null);
    setIsCategoryModalOpen(true);
  };

  // Open Edit Category Modal (category info + all dynamic fields in one form)
  const handleOpenEditModal = (cat: CategoryDto) => {
    setActiveModalCategory(cat);
    setIsCategoryModalOpen(true);
  };

  const handleCloseCategoryModal = () => {
    setIsCategoryModalOpen(false);
    setActiveModalCategory(null);
    void refreshCategories();
  };

  // Bridge for saving category info
  const handleSaveCategory = async (data: {
    id?: string;
    name: string;
  }): Promise<CategoryDto | null> => {
    if (data.id) {
      const res = await updateCategory({
        id: data.id,
        name: data.name,
      });
      setActiveModalCategory(res);
      showSuccess(`Category "${res.name}" updated successfully.`);
      return res;
    } else {
      const res = await createCategory({
        name: data.name,
      });
      showSuccess(`Category "${res.name}" created successfully.`);
      return res;
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 select-text">
      {/* Top Header Card */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-cream-300 bg-white p-6 shadow-sm">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold text-stone-900">Categories</h1>
          </div>
          <p className="mt-1 text-xs text-stone-500">
            Manage product categories and custom attributes.
          </p>
        </div>

        <button
          id="btn-add-category"
          type="button"
          onClick={handleOpenCreateModal}
          className="inline-flex items-center gap-2 rounded-xl bg-amber-600 hover:bg-amber-500 px-4 py-2.5 text-xs font-bold text-white shadow-sm shadow-amber-600/20 transition"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          + Create Category
        </button>
      </div>


      {/* Filter and Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-cream-300 bg-white p-4 shadow-xs">
        <div className="relative w-full max-w-md">
          <input
            id="category-search-input"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search categories by name..."
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
          Total Categories:{' '}
          <span className="font-bold text-stone-800">{categories.length}</span>
        </div>
      </div>

      {/* Categories Table / List */}
      <div className="overflow-hidden rounded-2xl border border-cream-300 bg-white shadow-sm">
        {loading && categories.length === 0 ? (
          <div className="flex h-48 items-center justify-center text-xs text-stone-500">
            <div className="flex items-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-amber-600 border-t-transparent" />
              Loading categories...
            </div>
          </div>
        ) : categories.length === 0 ? (
          /* Empty State */
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cream-100 text-stone-500 border border-cream-300">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                />
              </svg>
            </div>
            <h3 className="mt-4 text-sm font-bold text-stone-800">
              {searchQuery ? 'No matching categories' : 'No categories found'}
            </h3>
            <p className="mt-1 text-xs text-stone-500 max-w-sm">
              {searchQuery
                ? `No categories matched "${searchQuery}".`
                : 'No product categories yet. Create your first category to get started.'}
            </p>
            {!searchQuery && (
              <button
                type="button"
                onClick={handleOpenCreateModal}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-amber-600 hover:bg-amber-500 px-4 py-2 text-xs font-bold text-white shadow-sm hover:shadow transition"
              >
                + Create Category
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-cream-200 bg-cream-50/75 uppercase tracking-wider text-stone-600 font-bold">
                <tr>
                  <th className="px-6 py-3.5">Category Name</th>
                  <th className="px-6 py-3.5 text-center">Attributes</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-200/80">
                {categories.map((cat) => (
                  <tr
                    key={cat.id}
                    className="transition hover:bg-cream-50/60"
                  >
                    <td className="px-6 py-4 font-bold text-stone-900">
                      {cat.name}
                    </td>
                    <td className="px-6 py-4 text-center whitespace-nowrap">
                      <span className="inline-flex items-center rounded-full bg-amber-50 border border-amber-200/80 px-2.5 py-0.5 text-xs font-mono font-semibold text-amber-800">
                        {cat.fieldCount ?? 0} {cat.fieldCount === 1 ? 'Attribute' : 'Attributes'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          id={`btn-edit-category-${cat.id}`}
                          onClick={() => handleOpenEditModal(cat)}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-cream-100 hover:bg-amber-50 border border-cream-300 hover:border-amber-300 px-3.5 py-1.5 text-xs font-semibold text-stone-700 hover:text-amber-800 transition"
                        >
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                          Edit Category & Attributes
                        </button>

                        <button
                          type="button"
                          id={`btn-delete-category-${cat.id}`}
                          onClick={() => setCategoryToDelete(cat)}
                          title={`Delete ${cat.name}`}
                          className="inline-flex items-center justify-center rounded-xl bg-cream-100 hover:bg-rose-50 border border-cream-300 hover:border-rose-300 p-1.5 text-stone-600 hover:text-rose-600 transition"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
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

      {/* Unified All-in-One Category & Dynamic Fields Modal */}
      {isCategoryModalOpen && (
        <CategoryFormModal
          isOpen={isCategoryModalOpen}
          category={activeModalCategory}
          session={session}
          onClose={handleCloseCategoryModal}
          onSaveCategory={handleSaveCategory}
          onSuccess={async () => {
            await refreshCategories();
          }}
        />
      )}

      {/* Category Delete Confirmation Modal */}
      {categoryToDelete && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-stone-900/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-sm rounded-2xl border border-cream-300 bg-white p-6 shadow-2xl">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 border border-rose-200 mb-3.5">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            </div>
            <h3 className="text-sm font-bold text-stone-900">
              Confirm Category Deletion
            </h3>
            <p className="mt-2 text-xs text-stone-600 leading-relaxed">
              Are you sure you want to delete category{' '}
              <span className="font-semibold text-stone-900">{categoryToDelete.name}</span>?
              <br /><br />
              If this category has active products, deletion will be blocked to protect your inventory. If it has no active products, it will be permanently deleted.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setCategoryToDelete(null)}
                className="rounded-xl border border-cream-300 bg-white px-4 py-2 text-xs font-semibold text-stone-700 hover:bg-cream-100 shadow-xs transition"
              >
                Cancel
              </button>
              <button
                type="button"
                id="btn-confirm-delete-category"
                onClick={handleConfirmDeleteCategory}
                className="rounded-xl bg-rose-600 hover:bg-rose-500 px-4 py-2 text-xs font-bold text-white shadow-sm transition"
              >
                Delete Category
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
