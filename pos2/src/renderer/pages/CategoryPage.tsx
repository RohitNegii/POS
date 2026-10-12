import React, { useEffect, useState } from 'react';
import type { AuthSessionPayload, CategoryDto } from '../../shared/types/ipc';
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
    createCategory,
    updateCategory,
    deleteCategory,
    clearError,
  } = useCategories();

  useEffect(() => {
    if (error) {
      showError(error);
      clearError();
    }
  }, [error, showError, clearError]);

  const [categoryToDelete, setCategoryToDelete] = useState<CategoryDto | null>(null);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [activeModalCategory, setActiveModalCategory] = useState<CategoryDto | null>(null);

  const handleOpenCreateModal = () => {
    setActiveModalCategory(null);
    setIsCategoryModalOpen(true);
  };

  const handleOpenEditModal = (cat: CategoryDto) => {
    setActiveModalCategory(cat);
    setIsCategoryModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!categoryToDelete) return;
    const target = categoryToDelete;
    setCategoryToDelete(null);
    const ok = await deleteCategory(target.id);
    if (ok) {
      showSuccess(`Category "${target.name}" removed.`);
    }
  };

  const handleSaveCategory = async (data: { id?: string; name: string; description?: string }) => {
    if (data.id) {
      const res = await updateCategory({
        id: data.id,
        name: data.name,
        description: data.description,
      });
      if (res) {
        showSuccess(`Category "${res.name}" updated.`);
        setActiveModalCategory(res);
      }
      return res;
    } else {
      const res = await createCategory({
        name: data.name,
        description: data.description,
      });
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
              Product Categories
            </h1>
            <span className="rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold px-2.5 py-0.5">
              {session.companyName}
            </span>
          </div>
          <p className="mt-1 text-xs text-stone-500">
            Define categories and product attribute schemas for your company.
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpenCreateModal}
          className="inline-flex items-center gap-2 rounded-xl bg-amber-600 hover:bg-amber-500 px-4 py-2.5 text-xs font-bold text-white shadow-sm shadow-amber-600/20 transition cursor-pointer"
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
          Total Categories: <span className="font-bold text-stone-800">{categories.length}</span>
        </div>
      </div>

      {/* Category List Cards */}
      {loading ? (
        <div className="flex justify-center p-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-amber-600 border-t-transparent" />
        </div>
      ) : categories.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-cream-300 bg-white/50 p-12 text-center">
          <p className="text-sm font-semibold text-stone-700">No categories found</p>
          <p className="mt-1 text-xs text-stone-400">
            {searchQuery ? 'Try adjusting your search criteria.' : 'Create your first product category to get started.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {categories.map((cat) => (
            <div
              key={cat.id}
              className="rounded-2xl border border-cream-300 bg-white p-5 shadow-xs hover:shadow-md transition flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-bold text-stone-900">{cat.name}</h3>
                  <span className="rounded-full bg-cream-100 border border-cream-200 px-2 py-0.5 text-[10px] font-semibold text-stone-600">
                    {cat.fieldsCount ?? 0} attrs
                  </span>
                </div>
                <p className="mt-2 text-xs text-stone-500 line-clamp-2">
                  {cat.description || 'No description provided.'}
                </p>
              </div>

              <div className="mt-5 flex items-center justify-between border-t border-cream-200 pt-3">
                <span className="text-[10px] text-stone-400">
                  Updated {new Date(cat.updatedAt).toLocaleDateString()}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleOpenEditModal(cat)}
                    className="rounded-lg bg-cream-100 hover:bg-cream-200 px-2.5 py-1 text-xs font-semibold text-stone-700 transition cursor-pointer"
                  >
                    Edit / Attributes
                  </button>
                  <button
                    type="button"
                    onClick={() => setCategoryToDelete(cat)}
                    className="rounded-lg p-1 text-stone-400 hover:bg-rose-50 hover:text-rose-600 transition cursor-pointer"
                    title="Delete Category"
                  >
                    ✕
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Category Form Modal */}
      <CategoryFormModal
        isOpen={isCategoryModalOpen}
        category={activeModalCategory}
        onClose={() => setIsCategoryModalOpen(false)}
        onSaveCategory={handleSaveCategory}
      />

      {/* Delete Confirmation Modal */}
      {categoryToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl border border-cream-300 bg-white p-6 shadow-xl space-y-4">
            <h3 className="text-sm font-bold text-stone-900">Confirm Deletion</h3>
            <p className="text-xs text-stone-600">
              Are you sure you want to delete category <strong>"{categoryToDelete.name}"</strong>? All associated attributes will also be removed.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCategoryToDelete(null)}
                className="rounded-xl border border-cream-300 px-3.5 py-1.5 text-xs font-semibold text-stone-700 hover:bg-cream-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="rounded-xl bg-rose-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-rose-500 cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
