import React, { useEffect, useState } from 'react';
import type {
  CategoryDto,
  CategoryFieldType,
} from '../../shared/types/ipc';
import { useCategoryFields } from '../hooks/useCategoryFields';
import { useToast } from '../context/ToastContext';

interface CategoryFormModalProps {
  isOpen: boolean;
  category: CategoryDto | null;
  onClose: () => void;
  onSaveCategory: (data: { id?: string; name: string; description?: string }) => Promise<CategoryDto | null>;
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
  { id: 'custom', label: 'Custom Attribute', name: '', fieldKey: '', fieldType: 'text', required: false },
  { id: 'weight', label: 'Weight (Number)', name: 'Weight', fieldKey: 'weight', fieldType: 'number', required: true },
  { id: 'purity', label: 'Purity (Dropdown: 24K, 22K, 18K...)', name: 'Purity', fieldKey: 'purity', fieldType: 'select', required: true, options: ['24K (999)', '22K (916)', '18K (750)', '14K (585)', '925 Silver', 'Fine Silver'] },
  { id: 'makingCharges', label: 'Making Charges per Gram (Number)', name: 'Making Charges per Gram', fieldKey: 'makingChargesPerGram', fieldType: 'number', required: false },
  { id: 'ratePerMeter', label: 'Rate per Meter (Number)', name: 'Rate per Meter', fieldKey: 'ratePerMeter', fieldType: 'number', required: true },
  { id: 'sellingPrice', label: 'Selling Price (Number)', name: 'Selling Price', fieldKey: 'sellingPrice', fieldType: 'number', required: true },
  { id: 'colour', label: 'Colour (Dropdown: Gold, Silver...)', name: 'Colour', fieldKey: 'colour', fieldType: 'select', required: false, options: ['Gold', 'Silver', 'Rose Gold', 'Black', 'Antique Gold'] },
  { id: 'size', label: 'Size (Dropdown: Small, Medium, Large...)', name: 'Size', fieldKey: 'size', fieldType: 'select', required: false, options: ['Small', 'Medium', 'Large', 'Standard', 'Free Size'] },
  { id: 'material', label: 'Material (Text)', name: 'Material', fieldKey: 'material', fieldType: 'text', required: false },
  { id: 'design', label: 'Design / Pattern (Text)', name: 'Design', fieldKey: 'design', fieldType: 'text', required: false },
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
  return clean || 'attribute';
}

export const CategoryFormModal: React.FC<CategoryFormModalProps> = ({
  isOpen,
  category,
  onClose,
  onSaveCategory,
}) => {
  const isEditing = Boolean(category);
  const { showError, showSuccess } = useToast();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [savingCategory, setSavingCategory] = useState(false);

  // Field Hook
  const {
    fields,
    loading: fieldsLoading,
    createField,
    updateField,
    deleteField,
    moveField,
  } = useCategoryFields(category?.id ?? null);

  // New field sub-form state
  const [isAddingField, setIsAddingField] = useState(false);
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldKey, setNewFieldKey] = useState('');
  const [newFieldType, setNewFieldType] = useState<CategoryFieldType>('text');
  const [newFieldRequired, setNewFieldRequired] = useState(false);
  const [newFieldOptionsStr, setNewFieldOptionsStr] = useState('');

  // Editing existing field state
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [editFieldName, setEditFieldName] = useState('');
  const [editFieldRequired, setEditFieldRequired] = useState(false);
  const [editFieldOptionsStr, setEditFieldOptionsStr] = useState('');

  useEffect(() => {
    if (category) {
      setName(category.name);
      setDescription(category.description || '');
    } else {
      setName('');
      setDescription('');
    }
    setIsAddingField(false);
    setEditingFieldId(null);
  }, [category, isOpen]);

  if (!isOpen) return null;

  const handlePresetSelect = (presetId: string) => {
    const preset = COMMON_ATTRIBUTE_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    if (preset.id === 'custom') {
      setNewFieldName('');
      setNewFieldKey('');
      setNewFieldType('text');
      setNewFieldRequired(false);
      setNewFieldOptionsStr('');
    } else {
      setNewFieldName(preset.name);
      setNewFieldKey(preset.fieldKey);
      setNewFieldType(preset.fieldType);
      setNewFieldRequired(preset.required);
      setNewFieldOptionsStr(preset.options ? preset.options.join(', ') : '');
    }
  };

  const handleSaveCategoryBasic = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      showError('Category name is required.');
      return;
    }

    setSavingCategory(true);
    try {
      const res = await onSaveCategory({
        id: category?.id,
        name: trimmed,
        description: description.trim() || undefined,
      });
      if (res && !category) {
        showSuccess(`Category "${res.name}" created.`);
        onClose();
      }
    } finally {
      setSavingCategory(false);
    }
  };

  const handleCreateFieldSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!category) {
      showError('Please save the category before adding attributes.');
      return;
    }

    const trimmedName = newFieldName.trim();
    const trimmedKey = newFieldKey.trim() || toCamelCaseKey(trimmedName);

    if (!trimmedName) {
      showError('Attribute name is required.');
      return;
    }

    let parsedOptions: string[] | undefined;
    if (newFieldType === 'select') {
      parsedOptions = newFieldOptionsStr
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (parsedOptions.length === 0) {
        showError('Select attribute must have at least one option.');
        return;
      }
    }

    const res = await createField({
      categoryId: category.id,
      name: trimmedName,
      fieldKey: trimmedKey,
      fieldType: newFieldType,
      required: newFieldRequired,
      options: parsedOptions,
    });

    if (res) {
      showSuccess(`Attribute "${res.name}" added.`);
      setIsAddingField(false);
      setNewFieldName('');
      setNewFieldKey('');
      setNewFieldType('text');
      setNewFieldRequired(false);
      setNewFieldOptionsStr('');
    }
  };

  const handleStartEditField = (f: typeof fields[0]) => {
    setEditingFieldId(f.id);
    setEditFieldName(f.name);
    setEditFieldRequired(f.required);
    setEditFieldOptionsStr(f.options ? f.options.join(', ') : '');
  };

  const handleSaveEditedField = async (fieldId: string) => {
    const trimmedName = editFieldName.trim();
    if (!trimmedName) {
      showError('Attribute name is required.');
      return;
    }

    const target = fields.find((f) => f.id === fieldId);
    let parsedOptions: string[] | undefined;
    if (target?.fieldType === 'select') {
      parsedOptions = editFieldOptionsStr
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (parsedOptions.length === 0) {
        showError('Select attribute must have at least one option.');
        return;
      }
    }

    const res = await updateField({
      id: fieldId,
      name: trimmedName,
      required: editFieldRequired,
      options: parsedOptions,
    });

    if (res) {
      showSuccess(`Attribute "${res.name}" updated.`);
      setEditingFieldId(null);
    }
  };

  const handleDeleteField = async (fieldId: string, fieldName: string) => {
    const ok = await deleteField(fieldId);
    if (ok) {
      showSuccess(`Attribute "${fieldName}" deleted.`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-2xl rounded-3xl border border-cream-300 bg-white p-6 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-cream-200 pb-4">
          <div>
            <h2 className="text-lg font-bold text-stone-900">
              {isEditing ? `Edit Category: ${category?.name}` : 'Create New Category'}
            </h2>
            <p className="text-xs text-stone-500">
              Configure category details and custom dynamic attributes.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-stone-400 hover:bg-cream-100 hover:text-stone-700 cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Basic Information Form */}
        <form onSubmit={handleSaveCategoryBasic} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-stone-700">Category Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Gold / Silver Jewellery"
              className="mt-1 w-full rounded-xl border border-cream-300 bg-cream-50/50 px-3.5 py-2 text-xs text-stone-900 focus:border-amber-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-600/20"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700">Description (Optional)</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief details about what items belong to this category..."
              className="mt-1 w-full rounded-xl border border-cream-300 bg-cream-50/50 px-3.5 py-2 text-xs text-stone-900 focus:border-amber-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-600/20"
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="submit"
              disabled={savingCategory}
              className="rounded-xl bg-amber-600 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-amber-500 disabled:opacity-50 cursor-pointer"
            >
              {savingCategory ? 'Saving...' : isEditing ? 'Update Category Info' : 'Save & Continue'}
            </button>
          </div>
        </form>

        {/* Dynamic Attributes Section (Visible when editing an existing category) */}
        {isEditing && (
          <div className="border-t border-cream-200 pt-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-stone-900">Custom Dynamic Attributes</h3>
                <p className="text-[11px] text-stone-500">
                  Attributes defined here dynamically apply to all products under this category.
                </p>
              </div>
              {!isAddingField && (
                <button
                  type="button"
                  onClick={() => setIsAddingField(true)}
                  className="rounded-xl bg-stone-900 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-stone-800 cursor-pointer"
                >
                  + Add Attribute
                </button>
              )}
            </div>

            {/* Sub-form: Add New Attribute */}
            {isAddingField && (
              <form onSubmit={handleCreateFieldSubmit} className="rounded-2xl border border-amber-300 bg-amber-50/40 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-950">Add Dynamic Attribute</span>
                  <button
                    type="button"
                    onClick={() => setIsAddingField(false)}
                    className="text-xs text-stone-400 hover:text-stone-700 cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-stone-700">Quick Attribute Preset</label>
                  <select
                    onChange={(e) => handlePresetSelect(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-cream-300 bg-white px-3 py-1.5 text-xs text-stone-800 focus:outline-none"
                  >
                    {COMMON_ATTRIBUTE_PRESETS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-stone-700">Attribute Name</label>
                    <input
                      type="text"
                      required
                      value={newFieldName}
                      onChange={(e) => {
                        setNewFieldName(e.target.value);
                        if (!newFieldKey) setNewFieldKey(toCamelCaseKey(e.target.value));
                      }}
                      placeholder="e.g. Making Charges"
                      className="mt-1 w-full rounded-xl border border-cream-300 bg-white px-3 py-1.5 text-xs text-stone-800"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-stone-700">Data Type</label>
                    <select
                      value={newFieldType}
                      onChange={(e) => setNewFieldType(e.target.value as CategoryFieldType)}
                      className="mt-1 w-full rounded-xl border border-cream-300 bg-white px-3 py-1.5 text-xs text-stone-800"
                    >
                      <option value="text">Text</option>
                      <option value="number">Number</option>
                      <option value="select">Dropdown / Select</option>
                      <option value="boolean">Yes / No (Boolean)</option>
                    </select>
                  </div>
                </div>

                {newFieldType === 'select' && (
                  <div>
                    <label className="block text-[11px] font-semibold text-stone-700">
                      Options (comma-separated)
                    </label>
                    <input
                      type="text"
                      required
                      value={newFieldOptionsStr}
                      onChange={(e) => setNewFieldOptionsStr(e.target.value)}
                      placeholder="24K, 22K, 18K"
                      className="mt-1 w-full rounded-xl border border-cream-300 bg-white px-3 py-1.5 text-xs text-stone-800"
                    />
                  </div>
                )}

                <div className="flex items-center justify-between pt-1">
                  <label className="flex items-center gap-2 text-xs text-stone-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newFieldRequired}
                      onChange={(e) => setNewFieldRequired(e.target.checked)}
                      className="rounded text-amber-600"
                    />
                    Required field
                  </label>

                  <button
                    type="submit"
                    className="rounded-xl bg-amber-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-amber-500 cursor-pointer"
                  >
                    Save Attribute
                  </button>
                </div>
              </form>
            )}

            {/* List of Fields */}
            {fieldsLoading ? (
              <div className="py-4 text-center text-xs text-stone-400">Loading attributes...</div>
            ) : fields.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-cream-300 p-6 text-center text-xs text-stone-500">
                No custom attributes configured for this category yet.
              </div>
            ) : (
              <div className="space-y-2">
                {fields.map((f, idx) => (
                  <div
                    key={f.id}
                    className="flex items-center justify-between rounded-xl border border-cream-300 bg-cream-50/40 p-3 hover:bg-white transition"
                  >
                    {editingFieldId === f.id ? (
                      <div className="flex-1 space-y-2 pr-3">
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="text"
                            value={editFieldName}
                            onChange={(e) => setEditFieldName(e.target.value)}
                            className="rounded-lg border border-cream-300 px-2 py-1 text-xs"
                          />
                          <label className="flex items-center gap-2 text-xs text-stone-600">
                            <input
                              type="checkbox"
                              checked={editFieldRequired}
                              onChange={(e) => setEditFieldRequired(e.target.checked)}
                            />
                            Required
                          </label>
                        </div>
                        {f.fieldType === 'select' && (
                          <input
                            type="text"
                            value={editFieldOptionsStr}
                            onChange={(e) => setEditFieldOptionsStr(e.target.value)}
                            className="w-full rounded-lg border border-cream-300 px-2 py-1 text-xs"
                            placeholder="Options (comma-separated)"
                          />
                        )}
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => handleSaveEditedField(f.id)}
                            className="text-[11px] font-bold text-amber-600 hover:text-amber-700"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingFieldId(null)}
                            className="text-[11px] text-stone-400 hover:text-stone-600"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-stone-800">{f.name}</span>
                          <span className="rounded bg-cream-200 px-1.5 py-0.5 text-[10px] font-mono text-stone-600">
                            {f.fieldType}
                          </span>
                          {f.required && (
                            <span className="rounded bg-rose-100 text-rose-700 px-1.5 py-0.5 text-[10px] font-semibold">
                              Required
                            </span>
                          )}
                        </div>
                        {f.options && f.options.length > 0 && (
                          <div className="mt-1 text-[11px] text-stone-500">
                            Options: {f.options.join(', ')}
                          </div>
                        )}
                      </div>
                    )}

                    {editingFieldId !== f.id && (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => moveField(f.id, 'up')}
                          className="p-1 text-stone-400 hover:text-stone-700 disabled:opacity-20 cursor-pointer"
                          title="Move up"
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          disabled={idx === fields.length - 1}
                          onClick={() => moveField(f.id, 'down')}
                          className="p-1 text-stone-400 hover:text-stone-700 disabled:opacity-20 cursor-pointer"
                          title="Move down"
                        >
                          ▼
                        </button>
                        <button
                          type="button"
                          onClick={() => handleStartEditField(f)}
                          className="p-1 text-stone-400 hover:text-amber-600 cursor-pointer text-xs"
                          title="Edit"
                        >
                          ✎
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteField(f.id, f.name)}
                          className="p-1 text-stone-400 hover:text-rose-600 cursor-pointer text-xs"
                          title="Delete"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-cream-300 bg-white px-4 py-2 text-xs font-semibold text-stone-700 hover:bg-cream-100 cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
