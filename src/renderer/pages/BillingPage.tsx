import React, { useEffect, useRef, useState } from 'react';
import type {
  AuthSessionPayload,
  BillDto,
  CreateBillItemInput,
  ScannedProductDto,
} from '../../shared/types/ipc';
import { useToast } from '../context/ToastContext';
import { ipcClient } from '../services/ipcClient';

interface CartItem extends ScannedProductDto {
  cartQuantity: number;
  itemTotal: number;
  discountPercentage?: number;
}

interface BillingPageProps {
  session: AuthSessionPayload;
  onNavigateToHistory?: () => void;
}

export const BillingPage: React.FC<BillingPageProps> = ({ session: _session, onNavigateToHistory }) => {
  const { showSuccess, showError, showInfo } = useToast();

  const [barcodeInput, setBarcodeInput] = useState('');
  const [scanning, setScanning] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);

  // Customer Details
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'UPI' | 'CARD' | 'SPLIT'>('CASH');
  const [discountPercentage, setDiscountPercentage] = useState<number>(0);
  const [taxAmount, setTaxAmount] = useState<number>(0);
  const [notes, setNotes] = useState('');

  // Processing sale state
  const [completingSale, setCompletingSale] = useState(false);
  const [completedBill, setCompletedBill] = useState<BillDto | null>(null);

  // Search & Catalog Modal
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [catalogProducts, setCatalogProducts] = useState<ScannedProductDto[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);

  const barcodeInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus barcode input on mount and after actions
  useEffect(() => {
    barcodeInputRef.current?.focus();
  }, [completedBill, catalogOpen]);

  // Load catalog for search modal
  const handleOpenCatalog = async () => {
    setCatalogOpen(true);
    setLoadingCatalog(true);
    try {
      const res = await ipcClient.searchBillingProducts(searchQuery);
      if (res.success) {
        setCatalogProducts(res.data);
      }
    } catch {
      showError('Failed to load products.');
    } finally {
      setLoadingCatalog(false);
    }
  };

  const handleSearchProducts = async (q: string) => {
    setSearchQuery(q);
    setLoadingCatalog(true);
    try {
      const res = await ipcClient.searchBillingProducts(q);
      if (res.success) {
        setCatalogProducts(res.data);
      }
    } catch {
      showError('Search failed.');
    } finally {
      setLoadingCatalog(false);
    }
  };

  // Add scanned product to cart
  const addProductToCart = (product: ScannedProductDto) => {
    setCart((prev) => {
      const existingIndex = prev.findIndex((item) => item.id === product.id);
      if (existingIndex >= 0) {
        const updated = [...prev];
        const item = updated[existingIndex];
        const newQty = item.cartQuantity + 1;
        updated[existingIndex] = {
          ...item,
          cartQuantity: newQty,
          itemTotal: Math.round(item.unitPrice * newQty * 100) / 100,
        };
        return updated;
      } else {
        const newItem: CartItem = {
          ...product,
          cartQuantity: 1,
          itemTotal: Math.round(product.unitPrice * 100) / 100,
          discountPercentage: discountPercentage,
        };
        return [newItem, ...prev];
      }
    });

    showSuccess(`Added "${product.name}" (${product.companyName}) to bill`);
    setBarcodeInput('');
    barcodeInputRef.current?.focus();
  };

  // Handle global discount % change (syncs all items in cart)
  const handleGlobalDiscountChange = (newPct: number) => {
    const clamped = Math.max(0, Math.min(100, newPct));
    setDiscountPercentage(clamped);
    setCart((prev) =>
      prev.map((item) => ({
        ...item,
        discountPercentage: clamped,
      }))
    );
  };

  // Handle per-item discount % change directly on a cart row
  const handleItemDiscountChange = (productId: string, newPct: number) => {
    const clamped = Math.max(0, Math.min(100, newPct));
    setCart((prev) =>
      prev.map((item) => {
        if (item.id === productId) {
          return {
            ...item,
            discountPercentage: clamped,
          };
        }
        return item;
      })
    );
  };

  // 1-Click Demo: Test 50 + 50 with 10% discount -> 45 + 45 = 90 Bill
  const handleLoadDemoFiftyFifty = async () => {
    try {
      setScanning(true);
      const resA = await ipcClient.scanBillingProduct('AGS000050');
      const resB = await ipcClient.scanBillingProduct('BAI000050');

      const itemsToAdd: CartItem[] = [];
      if (resA.success && resA.data) {
        itemsToAdd.push({
          ...resA.data,
          cartQuantity: 1,
          itemTotal: 50,
          discountPercentage: 10,
        });
      }
      if (resB.success && resB.data) {
        itemsToAdd.push({
          ...resB.data,
          cartQuantity: 1,
          itemTotal: 50,
          discountPercentage: 10,
        });
      }

      setCart(itemsToAdd);
      setDiscountPercentage(10);
      showSuccess('Loaded 2 items of ₹50 each (Total ₹100). With 10% discount, both items are ₹45 each and bill is ₹90!');
    } catch {
      showError('Error loading demo items.');
    } finally {
      setScanning(false);
    }
  };

  // Handle Barcode Scan Form Submit
  const handleScanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = barcodeInput.trim();
    if (!code) return;

    setScanning(true);
    try {
      const res = await ipcClient.scanBillingProduct(code);
      if (res.success) {
        addProductToCart(res.data);
      } else {
        showError(res.error || `Barcode "${code}" not found.`);
      }
    } catch (err: any) {
      showError(err.message || 'Error scanning barcode.');
    } finally {
      setScanning(false);
    }
  };

  // Cart item quantity adjustments
  const updateQuantity = (productId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.id === productId) {
            const newQty = Math.max(1, item.cartQuantity + delta);
            return {
              ...item,
              cartQuantity: newQty,
              itemTotal: Math.round(item.unitPrice * newQty * 100) / 100,
            };
          }
          return item;
        })
        .filter((item) => item.cartQuantity > 0)
    );
  };

  const removeCartItem = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.id !== productId));
  };

  const clearCart = () => {
    if (cart.length === 0) return;
    if (window.confirm('Are you sure you want to clear all items from the current bill?')) {
      setCart([]);
      setDiscountPercentage(0);
      setTaxAmount(0);
      setNotes('');
    }
  };

  // Subtotal, item-level discounts, and company breakdowns
  const subtotal = Math.round(cart.reduce((sum, item) => sum + (item.unitPrice * item.cartQuantity), 0) * 100) / 100;

  const totalDiscountAmount = Math.round(
    cart.reduce((sum, item) => {
      const pct = item.discountPercentage !== undefined ? item.discountPercentage : discountPercentage;
      const itemDisc = Math.round((item.unitPrice * (pct / 100)) * 100) / 100;
      return sum + (itemDisc * item.cartQuantity);
    }, 0) * 100
  ) / 100;

  const netSubtotal = Math.max(0, Math.round((subtotal - totalDiscountAmount) * 100) / 100);

  const companyABreakdown = cart.filter(
    (i) => i.companyCode === 'COMPANY_A' || i.companyName.includes('Company A')
  );
  const companyBBreakdown = cart.filter(
    (i) => i.companyCode === 'COMPANY_B' || i.companyName.includes('Company B')
  );

  const companyASubtotal = Math.round(
    companyABreakdown.reduce((sum, i) => {
      const pct = i.discountPercentage !== undefined ? i.discountPercentage : discountPercentage;
      const disc = Math.round((i.unitPrice * (pct / 100)) * 100) / 100;
      const net = i.unitPrice - disc;
      return sum + (net * i.cartQuantity);
    }, 0) * 100
  ) / 100;

  const companyBSubtotal = Math.round(
    companyBBreakdown.reduce((sum, i) => {
      const pct = i.discountPercentage !== undefined ? i.discountPercentage : discountPercentage;
      const disc = Math.round((i.unitPrice * (pct / 100)) * 100) / 100;
      const net = i.unitPrice - disc;
      return sum + (net * i.cartQuantity);
    }, 0) * 100
  ) / 100;

  const grandTotal = Math.max(0, Math.round((netSubtotal + taxAmount) * 100) / 100);

  // Complete Sale and Create Single Bill
  const handleCompleteSale = async () => {
    if (cart.length === 0) {
      showInfo('Cannot complete bill with empty cart. Please scan or add products.');
      return;
    }

    setCompletingSale(true);
    try {
      const items: CreateBillItemInput[] = cart.map((item) => {
        const itemDiscPct = item.discountPercentage !== undefined ? item.discountPercentage : discountPercentage;
        const itemDisc = Math.round((item.unitPrice * (itemDiscPct / 100)) * 100) / 100;
        const netUnitPrice = Math.round((item.unitPrice - itemDisc) * 100) / 100;
        return {
          productId: item.id,
          companyId: item.companyId,
          companyName: item.companyName,
          barcode: item.barcode,
          productName: item.name,
          categoryName: item.categoryName,
          unitPrice: item.unitPrice,
          discountPercentage: itemDiscPct,
          discountAmount: itemDisc,
          netUnitPrice,
          quantity: item.cartQuantity,
          detailsJson: item.details ? JSON.stringify(item.details) : undefined,
        };
      });

      const res = await ipcClient.createBill({
        customerName: customerName.trim() || undefined,
        customerPhone: customerPhone.trim() || undefined,
        paymentMethod,
        discountPercentage,
        discount: totalDiscountAmount,
        tax: taxAmount,
        notes: notes.trim() || undefined,
        items,
      });

      if (res.success) {
        setCompletedBill(res.data);
        showSuccess(`Bill ${res.data.invoiceNumber} created successfully!`);
        // Reset cart for next customer
        setCart([]);
        setCustomerName('');
        setCustomerPhone('');
        setDiscountPercentage(0);
        setTaxAmount(0);
        setNotes('');
      } else {
        showError(res.error || 'Failed to complete sale.');
      }
    } catch (err: any) {
      showError(err.message || 'Error creating bill.');
    } finally {
      setCompletingSale(false);
    }
  };

  const handlePrintReceipt = () => {
    window.print();
  };

  return (
    <div className="flex h-full flex-col gap-6">
      {/* Top Bar: Cross-Company Billing Header & Status */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-amber-200/80 bg-gradient-to-r from-amber-500/10 via-amber-600/5 to-amber-700/10 p-4 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 font-bold text-white shadow-md shadow-amber-600/30">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-stone-900">Unified POS Billing Terminal</h2>
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800 border border-emerald-200">
                Multi-Company Active
              </span>
            </div>
            <p className="text-xs text-stone-600">
              Customer can purchase products from <span className="font-semibold text-amber-800">Company A</span> & <span className="font-semibold text-indigo-800">Company B</span> in a single combined invoice.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onNavigateToHistory && (
            <button
              type="button"
              onClick={onNavigateToHistory}
              className="flex items-center gap-1.5 rounded-xl border border-cream-300 bg-white px-3.5 py-2 text-xs font-semibold text-stone-700 shadow-xs hover:bg-cream-100 transition"
            >
              <svg className="h-4 w-4 text-stone-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Past Invoices</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleOpenCatalog}
            className="flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2 text-xs font-semibold text-amber-900 shadow-xs hover:bg-amber-100 transition"
          >
            <svg className="h-4 w-4 text-amber-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
            <span>Browse Catalog</span>
          </button>
        </div>
      </div>

      {/* Barcode Scan & Quick Demo Pills */}
      <div className="flex flex-col gap-2 rounded-2xl border border-cream-300 bg-white p-4 shadow-sm">
        <form onSubmit={handleScanSubmit} className="flex gap-3">
          <div className="relative flex-1">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-stone-400">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
              </svg>
            </div>
            <input
              ref={barcodeInputRef}
              type="text"
              value={barcodeInput}
              onChange={(e) => setBarcodeInput(e.target.value)}
              placeholder="Scan barcode with handheld scanner or type barcode (e.g. AGJ000001, BHD000001) & press Enter..."
              disabled={scanning}
              className="w-full rounded-xl border border-cream-300 bg-cream-50/60 pl-11 pr-4 py-3 text-sm font-mono text-stone-900 placeholder-stone-400 focus:border-amber-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-600/20"
            />
          </div>

          <button
            type="submit"
            disabled={scanning || !barcodeInput.trim()}
            className="flex items-center gap-2 rounded-xl bg-amber-600 px-6 py-3 text-sm font-semibold text-white shadow-md shadow-amber-600/20 hover:bg-amber-500 disabled:opacity-50 transition"
          >
            {scanning ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              'Scan / Add'
            )}
          </button>
        </form>

        {/* Quick Demo Test Buttons for immediate 1-click test of both companies */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-cream-200 text-xs text-stone-500">
          <span className="font-semibold text-stone-700">Quick Test Items:</span>

          {/* 1-Click Demo Button for User's Exact 50 + 50 @ 10% Discount Scenario */}
          <button
            type="button"
            onClick={handleLoadDemoFiftyFifty}
            className="flex items-center gap-1.5 rounded-lg border border-emerald-400 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-900 hover:bg-emerald-100 shadow-2xs transition"
          >
            <span className="h-2 w-2 rounded-full bg-emerald-600 animate-pulse" />
            ✨ 2 Items (₹50+₹50) @ 10% Discount = ₹90 Bill
          </button>

          <button
            type="button"
            onClick={() => {
              setBarcodeInput('AGS000050');
              void ipcClient.scanBillingProduct('AGS000050').then((res) => res.success && res.data && addProductToCart(res.data));
            }}
            className="flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-900 hover:bg-amber-100 transition"
          >
            <span className="font-bold text-amber-700">[Co. A]</span> Silver Coin (₹50)
          </button>

          <button
            type="button"
            onClick={() => {
              setBarcodeInput('BAI000050');
              void ipcClient.scanBillingProduct('BAI000050').then((res) => res.success && res.data && addProductToCart(res.data));
            }}
            className="flex items-center gap-1.5 rounded-lg border border-indigo-300 bg-indigo-50 px-2.5 py-1 text-[11px] font-medium text-indigo-900 hover:bg-indigo-100 transition"
          >
            <span className="font-bold text-indigo-700">[Co. B]</span> Floral Brooch (₹50)
          </button>

          <button
            type="button"
            onClick={() => {
              setBarcodeInput('AGJ000001');
              void ipcClient.scanBillingProduct('AGJ000001').then((res) => res.success && res.data && addProductToCart(res.data));
            }}
            className="flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-900 hover:bg-amber-100 transition"
          >
            <span className="font-bold text-amber-700">[Co. A]</span> Gold Ring (AGJ000001)
          </button>

          <button
            type="button"
            onClick={() => {
              setBarcodeInput('BHD000001');
              void ipcClient.scanBillingProduct('BHD000001').then((res) => res.success && res.data && addProductToCart(res.data));
            }}
            className="flex items-center gap-1.5 rounded-lg border border-indigo-300 bg-indigo-50 px-2.5 py-1 text-[11px] font-medium text-indigo-900 hover:bg-indigo-100 transition"
          >
            <span className="font-bold text-indigo-700">[Co. B]</span> Royal Silk (BHD000001)
          </button>
        </div>
      </div>

      {/* Main Terminal Workspace: 2-Column Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start flex-1">
        {/* Left 7 Columns: Scanned Items Table */}
        <div className="lg:col-span-8 flex flex-col rounded-2xl border border-cream-300 bg-white shadow-sm overflow-hidden">
          {/* Table Header */}
          <div className="flex items-center justify-between border-b border-cream-200 px-6 py-4 bg-cream-50/70">
            <div>
              <h3 className="text-sm font-bold text-stone-900">Current Customer Cart</h3>
              <p className="text-xs text-stone-500">
                {cart.length} unique products • {cart.reduce((s, i) => s + i.cartQuantity, 0)} total units
              </p>
            </div>

            {cart.length > 0 && (
              <button
                type="button"
                onClick={clearCart}
                className="text-xs font-semibold text-rose-600 hover:text-rose-700 hover:underline"
              >
                Clear Cart
              </button>
            )}
          </div>

          {/* Table Body */}
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center text-stone-500">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-cream-100 text-stone-400 mb-3">
                <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                </svg>
              </div>
              <h4 className="text-sm font-bold text-stone-700">Customer Cart is Empty</h4>
              <p className="mt-1 text-xs text-stone-500 max-w-sm">
                Scan product barcodes from Company A and Company B, or click quick test items above to start building the bill.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-cream-200 bg-cream-50/70 text-[11px] font-bold uppercase tracking-wider text-stone-600">
                    <th className="py-3 px-3">Product & Category</th>
                    <th className="py-3 px-3">Company</th>
                    <th className="py-3 px-3 text-right">Orig. Rate</th>
                    <th className="py-3 px-3 text-center">Disc. (%)</th>
                    <th className="py-3 px-3 text-right">Net Rate</th>
                    <th className="py-3 px-3 text-center">Qty</th>
                    <th className="py-3 px-3 text-right">Line Total</th>
                    <th className="py-3 px-2 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cream-100">
                  {cart.map((item) => {
                    const isCompanyA =
                      item.companyCode === 'COMPANY_A' || item.companyName.includes('Company A');
                    const itemPct =
                      item.discountPercentage !== undefined ? item.discountPercentage : discountPercentage;
                    const itemDisc = Math.round((item.unitPrice * (itemPct / 100)) * 100) / 100;
                    const netUnitPrice = Math.round((item.unitPrice - itemDisc) * 100) / 100;
                    const lineTotal = Math.round((netUnitPrice * item.cartQuantity) * 100) / 100;

                    return (
                      <tr key={item.id} className="hover:bg-cream-50/50 transition">
                        {/* Product Name & Category */}
                        <td className="py-3.5 px-3">
                          <div className="font-bold text-stone-900">{item.name}</div>
                          <div className="flex items-center gap-1.5 text-[11px] text-stone-500 font-mono mt-0.5">
                            <span>{item.barcode}</span>
                            <span>•</span>
                            <span className="font-sans text-stone-600">{item.categoryName}</span>
                          </div>
                          {item.pricingBreakdown && (
                            <div className="text-[10px] text-amber-700 font-medium mt-0.5">
                              {item.pricingBreakdown}
                            </div>
                          )}
                        </td>

                        {/* Company Badge */}
                        <td className="py-3.5 px-3">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold border ${
                              isCompanyA
                                ? 'bg-amber-50 text-amber-900 border-amber-300'
                                : 'bg-indigo-50 text-indigo-900 border-indigo-300'
                            }`}
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${
                                isCompanyA ? 'bg-amber-600' : 'bg-indigo-600'
                              }`}
                            />
                            {item.companyName.includes('Company A') ? 'Co. A' : item.companyName.includes('Company B') ? 'Co. B' : item.companyName}
                          </span>
                        </td>

                        {/* Original Unit Price */}
                        <td className="py-3.5 px-3 text-right">
                          <span className={`font-semibold ${itemPct > 0 ? 'line-through text-stone-400' : 'text-stone-800'}`}>
                            ₹{item.unitPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </td>

                        {/* Discount (%) with Quick Row Input */}
                        <td className="py-3.5 px-3 text-center">
                          <div className="inline-flex flex-col items-center">
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                min="0"
                                max="100"
                                step="0.5"
                                value={itemPct === 0 ? '' : itemPct}
                                onChange={(e) => handleItemDiscountChange(item.id, parseFloat(e.target.value) || 0)}
                                placeholder="0"
                                title="Edit item discount %"
                                className="w-13 rounded-md border border-cream-300 bg-white px-1.5 py-0.5 text-center text-xs font-bold text-stone-900 focus:border-amber-600 focus:outline-none"
                              />
                              <span className="text-[11px] font-bold text-stone-500">%</span>
                            </div>
                            {itemPct > 0 && (
                              <span className="text-[10px] font-bold text-emerald-700 mt-0.5">
                                -₹{itemDisc.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Net Unit Rate (After Discount) */}
                        <td className="py-3.5 px-3 text-right">
                          <div className="font-bold text-stone-900 text-xs">
                            ₹{netUnitPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                          {itemPct > 0 && (
                            <div className="text-[10px] text-emerald-700 font-semibold">
                              ({itemPct}% off)
                            </div>
                          )}
                        </td>

                        {/* Quantity Controls */}
                        <td className="py-3.5 px-3">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => updateQuantity(item.id, -1)}
                              className="flex h-6 w-6 items-center justify-center rounded-lg border border-cream-300 bg-white font-bold text-stone-700 hover:bg-cream-100 shadow-2xs"
                            >
                              -
                            </button>
                            <span className="w-7 text-center font-bold text-stone-900 text-xs">
                              {item.cartQuantity}
                            </span>
                            <button
                              type="button"
                              onClick={() => updateQuantity(item.id, 1)}
                              className="flex h-6 w-6 items-center justify-center rounded-lg border border-cream-300 bg-white font-bold text-stone-700 hover:bg-cream-100 shadow-2xs"
                            >
                              +
                            </button>
                          </div>
                        </td>

                        {/* Line Total */}
                        <td className="py-3.5 px-3 text-right">
                          {itemPct > 0 && (
                            <div className="line-through text-stone-400 text-[10px]">
                              ₹{(item.unitPrice * item.cartQuantity).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                          )}
                          <div className="font-bold text-stone-900 text-sm">
                            ₹{lineTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                        </td>

                        {/* Action: Remove */}
                        <td className="py-3.5 px-2 text-center">
                          <button
                            type="button"
                            onClick={() => removeCartItem(item.id)}
                            className="rounded p-1 text-stone-400 hover:text-rose-600 transition"
                            title="Remove from cart"
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right 4 Columns: Customer Details & Checkout Card */}
        <div className="lg:col-span-4 flex flex-col gap-4">
          <div className="rounded-2xl border border-cream-300 bg-white p-5 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-stone-900 border-b border-cream-200 pb-2">
              Customer & Payment
            </h3>

            {/* Customer Inputs */}
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-stone-700">Customer Name</label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="e.g. Ramesh Kumar (Optional)"
                  className="mt-1 w-full rounded-xl border border-cream-300 bg-cream-50/50 px-3 py-2 text-xs text-stone-900 placeholder-stone-400 focus:border-amber-600 focus:bg-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700">Mobile Number</label>
                <input
                  type="text"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="e.g. +91 9876543210 (Optional)"
                  className="mt-1 w-full rounded-xl border border-cream-300 bg-cream-50/50 px-3 py-2 text-xs text-stone-900 placeholder-stone-400 focus:border-amber-600 focus:bg-white focus:outline-none"
                />
              </div>

              {/* Payment Mode */}
              <div>
                <label className="block text-xs font-semibold text-stone-700">Payment Method</label>
                <div className="mt-1.5 grid grid-cols-3 gap-2">
                  {(['CASH', 'UPI', 'CARD'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setPaymentMethod(mode)}
                      className={`rounded-xl border py-2 text-xs font-bold transition ${
                        paymentMethod === mode
                          ? 'border-amber-600 bg-amber-600 text-white shadow-xs'
                          : 'border-cream-300 bg-white text-stone-700 hover:bg-cream-50'
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Financial Summary & Company Breakdowns */}
            <div className="rounded-xl border border-cream-200 bg-cream-50/60 p-3.5 space-y-2 text-xs">
              <div className="flex justify-between text-stone-600">
                <span>Total Items:</span>
                <span className="font-semibold text-stone-900">
                  {cart.reduce((s, i) => s + i.cartQuantity, 0)} units
                </span>
              </div>

              {/* Company A Breakdown */}
              {companyABreakdown.length > 0 && (
                <div className="flex items-center justify-between rounded-lg bg-amber-500/10 px-2 py-1 text-amber-900">
                  <span className="flex items-center gap-1 font-semibold">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-600" />
                    Company A ({companyABreakdown.length} items):
                  </span>
                  <span className="font-bold">₹{companyASubtotal.toLocaleString()}</span>
                </div>
              )}

              {/* Company B Breakdown */}
              {companyBBreakdown.length > 0 && (
                <div className="flex items-center justify-between rounded-lg bg-indigo-500/10 px-2 py-1 text-indigo-900">
                  <span className="flex items-center gap-1 font-semibold">
                    <span className="h-1.5 w-1.5 rounded-full bg-indigo-600" />
                    Company B ({companyBBreakdown.length} items):
                  </span>
                  <span className="font-bold">₹{companyBSubtotal.toLocaleString()}</span>
                </div>
              )}

              <div className="border-t border-cream-200 pt-2 flex justify-between text-stone-700 font-medium">
                <span>Gross Subtotal:</span>
                <span>₹{subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>

              {/* Percent Discount (%) Input and Presets */}
              <div className="space-y-2 pt-2 border-t border-cream-200 bg-amber-50/50 rounded-xl p-3 border border-amber-200/60">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex flex-col">
                    <span className="text-stone-800 font-bold text-xs">
                      Bill Discount (%):
                    </span>
                    <span className="text-[10px] text-stone-500">
                      Applies evenly across all items
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.5"
                      value={discountPercentage || ''}
                      onChange={(e) => {
                        const val = Math.max(0, Math.min(100, parseFloat(e.target.value) || 0));
                        handleGlobalDiscountChange(val);
                      }}
                      placeholder="0"
                      className="w-16 rounded-lg border border-cream-300 bg-white px-2 py-1 text-right text-xs font-bold text-stone-900 focus:border-amber-600 focus:outline-none"
                    />
                    <span className="font-bold text-stone-500 text-xs">%</span>
                  </div>
                </div>

                {/* Quick % preset buttons */}
                <div className="flex items-center gap-1.5">
                  {[0, 5, 10, 15, 20].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => handleGlobalDiscountChange(pct)}
                      className={`flex-1 rounded-lg py-1 text-[10px] font-bold border transition ${
                        discountPercentage === pct
                          ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                          : 'bg-white text-stone-600 border-cream-300 hover:bg-cream-100'
                      }`}
                    >
                      {pct === 0 ? 'None' : `${pct}%`}
                    </button>
                  ))}
                </div>

                {totalDiscountAmount > 0 && (
                  <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-2 text-[11px] text-emerald-800 flex items-center justify-between">
                    <span className="font-semibold">Discount Savings:</span>
                    <span className="font-bold text-xs">
                      -₹{totalDiscountAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="text-stone-600">Tax / GST (₹):</span>
                <input
                  type="number"
                  min="0"
                  value={taxAmount || ''}
                  onChange={(e) => setTaxAmount(Math.max(0, parseFloat(e.target.value) || 0))}
                  placeholder="0"
                  className="w-24 rounded-lg border border-cream-300 bg-white px-2 py-1 text-right text-xs text-stone-900"
                />
              </div>

              {/* Grand Total */}
              <div className="border-t-2 border-dashed border-cream-300 pt-2 flex justify-between items-center text-sm">
                <span className="font-bold text-stone-900">Grand Total:</span>
                <span className="text-lg font-black text-amber-700">
                  ₹{grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            {/* Complete Sale CTA */}
            <button
              type="button"
              onClick={handleCompleteSale}
              disabled={completingSale || cart.length === 0}
              className="w-full rounded-xl bg-gradient-to-r from-amber-600 to-amber-700 py-3 text-sm font-bold text-white shadow-lg shadow-amber-600/30 hover:from-amber-500 hover:to-amber-600 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {completingSale ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Generating Single Bill...
                </>
              ) : (
                <>
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Complete Sale & Create Single Bill</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Modal 1: Search & Browse Catalog Modal */}
      {catalogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-cream-300 bg-white p-6 shadow-2xl flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between border-b border-cream-200 pb-4">
              <div>
                <h3 className="text-base font-bold text-stone-900">Product Catalog (Both Companies)</h3>
                <p className="text-xs text-stone-500">
                  Search by product name or barcode to add directly into current customer bill
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCatalogOpen(false)}
                className="rounded-lg p-1 text-stone-400 hover:bg-cream-100 hover:text-stone-700"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mt-4">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => void handleSearchProducts(e.target.value)}
                placeholder="Search products (Gold, Silver, Silk, Kundan...)"
                className="w-full rounded-xl border border-cream-300 bg-cream-50/60 px-4 py-2.5 text-xs text-stone-900 placeholder-stone-400 focus:border-amber-600 focus:bg-white focus:outline-none"
              />
            </div>

            <div className="mt-4 flex-1 overflow-y-auto divide-y divide-cream-100">
              {loadingCatalog ? (
                <div className="flex items-center justify-center py-12 text-stone-500 text-xs">
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-amber-600 border-t-transparent mr-2" />
                  Loading products...
                </div>
              ) : catalogProducts.length === 0 ? (
                <div className="py-12 text-center text-xs text-stone-500">
                  No products found matching &quot;{searchQuery}&quot;.
                </div>
              ) : (
                catalogProducts.map((p) => {
                  const isCompA = p.companyCode === 'COMPANY_A' || p.companyName.includes('Company A');
                  return (
                    <div
                      key={p.id}
                      className="flex items-center justify-between py-3 px-2 hover:bg-cream-50 rounded-xl transition"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-stone-900">{p.name}</span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold border ${
                              isCompA
                                ? 'bg-amber-50 text-amber-900 border-amber-300'
                                : 'bg-indigo-50 text-indigo-900 border-indigo-300'
                            }`}
                          >
                            {p.companyName}
                          </span>
                        </div>
                        <div className="text-[11px] text-stone-500 font-mono mt-0.5">
                          {p.barcode} • {p.categoryName} • Stock: {p.stockQuantity}
                        </div>
                        {p.pricingBreakdown && (
                          <div className="text-[10px] text-amber-700 font-medium mt-0.5">
                            {p.pricingBreakdown}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="text-right font-bold text-stone-900 text-xs">
                          ₹{p.unitPrice.toLocaleString()}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            addProductToCart(p);
                            setCatalogOpen(false);
                          }}
                          className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-500 transition shadow-2xs"
                        >
                          + Add to Bill
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal 2: Single Customer Invoice Receipt Modal */}
      {completedBill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-3xl border border-cream-300 bg-white p-6 shadow-2xl flex flex-col max-h-[90vh]">
            {/* Action Bar (Not printed) */}
            <div className="flex items-center justify-between pb-3 border-b border-cream-200 print:hidden">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-600" />
                Single Bill Generated Successfully
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePrintReceipt}
                  className="rounded-xl border border-cream-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-cream-100 shadow-2xs transition flex items-center gap-1"
                >
                  <svg className="h-4 w-4 text-stone-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  <span>Print Receipt</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCompletedBill(null)}
                  className="rounded-xl bg-amber-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-amber-500 shadow-2xs transition"
                >
                  Start New Sale
                </button>
              </div>
            </div>

            {/* Printable Receipt Body */}
            <div id="printable-receipt" className="overflow-y-auto p-4 space-y-4 font-mono text-xs text-stone-850">
              {/* Store Header */}
              <div className="text-center border-b border-dashed border-stone-300 pb-3">
                <h2 className="text-lg font-black tracking-tight font-sans text-stone-900">
                  RETAIL STORE POS
                </h2>
                <p className="text-[11px] text-stone-500 font-sans">
                  Unified Multi-Company Retail Counter
                </p>
                <div className="mt-2 text-[10px] text-stone-600">
                  <span>Invoice #: </span>
                  <span className="font-bold text-stone-900">{completedBill.invoiceNumber}</span>
                </div>
                <div className="text-[10px] text-stone-500">
                  {new Date(completedBill.createdAt).toLocaleString()} • Cashier: {completedBill.billingUserName}
                </div>
              </div>

              {/* Customer Info */}
              {(completedBill.customerName || completedBill.customerPhone) && (
                <div className="text-[11px] border-b border-dashed border-stone-300 pb-2 font-sans">
                  {completedBill.customerName && (
                    <div><span className="text-stone-500">Customer:</span> <span className="font-bold">{completedBill.customerName}</span></div>
                  )}
                  {completedBill.customerPhone && (
                    <div><span className="text-stone-500">Phone:</span> {completedBill.customerPhone}</div>
                  )}
                </div>
              )}

              {/* Itemized Table */}
              <div className="space-y-2">
                <div className="flex justify-between font-bold text-[10px] uppercase border-b border-stone-200 pb-1 text-stone-600">
                  <span>Item / Company</span>
                  <span>Qty x Rate</span>
                  <span>Amount</span>
                </div>

                {completedBill.items.map((it) => (
                  <div key={it.id} className="border-b border-stone-100 pb-1.5">
                    <div className="flex justify-between font-bold text-stone-900">
                      <span>{it.productName}</span>
                      <span>₹{it.totalPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between text-[10px] text-stone-500">
                      <span>
                        [{it.companyName}] {it.barcode}
                        {it.discountPercentage && it.discountPercentage > 0 ? (
                          <span className="text-emerald-700 font-bold ml-1">
                            (Orig: ₹{it.unitPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} -{it.discountPercentage}%)
                          </span>
                        ) : null}
                      </span>
                      <span>
                        {it.quantity} x ₹{(it.netUnitPrice ?? it.unitPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Company Breakdown Summary */}
              {completedBill.companyBreakdowns && completedBill.companyBreakdowns.length > 0 && (
                <div className="rounded-lg bg-stone-50 p-2.5 space-y-1 text-[11px] font-sans border border-stone-200">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-stone-500">
                    Company Breakdown:
                  </div>
                  {completedBill.companyBreakdowns.map((cb) => (
                    <div key={cb.companyId} className="flex justify-between text-stone-700">
                      <span>• {cb.companyName} ({cb.itemCount} items):</span>
                      <span className="font-semibold">₹{cb.subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Financial Totals */}
              <div className="border-t border-dashed border-stone-300 pt-2 space-y-1 text-xs">
                <div className="flex justify-between text-stone-600">
                  <span>Gross Subtotal:</span>
                  <span>₹{completedBill.subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                {completedBill.discount > 0 && (
                  <div className="flex justify-between text-emerald-700 font-semibold">
                    <span>
                      Discount {completedBill.discountPercentage ? `(${completedBill.discountPercentage}%)` : ''}:
                    </span>
                    <span>-₹{completedBill.discount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                )}
                {completedBill.tax > 0 && (
                  <div className="flex justify-between text-stone-600">
                    <span>Tax / GST:</span>
                    <span>+₹{completedBill.tax.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                )}
                <div className="flex justify-between border-t-2 border-stone-900 pt-1 text-base font-black text-stone-900">
                  <span>Grand Total:</span>
                  <span>₹{completedBill.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between text-[11px] text-stone-600 pt-1">
                  <span>Payment Mode:</span>
                  <span className="font-bold">{completedBill.paymentMethod} (PAID)</span>
                </div>
              </div>

              {/* Footer */}
              <div className="text-center border-t border-dashed border-stone-300 pt-3 text-[10px] text-stone-500 font-sans">
                Thank you for your visit! Single receipt valid for all included company products.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
