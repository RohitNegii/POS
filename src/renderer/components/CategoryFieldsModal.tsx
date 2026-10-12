import React, { useEffect, useState } from 'react';
import type {
  AuthSessionPayload,
  CategoryDto,
  CategoryFieldDto,
  CategoryFieldType,
} from '../../shared/types/ipc';
import { useCategoryFields } from '../hooks/useCategoryFields';
import { useToast } from '../context/ToastContext';

interface CategoryFieldsModalProps {
  category: CategoryDto;
  session: AuthSessionPayload;
  isOpen: boolean;
  onClose: () => void;
}

// Convert display label to camelCase fieldKey recommendation
function toCamelCaseKey(str: string): string {
  return str
    .replace(/(?:^\w|[A-Z]|\b\w)/g, (letter, index) =>
      index === 0 ? letter.toLowerCase() : letter.toUpperCase()
    )
    .replace(/[^a-zA-Z0-9_]/g, '');
}

export const CategoryFieldsModal: React.FC<CategoryFieldsModalProps> = ({
  category,
  session: _session,
  isOpen,
  onClose,
}) => {
  const {
    fields,
    loading,
    saving,
    error,
    createField,
    updateField,
    deleteField,
    moveField,
    clearError,
  } = useCategoryFields(isOpen ? category.id : null);
  const { showError, showSuccess } = useToast();

  const INTERNAL_PRICING_KEYS = [
    'purchasePrice',
    'purchaseRatePerGram',
    'purchaseMakingChargesPerGram',
    'additionalChargesPercentage',
    'actualPurchasePrice',
    'actualPurchasePriceCode',
    'sellingPrice',
    'marginPercentage',
    'margin',
  ];

  const visibleFields = fields.filter((f) => !INTERNAL_PRICING_KEYS.includes(f.fieldKey));

  // Surface category fields errors via toast
  useEffect(() => {
    if (error) {
      showError(error);
      clearError();
    }
  }, [error, showError, clearError]);

  // Sub-modal states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingField, setEditingField] = useState<CategoryFieldDto | null>(null);

  // Form inputs
  const [formName, setFormName] = useState('');
  const [formKey, setFormKey] = useState('');
  const [formKeyAuto, setFormKeyAuto] = useState(true);
  const [formType, setFormType] = useState<CategoryFieldType>('text');
  const [formRequired, setFormRequired] = useState(false);
  const [formDisplayOrder, setFormDisplayOrder] = useState<number>(1);
  const [formOptions, setFormOptions] = useState<string[]>(['']);

  // Delete confirmation state
  const [deletingFieldId, setDeletingFieldId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setIsFormOpen(false);
      setEditingField(null);
      setDeletingFieldId(null);
      clearError();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleOpenAddForm = () => {
    setEditingField(null);
    setFormName('');
    setFormKey('');
    setFormKeyAuto(true);
    setFormType('text');
    setFormRequired(false);
    setFormDisplayOrder(fields.length + 1);
    setFormOptions(['']);
    clearError();
    setIsFormOpen(true);
  };

  const handleOpenEditForm = (field: CategoryFieldDto) => {
    setEditingField(field);
    setFormName(field.name);
    setFormKey(field.fieldKey);
    setFormKeyAuto(false);
    setFormType(field.fieldType);
    setFormRequired(field.required);
    setFormDisplayOrder(field.displayOrder);
    setFormOptions(field.options && field.options.length > 0 ? [...field.options] : ['']);
    clearError();
    setIsFormOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setEditingField(null);
    clearError();
  };

  const handleNameChange = (nameVal: string) => {
    setFormName(nameVal);
    if (formKeyAuto && !editingField) {
      setFormKey(toCamelCaseKey(nameVal));
    }
  };

  const handleAddOption = () => {
    setFormOptions([...formOptions, '']);
  };

  const handleRemoveOption = (index: number) => {
    const updated = formOptions.filter((_, i) => i !== index);
    setFormOptions(updated.length > 0 ? updated : ['']);
  };

  const handleOptionChange = (index: number, val: string) => {
    const updated = [...formOptions];
    updated[index] = val;
    setFormOptions(updated);
  };

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedName = formName.trim();
    if (!trimmedName) {
      showError('Field name is required.');
      return;
    }

    if (trimmedName.length > 100) {
      showError('Field name cannot exceed 100 characters.');
      return;
    }

    if (!editingField) {
      const trimmedKey = formKey.trim();
      if (!trimmedKey) {
        showError('Field key is required.');
        return;
      }
      if (trimmedKey.length > 50) {
        showError('Field key cannot exceed 50 characters.');
        return;
      }
      if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(trimmedKey)) {
        showError(
          'Field key must start with a letter and contain only alphanumeric characters and underscores (no spaces).'
        );
        return;
      }
    }

    let sanitizedOptions: string[] | undefined = undefined;
    if (formType === 'select') {
      sanitizedOptions = formOptions
        .map((opt) => opt.trim())
        .filter((opt) => opt.length > 0);

      if (sanitizedOptions.length === 0) {
        showError('At least one option is required for "select" field type.');
        return;
      }
    }

    if (editingField) {
      const success = await updateField({
        id: editingField.id,
        name: trimmedName,
        required: formRequired,
        displayOrder: formDisplayOrder,
        options: sanitizedOptions,
      });
      if (success) {
        showSuccess(`Field "${trimmedName}" updated successfully.`);
        handleCloseForm();
      }
    } else {
      const success = await createField({
        name: trimmedName,
        fieldKey: formKey.trim(),
        fieldType: formType,
        required: formRequired,
        displayOrder: formDisplayOrder,
        options: sanitizedOptions,
      });
      if (success) {
        showSuccess(`Field "${trimmedName}" added successfully.`);
        handleCloseForm();
      }
    }
  };

  const handleConfirmDelete = async (fieldId: string) => {
    const success = await deleteField(fieldId);
    if (success) {
      showSuccess('Field deleted successfully.');
      setDeletingFieldId(null);
    }
  };

  const getTypeBadgeClass = (type: CategoryFieldType) => {
    switch (type) {
      case 'text':
        return 'bg-amber-50 text-amber-800 border-amber-200';
      case 'number':
        return 'bg-sky-50 text-sky-700 border-sky-200';
      case 'select':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'boolean':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      default:
        return 'bg-cream-100 text-stone-700 border-cream-300';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 p-4 backdrop-blur-sm select-text">
      <div className="flex h-[90vh] max-h-[820px] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-cream-300 bg-white shadow-2xl">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-cream-200 px-6 py-4 bg-cream-50/70">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-base font-bold text-stone-900">
                Manage Dynamic Fields
              </h2>
              <span className="rounded-full border border-amber-300/80 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                {category.name}
              </span>
            </div>
            <p className="mt-1 text-xs text-stone-500">
              Configure product attributes for <span className="font-semibold text-stone-700">{category.name}</span>. The product entry form will dynamically render these fields.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              id="btn-add-field"
              type="button"
              onClick={handleOpenAddForm}
              className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-amber-500"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Field
            </button>

            <button
              id="btn-close-fields-modal"
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-stone-400 hover:bg-cream-100 hover:text-stone-700 transition"
              title="Close modal"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Modal Body / Field List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {loading && visibleFields.length === 0 ? (
            <div className="flex h-48 items-center justify-center text-xs text-stone-500">
              <div className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-amber-600 border-t-transparent" />
                Loading fields for {category.name}...
              </div>
            </div>
          ) : visibleFields.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-cream-300 p-12 text-center bg-cream-50/50">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white border border-cream-200 text-stone-500 shadow-xs">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="mt-4 text-sm font-bold text-stone-900">
                No fields configured yet
              </h3>
              <p className="mt-1 text-xs text-stone-500 max-w-md">
                Add attributes needed for products in <span className="text-stone-700 font-medium">{category.name}</span> (e.g. Design, Colour, Size, Material, Weight, etc.).
              </p>
              <button
                type="button"
                onClick={handleOpenAddForm}
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-amber-500"
              >
                + Add First Field
              </button>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-cream-200 bg-white shadow-xs">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-cream-200 bg-cream-50/80 uppercase tracking-wider text-stone-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold text-center w-14">Order</th>
                    <th className="px-4 py-3 font-semibold">Field Name & Key</th>
                    <th className="px-4 py-3 font-semibold">Type</th>
                    <th className="px-4 py-3 font-semibold">Requirement</th>
                    <th className="px-4 py-3 font-semibold">Configuration / Options</th>
                    <th className="px-4 py-3 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cream-100">
                  {visibleFields.map((field, idx) => (
                    <tr
                      key={field.id}
                      className="transition hover:bg-cream-50/50 group"
                    >
                      {/* Order and Move controls */}
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1">
                          <span className="font-mono text-xs text-stone-500 font-semibold w-5 text-right">
                            {field.displayOrder}
                          </span>
                          <div className="flex flex-col">
                            <button
                              type="button"
                              onClick={() => moveField(field.id, 'up')}
                              disabled={saving || idx === 0}
                              title="Move Up"
                              className="rounded p-0.5 text-stone-400 hover:text-stone-700 hover:bg-cream-100 disabled:opacity-20 disabled:hover:bg-transparent"
                            >
                              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              onClick={() => moveField(field.id, 'down')}
                              disabled={saving || idx === fields.length - 1}
                              title="Move Down"
                              className="rounded p-0.5 text-stone-400 hover:text-stone-700 hover:bg-cream-100 disabled:opacity-20 disabled:hover:bg-transparent"
                            >
                              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      </td>

                      {/* Name & Key */}
                      <td className="px-4 py-3">
                        <div className="font-semibold text-stone-900">{field.name}</div>
                        <div className="mt-0.5 flex items-center gap-1">
                          <span className="text-[11px] font-mono text-stone-500 bg-cream-50 border border-cream-200 px-1.5 py-0.2 rounded">
                            {field.fieldKey}
                          </span>
                        </div>
                      </td>

                      {/* Type Badge */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`inline-block rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider border ${getTypeBadgeClass(
                            field.fieldType
                          )}`}
                        >
                          {field.fieldType}
                        </span>
                      </td>

                      {/* Required / Optional */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        {field.required ? (
                          <span className="rounded bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700 border border-rose-200">
                            Required *
                          </span>
                        ) : (
                          <span className="rounded bg-cream-100 px-2 py-0.5 text-[11px] font-medium text-stone-600 border border-cream-200">
                            Optional
                          </span>
                        )}
                      </td>

                      {/* Configuration / Options */}
                      <td className="px-4 py-3 max-w-xs">
                        {field.fieldType === 'select' && field.options && field.options.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {field.options.map((opt, oIdx) => (
                              <span
                                key={oIdx}
                                className="rounded bg-purple-50 text-purple-700 border border-purple-200 px-1.5 py-0.5 text-[10px]"
                              >
                                {opt}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-stone-400 italic text-[11px]">
                            {field.fieldType === 'boolean'
                              ? 'True / False Toggle'
                              : field.fieldType === 'number'
                              ? 'Numeric Input'
                              : 'Free Text Input'}
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 text-right whitespace-nowrap space-x-1.5">
                        <button
                          type="button"
                          onClick={() => handleOpenEditForm(field)}
                          className="inline-flex items-center gap-1 rounded border border-cream-300 bg-white px-2.5 py-1 text-xs font-medium text-stone-700 transition hover:bg-cream-100 shadow-xs"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingFieldId(field.id)}
                          className="inline-flex items-center gap-1 rounded bg-rose-50 border border-rose-200 px-2.5 py-1 text-xs font-medium text-rose-700 transition hover:bg-rose-100"
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

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-cream-200 px-6 py-3.5 bg-cream-50/70">
          <div className="text-xs text-stone-500">
            Total Fields:{' '}
            <span className="font-semibold text-stone-800">{fields.length}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-cream-300 bg-white px-4 py-2 text-xs font-semibold text-stone-700 hover:bg-cream-100 transition shadow-xs"
          >
            Done
          </button>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deletingFieldId && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-stone-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl border border-cream-300 bg-white p-6 shadow-2xl">
            <h3 className="text-sm font-bold text-stone-900">
              Confirm Field Deletion
            </h3>
            <p className="mt-2 text-xs text-stone-600 leading-relaxed">
              Are you sure you want to delete this field? This will remove it from the future product schema of <span className="font-semibold text-stone-900">{category.name}</span>.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeletingFieldId(null)}
                disabled={saving}
                className="rounded-lg border border-cream-300 bg-white px-3.5 py-1.5 text-xs font-medium text-stone-700 hover:bg-cream-100 shadow-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleConfirmDelete(deletingFieldId)}
                disabled={saving}
                className="rounded-lg bg-rose-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-rose-500 disabled:opacity-50"
              >
                {saving ? 'Deleting...' : 'Delete Field'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Field Sub-Modal */}
      {isFormOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-stone-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-cream-300 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-cream-200 px-6 py-4 bg-cream-50/70">
              <div>
                <h3 className="text-sm font-bold text-stone-900">
                  {editingField ? 'Edit Dynamic Field' : 'Add Dynamic Field'}
                </h3>
                <p className="mt-0.5 text-xs text-stone-500">
                  Category: <span className="font-semibold text-stone-700">{category.name}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={handleCloseForm}
                disabled={saving}
                className="rounded-lg p-1 text-stone-400 hover:bg-cream-100 hover:text-stone-700"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmitForm} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              {/* Field Name */}
              <div>
                <label className="block text-xs font-medium text-stone-700">
                  Field Display Name <span className="text-rose-500">*</span>
                </label>
                <input
                  id="field-name-input"
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="e.g. Making Charges per Gram, Colour, Weight"
                  disabled={saving}
                  className="mt-1.5 w-full rounded-lg border border-cream-300 bg-white px-3.5 py-2 text-xs text-stone-900 placeholder-stone-400 focus:border-amber-600 focus:outline-none focus:ring-1 focus:ring-amber-600 disabled:opacity-50"
                />
              </div>

              {/* Field Key */}
              <div>
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-medium text-stone-700">
                    Field Key <span className="text-rose-500">*</span>
                  </label>
                  {editingField ? (
                    <span className="text-[10px] text-amber-700 font-mono flex items-center gap-1 font-medium">
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                      Read-only after creation
                    </span>
                  ) : (
                    <span className="text-[10px] text-stone-400">
                      camelCase / snake_case, no spaces
                    </span>
                  )}
                </div>
                <input
                  id="field-key-input"
                  type="text"
                  required
                  value={formKey}
                  onChange={(e) => {
                    setFormKey(e.target.value);
                    setFormKeyAuto(false);
                  }}
                  placeholder="e.g. makingChargePerGram, colour, weight"
                  disabled={saving || Boolean(editingField)}
                  className={`mt-1.5 w-full rounded-lg border font-mono px-3.5 py-2 text-xs ${
                    editingField
                      ? 'border-cream-200 bg-cream-50 text-stone-500 cursor-not-allowed'
                      : 'border-cream-300 bg-white text-stone-900 placeholder-stone-400 focus:border-amber-600 focus:outline-none focus:ring-1 focus:ring-amber-600'
                  }`}
                />
              </div>

              {/* Field Type */}
              <div>
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-medium text-stone-700">
                    Field Type <span className="text-rose-500">*</span>
                  </label>
                  {editingField && (
                    <span className="text-[10px] text-amber-700 font-mono flex items-center gap-1 font-medium">
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                      Read-only after creation
                    </span>
                  )}
                </div>
                {editingField ? (
                  <div className="mt-1.5 flex items-center gap-2">
                    <span
                      className={`inline-block rounded px-3 py-1.5 text-xs font-semibold uppercase tracking-wider border ${getTypeBadgeClass(
                        formType
                      )}`}
                    >
                      {formType}
                    </span>
                    <span className="text-[11px] text-stone-500">
                      (Type locked to maintain product data integrity)
                    </span>
                  </div>
                ) : (
                  <div className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {(['text', 'number', 'select', 'boolean'] as const).map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setFormType(type)}
                        className={`rounded-lg border px-3 py-2 text-xs font-semibold capitalize transition ${
                          formType === type
                            ? 'border-amber-500 bg-amber-50 text-amber-800 ring-1 ring-amber-500/50'
                            : 'border-cream-200 bg-white text-stone-600 hover:border-cream-300 hover:bg-cream-50/50'
                        }`}
                      >
                        {type === 'select' ? 'Select (Dropdown)' : type}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Dynamic Select Options (only shown for select type) */}
              {formType === 'select' && (
                <div className="rounded-xl border border-cream-200 bg-cream-50/50 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="block text-xs font-semibold text-stone-800">
                        Dropdown Options <span className="text-rose-500">*</span>
                      </label>
                      <p className="text-[10px] text-stone-500">
                        Provide choices for this dropdown (e.g. Gold, Silver, Black, 22K, 24K).
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleAddOption}
                      className="inline-flex items-center gap-1 rounded border border-cream-300 bg-white px-2.5 py-1 text-xs font-medium text-stone-700 hover:bg-cream-100 shadow-xs"
                    >
                      + Add Option
                    </button>
                  </div>

                  <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                    {formOptions.map((opt, oIdx) => (
                      <div key={oIdx} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={opt}
                          onChange={(e) => handleOptionChange(oIdx, e.target.value)}
                          placeholder={`Option ${oIdx + 1} (e.g. Gold)`}
                          className="flex-1 rounded-lg border border-cream-300 bg-white px-3 py-1.5 text-xs text-stone-900 placeholder-stone-400 focus:border-amber-600 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveOption(oIdx)}
                          disabled={formOptions.length <= 1}
                          className="rounded p-1 text-stone-400 hover:text-rose-600 disabled:opacity-20"
                          title="Remove option"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Requirement & Display Order */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div className="flex items-center gap-3 rounded-lg border border-cream-200 bg-cream-50/50 p-3">
                  <input
                    id="field-required-checkbox"
                    type="checkbox"
                    checked={formRequired}
                    onChange={(e) => setFormRequired(e.target.checked)}
                    className="h-4 w-4 rounded border-cream-300 text-amber-600 focus:ring-amber-500"
                  />
                  <label htmlFor="field-required-checkbox" className="text-xs text-stone-700 select-none cursor-pointer">
                    <span className="font-semibold text-stone-800">Required Field</span>
                    <p className="text-[10px] text-stone-500">
                      Must be filled in product form
                    </p>
                  </label>
                </div>

                <div>
                  <label htmlFor="field-order-input" className="block text-xs font-medium text-stone-700">
                    Display Order Position
                  </label>
                  <input
                    id="field-order-input"
                    type="number"
                    min={1}
                    value={formDisplayOrder}
                    onChange={(e) => setFormDisplayOrder(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="mt-1.5 w-full rounded-lg border border-cream-300 bg-white px-3 py-2 text-xs text-stone-900 focus:border-amber-600 focus:outline-none focus:ring-1 focus:ring-amber-600"
                  />
                </div>
              </div>

              {/* Form Buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-cream-200">
                <button
                  type="button"
                  onClick={handleCloseForm}
                  disabled={saving}
                  className="rounded-lg border border-cream-300 bg-white px-4 py-2 text-xs font-semibold text-stone-700 hover:bg-cream-100 disabled:opacity-50 shadow-xs"
                >
                  Cancel
                </button>
                <button
                  id="btn-save-field"
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-amber-500 disabled:opacity-50"
                >
                  {saving
                    ? 'Saving...'
                    : editingField
                    ? 'Update Field'
                    : 'Save Field'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
