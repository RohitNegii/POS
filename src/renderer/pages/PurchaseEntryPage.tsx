import React, { useState, useEffect } from 'react';
import type {
  AuthSessionPayload,
  CreatePurchaseItemInput,
  ProductDto,
  PurchaseDto,
  PurchasePaymentMethod,
  PurchasePaymentStatus,
} from '../../shared/types/ipc';
import { useToast } from '../context/ToastContext';
import { useVendors } from '../hooks/useVendors';
import { useCategories } from '../hooks/useCategories';
import { useProducts } from '../hooks/useProducts';
import { usePurchases } from '../hooks/usePurchases';
import { ProductFormModal } from '../components/ProductFormModal';
import { BarcodePrintModal } from '../components/BarcodePrintModal';
import { BatchBarcodePrintModal } from '../components/BatchBarcodePrintModal';
import { ipcClient } from '../services/ipcClient';

interface PurchaseEntryPageProps {
  session: AuthSessionPayload;
  onNavigateToHistory: () => void;
  editingPurchaseId?: string | null;
  onCancelEdit?: () => void;
}

export interface BillProductItem {
  tempId: string;
  productId: string;
  product: ProductDto;
  name: string;
  barcode: string;
  categoryName: string;
  currentStock: number;
  quantityBought: number;
  unitCost: number;
  taxRate: number;
  taxAmount: number;
  lineTotal: number;
}

export const PurchaseEntryPage: React.FC<PurchaseEntryPageProps> = ({
  session,
  onNavigateToHistory,
  editingPurchaseId,
  onCancelEdit,
}) => {
  const { showError, showSuccess, showInfo } = useToast();
  const { vendors, refreshVendors, createVendor } = useVendors();
  const { categories } = useCategories();
  const { products, refreshProducts } = useProducts();
  const { createPurchase, updatePurchase } = usePurchases();

  useEffect(() => {
    void refreshVendors();
  }, [refreshVendors]);

  // Editing existing bill state
  const [loadingPurchase, setLoadingPurchase] = useState<boolean>(false);
  const [currentEditingPurchase, setCurrentEditingPurchase] = useState<PurchaseDto | null>(null);

  // Invoice Header State
  const [selectedVendorId, setSelectedVendorId] = useState<string>('');
  const [invoiceNumber, setInvoiceNumber] = useState<string>('');
  const [purchaseDate, setPurchaseDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [paymentMethod, setPaymentMethod] = useState<PurchasePaymentMethod>('CASH');

  // Bill Items State
  const [items, setItems] = useState<BillProductItem[]>([]);



  // Quick Add Vendor Modal State
  const [isQuickAddVendorOpen, setIsQuickAddVendorOpen] = useState<boolean>(false);
  const [quickVendorName, setQuickVendorName] = useState<string>('');
  const [quickVendorPhone, setQuickVendorPhone] = useState<string>('');
  const [quickVendorSubmitting, setQuickVendorSubmitting] = useState<boolean>(false);

  // Existing Add / Edit Product Modal State (Reusing ProductFormModal exactly)
  const [isAddProductModalOpen, setIsAddProductModalOpen] = useState<boolean>(false);
  const [editingBillProduct, setEditingBillProduct] = useState<ProductDto | null>(null);

  // Barcode Print Modal State
  const [printingProduct, setPrintingProduct] = useState<ProductDto | null>(null);
  const [printingCopies, setPrintingCopies] = useState<number>(1);
  const [batchPrintingPurchase, setBatchPrintingPurchase] = useState<PurchaseDto | null>(null);

  // Submitting Purchase State
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [savedPurchase, setSavedPurchase] = useState<PurchaseDto | null>(null);

  // Load existing purchase bill if editingPurchaseId is provided
  useEffect(() => {
    if (!editingPurchaseId) {
      setCurrentEditingPurchase(null);
      setLoadingPurchase(false);
      return;
    }

    let isCurrent = true;
    setLoadingPurchase(true);

    const fetchBill = async () => {
      try {
        const res = await ipcClient.getPurchaseById(editingPurchaseId);
        if (!isCurrent) return;

        if (!res.success) {
          showError(res.error || 'Failed to retrieve purchase bill details.');
          return;
        }

        if (!res.data) {
          showError('Purchase bill record not found.');
          return;
        }

        const p = res.data;
        setCurrentEditingPurchase(p);
        setSelectedVendorId(p.vendorId);
        setInvoiceNumber(p.invoiceNumber);
        setPurchaseDate(p.purchaseDate);
        setPaymentMethod(
          p.paymentMethod === 'ONLINE' || p.paymentMethod === 'UPI' || p.paymentMethod === 'BANK_TRANSFER' || p.paymentMethod === 'CARD'
            ? 'ONLINE'
            : p.paymentMethod === 'NO_PAYMENT' || p.paymentMethod === 'CREDIT'
            ? 'NO_PAYMENT'
            : 'CASH'
        );

        const loadedItems: BillProductItem[] = p.items.map((item, idx) => {
          const prod = products.find((prodItem) => prodItem.id === item.productId);
          let unitCostToUse = item.unitCost;
          if (
            prod &&
            typeof prod.purchasePrice === 'number' &&
            prod.purchasePrice > 0 &&
            typeof prod.actualPurchasePrice === 'number' &&
            Math.abs(item.unitCost - prod.actualPurchasePrice) < 0.01 &&
            Math.abs(prod.purchasePrice - prod.actualPurchasePrice) >= 0.01
          ) {
            unitCostToUse = prod.purchasePrice;
          }

          const lineTotal = Math.round(item.quantityBought * unitCostToUse * 100) / 100;

          return {
            tempId: item.id || `edit-item-${idx}-${Date.now()}`,
            productId: item.productId || '',
            product: prod || {
              id: item.productId || 'temp',
              companyId: session.companyId,
              categoryId: '',
              name: item.productName,
              barcode: item.barcode,
              stockQuantity: item.currentStock,
              isArchived: false,
              createdAt: item.createdAt,
              updatedAt: item.updatedAt,
              categoryName: item.categoryName || 'General',
              fieldValues: [],
              stockDisplay: item.currentStock,
              calculatedJewelleryPrice: null,
              pricingError: null,
              purchasePrice: unitCostToUse,
              purchaseRatePerGram: null,
              purchaseMakingChargesPerGram: null,
              additionalChargesPercentage: null,
              actualPurchasePrice: unitCostToUse,
              actualPurchasePriceCode: null,
              sellingPrice: null,
              marginPercentage: null,
              vendorId: p.vendorId,
              vendorName: p.vendorName,
              vendorPhone: p.vendorPhone,
              purchaseDate: p.purchaseDate,
            },
            name: item.productName,
            barcode: item.barcode,
            categoryName: item.categoryName || 'General',
            currentStock: item.currentStock,
            quantityBought: item.quantityBought,
            unitCost: unitCostToUse,
            taxRate: item.taxRate || 0,
            taxAmount: item.taxAmount || 0,
            lineTotal,
          };
        });
        setItems(loadedItems);
      } catch (err) {
        if (!isCurrent) return;
        showError(err instanceof Error ? err.message : 'Error loading purchase bill');
      } finally {
        if (isCurrent) {
          setLoadingPurchase(false);
        }
      }
    };

    void fetchBill();

    return () => {
      isCurrent = false;
    };
  }, [editingPurchaseId]);



  // Calculate Subtotals & Grand Total directly from Purchase Price (₹)
  const grandTotal = Math.round(
    items.reduce((acc, it) => acc + (it.lineTotal || (it.quantityBought * it.unitCost)), 0) * 100
  ) / 100;

  const totalUnits = Math.round(
    items.reduce((acc, it) => acc + it.quantityBought, 0) * 100
  ) / 100;

  // Handle Quick Add Vendor
  const handleQuickAddVendorSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = quickVendorName.trim();
    if (!trimmed) {
      showError('Please enter a vendor / supplier name.');
      return;
    }

    setQuickVendorSubmitting(true);
    try {
      const created = await createVendor({
        name: trimmed,
        phoneNumber: quickVendorPhone.trim() || undefined,
      });

      if (created) {
        showSuccess(`Vendor "${created.name}" created and selected!`);
        setSelectedVendorId(created.id);
        setIsQuickAddVendorOpen(false);
        setQuickVendorName('');
        setQuickVendorPhone('');
      }
    } finally {
      setQuickVendorSubmitting(false);
    }
  };

  // Helper to add product to bill items
  const addProductToBill = (prod: ProductDto, initialQuantity?: number) => {
    // Check if already in bill
    const existingIndex = items.findIndex((it) => it.productId === prod.id);
    if (existingIndex >= 0) {
      const updated = [...items];
      const target = updated[existingIndex];
      const newQty = target.quantityBought + (initialQuantity || 1);
      const lineSubtotal = Math.round(newQty * target.unitCost * 100) / 100;
      const lineTax = Math.round(lineSubtotal * (target.taxRate / 100) * 100) / 100;
      updated[existingIndex] = {
        ...target,
        quantityBought: newQty,
        taxAmount: lineTax,
        lineTotal: Math.round((lineSubtotal + lineTax) * 100) / 100,
      };
      setItems(updated);
      showInfo(`Updated quantity for "${prod.name}" to ${newQty}.`);
      return;
    }

    // Determine default purchase cost: Purchase Price (₹) first, not actual purchase price
    const cost =
      prod.purchasePrice !== null && prod.purchasePrice !== undefined && prod.purchasePrice > 0
        ? prod.purchasePrice
        : prod.actualPurchasePrice !== null && prod.actualPurchasePrice !== undefined
        ? prod.actualPurchasePrice
        : 0;

    const qty = initialQuantity && initialQuantity > 0 ? initialQuantity : 1;
    const lineTotal = Math.round(qty * cost * 100) / 100;

    const newItem: BillProductItem = {
      tempId: `bill_item_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      productId: prod.id,
      product: prod,
      name: prod.name,
      barcode: prod.barcode,
      categoryName: prod.categoryName || 'General',
      currentStock: prod.stockQuantity || 0,
      quantityBought: qty,
      unitCost: cost,
      taxRate: 0,
      taxAmount: 0,
      lineTotal,
    };

    setItems((prev) => [newItem, ...prev]);
    showSuccess(`Added "${prod.name}" to the bill.`);
  };

  // Callback when a product is saved from ProductFormModal (Created or Edited)
  const handleProductSavedFromForm = async (saved: ProductDto) => {
    if (editingBillProduct) {
      // User edited an existing product from the bill: prefer purchasePrice
      const newCost =
        saved.purchasePrice !== null && saved.purchasePrice !== undefined && saved.purchasePrice > 0
          ? saved.purchasePrice
          : saved.actualPurchasePrice !== null && saved.actualPurchasePrice !== undefined
          ? saved.actualPurchasePrice
          : null;

      const newQty = saved.stockQuantity && saved.stockQuantity > 0 ? saved.stockQuantity : 1;

      setItems((prev) =>
        prev.map((it) => {
          if (it.productId !== saved.id) return it;
          const costToUse = newCost !== null ? newCost : it.unitCost;
          const qtyToUse = newQty;
          return {
            ...it,
            product: saved,
            name: saved.name,
            barcode: saved.barcode,
            categoryName: saved.categoryName || it.categoryName,
            quantityBought: qtyToUse,
            unitCost: costToUse,
            lineTotal: Math.round(qtyToUse * costToUse * 100) / 100,
          };
        })
      );
      void refreshProducts();
      setEditingBillProduct(null);
      setIsAddProductModalOpen(false);
      showSuccess(`Updated "${saved.name}" in catalog and bill.`);
    } else {
      // User created a brand new product
      const modalEnteredQty =
        saved.stockQuantity && saved.stockQuantity > 0 ? saved.stockQuantity : 1;

      // Refresh products catalog in background
      void refreshProducts();

      // Automatically add to bill
      addProductToBill(saved, modalEnteredQty);
      setIsAddProductModalOpen(false);
      showSuccess(`Product "${saved.name}" created and added to bill.`);
    }
  };

  // Open Edit Product Modal for an item in the bill
  const handleOpenEditProduct = async (item: BillProductItem) => {
    let target = products.find((p) => p.id === item.productId) || item.product;
    if (item.productId && (!target.categoryId || !target.fieldValues || target.fieldValues.length === 0)) {
      try {
        const full = await ipcClient.getProductById(item.productId);
        if (full.success && full.data) {
          target = full.data;
        }
      } catch {}
    }
    if (!target.categoryId && categories.length > 0) {
      const matched = categories.find(
        (c) => c.name.toLowerCase() === (target.categoryName || item.categoryName || '').toLowerCase()
      );
      if (matched) {
        target = { ...target, categoryId: matched.id };
      } else {
        target = { ...target, categoryId: categories[0].id };
      }
    }
    const productForModal: ProductDto = {
      ...target,
      stockQuantity: item.quantityBought,
    };
    setEditingBillProduct(productForModal);
    setIsAddProductModalOpen(true);
  };



  const removeItem = (tempId: string) => {
    setItems((prev) => prev.filter((it) => it.tempId !== tempId));
  };

  const handleClearAll = () => {
    if (items.length === 0) return;
    if (window.confirm('Clear all products from the current purchase bill?')) {
      setItems([]);
    }
  };

  // Open Barcode Print Modal for an item
  const handleOpenPrintBarcode = (item: BillProductItem) => {
    setPrintingProduct(item.product);
    setPrintingCopies(Math.max(1, Math.round(item.quantityBought)));
  };

  // Save Purchase Bill
  const handleSavePurchaseBill = async () => {
    if (!selectedVendorId) {
      showError('Please select a vendor / supplier.');
      return;
    }

    const trimmedInv = invoiceNumber.trim();
    if (!trimmedInv) {
      showError('Please enter the vendor invoice / bill number.');
      return;
    }

    if (items.length === 0) {
      showError('Please add at least one product to the purchase bill.');
      return;
    }

    // Verify all quantities
    for (const it of items) {
      if (it.quantityBought <= 0) {
        showError(`Purchased quantity for "${it.name}" must be greater than 0.`);
        return;
      }
    }

    setSubmitting(true);
    try {
      const payloadItems: CreatePurchaseItemInput[] = items.map((it) => ({
        productId: it.productId,
        quantityBought: it.quantityBought,
        unitCost: it.unitCost,
        taxRate: 0,
        taxAmount: 0,
        totalAmount: it.lineTotal,
      }));

      const isNoPayment = paymentMethod === 'NO_PAYMENT';
      const paid = isNoPayment ? 0 : grandTotal;
      const status: PurchasePaymentStatus = isNoPayment ? 'UNPAID' : 'PAID';
      const paymentDateVal = isNoPayment ? null : purchaseDate;

      if (editingPurchaseId) {
        const res = await updatePurchase({
          id: editingPurchaseId,
          vendorId: selectedVendorId,
          invoiceNumber: trimmedInv,
          purchaseDate,
          paymentDate: paymentDateVal,
          paymentMethod,
          paymentStatus: status,
          amountPaid: paid,
          items: payloadItems,
        });

        if (res) {
          showSuccess(
            `Purchase bill "${res.purchaseNumber}" successfully updated! Stock inventory has been adjusted.`
          );
          setSavedPurchase(res);
        }
      } else {
        const res = await createPurchase({
          vendorId: selectedVendorId,
          invoiceNumber: trimmedInv,
          purchaseDate,
          paymentDate: paymentDateVal,
          paymentMethod,
          paymentStatus: status,
          amountPaid: paid,
          items: payloadItems,
        });

        if (res) {
          showSuccess(
            `Purchase bill "${res.purchaseNumber}" saved! Inventory has been updated for ${items.length} products.`
          );
          setSavedPurchase(res);
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleStartNewBill = () => {
    setSavedPurchase(null);
    setItems([]);
    setInvoiceNumber('');
    if (editingPurchaseId && onCancelEdit) {
      onCancelEdit();
    }
  };

  return (
    <div className="space-y-6 select-text max-w-7xl mx-auto pb-12">
      {/* Top Banner & Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-cream-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-md border border-amber-200">
              {editingPurchaseId ? 'Edit Bill Register' : 'Inward Stock Register'}
            </span>
            <span className="text-[11px] font-semibold text-stone-500">
              {session.companyName || 'Company Admin'}
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-stone-900">
            {editingPurchaseId ? 'Edit Purchase Bill' : 'Purchase Entry'}
          </h1>
          <p className="mt-0.5 text-xs text-stone-500">
            {editingPurchaseId
              ? 'Edit vendor invoice details, modify purchased products and quantities, adjust unit costs, and update warehouse stock.'
              : 'Log vendor purchase bills, create new products for each inward item, calculate GST totals, and update warehouse stock.'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {editingPurchaseId && onCancelEdit && (
            <button
              type="button"
              onClick={onCancelEdit}
              className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 px-3.5 py-2 text-xs font-bold text-amber-900 shadow-xs transition"
            >
              Cancel Edit
            </button>
          )}

          <button
            type="button"
            onClick={onNavigateToHistory}
            className="inline-flex items-center gap-1.5 rounded-xl border border-cream-300 bg-white hover:bg-cream-100 px-3.5 py-2 text-xs font-bold text-stone-700 shadow-xs transition"
          >
            <svg className="h-4 w-4 text-stone-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Purchase History
          </button>
        </div>
      </div>

      {/* Edit Mode Alert Banner */}
      {editingPurchaseId && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50/90 p-4 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-600 text-white shadow-xs">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-900">
                  Editing Purchase Bill Mode
                </span>
                {currentEditingPurchase?.purchaseNumber && (
                  <span className="rounded-md bg-amber-200/80 px-2 py-0.5 font-mono text-[11px] font-bold text-amber-950">
                    {currentEditingPurchase.purchaseNumber}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-amber-800 mt-0.5">
                Modifying bill items, quantities, or unit costs will automatically reconcile warehouse inventory stock levels upon updating.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onCancelEdit && (
              <button
                type="button"
                onClick={onCancelEdit}
                className="rounded-xl border border-amber-300 bg-white hover:bg-amber-100 px-3.5 py-1.5 text-xs font-bold text-amber-900 shadow-xs transition"
              >
                Cancel Edit
              </button>
            )}
          </div>
        </div>
      )}

      {loadingPurchase && (
        <div className="flex h-48 items-center justify-center rounded-2xl border border-cream-300 bg-white p-6 shadow-xs">
          <div className="flex items-center gap-2.5 text-xs text-stone-600">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-amber-600 border-t-transparent" />
            <span>Loading purchase bill details...</span>
          </div>
        </div>
      )}

      {/* Bill Inward Header: Vendor, Invoice Number, Date, Payment Method */}
      <div className={`rounded-2xl border border-cream-300 bg-white p-5 shadow-xs ${loadingPurchase ? 'opacity-50 pointer-events-none' : ''}`}>
        <div className="text-xs font-bold uppercase tracking-wider text-stone-600 mb-4 flex items-center justify-between">
          <span>1. Vendor Bill & Invoice Details</span>
          <span className="text-[11px] font-normal text-stone-400">All fields required for inward tax registration</span>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Vendor Picker */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-stone-700">Vendor / Supplier *</label>
              <button
                type="button"
                onClick={() => setIsQuickAddVendorOpen(true)}
                className="text-[11px] font-bold text-amber-700 hover:text-amber-800 underline underline-offset-2 transition"
              >
                + New Vendor
              </button>
            </div>
            <select
              id="purchase-vendor-select"
              value={selectedVendorId}
              onChange={(e) => setSelectedVendorId(e.target.value)}
              className="w-full rounded-xl border border-cream-300 bg-cream-50/50 px-3 py-2 text-xs font-medium text-stone-900 focus:border-amber-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-600/20"
            >
              <option value="">-- Select Vendor --</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} {v.phoneNumber ? `(${v.phoneNumber})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Vendor Invoice / Bill Number */}
          <div>
            <label className="block text-xs font-bold text-stone-700 mb-1.5">
              Vendor Invoice / Bill No. *
            </label>
            <input
              id="purchase-invoice-number-input"
              type="text"
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              placeholder="e.g. INV-2026-9901"
              className="w-full rounded-xl border border-cream-300 bg-cream-50/50 px-3.5 py-2 text-xs font-medium text-stone-900 placeholder-stone-400 focus:border-amber-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-600/20 uppercase"
            />
          </div>

          {/* Purchase Date */}
          <div>
            <label className="block text-xs font-bold text-stone-700 mb-1.5">
              Purchase Date *
            </label>
            <input
              id="purchase-date-input"
              type="date"
              value={purchaseDate}
              onChange={(e) => setPurchaseDate(e.target.value)}
              className="w-full rounded-xl border border-cream-300 bg-cream-50/50 px-3.5 py-2 text-xs font-medium text-stone-900 focus:border-amber-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-600/20"
            />
          </div>

          {/* Payment Method */}
          <div>
            <label className="block text-xs font-bold text-stone-700 mb-1.5">
              Payment Method *
            </label>
            <select
              id="purchase-payment-method-select"
              value={paymentMethod}
              onChange={(e) => {
                setPaymentMethod(e.target.value as PurchasePaymentMethod);
              }}
              className="w-full rounded-xl border border-cream-300 bg-cream-50/50 px-3 py-2 text-xs font-semibold text-stone-900 focus:border-amber-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-600/20"
            >
              <option value="CASH">Cash</option>
              <option value="ONLINE">Online</option>
              <option value="NO_PAYMENT">No Payment</option>
            </select>
          </div>
        </div>
      </div>

      {/* Product Inward Section: Create New Product */}
      <div className="rounded-2xl border border-cream-300 bg-white p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-stone-600">
                2. Inward Products
              </span>
              <span className="rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-[11px] font-bold text-amber-800">
                {items.length} {items.length === 1 ? 'Product' : 'Products'} in Bill
              </span>
            </div>
            <p className="text-[11px] text-stone-500 mt-1">
              Every inward item must be registered as a new product in your catalog with category specifications, purchase rate, and barcode.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              id="btn-add-product-modal"
              type="button"
              onClick={() => {
                setEditingBillProduct(null);
                setIsAddProductModalOpen(true);
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-amber-600 hover:bg-amber-500 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition shadow-amber-600/20 active:scale-98"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
              + Create New Product
            </button>
          </div>
        </div>

        {items.length === 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 rounded-xl border border-dashed border-amber-300/80 bg-amber-50/40 p-3.5">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-800 shrink-0">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              </div>
              <div className="text-xs">
                <span className="font-bold text-stone-800">No products added yet.</span>{' '}
                <span className="text-stone-500">Each purchase entry registers a new product in the store catalog.</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setEditingBillProduct(null);
                setIsAddProductModalOpen(true);
              }}
              className="text-xs font-bold text-amber-700 hover:text-amber-800 hover:underline transition whitespace-nowrap"
            >
              + Open Product Form →
            </button>
          </div>
        )}
      </div>

      {/* Bill Items Table */}
      <div className="overflow-hidden rounded-2xl border border-cream-300 bg-white shadow-sm">
        <div className="p-4 border-b border-cream-200 flex items-center justify-between">
          <div className="text-xs font-bold uppercase tracking-wider text-stone-700 flex items-center gap-2">
            <span>Bill Line Items</span>
            <span className="rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-[11px] font-bold">
              {items.length} {items.length === 1 ? 'Product' : 'Products'}
            </span>
          </div>

          {items.length > 0 && (
            <button
              type="button"
              onClick={handleClearAll}
              className="text-xs text-rose-600 hover:text-rose-800 font-semibold transition"
            >
              Clear All Items
            </button>
          )}
        </div>

        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cream-100 text-stone-400 border border-cream-300">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
              </svg>
            </div>
            <h3 className="mt-3 text-sm font-bold text-stone-800">
              No products added to this purchase bill yet
            </h3>
            <p className="mt-1 text-xs text-stone-500 max-w-sm">
              Click <strong>"+ Create New Product"</strong> to register a new product across any category and add it to this purchase bill.
            </p>
            <button
              type="button"
              onClick={() => {
                setEditingBillProduct(null);
                setIsAddProductModalOpen(true);
              }}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-amber-600 hover:bg-amber-500 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition shadow-amber-600/20 active:scale-98"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
              + Create New Product
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-cream-200 bg-cream-50/75 uppercase tracking-wider text-stone-600 font-bold">
                <tr>
                  <th className="px-4 py-3 w-10 text-center">#</th>
                  <th className="px-4 py-3">Product Name & Category</th>
                  <th className="px-4 py-3">Barcode</th>
                  <th className="px-4 py-3 text-center">Current Stock</th>
                  <th className="px-4 py-3 text-center whitespace-nowrap">Purchase Qty</th>
                  <th className="px-4 py-3 text-right whitespace-nowrap">Purchase Price (₹)</th>
                  <th className="px-4 py-3 text-right">Total (₹)</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-200/80">
                {items.map((item, idx) => (
                  <tr key={item.tempId} className="transition hover:bg-cream-50/50">
                    <td className="px-4 py-3 text-center text-stone-400 font-bold">
                      {idx + 1}
                    </td>

                    {/* Product Name & Category */}
                    <td className="px-4 py-3">
                      <div className="font-bold text-stone-900 text-xs">{item.name}</div>
                      <div className="text-[11px] text-stone-400 mt-0.5">{item.categoryName}</div>
                    </td>

                    {/* Barcode */}
                    <td className="px-4 py-3 font-mono font-bold text-amber-800">
                      {item.barcode}
                    </td>

                    {/* Current Stock */}
                    <td className="px-4 py-3 text-center">
                      <span className="rounded bg-stone-100 px-2 py-0.5 text-[11px] font-semibold text-stone-600">
                        {item.currentStock}
                      </span>
                    </td>

                    {/* Purchase Quantity - Controlled via Product Modal */}
                    <td className="px-4 py-3 text-center whitespace-nowrap">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-amber-50 text-amber-900 font-bold text-xs border border-amber-200">
                        {item.quantityBought}
                      </span>
                    </td>

                    {/* Purchase Price (Unit Cost) - Controlled via Product Modal */}
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="font-mono font-bold text-stone-900 text-xs">
                        ₹{item.unitCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </div>
                      {item.product.actualPurchasePrice !== null &&
                        item.product.actualPurchasePrice !== undefined &&
                        item.product.actualPurchasePrice !== item.unitCost && (
                          <div
                            className="text-[10px] text-stone-400 font-normal mt-0.5"
                            title="Internal Actual Landed Cost including overheads"
                          >
                            Actual: ₹{item.product.actualPurchasePrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </div>
                        )}
                    </td>

                    {/* Line Total */}
                    <td className="px-4 py-3 text-right font-bold text-stone-900 font-mono whitespace-nowrap">
                      ₹{item.lineTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>

                    {/* Actions: Edit Product (Modal), Print Barcode & Remove */}
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleOpenEditProduct(item)}
                          className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-900 transition"
                          title="Open Product Modal to edit quantity, purchase price, or attributes"
                        >
                          <svg className="h-3.5 w-3.5 text-amber-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                          Edit Product
                        </button>

                        <button
                          type="button"
                          onClick={() => handleOpenPrintBarcode(item)}
                          className="inline-flex items-center gap-1 rounded-lg border border-cream-300 bg-white hover:bg-cream-100 px-2 py-1 text-[11px] font-bold text-stone-700 transition"
                          title="Print Barcode Labels for purchased quantity"
                        >
                          <svg className="h-3 w-3 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                          </svg>
                          Barcode
                        </button>

                        <button
                          type="button"
                          onClick={() => removeItem(item.tempId)}
                          className="rounded-lg p-1 text-stone-400 hover:bg-rose-50 hover:text-rose-600 transition"
                          title="Remove item"
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

      {/* Bill Totals & Submission Bottom Area */}
      <div className="rounded-2xl border border-cream-300 bg-white p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          {/* Left: Summary Stats */}
          <div className="flex flex-wrap items-center gap-6 text-xs">
            <div>
              <span className="text-stone-400 block font-semibold">Total Line Products</span>
              <span className="text-base font-bold text-stone-900">{items.length}</span>
            </div>

            <div className="border-l border-cream-200 pl-6">
              <span className="text-stone-400 block font-semibold">Total Units Inward</span>
              <span className="text-base font-bold text-stone-900">{totalUnits} units</span>
            </div>

            <div className="border-l border-cream-200 pl-6">
              <span className="text-stone-400 block font-semibold">Total Bill Amount</span>
              <span className="text-base font-bold text-stone-900 font-mono">
                ₹{grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {/* Right: Grand Total & Save Button */}
          <div className="flex items-center gap-4">
            <div className="text-right">
              <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider block">
                Grand Total Amount
              </span>
              <span className="text-2xl font-black text-amber-700 font-mono">
                ₹{grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>

            <button
              id="btn-save-purchase-bill"
              type="button"
              disabled={submitting || items.length === 0}
              onClick={handleSavePurchaseBill}
              className="inline-flex items-center gap-2 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed px-6 py-3.5 text-sm font-bold text-white shadow-md transition shadow-amber-600/30"
            >
              {submitting ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  {editingPurchaseId ? 'Updating Purchase Bill...' : 'Saving Bill & Updating Stock...'}
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  {editingPurchaseId ? 'Update Purchase Bill' : 'Save Purchase Bill'}
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* SUCCESS CONFIRMATION MODAL */}
      {savedPurchase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-2xl border border-cream-300 bg-white p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-bold text-stone-900">
                  {editingPurchaseId
                    ? 'Purchase Bill Successfully Updated!'
                    : 'Purchase Bill Successfully Saved!'}
                </h3>
                <p className="text-xs text-stone-500">
                  {editingPurchaseId
                    ? 'Inventory stock levels have been reconciled and updated.'
                    : 'Stock inventory has been increased for all purchased items.'}
                </p>
              </div>
            </div>

            <div className="mt-5 rounded-xl border border-cream-300 bg-cream-50/70 p-4 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-stone-500 font-semibold">Purchase ID:</span>
                <span className="font-mono font-bold text-stone-900">{savedPurchase.purchaseNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500 font-semibold">Vendor Invoice:</span>
                <span className="font-mono font-bold text-stone-900">{savedPurchase.invoiceNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500 font-semibold">Vendor Name:</span>
                <span className="font-bold text-stone-900">{savedPurchase.vendorName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500 font-semibold">Products / Units:</span>
                <span className="font-bold text-stone-900">
                  {savedPurchase.totalProductsCount} products ({savedPurchase.totalUnitsBought} units)
                </span>
              </div>
              <div className="flex justify-between border-t border-cream-200 pt-2 text-sm font-bold">
                <span className="text-stone-900">Total Amount:</span>
                <span className="text-amber-700 font-mono">
                  ₹{savedPurchase.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            <div className="mt-6 flex flex-col sm:flex-row items-center gap-3">
              <button
                type="button"
                id="btn-print-saved-purchase-barcodes"
                onClick={() => setBatchPrintingPurchase(savedPurchase)}
                className="w-full sm:w-auto flex-1 inline-flex items-center justify-center gap-2 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 px-4 py-2.5 text-xs font-bold text-amber-900 transition"
                title={`Print all barcodes for this entry (${savedPurchase.totalUnitsBought} total stickers)`}
              >
                <svg className="h-4 w-4 text-amber-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                </svg>
                Print Entry Barcodes ({savedPurchase.totalUnitsBought} stickers)
              </button>

              <button
                type="button"
                onClick={onNavigateToHistory}
                className="w-full sm:w-auto inline-flex items-center justify-center rounded-xl border border-cream-300 bg-white hover:bg-cream-100 px-4 py-2.5 text-xs font-bold text-stone-700 transition"
              >
                View in History
              </button>

              <button
                type="button"
                onClick={handleStartNewBill}
                className="w-full sm:w-auto inline-flex items-center justify-center rounded-xl bg-amber-600 hover:bg-amber-500 px-4 py-2.5 text-xs font-bold text-white transition"
              >
                {editingPurchaseId ? 'Return to History' : '+ New Bill'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QUICK ADD VENDOR MODAL */}
      {isQuickAddVendorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl border border-cream-300 bg-white p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-cream-200 pb-3">
              <h3 className="text-base font-bold text-stone-900">
                Quick Add Vendor / Supplier
              </h3>
              <button
                type="button"
                onClick={() => setIsQuickAddVendorOpen(false)}
                className="text-stone-400 hover:text-stone-600"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleQuickAddVendorSubmit} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  Vendor Name *
                </label>
                <input
                  type="text"
                  required
                  value={quickVendorName}
                  onChange={(e) => setQuickVendorName(e.target.value)}
                  placeholder="e.g. S.K. Bullion & Gems"
                  className="w-full rounded-xl border border-cream-300 bg-cream-50/50 px-3.5 py-2 text-xs text-stone-900 focus:border-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-600/20"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  Phone Number (Optional)
                </label>
                <input
                  type="text"
                  value={quickVendorPhone}
                  onChange={(e) => setQuickVendorPhone(e.target.value)}
                  placeholder="e.g. 9876543210"
                  className="w-full rounded-xl border border-cream-300 bg-cream-50/50 px-3.5 py-2 text-xs text-stone-900 focus:border-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-600/20"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsQuickAddVendorOpen(false)}
                  className="rounded-xl border border-cream-300 px-4 py-2 text-xs font-semibold text-stone-600 hover:bg-cream-100 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={quickVendorSubmitting}
                  className="rounded-xl bg-amber-600 hover:bg-amber-500 px-4 py-2 text-xs font-bold text-white transition disabled:opacity-50"
                >
                  {quickVendorSubmitting ? 'Saving...' : 'Add Vendor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* THE PRODUCT FORM MODAL — 100% UNCHANGED FIELDS, VALIDATIONS, & UI */}
      <ProductFormModal
        isOpen={isAddProductModalOpen}
        onClose={() => {
          setIsAddProductModalOpen(false);
          setEditingBillProduct(null);
        }}
        onSaved={handleProductSavedFromForm}
        editingProduct={editingBillProduct}
        session={session}
        categories={categories}
        defaultVendorId={selectedVendorId || null}
        defaultPurchaseDate={purchaseDate || null}
      />

      {/* BARCODE PRINT MODAL INTEGRATION */}
      {printingProduct && (
        <BarcodePrintModal
          isOpen={Boolean(printingProduct)}
          onClose={() => setPrintingProduct(null)}
          product={printingProduct}
          session={session}
          initialCopies={printingCopies}
        />
      )}

      {/* BATCH BARCODE PRINT MODAL INTEGRATION (Prints all products in this purchase entry) */}
      {batchPrintingPurchase && (
        <BatchBarcodePrintModal
          isOpen={Boolean(batchPrintingPurchase)}
          onClose={() => setBatchPrintingPurchase(null)}
          purchase={batchPrintingPurchase}
          session={session}
          products={products}
        />
      )}
    </div>
  );
};
