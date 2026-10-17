import React, { useState, useEffect } from 'react';
import type {
  AuthSessionPayload,
  CreateProductRequest,
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
import { ProductFormModal, FormBillItemDetails } from '../components/ProductFormModal';
import { BarcodePrintModal } from '../components/BarcodePrintModal';
import { BatchBarcodePrintModal } from '../components/BatchBarcodePrintModal';
import { ipcClient } from '../services/ipcClient';
import { getLocalDateString } from '../../shared/utils/date';

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
  itemDescription?: string;
  barcode: string;
  categoryName: string;
  hsnCode?: string;
  currentStock: number;
  quantityBought: number;
  unitCost: number; // Rate
  discount: number; // Disc (₹)
  taxableAmount: number; // Total before tax = (qty * rate) - disc
  cgstRate: number;
  cgstAmount: number;
  sgstRate: number;
  sgstAmount: number;
  igstRate: number;
  igstAmount: number;
  taxRate: number; // Combined GST rate
  taxAmount: number; // Combined GST amount
  lineTotal: number; // Final Total
  productDraft?: CreateProductRequest;
}

export const PurchaseEntryPage: React.FC<PurchaseEntryPageProps> = ({
  session,
  onNavigateToHistory,
  editingPurchaseId,
  onCancelEdit,
}) => {
  const { showError, showSuccess } = useToast();
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
    getLocalDateString()
  );
  const [paymentMethod, setPaymentMethod] = useState<PurchasePaymentMethod>('CASH');

  // E-way bill & Transport Details State
  const [ewayBillNumber, setEwayBillNumber] = useState<string>('');
  const [transporterName, setTransporterName] = useState<string>('');
  const [vehicleNumber, setVehicleNumber] = useState<string>('');

  // Bill Items State
  const [items, setItems] = useState<BillProductItem[]>([]);

  // Quick Add Vendor Modal State
  const [isQuickAddVendorOpen, setIsQuickAddVendorOpen] = useState<boolean>(false);
  const [quickVendorName, setQuickVendorName] = useState<string>('');
  const [quickVendorPhone, setQuickVendorPhone] = useState<string>('');
  const [quickVendorAddress, setQuickVendorAddress] = useState<string>('');
  const [quickVendorGst, setQuickVendorGst] = useState<string>('');
  const [quickVendorBankName, setQuickVendorBankName] = useState<string>('');
  const [quickVendorAccountNo, setQuickVendorAccountNo] = useState<string>('');
  const [quickVendorIfsc, setQuickVendorIfsc] = useState<string>('');
  const [quickVendorSubmitting, setQuickVendorSubmitting] = useState<boolean>(false);

  // Add / Edit Product Modal State (All product & inward details managed via form)
  const [isAddProductModalOpen, setIsAddProductModalOpen] = useState<boolean>(false);
  const [editingBillProduct, setEditingBillProduct] = useState<ProductDto | null>(null);
  const [editingBillTempId, setEditingBillTempId] = useState<string | null>(null);
  const [editingBillItemData, setEditingBillItemData] = useState<FormBillItemDetails | null>(null);

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
        setEwayBillNumber(p.ewayBillNumber || '');
        setTransporterName(p.transporterName || '');
        setVehicleNumber(p.vehicleNumber || '');
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

          const gross = Math.round(item.quantityBought * unitCostToUse * 100) / 100;
          const discount = item.discount || 0;
          const taxableAmount = item.taxableAmount !== undefined && item.taxableAmount !== null
            ? item.taxableAmount
            : Math.max(0, gross - discount);

          const cgstRate = item.cgstRate || 0;
          const cgstAmount = item.cgstAmount || (cgstRate > 0 ? Math.round(taxableAmount * (cgstRate / 100) * 100) / 100 : 0);
          const sgstRate = item.sgstRate || 0;
          const sgstAmount = item.sgstAmount || (sgstRate > 0 ? Math.round(taxableAmount * (sgstRate / 100) * 100) / 100 : 0);
          const igstRate = item.igstRate || 0;
          const igstAmount = item.igstAmount || (igstRate > 0 ? Math.round(taxableAmount * (igstRate / 100) * 100) / 100 : 0);
          const taxAmount = item.taxAmount || (cgstAmount + sgstAmount + igstAmount);
          const lineTotal = item.totalAmount || Math.round((taxableAmount + taxAmount) * 100) / 100;

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
            itemDescription: item.itemDescription || '',
            barcode: item.barcode,
            categoryName: item.categoryName || 'General',
            hsnCode: item.hsnCode || '',
            currentStock: item.currentStock,
            quantityBought: item.quantityBought,
            unitCost: unitCostToUse,
            discount,
            taxableAmount,
            cgstRate,
            cgstAmount,
            sgstRate,
            sgstAmount,
            igstRate,
            igstAmount,
            taxRate: item.taxRate || (cgstRate + sgstRate + igstRate),
            taxAmount,
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

  // Calculation Helper
  const calculateItemTotals = (
    qty: number,
    unitCost: number,
    discount: number,
    cgstRate: number,
    sgstRate: number,
    igstRate: number
  ) => {
    const safeQty = isNaN(qty) || qty <= 0 ? 0 : qty;
    const safeCost = isNaN(unitCost) || unitCost < 0 ? 0 : unitCost;
    const safeDiscount = isNaN(discount) || discount < 0 ? 0 : discount;
    const gross = Math.round(safeQty * safeCost * 100) / 100;
    const taxableAmount = Math.max(0, Math.round((gross - safeDiscount) * 100) / 100);

    const safeCgstRate = isNaN(cgstRate) || cgstRate < 0 ? 0 : cgstRate;
    const safeSgstRate = isNaN(sgstRate) || sgstRate < 0 ? 0 : sgstRate;
    const safeIgstRate = isNaN(igstRate) || igstRate < 0 ? 0 : igstRate;

    const cgstAmount = safeCgstRate > 0 ? Math.round(taxableAmount * (safeCgstRate / 100) * 100) / 100 : 0;
    const sgstAmount = safeSgstRate > 0 ? Math.round(taxableAmount * (safeSgstRate / 100) * 100) / 100 : 0;
    const igstAmount = safeIgstRate > 0 ? Math.round(taxableAmount * (safeIgstRate / 100) * 100) / 100 : 0;

    const taxAmount = Math.round((cgstAmount + sgstAmount + igstAmount) * 100) / 100;
    const taxRate = safeCgstRate + safeSgstRate + safeIgstRate;
    const lineTotal = Math.round((taxableAmount + taxAmount) * 100) / 100;

    return {
      taxableAmount,
      cgstRate: safeCgstRate,
      cgstAmount,
      sgstRate: safeSgstRate,
      sgstAmount,
      igstRate: safeIgstRate,
      igstAmount,
      taxRate,
      taxAmount,
      lineTotal,
    };
  };



  // Calculate Subtotals, Taxes & Grand Total
  const totalTaxable = Math.round(
    items.reduce((acc, it) => acc + (it.taxableAmount || 0), 0) * 100
  ) / 100;

  const totalCgst = Math.round(
    items.reduce((acc, it) => acc + (it.cgstAmount || 0), 0) * 100
  ) / 100;

  const totalSgst = Math.round(
    items.reduce((acc, it) => acc + (it.sgstAmount || 0), 0) * 100
  ) / 100;

  const totalIgst = Math.round(
    items.reduce((acc, it) => acc + (it.igstAmount || 0), 0) * 100
  ) / 100;

  const totalTax = Math.round((totalCgst + totalSgst + totalIgst) * 100) / 100;

  const grandTotal = Math.round((totalTaxable + totalTax) * 100) / 100;

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
        address: quickVendorAddress.trim() || undefined,
        gstNumber: quickVendorGst.trim().toUpperCase() || undefined,
        bankName: quickVendorBankName.trim() || undefined,
        accountNumber: quickVendorAccountNo.trim() || undefined,
        ifscCode: quickVendorIfsc.trim().toUpperCase() || undefined,
      });

      if (created) {
        showSuccess(`Vendor "${created.name}" created and selected!`);
        setSelectedVendorId(created.id);
        setIsQuickAddVendorOpen(false);
        setQuickVendorName('');
        setQuickVendorPhone('');
        setQuickVendorAddress('');
        setQuickVendorGst('');
        setQuickVendorBankName('');
        setQuickVendorAccountNo('');
        setQuickVendorIfsc('');
      }
    } finally {
      setQuickVendorSubmitting(false);
    }
  };



  // Open Add Product Modal (Fresh form)
  const handleOpenAddProduct = () => {
    setEditingBillProduct(null);
    setEditingBillTempId(null);
    setEditingBillItemData(null);
    setIsAddProductModalOpen(true);
  };

  // Open Edit Product Modal for an item in the bill (All fields prefilled into form)
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
      purchasePrice: item.unitCost,
    };
    setEditingBillProduct(productForModal);
    setEditingBillTempId(item.tempId);
    setEditingBillItemData({
      itemDescription: item.itemDescription || '',
      hsnCode: item.hsnCode || '',
      quantityBought: item.quantityBought,
      unitCost: item.unitCost,
      discount: item.discount,
      taxableAmount: item.taxableAmount,
      cgstRate: item.cgstRate,
      cgstAmount: item.cgstAmount,
      sgstRate: item.sgstRate,
      sgstAmount: item.sgstAmount,
      igstRate: item.igstRate,
      igstAmount: item.igstAmount,
      lineTotal: item.lineTotal,
    });
    setIsAddProductModalOpen(true);
  };

  // Callback when a product is saved from ProductFormModal (Created or Edited via form)
  const handleProductSavedFromForm = async (
    saved: ProductDto,
    billDetails?: FormBillItemDetails,
    productDraft?: CreateProductRequest
  ) => {
    if (editingBillTempId) {
      // User edited an existing item from the bill via the form
      const qtyToUse = billDetails?.quantityBought ?? saved.stockQuantity ?? 1;
      const costToUse =
        billDetails?.unitCost !== undefined && billDetails.unitCost > 0
          ? billDetails.unitCost
          : saved.purchasePrice !== null && saved.purchasePrice !== undefined && saved.purchasePrice > 0
          ? saved.purchasePrice
          : saved.actualPurchasePrice !== null && saved.actualPurchasePrice !== undefined
          ? saved.actualPurchasePrice
          : 0;

      const discToUse = billDetails?.discount ?? 0;
      const cgstToUse = billDetails?.cgstRate ?? 0;
      const sgstToUse = billDetails?.sgstRate ?? 0;
      const igstToUse = billDetails?.igstRate ?? 0;

      const calcs = calculateItemTotals(
        qtyToUse,
        costToUse,
        discToUse,
        cgstToUse,
        sgstToUse,
        igstToUse
      );

      setItems((prev) =>
        prev.map((it) => {
          if (it.tempId !== editingBillTempId) return it;
          return {
            ...it,
            productId: saved.id,
            product: saved,
            name: saved.name,
            barcode: saved.barcode,
            categoryName: saved.categoryName || it.categoryName,
            itemDescription: billDetails?.itemDescription !== undefined ? billDetails.itemDescription : (it.itemDescription || ''),
            hsnCode: billDetails?.hsnCode !== undefined ? billDetails.hsnCode : (it.hsnCode || ''),
            quantityBought: qtyToUse,
            unitCost: costToUse,
            discount: discToUse,
            productDraft: productDraft || it.productDraft,
            ...calcs,
          };
        })
      );
      if (!saved.id.startsWith('draft_')) {
        void refreshProducts();
      }
      setEditingBillProduct(null);
      setEditingBillTempId(null);
      setEditingBillItemData(null);
      setIsAddProductModalOpen(false);
      showSuccess(`Updated "${saved.name}" in catalog and bill.`);
    } else {
      // User created a brand new product via the form
      const qtyToUse = billDetails?.quantityBought ?? (saved.stockQuantity && saved.stockQuantity > 0 ? saved.stockQuantity : 1);
      const costToUse =
        billDetails?.unitCost !== undefined && billDetails.unitCost > 0
          ? billDetails.unitCost
          : saved.purchasePrice !== null && saved.purchasePrice !== undefined && saved.purchasePrice > 0
          ? saved.purchasePrice
          : saved.actualPurchasePrice !== null && saved.actualPurchasePrice !== undefined
          ? saved.actualPurchasePrice
          : 0;

      const discToUse = billDetails?.discount ?? 0;
      const cgstToUse = billDetails?.cgstRate ?? 0;
      const sgstToUse = billDetails?.sgstRate ?? 0;
      const igstToUse = billDetails?.igstRate ?? 0;

      const calcs = calculateItemTotals(
        qtyToUse,
        costToUse,
        discToUse,
        cgstToUse,
        sgstToUse,
        igstToUse
      );

      const newItem: BillProductItem = {
        tempId: `bill_item_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        productId: saved.id,
        product: saved,
        name: saved.name,
        itemDescription: billDetails?.itemDescription || '',
        barcode: saved.barcode,
        categoryName: saved.categoryName || 'General',
        hsnCode: billDetails?.hsnCode || '',
        currentStock: saved.stockQuantity || 0,
        quantityBought: qtyToUse,
        unitCost: costToUse,
        discount: discToUse,
        productDraft,
        ...calcs,
      };

      setItems((prev) => [newItem, ...prev]);
      if (!saved.id.startsWith('draft_')) {
        void refreshProducts();
      }
      setEditingBillProduct(null);
      setEditingBillTempId(null);
      setEditingBillItemData(null);
      setIsAddProductModalOpen(false);
      showSuccess(`Product "${saved.name}" created and added to bill.`);
    }
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
        productName: it.name,
        barcode: it.barcode,
        categoryName: it.categoryName,
        itemDescription: it.itemDescription?.trim() || undefined,
        hsnCode: it.hsnCode?.trim() || undefined,
        quantityBought: it.quantityBought,
        unitCost: it.unitCost,
        discount: it.discount,
        taxableAmount: it.taxableAmount,
        cgstRate: it.cgstRate,
        cgstAmount: it.cgstAmount,
        sgstRate: it.sgstRate,
        sgstAmount: it.sgstAmount,
        igstRate: it.igstRate,
        igstAmount: it.igstAmount,
        taxRate: it.taxRate,
        taxAmount: it.taxAmount,
        totalAmount: it.lineTotal,
        productDraft: it.productDraft,
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
          ewayBillNumber: ewayBillNumber.trim() || undefined,
          transporterName: transporterName.trim() || undefined,
          vehicleNumber: vehicleNumber.trim() || undefined,
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
          void refreshProducts();
        }
      } else {
        const res = await createPurchase({
          vendorId: selectedVendorId,
          invoiceNumber: trimmedInv,
          purchaseDate,
          ewayBillNumber: ewayBillNumber.trim() || undefined,
          transporterName: transporterName.trim() || undefined,
          vehicleNumber: vehicleNumber.trim() || undefined,
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
          void refreshProducts();
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
    <div className="space-y-6 select-text max-w-7xl mx-auto pb-14">
      {/* Top Banner & Header */}
      <div className="relative overflow-hidden rounded-2xl border border-cream-300 bg-gradient-to-r from-white via-cream-50/70 to-amber-50/40 p-5 shadow-xs">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/80 bg-amber-100/70 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest text-amber-900">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-600 animate-pulse" />
                {editingPurchaseId ? 'Edit Bill Register' : 'Inward Stock Register'}
              </span>
              <span className="text-xs font-semibold text-stone-500">
                {session.companyName || 'Company Admin'}
              </span>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-stone-900">
              {editingPurchaseId ? 'Edit Purchase Bill' : 'Purchase Entry'}
            </h1>
            <p className="mt-1 text-xs text-stone-500 max-w-2xl">
              {editingPurchaseId
                ? 'Edit vendor invoice details, modify purchased products and quantities, adjust unit costs, and update warehouse stock.'
                : 'Log vendor purchase bills, inward inventory stock, itemized GST & tax calculation, and automatic barcode sticker generation.'}
            </p>
          </div>

          <div className="flex items-center gap-2.5 self-start sm:self-center">
            {editingPurchaseId && onCancelEdit && (
              <button
                type="button"
                onClick={onCancelEdit}
                className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50/80 hover:bg-amber-100 px-3.5 py-2 text-xs font-bold text-amber-900 shadow-xs transition active:scale-98"
              >
                Cancel Edit
              </button>
            )}

            <button
              type="button"
              onClick={onNavigateToHistory}
              className="inline-flex items-center gap-2 rounded-xl border border-cream-300 bg-white hover:bg-cream-100/80 px-4 py-2.5 text-xs font-bold text-stone-700 shadow-xs transition hover:border-cream-400 active:scale-98"
            >
              <svg className="h-4 w-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Purchase History
            </button>
          </div>
        </div>
      </div>

      {/* Edit Mode Alert Banner */}
      {editingPurchaseId && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl border border-amber-300/80 bg-gradient-to-r from-amber-50 via-amber-100/40 to-amber-50 p-4 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-600 text-white shadow-sm shadow-amber-600/30">
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
                  <span className="rounded-md bg-amber-200/90 border border-amber-300 px-2 py-0.5 font-mono text-[11px] font-bold text-amber-950">
                    {currentEditingPurchase.purchaseNumber}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-amber-800/90 mt-0.5">
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
          <div className="flex items-center gap-2.5 text-xs font-semibold text-stone-600">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-amber-600 border-t-transparent" />
            <span>Loading purchase bill details...</span>
          </div>
        </div>
      )}

      {/* STEP 1: Bill Inward Header: Vendor, Invoice Number, Date, Payment Method */}
      <div className={`rounded-2xl border border-cream-300 bg-white p-5 shadow-xs transition-opacity ${loadingPurchase ? 'opacity-50 pointer-events-none' : ''}`}>
        <div className="flex items-center justify-between pb-4 border-b border-cream-200/80 mb-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-100 border border-amber-300 text-amber-900 font-mono font-bold text-xs">
              01
            </span>
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-stone-800">
                Vendor Bill & Invoice Details
              </h2>
              <p className="text-[11px] text-stone-500">Official vendor bill number, purchase date, and creditor tax registration</p>
            </div>
          </div>
          <span className="text-[11px] font-medium text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200 hidden sm:inline-block">
            Required for Inward Stock
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Vendor Picker */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="purchase-vendor-select" className="text-xs font-bold text-stone-700">
                Vendor / Supplier <span className="text-red-500 font-bold">*</span>
              </label>
              <button
                type="button"
                onClick={() => setIsQuickAddVendorOpen(true)}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 hover:text-amber-800 transition"
              >
                <span className="text-xs font-bold">+</span> Quick Add
              </button>
            </div>
            <select
              id="purchase-vendor-select"
              value={selectedVendorId}
              onChange={(e) => setSelectedVendorId(e.target.value)}
              className="w-full rounded-xl border border-cream-300 bg-cream-50/40 px-3 py-2 text-xs font-medium text-stone-900 focus:border-amber-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-600/20 transition"
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
            <label htmlFor="purchase-invoice-number-input" className="block text-xs font-bold text-stone-700 mb-1.5">
              Vendor Invoice / Bill No. <span className="text-red-500 font-bold">*</span>
            </label>
            <input
              id="purchase-invoice-number-input"
              type="text"
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              placeholder="e.g. INV-2026-9901"
              className="w-full rounded-xl border border-cream-300 bg-cream-50/40 px-3.5 py-2 text-xs font-mono uppercase text-stone-900 placeholder-stone-400 focus:border-amber-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-600/20 transition font-medium"
            />
          </div>

          {/* Purchase Date */}
          <div>
            <label htmlFor="purchase-date-input" className="block text-xs font-bold text-stone-700 mb-1.5">
              Purchase Date <span className="text-red-500 font-bold">*</span>
            </label>
            <input
              id="purchase-date-input"
              type="date"
              value={purchaseDate}
              onChange={(e) => setPurchaseDate(e.target.value)}
              className="w-full rounded-xl border border-cream-300 bg-cream-50/40 px-3.5 py-2 text-xs font-medium text-stone-900 focus:border-amber-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-600/20 transition"
            />
          </div>

          {/* Payment Method */}
          <div>
            <label htmlFor="purchase-payment-method-select" className="block text-xs font-bold text-stone-700 mb-1.5">
              Payment Method <span className="text-red-500 font-bold">*</span>
            </label>
            <select
              id="purchase-payment-method-select"
              value={paymentMethod}
              onChange={(e) => {
                setPaymentMethod(e.target.value as PurchasePaymentMethod);
              }}
              className="w-full rounded-xl border border-cream-300 bg-cream-50/40 px-3 py-2 text-xs font-semibold text-stone-900 focus:border-amber-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-600/20 transition"
            >
              <option value="CASH">Cash</option>
              <option value="ONLINE">Online / Bank Transfer</option>
              <option value="NO_PAYMENT">No Payment (Credit)</option>
            </select>
          </div>
        </div>

        {/* Selected Creditor / Vendor Details Card */}
        {(() => {
          const v = vendors.find((vend) => vend.id === selectedVendorId);
          if (!v) return null;
          return (
            <div className="mt-4 rounded-xl border border-amber-200/90 bg-gradient-to-r from-amber-50/60 via-cream-50/80 to-white p-4 shadow-2xs">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div className="space-y-2">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-600 text-white font-bold text-xs shadow-xs">
                      {v.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 bg-amber-100/90 px-2 py-0.5 rounded mr-2 border border-amber-200/80">
                        Creditor Profile
                      </span>
                      <span className="text-xs font-bold text-stone-900">{v.name}</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-stone-600 pt-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-stone-400 font-medium">Phone:</span>
                      <span className="font-semibold text-stone-800">{v.phoneNumber || 'Not provided'}</span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className="text-stone-400 font-medium">GSTIN:</span>
                      <span className="font-mono font-bold text-amber-900 bg-amber-100/60 px-1.5 py-0.5 rounded border border-amber-200/60">
                        {v.gstNumber || 'Unregistered'}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className="text-stone-400 font-medium">Address:</span>
                      <span className="text-stone-700">{v.address || 'Address not registered'}</span>
                    </div>
                  </div>

                  {(v.bankName || v.accountNumber || v.ifscCode) && (
                    <div className="text-[11px] text-stone-600 flex flex-wrap items-center gap-3 pt-2 border-t border-amber-200/60">
                      <span className="font-bold text-amber-900 uppercase text-[10px] tracking-wide">Bank Settlement:</span>
                      {v.bankName && <span><strong>Bank:</strong> {v.bankName}</span>}
                      {v.accountNumber && <span><strong>A/C No:</strong> <span className="font-mono font-semibold">{v.accountNumber}</span></span>}
                      {v.ifscCode && <span><strong>IFSC:</strong> <span className="font-mono font-semibold">{v.ifscCode}</span></span>}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })()}

        {/* E-way Bill & Transport Details Row */}
        <div className="mt-4 pt-4 border-t border-cream-200/80">
          <div className="text-[11px] font-bold text-stone-500 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
            <svg className="h-3.5 w-3.5 text-stone-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
            Logistics & Transport Details <span className="text-stone-400 font-normal lowercase">(optional)</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="purchase-eway-bill-input" className="block text-xs font-semibold text-stone-700 mb-1">
                E-Way Bill Number
              </label>
              <input
                id="purchase-eway-bill-input"
                type="text"
                value={ewayBillNumber}
                onChange={(e) => setEwayBillNumber(e.target.value)}
                placeholder="e.g. 1210 3456 7890"
                className="w-full rounded-xl border border-cream-300 bg-cream-50/40 px-3.5 py-2 text-xs font-mono text-stone-900 placeholder-stone-400 focus:border-amber-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-600/20 transition"
              />
            </div>

            <div>
              <label htmlFor="purchase-transporter-input" className="block text-xs font-semibold text-stone-700 mb-1">
                Transport Details / Carrier
              </label>
              <input
                id="purchase-transporter-input"
                type="text"
                value={transporterName}
                onChange={(e) => setTransporterName(e.target.value)}
                placeholder="e.g. VRL Logistics / Delhivery / By Hand"
                className="w-full rounded-xl border border-cream-300 bg-cream-50/40 px-3.5 py-2 text-xs font-medium text-stone-900 placeholder-stone-400 focus:border-amber-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-600/20 transition"
              />
            </div>

            <div>
              <label htmlFor="purchase-vehicle-input" className="block text-xs font-semibold text-stone-700 mb-1">
                Vehicle Number
              </label>
              <input
                id="purchase-vehicle-input"
                type="text"
                value={vehicleNumber}
                onChange={(e) => setVehicleNumber(e.target.value.toUpperCase())}
                placeholder="e.g. DL 01 AB 1234"
                className="w-full rounded-xl border border-cream-300 bg-cream-50/40 px-3.5 py-2 text-xs font-mono uppercase text-stone-900 placeholder-stone-400 focus:border-amber-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-600/20 transition"
              />
            </div>
          </div>
        </div>
      </div>

      {/* STEP 2: Product Inward Action Card */}
      <div className="rounded-2xl border border-cream-300 bg-white p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-100 border border-amber-300 text-amber-900 font-mono font-bold text-xs">
                02
              </span>
              <h2 className="text-xs font-bold uppercase tracking-wider text-stone-800">
                Inward Products & Inventory
              </h2>
              <span className="rounded-full bg-amber-100/90 border border-amber-300 px-2.5 py-0.5 text-[11px] font-bold text-amber-900 font-mono">
                {items.length} {items.length === 1 ? 'Product' : 'Products'} in Bill
              </span>
            </div>
            <p className="text-[11px] text-stone-500 mt-1">
              Every inward item is registered in your product catalog with category specifications, purchase rate, and barcode.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              id="btn-add-product-modal"
              type="button"
              onClick={handleOpenAddProduct}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-amber-600/25 transition active:scale-95"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
              + Add New Product
            </button>
          </div>
        </div>

        {items.length === 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 rounded-xl border border-dashed border-amber-300 bg-gradient-to-r from-amber-50/50 via-cream-50/40 to-white p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-800 border border-amber-300/60 shrink-0">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              </div>
              <div className="text-xs">
                <span className="font-bold text-stone-900">No products added yet.</span>{' '}
                <span className="text-stone-500">Click &quot;+ Add New Product&quot; to configure category attributes, cost rate, discounts, and tax lines.</span>
              </div>
            </div>
            <button
              type="button"
              onClick={handleOpenAddProduct}
              className="text-xs font-bold text-amber-800 hover:text-amber-900 bg-amber-100/70 hover:bg-amber-100 px-3 py-1.5 rounded-lg border border-amber-300/80 transition whitespace-nowrap active:scale-95"
            >
              + Open Product Form →
            </button>
          </div>
        )}
      </div>

      {/* Bill Items Table */}
      <div className="overflow-hidden rounded-2xl border border-cream-300 bg-white shadow-sm">
        <div className="p-4 border-b border-cream-200/80 bg-cream-50/30 flex items-center justify-between">
          <div className="text-xs font-bold uppercase tracking-wider text-stone-700 flex items-center gap-2">
            <span>Bill Line Items</span>
            <span className="rounded-full bg-amber-100/90 text-amber-900 border border-amber-300/70 px-2 py-0.5 text-[11px] font-bold font-mono">
              {items.length} {items.length === 1 ? 'Product' : 'Products'}
            </span>
          </div>

          {items.length > 0 && (
            <button
              type="button"
              onClick={handleClearAll}
              className="text-xs text-rose-600 hover:text-rose-800 font-semibold transition hover:underline"
            >
              Clear All Items
            </button>
          )}
        </div>

        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-cream-100 text-stone-400 border border-cream-300/80 shadow-2xs">
              <svg className="h-7 w-7 text-stone-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
              </svg>
            </div>
            <h3 className="mt-3 text-sm font-bold text-stone-800">
              No products added to this purchase bill yet
            </h3>
            <p className="mt-1 text-xs text-stone-500 max-w-sm">
              Click <strong>&quot;+ Add New Product&quot;</strong> to register a product with category specifications, rates, discount, and GST via the form.
            </p>
            <button
              type="button"
              onClick={handleOpenAddProduct}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-amber-600/25 transition active:scale-95"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
              + Add New Product
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs min-w-[1100px]">
              <thead className="border-b border-cream-200/90 bg-cream-100/60 uppercase tracking-wider text-stone-600 font-bold text-[11px]">
                <tr>
                  <th className="px-3 py-3 w-10 text-center">#</th>
                  <th className="px-3 py-3 min-w-[200px]">Item Description</th>
                  <th className="px-3 py-3 w-24">HSN Code</th>
                  <th className="px-3 py-3 w-20 text-center">Qty</th>
                  <th className="px-3 py-3 w-24 text-right">Rate (₹)</th>
                  <th className="px-3 py-3 w-20 text-right">Disc (₹)</th>
                  <th className="px-3 py-3 w-24 text-right">Total (₹)</th>
                  <th className="px-3 py-3 w-24 text-right">CGST</th>
                  <th className="px-3 py-3 w-24 text-right">SGST</th>
                  <th className="px-3 py-3 w-24 text-right">IGST</th>
                  <th className="px-3 py-3 w-28 text-right">Final Total (₹)</th>
                  <th className="px-3 py-3 w-28 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-200/80">
                {items.map((item, idx) => (
                  <tr key={item.tempId} className="transition hover:bg-amber-50/20">
                    <td className="px-3 py-3 text-center text-stone-400 font-mono font-bold text-[11px]">
                      {idx + 1}
                    </td>

                    {/* Item Description: Name, Category, Barcode & Optional Narration */}
                    <td className="px-3 py-3">
                      <div className="font-bold text-stone-900 text-xs">{item.name}</div>
                      <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-stone-500 mt-0.5">
                        <span className="rounded bg-cream-100 px-1.5 py-0.5 font-medium text-stone-700 border border-cream-200">
                          {item.categoryName}
                        </span>
                        <span className="font-mono text-amber-900 font-bold bg-amber-100/70 px-1.5 py-0.5 rounded border border-amber-300/70">
                          {item.barcode}
                        </span>
                        <span>Stock: {item.currentStock}</span>
                      </div>
                      {item.itemDescription && (
                        <div
                          className="mt-1 text-[11px] text-stone-600 italic bg-cream-50/80 rounded px-2 py-0.5 border border-cream-200/60 max-w-sm truncate"
                          title={item.itemDescription}
                        >
                          {item.itemDescription}
                        </div>
                      )}
                    </td>

                    {/* HSN Code */}
                    <td className="px-3 py-3">
                      <span className="font-mono font-semibold text-stone-800 text-xs bg-cream-50/80 px-2 py-1 rounded border border-cream-200">
                        {item.hsnCode || '—'}
                      </span>
                    </td>

                    {/* Qty */}
                    <td className="px-3 py-3 text-center">
                      <span className="inline-block min-w-8 text-center rounded-lg bg-amber-50 border border-amber-200 px-2 py-1 text-xs font-bold text-amber-950 font-mono">
                        {item.quantityBought}
                      </span>
                    </td>

                    {/* Rate (₹) */}
                    <td className="px-3 py-3 text-right">
                      <span className="font-mono font-bold text-stone-900 text-xs">
                        ₹{item.unitCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </span>
                    </td>

                    {/* Disc (₹) */}
                    <td className="px-3 py-3 text-right">
                      <span className="font-mono text-xs text-stone-700">
                        {item.discount > 0 ? `₹${item.discount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'}
                      </span>
                    </td>

                    {/* Total (Taxable = Qty * Rate - Disc) */}
                    <td className="px-3 py-3 text-right">
                      <div className="font-mono font-bold text-stone-900 text-xs">
                        ₹{item.taxableAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </div>
                      <div className="text-[10px] text-stone-400">Taxable</div>
                    </td>

                    {/* CGST */}
                    <td className="px-3 py-3 text-right">
                      <div className="font-mono font-semibold text-emerald-800 text-xs">
                        ₹{(item.cgstAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </div>
                      <div className="text-[10px] text-emerald-700/80 font-medium">
                        ({item.cgstRate || 0}%)
                      </div>
                    </td>

                    {/* SGST */}
                    <td className="px-3 py-3 text-right">
                      <div className="font-mono font-semibold text-emerald-800 text-xs">
                        ₹{(item.sgstAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </div>
                      <div className="text-[10px] text-emerald-700/80 font-medium">
                        ({item.sgstRate || 0}%)
                      </div>
                    </td>

                    {/* IGST */}
                    <td className="px-3 py-3 text-right">
                      <div className="font-mono font-semibold text-blue-800 text-xs">
                        ₹{(item.igstAmount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </div>
                      <div className="text-[10px] text-blue-700/80 font-medium">
                        ({item.igstRate || 0}%)
                      </div>
                    </td>

                    {/* Final Total */}
                    <td className="px-3 py-3 text-right whitespace-nowrap">
                      <div className="font-mono font-black text-amber-900 text-xs">
                        ₹{item.lineTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="px-3 py-3 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleOpenEditProduct(item)}
                          className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-900 transition shadow-2xs active:scale-95"
                          title="Edit product, rates, quantity & taxes in form"
                        >
                          <svg className="h-3 w-3 text-amber-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                          Edit
                        </button>

                        <button
                          type="button"
                          onClick={() => handleOpenPrintBarcode(item)}
                          className="inline-flex items-center gap-1 rounded-lg border border-cream-300 bg-white hover:bg-cream-100 px-2 py-1 text-[11px] font-bold text-stone-700 transition active:scale-95 shadow-2xs"
                          title="Print Barcode Labels"
                        >
                          <svg className="h-3 w-3 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                          </svg>
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

      {/* STEP 4: Bill Totals & Submission Bottom Area */}
      <div className="rounded-2xl border border-cream-300 bg-white p-5 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          {/* Left: Summary Stats & GST Breakdown */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 text-xs flex-1">
            <div className="rounded-xl bg-cream-50/70 p-3 border border-cream-200/80">
              <span className="text-stone-400 block font-semibold text-[11px]">Total Line Items</span>
              <span className="text-sm font-bold text-stone-900 mt-0.5 block">{items.length} items ({totalUnits} units)</span>
            </div>

            <div className="rounded-xl bg-cream-50/70 p-3 border border-cream-200/80">
              <span className="text-stone-400 block font-semibold text-[11px]">Taxable Subtotal</span>
              <span className="text-sm font-bold text-stone-900 font-mono mt-0.5 block">
                ₹{totalTaxable.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>

            <div className="rounded-xl bg-emerald-50/50 p-3 border border-emerald-200/60">
              <span className="text-emerald-700/80 block font-semibold text-[11px]">CGST Total</span>
              <span className="text-sm font-bold text-emerald-900 font-mono mt-0.5 block">
                ₹{totalCgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>

            <div className="rounded-xl bg-emerald-50/50 p-3 border border-emerald-200/60">
              <span className="text-emerald-700/80 block font-semibold text-[11px]">SGST Total</span>
              <span className="text-sm font-bold text-emerald-900 font-mono mt-0.5 block">
                ₹{totalSgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>

            <div className="rounded-xl bg-blue-50/50 p-3 border border-blue-200/60">
              <span className="text-blue-700/80 block font-semibold text-[11px]">IGST Total</span>
              <span className="text-sm font-bold text-blue-900 font-mono mt-0.5 block">
                ₹{totalIgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>

            <div className="rounded-xl bg-amber-50/60 p-3 border border-amber-200/80">
              <span className="text-amber-800/80 block font-semibold text-[11px]">Total GST Tax</span>
              <span className="text-sm font-bold text-amber-950 font-mono mt-0.5 block">
                ₹{totalTax.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {/* Right: Grand Total & Save Button */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 border-t lg:border-t-0 lg:border-l border-cream-200/80 pt-4 lg:pt-0 lg:pl-6 shrink-0">
            <div className="rounded-xl bg-gradient-to-br from-amber-50 via-cream-100 to-amber-100/60 border border-amber-300/80 p-3 sm:px-5 sm:py-2.5 text-right">
              <span className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block">
                Final Bill Total
              </span>
              <span className="text-2xl sm:text-3xl font-black text-amber-800 font-mono tracking-tight block">
                ₹{grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>

            <button
              id="btn-save-purchase-bill"
              type="button"
              disabled={submitting || items.length === 0}
              onClick={handleSavePurchaseBill}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed px-6 py-3.5 text-sm font-bold text-white shadow-md shadow-emerald-700/25 transition active:scale-95"
            >
              {submitting ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  {editingPurchaseId ? 'Updating Purchase Bill...' : 'Saving Bill & Stock...'}
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl border border-cream-300 bg-white p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3.5">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 shadow-xs border border-emerald-200">
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

            <div className="mt-5 rounded-xl border border-cream-200/90 bg-cream-50/70 p-4 space-y-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-stone-500 font-semibold">Purchase ID:</span>
                <span className="font-mono font-bold text-stone-900 bg-white px-2 py-0.5 rounded border border-cream-200">{savedPurchase.purchaseNumber}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-stone-500 font-semibold">Vendor Invoice:</span>
                <span className="font-mono font-bold text-stone-900 bg-white px-2 py-0.5 rounded border border-cream-200">{savedPurchase.invoiceNumber}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-stone-500 font-semibold">Vendor Name:</span>
                <span className="font-bold text-stone-900">{savedPurchase.vendorName}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-stone-500 font-semibold">Products / Units:</span>
                <span className="font-bold text-stone-900">
                  {savedPurchase.totalProductsCount} products ({savedPurchase.totalUnitsBought} units)
                </span>
              </div>
              <div className="flex justify-between items-center border-t border-cream-200 pt-2.5 text-sm font-bold">
                <span className="text-stone-900">Total Amount:</span>
                <span className="text-amber-800 font-mono text-base font-black">
                  ₹{savedPurchase.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            <div className="mt-6 flex flex-col sm:flex-row items-center gap-2.5">
              <button
                type="button"
                id="btn-print-saved-purchase-barcodes"
                onClick={() => setBatchPrintingPurchase(savedPurchase)}
                className="w-full sm:w-auto flex-1 inline-flex items-center justify-center gap-2 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 px-4 py-2.5 text-xs font-bold text-amber-900 transition shadow-2xs"
                title={`Print all barcodes for this entry (${savedPurchase.totalUnitsBought} total stickers)`}
              >
                <svg className="h-4 w-4 text-amber-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                </svg>
                Print Entry Barcodes ({savedPurchase.totalUnitsBought})
              </button>

              <button
                type="button"
                onClick={onNavigateToHistory}
                className="w-full sm:w-auto inline-flex items-center justify-center rounded-xl border border-cream-300 bg-white hover:bg-cream-100 px-4 py-2.5 text-xs font-bold text-stone-700 transition"
              >
                View History
              </button>

              <button
                type="button"
                onClick={handleStartNewBill}
                className="w-full sm:w-auto inline-flex items-center justify-center rounded-xl bg-amber-600 hover:bg-amber-500 px-4 py-2.5 text-xs font-bold text-white transition shadow-xs"
              >
                {editingPurchaseId ? 'Return to History' : '+ New Bill'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QUICK ADD VENDOR MODAL */}
      {isQuickAddVendorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-cream-300 bg-white p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-cream-200 pb-3">
              <h3 className="text-sm font-bold text-stone-900 uppercase tracking-wide flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded bg-amber-100 text-amber-900 font-bold text-xs">
                  +
                </span>
                Quick Add Vendor / Supplier
              </h3>
              <button
                type="button"
                onClick={() => setIsQuickAddVendorOpen(false)}
                className="rounded-lg p-1 text-stone-400 hover:bg-cream-100 hover:text-stone-700 transition"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleQuickAddVendorSubmit} className="mt-4 space-y-3.5 max-h-[75vh] overflow-y-auto pr-1">
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  Vendor Name <span className="text-red-500 font-bold">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={quickVendorName}
                  onChange={(e) => setQuickVendorName(e.target.value)}
                  placeholder="e.g. S.K. Bullion & Gems"
                  className="w-full rounded-xl border border-cream-300 bg-cream-50/50 px-3.5 py-2 text-xs font-medium text-stone-900 focus:border-amber-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-600/20 transition"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">
                    Phone Number
                  </label>
                  <input
                    type="text"
                    value={quickVendorPhone}
                    onChange={(e) => setQuickVendorPhone(e.target.value)}
                    placeholder="e.g. 9876543210"
                    className="w-full rounded-xl border border-cream-300 bg-cream-50/50 px-3.5 py-2 text-xs font-medium text-stone-900 focus:border-amber-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-600/20 transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">
                    GSTIN / GST No
                  </label>
                  <input
                    type="text"
                    value={quickVendorGst}
                    onChange={(e) => setQuickVendorGst(e.target.value)}
                    placeholder="e.g. 07AAAAA0000A1Z5"
                    className="w-full rounded-xl border border-cream-300 bg-cream-50/50 px-3.5 py-2 text-xs font-mono uppercase text-stone-900 focus:border-amber-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-600/20 transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  Creditor Address
                </label>
                <input
                  type="text"
                  value={quickVendorAddress}
                  onChange={(e) => setQuickVendorAddress(e.target.value)}
                  placeholder="Street, City, State, Pincode"
                  className="w-full rounded-xl border border-cream-300 bg-cream-50/50 px-3.5 py-2 text-xs font-medium text-stone-900 focus:border-amber-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-600/20 transition"
                />
              </div>

              <div className="rounded-xl border border-cream-200/90 bg-cream-50/60 p-3.5 space-y-2.5">
                <span className="block text-[11px] font-bold text-stone-700 uppercase tracking-wider">
                  Vendor Bank Settlement Details
                </span>
                <div>
                  <input
                    type="text"
                    value={quickVendorBankName}
                    onChange={(e) => setQuickVendorBankName(e.target.value)}
                    placeholder="Bank Name (e.g. HDFC Bank)"
                    className="w-full rounded-lg border border-cream-300 bg-white px-3 py-1.5 text-xs text-stone-900 focus:border-amber-600 focus:outline-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={quickVendorAccountNo}
                    onChange={(e) => setQuickVendorAccountNo(e.target.value)}
                    placeholder="A/C Number"
                    className="w-full rounded-lg border border-cream-300 bg-white px-3 py-1.5 text-xs font-mono text-stone-900 focus:border-amber-600 focus:outline-none"
                  />
                  <input
                    type="text"
                    value={quickVendorIfsc}
                    onChange={(e) => setQuickVendorIfsc(e.target.value)}
                    placeholder="IFSC Code"
                    className="w-full rounded-lg border border-cream-300 bg-white px-3 py-1.5 text-xs font-mono uppercase text-stone-900 focus:border-amber-600 focus:outline-none"
                  />
                </div>
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
                  className="rounded-xl bg-amber-600 hover:bg-amber-500 px-4 py-2 text-xs font-bold text-white transition disabled:opacity-50 shadow-xs active:scale-98"
                >
                  {quickVendorSubmitting ? 'Saving...' : 'Add Vendor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* THE PRODUCT FORM MODAL — All product & inward details added and edited through form */}
      <ProductFormModal
        isOpen={isAddProductModalOpen}
        onClose={() => {
          setIsAddProductModalOpen(false);
          setEditingBillProduct(null);
          setEditingBillTempId(null);
          setEditingBillItemData(null);
        }}
        onSaved={handleProductSavedFromForm}
        editingProduct={editingBillProduct}
        initialBillItem={editingBillItemData}
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
