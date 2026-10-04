import React, { useEffect, useState } from 'react';
import type {
  AuthSessionPayload,
  CategoryDto,
  CategoryFieldType,
} from '../../shared/types/ipc';
import { useCategoryFields } from '../hooks/useCategoryFields';
import { useToast } from '../context/ToastContext';
import { ipcClient } from '../services/ipcClient';

interface CategoryFormModalProps {
  isOpen: boolean;
  category: CategoryDto | null; // null for Create Category, CategoryDto for Edit Category
  session: AuthSessionPayload;
  onClose: () => void;
  onSaveCategory: (data: { id?: string; name: string }) => Promise<CategoryDto | null>;
  onSuccess?: () => void;
}

interface DraftFieldItem {
  tempId: string;
  name: string;
  fieldKey: string;
  fieldType: CategoryFieldType;
  required: boolean;
  displayOrder: number;
  options?: string[];
}

export interface AttributePreset {
  id: string;
  label: string;
  name: string;
  fieldKey: string;
  fieldType: CategoryFieldType;
  required: boolean;
  options?: string[];
}

export const COMMON_ATTRIBUTE_PRESETS: AttributePreset[] = [
  { id: 'custom', label: 'Custom (Type your own attribute name below)', name: '', fieldKey: '', fieldType: 'text', required: false },
  { id: 'weight', label: 'Weight in Grams (Number)', name: 'Weight', fieldKey: 'weight', fieldType: 'number', required: true },
  { id: 'purity', label: 'Purity (Dropdown: 24K, 22K, 18K, 14K, Silver 925)', name: 'Purity', fieldKey: 'purity', fieldType: 'select', required: true, options: ['24K', '22K', '18K', '14K', 'Silver 925'] },
  { id: 'makingCharges', label: 'Making Charges per Gram (Number)', name: 'Making Charges per Gram', fieldKey: 'makingChargesPerGram', fieldType: 'number', required: false },
  { id: 'sellingPrice', label: 'Selling Price (Number)', name: 'Selling Price', fieldKey: 'sellingPrice', fieldType: 'number', required: true },
  { id: 'ratePerMeter', label: 'Rate per Meter (Number)', name: 'Rate per Meter', fieldKey: 'ratePerMeter', fieldType: 'number', required: true },
  { id: 'sellingPricePerMeter', label: 'Selling Price per Meter (Number)', name: 'Selling Price per Meter', fieldKey: 'sellingPricePerMeter', fieldType: 'number', required: true },
  { id: 'colour', label: 'Colour (Dropdown: Gold, Silver, Rose Gold, Black, White...)', name: 'Colour', fieldKey: 'colour', fieldType: 'select', required: false, options: ['Gold', 'Silver', 'Rose Gold', 'Black', 'White', 'Multi-colour'] },
  { id: 'size', label: 'Size (Dropdown: Free Size, Small, Medium, Large...)', name: 'Size', fieldKey: 'size', fieldType: 'select', required: false, options: ['Free Size', 'Small', 'Medium', 'Large', 'Extra Large'] },
  { id: 'material', label: 'Material (Text)', name: 'Material', fieldKey: 'material', fieldType: 'text', required: false },
  { id: 'design', label: 'Design / Pattern (Text)', name: 'Design', fieldKey: 'design', fieldType: 'text', required: false },
  { id: 'designWeight', label: 'Design Weight (Number)', name: 'Design Weight', fieldKey: 'designWeight', fieldType: 'number', required: false },
  { id: 'widthOrSize', label: 'Width / Dimensions (Text)', name: 'Width / Dimensions', fieldKey: 'widthOrSize', fieldType: 'text', required: false },
];

function toCamelCaseKey(str: string): string {
  const clean = str
    .replace(/(?:^\w|[A-Z]|\b\w)/g, (letter, index) =>
      index === 0 ? letter.toLowerCase() : letter.toUpperCase()
    )
    .replace(/[^a-zA-Z0-9_]/g, '');

  if (/^[0-9]/.test(clean)) {
    return `attr_${clean}`;
  }
  return clean;
}


export const CategoryFormModal: React.FC<CategoryFormModalProps> = ({
  isOpen,
  category,
  session: _session,
  onClose,
  onSaveCategory,
  onSuccess,
}) => {
  const isEditing = Boolean(category);

  const { showError, showSuccess } = useToast();

  // Category Basic Info State
  const [name, setName] = useState('');
  const [savingCategory, setSavingCategory] = useState(false);

  // Dynamic Fields for Existing Category (persisted via hook)
  const {
    fields: existingFields,
    loading: fieldsLoading,
    saving: fieldsSaving,
    error: fieldsHookError,
    createField,
    updateField,
    deleteField,
    moveField,
    clearError: clearFieldsHookError,
  } = useCategoryFields(category?.id ?? null);

  // Surface fieldsHookError via toast
  useEffect(() => {
    if (fieldsHookError) {
      showError(fieldsHookError);
      clearFieldsHookError();
    }
  }, [fieldsHookError, showError, clearFieldsHookError]);

  // Dynamic Fields for New Category (stored in draft state until "Create Category" is clicked)
  const [draftFields, setDraftFields] = useState<DraftFieldItem[]>([]);

  // Sub-editor state for Adding / Editing a field
  const [isFieldEditorOpen, setIsFieldEditorOpen] = useState(false);
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('custom');
  const [fieldName, setFieldName] = useState('');
  const [fieldKey, setFieldKey] = useState('');
  const [fieldKeyAuto, setFieldKeyAuto] = useState(true);
  const [fieldType, setFieldType] = useState<CategoryFieldType>('text');
  const [fieldRequired, setFieldRequired] = useState(false);
  const [fieldOptions, setFieldOptions] = useState<string[]>(['']);

  // Delete confirmation
  const [deletingFieldId, setDeletingFieldId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setName(category ? category.name : '');
      setDraftFields([]);
      setIsFieldEditorOpen(false);
      setEditingFieldId(null);
      setDeletingFieldId(null);
    }
  }, [isOpen, category]);

  if (!isOpen) return null;

  // Filter out internal purchase system fields from Category management
  const INTERNAL_PURCHASE_KEYS = [
    'purchasePrice',
    'additionalChargesPercentage',
    'actualPurchasePrice',
    'actualPurchasePriceCode',
  ];

  const filteredExistingFields = existingFields.filter(
    (f) => !INTERNAL_PURCHASE_KEYS.includes(f.fieldKey)
  );

  const activeFieldsList = isEditing
    ? filteredExistingFields.map((f) => ({
        id: f.id,
        name: f.name,
        fieldKey: f.fieldKey,
        fieldType: f.fieldType,
        required: f.required,
        displayOrder: f.displayOrder,
        options: f.options,
      }))
    : draftFields.map((f) => ({
        id: f.tempId,
        name: f.name,
        fieldKey: f.fieldKey,
        fieldType: f.fieldType,
        required: f.required,
        displayOrder: f.displayOrder,
        options: f.options ?? null,
      }));

  const handleOpenAddField = () => {
    setEditingFieldId(null);
    setSelectedPresetId('custom');
    setFieldName('');
    setFieldKey('');
    setFieldKeyAuto(true);
    setFieldType('text');
    setFieldRequired(false);
    setFieldOptions(['']);
    clearFieldsHookError();
    setIsFieldEditorOpen(true);
  };


  const handleOpenEditField = (field: {
    id: string;
    name: string;
    fieldKey: string;
    fieldType: CategoryFieldType;
    required: boolean;
    options: string[] | null;
  }) => {
    setEditingFieldId(field.id);
    const matchingPreset = COMMON_ATTRIBUTE_PRESETS.find((p) => p.fieldKey === field.fieldKey);
    setSelectedPresetId(matchingPreset ? matchingPreset.id : 'custom');
    setFieldName(field.name);
    setFieldKey(field.fieldKey);
    setFieldKeyAuto(false);
    setFieldType(field.fieldType);
    setFieldRequired(field.required);
    setFieldOptions(field.options && field.options.length > 0 ? [...field.options] : ['']);
    clearFieldsHookError();
    setIsFieldEditorOpen(true);
  };

  const handlePresetChange = (presetId: string) => {
    setSelectedPresetId(presetId);
    const preset = COMMON_ATTRIBUTE_PRESETS.find((p) => p.id === presetId);
    if (!preset || preset.id === 'custom') {
      setFieldName('');
      setFieldKey('');
      setFieldKeyAuto(true);
      setFieldType('text');
      setFieldRequired(false);
      setFieldOptions(['']);
      return;
    }

    setFieldName(preset.name);
    setFieldKey(preset.fieldKey);
    setFieldKeyAuto(false);
    setFieldType(preset.fieldType);
    setFieldRequired(preset.required);
    setFieldOptions(preset.options && preset.options.length > 0 ? [...preset.options] : ['']);
  };

  const handleFieldNameChange = (val: string) => {
    setFieldName(val);
    if (!editingFieldId && fieldKeyAuto) {
      setFieldKey(toCamelCaseKey(val));
    }
    const activePreset = COMMON_ATTRIBUTE_PRESETS.find((p) => p.id === selectedPresetId);
    if (activePreset && activePreset.id !== 'custom' && activePreset.name !== val) {
      setSelectedPresetId('custom');
    }
  };

  const handleOptionChange = (idx: number, val: string) => {
    const updated = [...fieldOptions];
    updated[idx] = val;
    setFieldOptions(updated);
  };

  const handleAddOption = () => {
    setFieldOptions([...fieldOptions, '']);
  };

  const handleRemoveOption = (idx: number) => {
    if (fieldOptions.length > 1) {
      setFieldOptions(fieldOptions.filter((_, i) => i !== idx));
    }
  };

  const handleSaveField = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedName = fieldName.trim();
    if (!trimmedName) {
      showError('Field name is required.');
      return;
    }

    const trimmedKey = fieldKey.trim();
    if (!editingFieldId && !trimmedKey) {
      showError('Field key is required.');
      return;
    }

    if (!editingFieldId && !/^[a-zA-Z][a-zA-Z0-9_]*$/.test(trimmedKey)) {
      showError(
        'Field key must start with a letter and contain only alphanumeric characters and underscores.'
      );
      return;
    }

    let cleanOptions: string[] | undefined = undefined;
    if (fieldType === 'select') {
      cleanOptions = fieldOptions.map((o) => o.trim()).filter(Boolean);
      if (cleanOptions.length === 0) {
        showError('At least one dropdown option is required for Select fields.');
        return;
      }
    }

    if (isEditing && category) {
      if (editingFieldId) {
        const existingField = existingFields.find((f) => f.id === editingFieldId);
        const success = await updateField({
          id: editingFieldId,
          name: trimmedName,
          required: fieldRequired,
          displayOrder: existingField?.displayOrder ?? 1,
          options: cleanOptions,
        });
        if (success) {
          showSuccess(`Attribute "${trimmedName}" updated.`);
          setIsFieldEditorOpen(false);
          setEditingFieldId(null);
        }
      } else {
        const success = await createField({
          name: trimmedName,
          fieldKey: trimmedKey,
          fieldType,
          required: fieldRequired,
          displayOrder: existingFields.length + 1,
          options: cleanOptions,
        });
        if (success) {
          showSuccess(`Attribute "${trimmedName}" added to category.`);
          setIsFieldEditorOpen(false);
          setEditingFieldId(null);
        }
      }
    } else {
      if (editingFieldId) {
        setDraftFields((prev) =>
          prev.map((f) =>
            f.tempId === editingFieldId
              ? {
                  ...f,
                  name: trimmedName,
                  required: fieldRequired,
                  options: cleanOptions,
                }
              : f
          )
        );
        showSuccess(`Attribute "${trimmedName}" updated.`);
      } else {
        if (draftFields.some((f) => f.fieldKey === trimmedKey)) {
          showError(`A field with key "${trimmedKey}" already exists in this category.`);
          return;
        }

        const newDraft: DraftFieldItem = {
          tempId: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: trimmedName,
          fieldKey: trimmedKey,
          fieldType,
          required: fieldRequired,
          displayOrder: draftFields.length + 1,
          options: cleanOptions,
        };
        setDraftFields((prev) => [...prev, newDraft]);
        showSuccess(`Attribute "${trimmedName}" added.`);
      }
      setIsFieldEditorOpen(false);
      setEditingFieldId(null);
    }
  };

  const handleMoveDraftField = (idx: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= draftFields.length) return;
    const updated = [...draftFields];
    const temp = updated[idx];
    updated[idx] = updated[targetIdx];
    updated[targetIdx] = temp;
    setDraftFields(
      updated.map((item, index) => ({
        ...item,
        displayOrder: index + 1,
      }))
    );
  };

  const handleDeleteFieldConfirmed = async (fieldId: string) => {
    if (isEditing) {
      const success = await deleteField(fieldId);
      if (success) {
        showSuccess('Attribute removed.');
        setDeletingFieldId(null);
      }
    } else {
      setDraftFields((prev) => prev.filter((f) => f.tempId !== fieldId));
      showSuccess('Attribute removed.');
      setDeletingFieldId(null);
    }
  };

  const handleUpdateCategoryDetails = async (): Promise<boolean> => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      showError('Category name is required.');
      return false;
    }
    if (trimmedName.length > 100) {
      showError('Category name cannot exceed 100 characters.');
      return false;
    }

    setSavingCategory(true);
    try {
      const saved = await onSaveCategory({
        id: category?.id,
        name: trimmedName,
      });
      if (saved) {
        showSuccess('Category details updated successfully.');
        if (onSuccess) {
          onSuccess();
        }
        return true;
      }
      return false;
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to update category.');
      return false;
    } finally {
      setSavingCategory(false);
    }
  };

  const handleCreateCategorySubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedName = name.trim();
    if (!trimmedName) {
      showError('Category name is required.');
      return;
    }
    if (trimmedName.length > 100) {
      showError('Category name cannot exceed 100 characters.');
      return;
    }

    setSavingCategory(true);
    try {
      const createdCategory = await onSaveCategory({
        name: trimmedName,
      });

      if (!createdCategory) {
        throw new Error('Failed to create category record.');
      }

      for (const df of draftFields) {
        const fieldRes = await ipcClient.createCategoryField({
          categoryId: createdCategory.id,
          name: df.name,
          fieldKey: df.fieldKey,
          fieldType: df.fieldType,
          required: df.required,
          displayOrder: df.displayOrder,
          options: df.options,
        });
        if (!fieldRes.success) {
          throw new Error(fieldRes.error || `Failed to create attribute "${df.name}".`);
        }
      }

      showSuccess(`Category "${trimmedName}" created successfully.`);
      if (onSuccess) {
        onSuccess();
      }
      onClose();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to create category.');
    } finally {
      setSavingCategory(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 p-4 backdrop-blur-sm select-text">
      <div className="flex h-[92vh] max-h-[880px] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-cream-300 bg-white shadow-2xl">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-cream-200 px-6 py-4 bg-cream-50/80">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-base font-bold text-stone-900">
                {isEditing ? `Edit Category: ${category?.name}` : 'Create New Category'}
              </h2>
            </div>
            <p className="mt-0.5 text-xs text-stone-500">
              Configure category details and define dynamic product attributes in this form.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-1.5 text-stone-400 hover:bg-cream-100 hover:text-stone-700 transition"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-cream-50/30">
          {/* Section 1: Category Information */}
          <div className="rounded-2xl border border-cream-200 bg-white p-5 space-y-4 shadow-xs">
            <div className="flex items-center justify-between border-b border-cream-200 pb-3">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-stone-700">
                  1. Category Information
                </h3>
                <p className="text-[11px] text-stone-500">
                  Enter category name.
                </p>
              </div>
              {isEditing && (
                <button
                  type="button"
                  onClick={handleUpdateCategoryDetails}
                  disabled={savingCategory}
                  className="rounded-xl bg-cream-100 hover:bg-cream-200 px-3 py-1.5 text-xs font-semibold text-stone-700 border border-cream-300 transition"
                >
                  {savingCategory ? 'Updating...' : 'Update Details'}
                </button>
              )}
            </div>

            <div>
              <label htmlFor="category-name-input" className="block text-xs font-semibold text-stone-700">
                Category Name <span className="text-rose-500">*</span>
              </label>
              <input
                id="category-name-input"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Gold Jewellery, Silver Ornaments, Home Décor"
                disabled={savingCategory}
                className="mt-1.5 w-full rounded-xl border border-cream-300 bg-cream-50/50 px-3.5 py-2 text-xs text-stone-900 placeholder-stone-400 focus:border-amber-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-600/20"
              />
            </div>
          </div>

          {/* Section 2: Dynamic Category Fields */}
          <div className="rounded-2xl border border-cream-200 bg-white p-5 space-y-4 shadow-xs">
            <div className="flex items-center justify-between border-b border-cream-200 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-stone-700">
                    2. Dynamic Product Fields
                  </h3>
                  <span className="rounded-full bg-amber-50 border border-amber-200/80 px-2.5 py-0.5 text-[11px] font-mono font-semibold text-amber-800">
                    {activeFieldsList.length} {activeFieldsList.length === 1 ? 'Field' : 'Fields'}
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] text-stone-500">
                  Defines which attributes products in this category will require (e.g. Weight, Purity, Size, Colour). Actual values are entered when creating products.
                </p>
              </div>

              {!isFieldEditorOpen && (
                <button
                  type="button"
                  onClick={handleOpenAddField}
                  disabled={fieldsSaving}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm shadow-amber-600/20 transition"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  + Add Field
                </button>
              )}
            </div>


            {/* Inline Sub-Editor to Add/Edit a Field */}
            {isFieldEditorOpen && (
              <div className="rounded-2xl border border-amber-300/80 bg-amber-50/40 p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-amber-200 pb-2.5">
                  <span className="text-xs font-bold text-amber-900">
                    {editingFieldId ? `Edit Attribute: ${fieldName}` : 'Add Attribute to Category'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsFieldEditorOpen(false)}
                    className="text-stone-500 hover:text-stone-800 text-xs font-medium"
                  >
                    Cancel
                  </button>
                </div>

                <form onSubmit={handleSaveField} className="space-y-4">
                  {/* Option 1: Quick-Select Attribute Dropdown */}
                  {!editingFieldId && (
                    <div className="rounded-xl border border-amber-200 bg-white/90 p-3.5 shadow-2xs">
                      <label htmlFor="attribute-preset-select" className="block text-xs font-bold text-stone-800">
                        Choose Attribute from Dropdown
                      </label>
                      <p className="text-[11px] text-stone-500 mt-0.5 mb-2">
                        Select a standard store attribute to auto-fill its settings with 1 click, or choose Custom.
                      </p>
                      <select
                        id="attribute-preset-select"
                        value={selectedPresetId}
                        onChange={(e) => handlePresetChange(e.target.value)}
                        className="w-full rounded-xl border border-cream-300 bg-cream-50/60 px-3.5 py-2 text-xs font-semibold text-stone-900 focus:border-amber-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-600/20"
                      >
                        {COMMON_ATTRIBUTE_PRESETS.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label htmlFor="field-name-input" className="block text-[11px] font-semibold text-stone-700">
                        Attribute Name <span className="text-rose-500">*</span>
                      </label>
                      <input
                        id="field-name-input"
                        type="text"
                        required
                        value={fieldName}
                        onChange={(e) => handleFieldNameChange(e.target.value)}
                        placeholder="e.g. Weight, Purity, Colour, Size"
                        className="mt-1 w-full rounded-xl border border-cream-300 bg-white px-3 py-2 text-xs text-stone-900 placeholder-stone-400 focus:border-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-600/20"
                      />
                    </div>

                    <div>
                      <label htmlFor="field-type-select" className="block text-[11px] font-semibold text-stone-700">
                        Input Type <span className="text-rose-500">*</span>
                      </label>
                      <select
                        id="field-type-select"
                        disabled={Boolean(editingFieldId)}
                        value={fieldType}
                        onChange={(e) => setFieldType(e.target.value as CategoryFieldType)}
                        className="mt-1 w-full rounded-xl border border-cream-300 bg-white px-3 py-2 text-xs text-stone-900 focus:border-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-600/20"
                      >
                        <option value="text">Text (e.g. Material, Dimensions)</option>
                        <option value="number">Number (e.g. Weight, Rate, Price)</option>
                        <option value="select">Dropdown (e.g. Purity, Colour, Size)</option>
                        <option value="boolean">Yes / No Option</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={fieldRequired}
                        onChange={(e) => setFieldRequired(e.target.checked)}
                        className="h-4 w-4 rounded border-cream-300 text-amber-600 focus:ring-amber-600"
                      />
                      <span className="text-xs text-stone-700 font-semibold">
                        Required attribute (staff must fill this when saving products)
                      </span>
                    </label>
                  </div>

                  {/* Dropdown Options List */}
                  {fieldType === 'select' && (
                    <div className="space-y-2 border-t border-amber-200/80 pt-3">
                      <div className="flex items-center justify-between">
                        <label className="block text-[11px] font-semibold text-stone-700">
                          Dropdown Choices <span className="text-rose-500">*</span>
                        </label>
                        <button
                          type="button"
                          onClick={handleAddOption}
                          className="text-[11px] text-amber-700 hover:text-amber-800 font-bold"
                        >
                          + Add Choice
                        </button>
                      </div>

                      <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                        {fieldOptions.map((opt, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <input
                              type="text"
                              required
                              value={opt}
                              onChange={(e) => handleOptionChange(idx, e.target.value)}
                              placeholder={`Option ${idx + 1} (e.g. 22K, Gold, Small)`}
                              className="w-full rounded-xl border border-cream-300 bg-white px-3 py-1.5 text-xs text-stone-900 focus:border-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-600/20"
                            />
                            {fieldOptions.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveOption(idx)}
                                className="text-rose-500 hover:text-rose-700 px-2 py-1 text-xs"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Collapsible Advanced Settings (Hides technical Short Code) */}
                  <details className="group pt-1 border-t border-amber-200/60">
                    <summary className="cursor-pointer text-[11px] font-semibold text-stone-500 hover:text-stone-800 select-none inline-flex items-center gap-1.5">
                      <span className="transition-transform group-open:rotate-90">▸</span>
                      <span>Advanced Settings (System Short Code)</span>
                    </summary>
                    <div className="mt-2.5 rounded-xl border border-cream-300 bg-white p-3 space-y-1">
                      <label htmlFor="field-key-input" className="block text-[11px] font-semibold text-stone-700">
                        Attribute Short Code
                      </label>
                      <input
                        id="field-key-input"
                        type="text"
                        required
                        disabled={Boolean(editingFieldId)}
                        value={fieldKey}
                        onChange={(e) => {
                          setFieldKey(e.target.value);
                          setFieldKeyAuto(false);
                        }}
                        placeholder="e.g. makingChargesPerGram, colour, weight"
                        className="w-full rounded-xl border border-cream-300 bg-cream-50/50 px-3 py-1.5 text-xs font-mono text-stone-900 disabled:bg-cream-100 disabled:opacity-70 focus:border-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-600/20"
                      />
                      <p className="text-[10px] text-stone-400">
                        Automatically generated from the attribute name. Used internally to link pricing formulas.
                      </p>
                    </div>
                  </details>

                  <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-amber-200">
                    <button
                      type="button"
                      onClick={() => setIsFieldEditorOpen(false)}
                      className="rounded-xl bg-white hover:bg-cream-100 border border-cream-300 px-3.5 py-1.5 text-xs text-stone-700 font-medium"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={fieldsSaving}
                      className="rounded-xl bg-amber-600 hover:bg-amber-500 px-4 py-1.5 text-xs font-bold text-white shadow-sm shadow-amber-600/20 disabled:opacity-50"
                    >
                      {fieldsSaving ? 'Saving Attribute...' : editingFieldId ? 'Save Changes' : 'Add to Category'}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* List of Configured Dynamic Fields */}
            {fieldsLoading ? (
              <div className="flex h-24 items-center justify-center text-xs text-stone-500">
                Loading fields...
              </div>
            ) : activeFieldsList.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-cream-300 p-8 text-center text-xs text-stone-500 space-y-1 bg-cream-50/40">
                <p className="font-semibold text-stone-700">No product attributes configured yet.</p>
                <p className="text-[11px]">
                  Click <strong>+ Add Field</strong> to define attributes such as Purity, Weight, Colour, or Size.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-cream-200 border border-cream-200 rounded-2xl overflow-hidden bg-white shadow-2xs">
                {activeFieldsList.map((field, idx) => (
                  <div
                    key={field.id}
                    className="flex items-center justify-between p-3.5 hover:bg-cream-50/60 transition text-xs"
                  >
                    <div className="flex items-center gap-3">
                      {/* Reorder Up/Down */}
                      <div className="flex flex-col gap-0.5 text-[10px]">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => {
                            if (isEditing) {
                              void moveField(field.id, 'up');
                            } else {
                              handleMoveDraftField(idx, 'up');
                            }
                          }}
                          className="text-stone-400 hover:text-stone-800 disabled:opacity-20 leading-none"
                          title="Move up"
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          disabled={idx === activeFieldsList.length - 1}
                          onClick={() => {
                            if (isEditing) {
                              void moveField(field.id, 'down');
                            } else {
                              handleMoveDraftField(idx, 'down');
                            }
                          }}
                          className="text-stone-400 hover:text-stone-800 disabled:opacity-20 leading-none"
                          title="Move down"
                        >
                          ▼
                        </button>
                      </div>

                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-stone-900">{field.name}</span>
                          <span className="rounded-full bg-cream-100 px-2 py-0.5 text-[10px] font-semibold text-stone-700 border border-cream-300">
                            {field.fieldType === 'text'
                              ? 'Text'
                              : field.fieldType === 'number'
                              ? 'Number'
                              : field.fieldType === 'select'
                              ? 'Dropdown'
                              : 'Yes / No'}
                          </span>
                          {field.required ? (
                            <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700 border border-rose-200">
                              Required
                            </span>
                          ) : (
                            <span className="rounded-full bg-cream-50 px-2 py-0.5 text-[10px] text-stone-500 border border-cream-200">
                              Optional
                            </span>
                          )}
                        </div>
                        {field.options && field.options.length > 0 && (
                          <div className="text-[11px] text-stone-600 mt-0.5">
                            Choices: [{field.options.slice(0, 4).join(', ')}{field.options.length > 4 ? ', ...' : ''}]
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Field Actions */}
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleOpenEditField(field)}
                        className="rounded-xl bg-cream-100 hover:bg-amber-50 border border-cream-300 hover:border-amber-300 px-3 py-1 text-[11px] font-semibold text-stone-700 hover:text-amber-800 transition"
                      >
                        Edit
                      </button>

                      {deletingFieldId === field.id ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleDeleteFieldConfirmed(field.id)}
                            className="rounded-xl bg-rose-600 px-2.5 py-1 text-[11px] font-bold text-white shadow-xs"
                          >
                            Confirm Delete
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingFieldId(null)}
                            className="text-stone-500 text-[11px] px-1"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setDeletingFieldId(field.id)}
                          className="rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 px-2.5 py-1 text-[11px] font-semibold text-rose-700 transition"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-cream-200 px-6 py-4 bg-cream-50/80">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-cream-300 bg-white px-4 py-2 text-xs font-semibold text-stone-700 hover:bg-cream-100 transition"
          >
            Cancel
          </button>

          {isEditing ? (
            <button
              id="btn-save-category"
              type="button"
              onClick={async () => {
                const ok = await handleUpdateCategoryDetails();
                if (ok) {
                  onClose();
                }
              }}
              disabled={savingCategory}
              className="rounded-xl bg-amber-600 hover:bg-amber-500 px-6 py-2 text-xs font-bold text-white shadow-sm shadow-amber-600/20 transition disabled:opacity-50"
            >
              {savingCategory ? 'Saving Changes...' : 'Save & Close'}
            </button>
          ) : (
            <button
              id="btn-save-category"
              type="button"
              onClick={handleCreateCategorySubmit}
              disabled={savingCategory}
              className="rounded-xl bg-amber-600 hover:bg-amber-500 px-6 py-2 text-xs font-bold text-white shadow-sm shadow-amber-600/20 transition disabled:opacity-50"
            >
              {savingCategory ? 'Creating Category...' : 'Create Category'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
