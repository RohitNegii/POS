import React, { useEffect, useState } from 'react';
import type {
  AuthSessionPayload,
  CategoryDto,
  CategoryFieldDto,
  JewelleryPriceCalculationResult,
  ProductDto,
  ProductFieldValueInput,
} from '../../shared/types/ipc';
import { ipcClient } from '../services/ipcClient';
import { generateActualPurchasePriceCode } from '../../shared/utils/purchaseCode';
import { useToast } from '../context/ToastContext';

interface ProductFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: (saved: ProductDto) => void;
  editingProduct: ProductDto | null;
  session: AuthSessionPayload;
  categories: CategoryDto[];
}

export const ProductFormModal: React.FC<ProductFormModalProps> = ({
  isOpen,
  onClose,
  onSaved,
  editingProduct,
  session: _session,
  categories,
}) => {
  const { showError } = useToast();
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [productName, setProductName] = useState<string>('');
  const [categoryFields, setCategoryFields] = useState<CategoryFieldDto[]>([]);
  const [fieldsLoading, setFieldsLoading] = useState<boolean>(false);
  const [fieldValues, setFieldValues] = useState<Record<string, { valueText?: string; valueNumber?: number | string; valueBoolean?: boolean }>>({});
  const [stockQuantity, setStockQuantity] = useState<string | number>('0');
  const [purchasePrice, setPurchasePrice] = useState<string | number>('');
  const [additionalCharges, setAdditionalCharges] = useState<string | number>('');
  const [actualPurchasePrice, setActualPurchasePrice] = useState<string | number>('');
  const [saving, setSaving] = useState<boolean>(false);
  const [liveCalculation, setLiveCalculation] = useState<JewelleryPriceCalculationResult | null>(null);


  const actualPurchasePriceCode = generateActualPurchasePriceCode(
    actualPurchasePrice !== '' && actualPurchasePrice !== null && actualPurchasePrice !== undefined
      ? actualPurchasePrice
      : null
  );

  const calculateActualPurchasePrice = (pVal: string | number, cVal: string | number) => {
    if (pVal === '' || pVal === null || pVal === undefined) {
      setActualPurchasePrice('');
      return;
    }
    const p = typeof pVal === 'number' ? pVal : parseFloat(String(pVal));
    if (isNaN(p) || p < 0) {
      setActualPurchasePrice('');
      return;
    }
    const c = cVal === '' || cVal === null || cVal === undefined ? 0 : (typeof cVal === 'number' ? cVal : parseFloat(String(cVal)));
    if (isNaN(c) || c < 0) {
      setActualPurchasePrice('');
      return;
    }
    const actual = Math.round((p + (p * c / 100)) * 100) / 100;
    setActualPurchasePrice(actual);
  };

  const handlePurchasePriceChange = (val: string) => {
    setPurchasePrice(val);
    calculateActualPurchasePrice(val, additionalCharges);
  };

  const handleAdditionalChargesChange = (val: string) => {
    setAdditionalCharges(val);
    calculateActualPurchasePrice(purchasePrice, val);
  };

  // Initialize or reset when modal opens or editingProduct changes
  useEffect(() => {
    if (!isOpen) {
      setSelectedCategoryId('');
      setProductName('');
      setStockQuantity('0');
      setPurchasePrice('');
      setAdditionalCharges('');
      setActualPurchasePrice('');
      setCategoryFields([]);
      setFieldValues({});
      return;
    }

    if (editingProduct) {
      setSelectedCategoryId(editingProduct.categoryId);
      setProductName(editingProduct.name);
      setStockQuantity(editingProduct.stockQuantity ?? 0);

      // Pre-fill existing field values
      const initialMap: Record<string, { valueText?: string; valueNumber?: number | string; valueBoolean?: boolean }> = {};
      let initialPurchasePrice: string | number = editingProduct.purchasePrice ?? '';
      let initialAdditionalCharges: string | number = editingProduct.additionalChargesPercentage ?? '';
      let initialActualPurchasePrice: string | number = editingProduct.actualPurchasePrice ?? '';

      if (editingProduct.fieldValues) {
        for (const fv of editingProduct.fieldValues) {
          initialMap[fv.categoryFieldId] = {
            valueText: fv.valueText ?? '',
            valueNumber: fv.valueNumber !== null && fv.valueNumber !== undefined ? fv.valueNumber : '',
            valueBoolean: fv.valueBoolean ?? false,
          };
          if (fv.categoryField?.fieldKey === 'purchasePrice' && initialPurchasePrice === '') {
            initialPurchasePrice = fv.valueNumber !== null && fv.valueNumber !== undefined ? fv.valueNumber : '';
          } else if (fv.categoryField?.fieldKey === 'additionalChargesPercentage' && initialAdditionalCharges === '') {
            initialAdditionalCharges = fv.valueNumber !== null && fv.valueNumber !== undefined ? fv.valueNumber : '';
          } else if (fv.categoryField?.fieldKey === 'actualPurchasePrice' && initialActualPurchasePrice === '') {
            initialActualPurchasePrice = fv.valueNumber !== null && fv.valueNumber !== undefined ? fv.valueNumber : '';
          }
        }
      }
      setFieldValues(initialMap);
      setPurchasePrice(initialPurchasePrice);
      setAdditionalCharges(initialAdditionalCharges);
      setActualPurchasePrice(initialActualPurchasePrice);

      // Load category fields for this category
      void loadCategoryFields(editingProduct.categoryId, initialMap);
    } else {
      setProductName('');
      setStockQuantity('0');
      setPurchasePrice('');
      setAdditionalCharges('');
      setActualPurchasePrice('');
      // If there are categories, default to the first one
      if (categories.length > 0) {
        const firstCatId = categories[0].id;
        setSelectedCategoryId(firstCatId);
        void loadCategoryFields(firstCatId, {});
      } else {
        setSelectedCategoryId('');
        setCategoryFields([]);
        setFieldValues({});
      }
    }
  }, [isOpen, editingProduct, categories]);

  const loadCategoryFields = async (
    catId: string,
    existingVals: Record<string, { valueText?: string; valueNumber?: number | string; valueBoolean?: boolean }>
  ) => {
    if (!catId) {
      setCategoryFields([]);
      return;
    }
    setFieldsLoading(true);
    try {
      const res = await ipcClient.listCategoryFields(catId);
      if (res.success) {
        setCategoryFields(res.data);

        // Populate missing defaults
        const updatedMap = { ...existingVals };
        for (const f of res.data) {
          if (!updatedMap[f.id]) {
            updatedMap[f.id] = {
              valueText: f.fieldType === 'select' && f.options && f.options.length > 0 ? f.options[0] : '',
              valueNumber: '',
              valueBoolean: false,
            };
          }
        }
        setFieldValues(updatedMap);
      } else {
        showError(res.error || 'Failed to load category attributes.');
      }
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to load category fields.');
    } finally {
      setFieldsLoading(false);
    }
  };

  const handleCategoryChange = (newCatId: string) => {
    setSelectedCategoryId(newCatId);
    setFieldValues({});
    setPurchasePrice('');
    setAdditionalCharges('');
    setActualPurchasePrice('');
    void loadCategoryFields(newCatId, {});
  };

  const handleFieldChange = (fieldId: string, patch: { valueText?: string; valueNumber?: number | string; valueBoolean?: boolean }) => {
    setFieldValues((prev) => ({
      ...prev,
      [fieldId]: {
        ...prev[fieldId],
        ...patch,
      },
    }));
  };

  const isJewelleryCategory = categoryFields.some(
    (f) => f.fieldKey === 'purity' || f.name.toLowerCase() === 'purity'
  );

  // Live calculation effect for categories with Purity attribute
  useEffect(() => {
    if (!isJewelleryCategory) {
      setLiveCalculation(null);
      return;
    }

    const purityField = categoryFields.find((f) => f.fieldKey === 'purity' || f.name.toLowerCase() === 'purity');
    const weightField = categoryFields.find((f) => f.fieldKey === 'weight' || f.name.toLowerCase() === 'weight');
    const makingField = categoryFields.find((f) => f.fieldKey === 'makingChargesPerGram' || f.name.toLowerCase().includes('making charge'));

    const purity = purityField ? fieldValues[purityField.id]?.valueText : '';
    const weightVal = weightField ? fieldValues[weightField.id]?.valueNumber : '';
    const makingVal = makingField ? fieldValues[makingField.id]?.valueNumber : '';

    const weight = typeof weightVal === 'number' ? weightVal : parseFloat(String(weightVal));
    const making = typeof makingVal === 'number' ? makingVal : parseFloat(String(makingVal));

    if (!purity || isNaN(weight) || weight <= 0) {
      setLiveCalculation(null);
      return;
    }

    let active = true;
    ipcClient
      .calculateJewelleryPrice({
        purity,
        weightGrams: weight,
        makingChargePerGram: isNaN(making) || making < 0 ? 0 : making,
      })
      .then((res) => {
        if (!active) return;
        if (res.success) {
          setLiveCalculation(res.data);
        } else {
          setLiveCalculation(null);
          showError(res.error);
        }
      })
      .catch((err) => {
        if (!active) return;
        setLiveCalculation(null);
        const msg = err instanceof Error ? err.message : 'Error calculating price';
        showError(msg);
      });

    return () => {
      active = false;
    };
  }, [isJewelleryCategory, categoryFields, fieldValues]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 1. Category validation
    if (!selectedCategoryId || !selectedCategoryId.trim()) {
      showError('Please select a product category.');
      return;
    }

    const selectedCategoryObj = categories.find((c) => c.id === selectedCategoryId);
    if (!selectedCategoryObj && !editingProduct) {
      showError('Selected category is invalid. Please select a valid category.');
      return;
    }

    // 2. Product Name validation
    const trimmedName = productName.trim();
    if (!trimmedName) {
      showError('Product name is required.');
      return;
    }
    if (trimmedName.length < 2) {
      showError('Product name must be at least 2 characters.');
      return;
    }
    if (trimmedName.length > 150) {
      showError('Product name cannot exceed 150 characters.');
      return;
    }

    // 3. Stock Quantity validation
    const stockStr = String(stockQuantity ?? '').trim();
    if (stockStr === '') {
      showError('Stock quantity is required.');
      return;
    }
    const parsedStock = parseFloat(stockStr);
    if (isNaN(parsedStock)) {
      showError('Stock quantity must be a valid number.');
      return;
    }
    if (parsedStock < 0) {
      showError('Stock quantity cannot be negative.');
      return;
    }
    if (parsedStock > 10000000) {
      showError('Stock quantity cannot exceed 10,000,000.');
      return;
    }

    // 4. Purchase Pricing validation
    let parsedPurchasePrice: number | null = null;
    const pStr = String(purchasePrice ?? '').trim();
    if (pStr !== '') {
      const p = parseFloat(pStr);
      if (isNaN(p)) {
        showError('Purchase price must be a valid number.');
        return;
      }
      if (p < 0) {
        showError('Purchase price cannot be negative.');
        return;
      }
      if (p > 100000000) {
        showError('Purchase price cannot exceed ₹100,000,000.');
        return;
      }
      parsedPurchasePrice = Math.round(p * 100) / 100;
    }

    let parsedAdditionalCharges: number | null = null;
    const cStr = String(additionalCharges ?? '').trim();
    if (cStr !== '') {
      const c = parseFloat(cStr);
      if (isNaN(c)) {
        showError('Additional cost percentage must be a valid number.');
        return;
      }
      if (c < 0) {
        showError('Additional cost percentage cannot be negative.');
        return;
      }
      if (c > 500) {
        showError('Additional cost percentage cannot exceed 500%.');
        return;
      }
      parsedAdditionalCharges = Math.round(c * 100) / 100;
    }

    if (parsedAdditionalCharges !== null && parsedAdditionalCharges > 0 && parsedPurchasePrice === null) {
      showError('Please enter a Purchase Price before applying Additional Cost (%).');
      return;
    }

    let parsedActualPurchasePrice: number | null = null;
    if (parsedPurchasePrice !== null) {
      const c = parsedAdditionalCharges ?? 0;
      parsedActualPurchasePrice = Math.round((parsedPurchasePrice + (parsedPurchasePrice * c / 100)) * 100) / 100;
    }

    // 5. Dynamic Category Fields validation
    const activeCategoryFields = categoryFields.filter(
      (f) => !['purchasePrice', 'additionalChargesPercentage', 'actualPurchasePrice', 'actualPurchasePriceCode'].includes(f.fieldKey)
    );

    for (const f of activeCategoryFields) {
      const val = fieldValues[f.id];

      if (f.fieldType === 'text') {
        const textVal = val?.valueText?.trim() || '';
        if (f.required && !textVal) {
          showError(`"${f.name}" is required.`);
          return;
        }
        if (textVal && textVal.length > 200) {
          showError(`"${f.name}" cannot exceed 200 characters.`);
          return;
        }
      } else if (f.fieldType === 'number') {
        const rawNum = val?.valueNumber;
        const numStr = rawNum !== undefined && rawNum !== null ? String(rawNum).trim() : '';

        if (f.required && numStr === '') {
          showError(`"${f.name}" is required.`);
          return;
        }

        if (numStr !== '') {
          const num = parseFloat(numStr);
          if (isNaN(num)) {
            showError(`"${f.name}" must be a valid number.`);
            return;
          }
          if (num < 0) {
            showError(`"${f.name}" cannot be negative.`);
            return;
          }

          const lowerKey = f.fieldKey.toLowerCase();
          const lowerName = f.name.toLowerCase();

          // Weight fields
          if (lowerKey.includes('weight') || lowerName.includes('weight')) {
            if (num <= 0) {
              showError(`"${f.name}" must be greater than 0 grams.`);
              return;
            }
            if (num > 50000) {
              showError(`"${f.name}" cannot exceed 50,000 grams.`);
              return;
            }
          }

          // Price fields
          if (
            lowerKey.includes('price') ||
            lowerName.includes('price') ||
            lowerKey.includes('rate') ||
            lowerName.includes('rate')
          ) {
            if (num <= 0) {
              showError(`"${f.name}" must be greater than 0.`);
              return;
            }
            if (num > 100000000) {
              showError(`"${f.name}" cannot exceed ₹100,000,000.`);
              return;
            }
          }

          // Making charges
          if (lowerKey.includes('making') || lowerName.includes('making')) {
            if (num > 100000) {
              showError(`"${f.name}" cannot exceed ₹100,000 per gram.`);
              return;
            }
          }
        }
      } else if (f.fieldType === 'select') {
        const selectedVal = val?.valueText?.trim() || '';
        if (f.required && !selectedVal) {
          showError(`Please select an option for "${f.name}".`);
          return;
        }
        if (selectedVal && f.options && f.options.length > 0) {
          if (!f.options.includes(selectedVal)) {
            showError(`Invalid selection for "${f.name}". Please choose from the available options.`);
            return;
          }
        }
      }
    }

    // 6. Jewellery Specific Validation
    if (isJewelleryCategory) {
      const purityField = categoryFields.find((f) => f.fieldKey === 'purity' || f.name.toLowerCase().includes('purity'));
      if (purityField) {
        const purityVal = fieldValues[purityField.id]?.valueText?.trim();
        if (!purityVal) {
          showError('Please select Purity for jewellery products.');
          return;
        }
      }

      const weightField = categoryFields.find((f) => f.fieldKey === 'weight' || f.name.toLowerCase().includes('weight'));
      if (weightField) {
        const weightVal = fieldValues[weightField.id]?.valueNumber;
        const parsedW = typeof weightVal === 'number' ? weightVal : parseFloat(String(weightVal ?? ''));
        if (isNaN(parsedW) || parsedW <= 0) {
          showError('Please enter a valid Weight (grams) greater than 0 for jewellery products.');
          return;
        }
      }
    }

    // Format field values for IPC
    const fieldValuesPayload: ProductFieldValueInput[] = categoryFields.map((f) => {
      if (f.fieldKey === 'purchasePrice') {
        return {
          categoryFieldId: f.id,
          valueText: null,
          valueNumber: parsedPurchasePrice,
          valueBoolean: null,
        };
      }
      if (f.fieldKey === 'additionalChargesPercentage') {
        return {
          categoryFieldId: f.id,
          valueText: null,
          valueNumber: parsedAdditionalCharges,
          valueBoolean: null,
        };
      }
      if (f.fieldKey === 'actualPurchasePrice') {
        return {
          categoryFieldId: f.id,
          valueText: null,
          valueNumber: parsedActualPurchasePrice,
          valueBoolean: null,
        };
      }
      if (f.fieldKey === 'actualPurchasePriceCode') {
        return {
          categoryFieldId: f.id,
          valueText: generateActualPurchasePriceCode(parsedActualPurchasePrice),
          valueNumber: null,
          valueBoolean: null,
        };
      }

      const val = fieldValues[f.id];
      let valueNumber: number | null = null;
      if (f.fieldType === 'number' && val?.valueNumber !== undefined && val.valueNumber !== null && val.valueNumber !== '') {
        const parsed = typeof val.valueNumber === 'number' ? val.valueNumber : parseFloat(String(val.valueNumber));
        valueNumber = isNaN(parsed) ? null : parsed;
      }

      return {
        categoryFieldId: f.id,
        valueText: f.fieldType === 'text' || f.fieldType === 'select' ? (val?.valueText?.trim() || null) : null,
        valueNumber,
        valueBoolean: f.fieldType === 'boolean' ? Boolean(val?.valueBoolean) : null,
      };
    });

    setSaving(true);
    try {
      if (editingProduct) {
        const res = await ipcClient.updateProduct({
          id: editingProduct.id,
          name: trimmedName,
          stockQuantity: parsedStock,
          fieldValues: fieldValuesPayload,
          purchasePrice: parsedPurchasePrice,
          additionalChargesPercentage: parsedAdditionalCharges,
          actualPurchasePrice: parsedActualPurchasePrice,
          actualPurchasePriceCode: generateActualPurchasePriceCode(parsedActualPurchasePrice),
        });

        if (res.success) {
          onSaved(res.data);
          onClose();
        } else {
          showError(res.error || 'Failed to update product.');
        }
      } else {
        const res = await ipcClient.createProduct({
          categoryId: selectedCategoryId,
          name: trimmedName,
          stockQuantity: parsedStock,
          fieldValues: fieldValuesPayload,
          purchasePrice: parsedPurchasePrice,
          additionalChargesPercentage: parsedAdditionalCharges,
          actualPurchasePrice: parsedActualPurchasePrice,
          actualPurchasePriceCode: generateActualPurchasePriceCode(parsedActualPurchasePrice),
        });

        if (res.success) {
          onSaved(res.data);
          onClose();
        } else {
          showError(res.error || 'Failed to create product.');
        }
      }
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to save product.');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 p-4 backdrop-blur-sm select-text">
      <div className="flex h-[90vh] max-h-[840px] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-cream-300 bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-cream-200 px-6 py-4 bg-cream-50/70">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-base font-bold text-stone-900">
                {editingProduct ? 'Edit Product' : 'Add New Product'}
              </h2>
            </div>
            <p className="mt-1 text-xs text-stone-500">
              {editingProduct
                ? 'Update product details and attributes.'
                : 'Enter product details. A unique scannable barcode will be assigned.'}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg p-1.5 text-stone-400 hover:bg-cream-100 hover:text-stone-700 transition"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} noValidate className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-6 space-y-6">

            {/* Core Section: Category & Product Name */}
            <div className="rounded-xl border border-cream-200 bg-cream-50/50 p-4 space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-stone-600">
                Core Information
              </h3>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {/* Category Selection */}
                <div>
                  <label htmlFor="product-category-select" className="block text-xs font-medium text-stone-700">
                    Product Category <span className="text-rose-500">*</span>
                  </label>
                  {editingProduct ? (
                    <div className="mt-1.5 flex items-center justify-between rounded-lg border border-cream-200 bg-white px-3.5 py-2 text-xs text-stone-700">
                      <span className="font-semibold">{editingProduct.categoryName}</span>
                      <span className="text-[10px] text-amber-700 font-mono font-medium">Locked</span>
                    </div>
                  ) : (
                    <select
                      id="product-category-select"
                      value={selectedCategoryId}
                      onChange={(e) => handleCategoryChange(e.target.value)}
                      disabled={saving || categories.length === 0}
                      className="mt-1.5 w-full rounded-lg border border-cream-300 bg-white px-3.5 py-2 text-xs text-stone-900 focus:border-amber-600 focus:outline-none focus:ring-1 focus:ring-amber-600"
                    >
                      <option value="">-- Select Category --</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  )}
                  {categories.length === 0 && (
                    <p className="mt-1 text-[11px] text-rose-600 font-medium">
                      No categories found. Please create a category first in Category Management.
                    </p>
                  )}
                </div>

                {/* Permanent Barcode info */}
                <div>
                  <label className="block text-xs font-medium text-stone-700">
                    Permanent Barcode
                  </label>
                  <div className="mt-1.5 flex items-center justify-between rounded-lg border border-cream-200 bg-white px-3.5 py-2 text-xs font-mono">
                    {editingProduct ? (
                      <>
                        <span className="font-bold text-amber-900">{editingProduct.barcode}</span>
                        <span className="text-[10px] text-amber-700 font-medium">Assigned</span>
                      </>
                    ) : (
                      <>
                        <span className="text-stone-400 italic text-[11px]">Auto-generated upon save</span>
                        <span className="text-[10px] text-emerald-700 font-medium">Auto-assigned</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Product Name & Stock Quantity */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  <label htmlFor="product-name-input" className="block text-xs font-medium text-stone-700">
                    Product Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="product-name-input"
                    type="text"
                    required
                    value={productName}
                    onChange={(e) => setProductName(e.target.value)}
                    placeholder="e.g. Golden Jhumka, Gold Ring 22K, Sofa Cover Cloth"
                    disabled={saving}
                    className="mt-1.5 w-full rounded-lg border border-cream-300 bg-white px-3.5 py-2 text-xs text-stone-900 placeholder-stone-400 focus:border-amber-600 focus:outline-none focus:ring-1 focus:ring-amber-600"
                  />
                </div>

                <div>
                  <label htmlFor="product-stock-input" className="block text-xs font-medium text-stone-700">
                    Stock Quantity <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="product-stock-input"
                    type="number"
                    step="any"
                    min="0"
                    required
                    value={stockQuantity}
                    onChange={(e) => setStockQuantity(e.target.value)}
                    placeholder="e.g. 10 or 50.5"
                    disabled={saving}
                    className="mt-1.5 w-full rounded-lg border border-cream-300 bg-white px-3.5 py-2 text-xs text-stone-900 focus:border-amber-600 focus:outline-none focus:ring-1 focus:ring-amber-600 font-mono"
                  />
                  <p className="mt-1 text-[10px] text-stone-500">
                    Supports whole units or decimals (e.g. 50.5m)
                  </p>
                </div>
              </div>
            </div>

            {/* Purchase Pricing Section */}
            <div className="rounded-xl border border-cream-200 bg-cream-50/50 p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-stone-600">
                    Purchase Pricing
                  </h3>
                  <p className="text-[11px] text-stone-500">
                    Set purchase cost and additional charges applied on this product.
                  </p>
                </div>
                <span className="rounded bg-amber-100/70 border border-amber-300 px-2 py-0.5 text-[10px] font-semibold text-amber-900 font-mono">
                  Auto-Calculated
                </span>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {/* Purchase Price Input */}
                <div>
                  <label htmlFor="product-purchase-price-input" className="block text-xs font-medium text-stone-700">
                    Purchase Price (₹)
                  </label>
                  <div className="relative mt-1.5">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-xs font-bold text-stone-400">
                      ₹
                    </span>
                    <input
                      id="product-purchase-price-input"
                      type="number"
                      step="any"
                      min="0"
                      value={purchasePrice}
                      onChange={(e) => handlePurchasePriceChange(e.target.value)}
                      placeholder="e.g. 100"
                      disabled={saving}
                      className="w-full rounded-lg border border-cream-300 bg-white pl-7 pr-3.5 py-2 text-xs text-stone-900 placeholder-stone-400 focus:border-amber-600 focus:outline-none focus:ring-1 focus:ring-amber-600 font-mono"
                    />
                  </div>
                  <p className="mt-1 text-[10px] text-stone-500">
                    Base price at purchase
                  </p>
                </div>

                {/* Additional Charges (%) Input */}
                <div>
                  <label htmlFor="product-additional-charges-input" className="block text-xs font-medium text-stone-700">
                    Additional Cost (%)
                  </label>
                  <div className="relative mt-1.5">
                    <input
                      id="product-additional-charges-input"
                      type="number"
                      step="any"
                      min="0"
                      value={additionalCharges}
                      onChange={(e) => handleAdditionalChargesChange(e.target.value)}
                      placeholder="e.g. 10"
                      disabled={saving}
                      className="w-full rounded-lg border border-cream-300 bg-white pr-7 pl-3.5 py-2 text-xs text-stone-900 placeholder-stone-400 focus:border-amber-600 focus:outline-none focus:ring-1 focus:ring-amber-600 font-mono"
                    />
                    <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-xs font-bold text-stone-400">
                      %
                    </span>
                  </div>
                  <p className="mt-1 text-[10px] text-stone-500">
                    % on purchase price
                  </p>
                </div>

                {/* Actual Purchase Price (Read-Only / Automatically Calculated) */}
                <div>
                  <div className="flex items-center justify-between">
                    <label htmlFor="product-actual-purchase-price" className="block text-xs font-medium text-stone-700">
                      Actual Purchase Price
                    </label>
                    <span className="text-[10px] text-amber-700 font-semibold font-mono">
                      Calculated
                    </span>
                  </div>
                  <div className="relative mt-1.5">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-xs font-bold text-amber-700">
                      ₹
                    </span>
                    <input
                      id="product-actual-purchase-price"
                      type="text"
                      readOnly
                      disabled
                      value={
                        actualPurchasePrice !== null && actualPurchasePrice !== undefined && actualPurchasePrice !== ''
                          ? Number(actualPurchasePrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                          : '—'
                      }
                      className="w-full rounded-lg border border-amber-300 bg-amber-50/70 pl-7 pr-3.5 py-2 text-xs font-bold font-mono text-amber-950 cursor-not-allowed select-text shadow-xs"
                    />
                  </div>
                  <p className="mt-1 text-[10px] text-stone-500">
                    Price + Charges
                  </p>
                </div>

                {/* Actual Purchase Price Code (COMPLISENT Mapping) */}
                <div>
                  <div className="flex items-center justify-between">
                    <label htmlFor="product-actual-purchase-price-code" className="block text-xs font-medium text-stone-700">
                      Purchase Price Code
                    </label>
                    <span className="text-[10px] text-amber-700 font-semibold font-mono" title="COMPLISENT (1=C 2=O 3=M 4=P 5=L 6=I 7=S 8=E 9=N 0=T)">
                      COMPLISENT
                    </span>
                  </div>
                  <div className="relative mt-1.5">
                    <input
                      id="product-actual-purchase-price-code"
                      type="text"
                      readOnly
                      disabled
                      value={actualPurchasePriceCode || '—'}
                      placeholder="e.g. TTTCTT"
                      className="w-full rounded-lg border border-amber-300 bg-amber-50/70 px-3 py-2 text-xs font-bold font-mono tracking-widest text-amber-950 cursor-not-allowed select-text shadow-xs text-center"
                    />
                  </div>
                  <p className="mt-1 text-[10px] text-stone-500">
                    Secret 6-char tag code
                  </p>
                </div>
              </div>

              {/* Real-time Calculation Breakdown Pill */}
              {purchasePrice !== '' && !isNaN(Number(purchasePrice)) && Number(purchasePrice) >= 0 && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-amber-100/50 border border-amber-200/80 px-3.5 py-2 text-xs">
                  <div className="flex items-center gap-2 text-amber-900 font-medium">
                    <span className="text-amber-700 font-bold">Calculation:</span>
                    <span className="font-mono">
                      ₹{Number(purchasePrice).toLocaleString()} + {additionalCharges !== '' ? `${additionalCharges}%` : '0%'}
                      {' '}
                      (₹{(Number(purchasePrice) * (Number(additionalCharges || 0) / 100)).toFixed(2)})
                      {' = '}
                      <strong className="font-bold text-amber-950">
                        ₹{Number(actualPurchasePrice || purchasePrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </strong>
                    </span>
                  </div>
                  {actualPurchasePriceCode && (
                    <div className="flex items-center gap-1.5 font-mono text-xs">
                      <span className="text-stone-500 font-sans text-[11px]">Barcode Tag Code:</span>
                      <span className="rounded bg-amber-200/90 px-2 py-0.5 font-bold tracking-widest text-amber-950 border border-amber-300/80">
                        {actualPurchasePriceCode}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Dynamic Category Fields Section */}
            {(() => {
              const displayCategoryFields = categoryFields.filter(
                (f) => !['purchasePrice', 'additionalChargesPercentage', 'actualPurchasePrice', 'actualPurchasePriceCode'].includes(f.fieldKey)
              );

              return (
                <div className="rounded-xl border border-cream-200 bg-cream-50/50 p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-stone-600">
                        Category Attributes
                      </h3>
                      <p className="text-[11px] text-stone-500">
                        Dynamically configured attributes for this category.
                      </p>
                    </div>
                    <span className="text-[11px] text-stone-500 font-mono">
                      {displayCategoryFields.length} {displayCategoryFields.length === 1 ? 'field' : 'fields'}
                    </span>
                  </div>

                  {fieldsLoading ? (
                    <div className="flex h-32 items-center justify-center text-xs text-stone-500">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-amber-600 border-t-transparent mr-2" />
                      Loading category attributes...
                    </div>
                  ) : displayCategoryFields.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-cream-300 p-6 text-center text-xs text-stone-500 bg-white/50">
                      No additional attributes configured for this category. You can save this product now, or add custom fields in Category Management.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      {displayCategoryFields.map((field) => {
                        const currentVal = fieldValues[field.id] || {};

                        return (
                          <div key={field.id} className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <label htmlFor={`field-${field.id}`} className="block text-xs font-medium text-stone-700">
                                {field.name} {field.required && <span className="text-rose-500">*</span>}
                              </label>
                            </div>

                            {/* Text Field */}
                            {field.fieldType === 'text' && (
                              <input
                                id={`field-${field.id}`}
                                type="text"
                                required={field.required}
                                value={currentVal.valueText || ''}
                                onChange={(e) => handleFieldChange(field.id, { valueText: e.target.value })}
                                placeholder={`Enter ${field.name.toLowerCase()}`}
                                disabled={saving}
                                className="w-full rounded-lg border border-cream-300 bg-white px-3.5 py-2 text-xs text-stone-900 placeholder-stone-400 focus:border-amber-600 focus:outline-none focus:ring-1 focus:ring-amber-600"
                              />
                            )}

                            {/* Number Field (supports decimals like 50.5, 5.25) */}
                            {field.fieldType === 'number' && (
                              <input
                                id={`field-${field.id}`}
                                type="number"
                                step="any"
                                required={field.required}
                                value={currentVal.valueNumber !== undefined ? currentVal.valueNumber : ''}
                                onChange={(e) => handleFieldChange(field.id, { valueNumber: e.target.value })}
                                placeholder={`Enter ${field.name.toLowerCase()} (e.g. 10, 50.5)`}
                                disabled={saving}
                                className="w-full rounded-lg border border-cream-300 bg-white px-3.5 py-2 text-xs text-stone-900 placeholder-stone-400 focus:border-amber-600 focus:outline-none focus:ring-1 focus:ring-amber-600"
                              />
                            )}

                            {/* Select Field */}
                            {field.fieldType === 'select' && (
                              <select
                                id={`field-${field.id}`}
                                required={field.required}
                                value={currentVal.valueText || ''}
                                onChange={(e) => handleFieldChange(field.id, { valueText: e.target.value })}
                                disabled={saving}
                                className="w-full rounded-lg border border-cream-300 bg-white px-3.5 py-2 text-xs text-stone-900 focus:border-amber-600 focus:outline-none focus:ring-1 focus:ring-amber-600"
                              >
                                <option value="">-- Select {field.name} --</option>
                                {field.options?.map((opt, oIdx) => (
                                  <option key={oIdx} value={opt}>
                                    {opt}
                                  </option>
                                ))}
                              </select>
                            )}

                            {/* Boolean Field */}
                            {field.fieldType === 'boolean' && (
                              <div className="flex items-center gap-3 pt-1">
                                <input
                                  id={`field-${field.id}`}
                                  type="checkbox"
                                  checked={Boolean(currentVal.valueBoolean)}
                                  onChange={(e) => handleFieldChange(field.id, { valueBoolean: e.target.checked })}
                                  disabled={saving}
                                  className="h-4 w-4 rounded border-cream-300 text-amber-600 focus:ring-amber-500 focus:ring-offset-white"
                                />
                                <label htmlFor={`field-${field.id}`} className="text-xs text-stone-700 cursor-pointer select-none">
                                  {currentVal.valueBoolean ? 'Yes (Enabled)' : 'No (Disabled)'}
                                </label>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Gold / Silver Calculated Price (Read-Only) */}
            {isJewelleryCategory && (
              <div className="rounded-xl border border-amber-300/80 bg-amber-50/50 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded bg-amber-200/60 text-amber-900 font-bold text-[10px]">
                      Au
                    </span>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-amber-900">
                      Live Calculated Price (Daily Market Rate)
                    </h4>
                  </div>
                  <span className="rounded bg-amber-200/50 px-2 py-0.5 text-[10px] font-semibold text-amber-900 font-mono">
                    Automatic / Read-Only
                  </span>
                </div>

                {liveCalculation ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-xs font-mono">
                      <div className="rounded-lg bg-white p-2.5 border border-amber-200 shadow-xs">
                        <span className="text-[10px] text-stone-500 block uppercase font-sans font-semibold">Current Rate</span>
                        <span className="font-bold text-stone-800">₹{liveCalculation.ratePerGram.toLocaleString()}/g</span>
                        <span className="text-[9px] text-stone-500 block">({liveCalculation.metalType} Daily Rate)</span>
                      </div>
                      <div className="rounded-lg bg-white p-2.5 border border-amber-200 shadow-xs">
                        <span className="text-[10px] text-stone-500 block uppercase font-sans font-semibold">Purity</span>
                        <span className="font-bold text-stone-800">{liveCalculation.purity} ({liveCalculation.purityFactor})</span>
                      </div>
                      <div className="rounded-lg bg-white p-2.5 border border-amber-200 shadow-xs">
                        <span className="text-[10px] text-stone-500 block uppercase font-sans font-semibold">Metal Value</span>
                        <span className="font-bold text-amber-800">₹{liveCalculation.metalValue.toLocaleString()}</span>
                      </div>
                      <div className="rounded-lg bg-white p-2.5 border border-amber-200 shadow-xs">
                        <span className="text-[10px] text-stone-500 block uppercase font-sans font-semibold">Making Charges</span>
                        <span className="font-bold text-stone-800">₹{liveCalculation.totalMakingCharges.toLocaleString()}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between rounded-lg bg-amber-100/70 border border-amber-300 px-4 py-3">
                      <div>
                        <span className="text-xs font-bold text-amber-950">CALCULATED PRODUCT PRICE</span>
                        <p className="text-[10px] text-amber-800">
                          Automatically computed from current daily rate + purity + weight + making charge.
                        </p>
                      </div>
                      <div className="font-mono text-xl font-black text-amber-900">
                        ₹{liveCalculation.finalPrice.toLocaleString()}
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-stone-500 italic">
                    Select Purity and enter Weight (grams) above to automatically calculate product selling price from today's daily metal rate.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 border-t border-cream-200 px-6 py-4 bg-cream-50/70">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-lg border border-cream-300 bg-white px-4 py-2 text-xs font-semibold text-stone-700 hover:bg-cream-100 disabled:opacity-50 transition shadow-xs"
            >
              Cancel
            </button>
            <button
              id="btn-save-product"
              type="submit"
              disabled={saving || (!editingProduct && categories.length === 0)}
              className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-amber-500 disabled:opacity-50 transition"
            >
              {saving
                ? 'Saving Product...'
                : editingProduct
                ? 'Update Product'
                : 'Save Product & Generate Barcode'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
