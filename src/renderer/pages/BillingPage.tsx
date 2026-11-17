import React, { useEffect, useRef, useState } from 'react';
import type {
  AuthSessionPayload,
  BillDto,
  BillingUserDto,
  CreateBillItemInput,
  ScannedProductDto,
} from '../../shared/types/ipc';
import { useToast } from '../context/ToastContext';
import { ipcClient } from '../services/ipcClient';
import { SalesReceiptModal } from '../components/SalesReceiptModal';

interface CartItem extends ScannedProductDto {
  cartQuantity: number;
  itemTotal: number;
}

export function isMeterProduct(item: {
  priceType?: string;
  categoryName?: string | null;
  pricingBreakdown?: string | null;
  details?: Record<string, any> | null;
}): boolean {
  if (item.priceType === 'PER_METER') return true;
  if (/meter|fabric|linear|cloth|wire/i.test(item.categoryName || '')) return true;
  if (item.details?.sellingPricePerMeter || item.details?.ratePerMeter) return true;
  if (/per meter|\/meter|\/m/i.test(item.pricingBreakdown || '')) return true;
  return false;
}

interface BillingPageProps {
  session: AuthSessionPayload;
  onNavigateToHistory?: () => void;
  editingBillId?: string | null;
  onCancelEdit?: () => void;
}

export const BillingPage: React.FC<BillingPageProps> = ({
  session,
  onNavigateToHistory,
  editingBillId,
  onCancelEdit,
}) => {
  const { showSuccess, showError, showInfo } = useToast();

  const [barcodeInput, setBarcodeInput] = useState('');
  const [scanning, setScanning] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);

  // Editing existing bill state
  const [editingBill, setEditingBill] = useState<BillDto | null>(null);
  const [loadingEditingBill, setLoadingEditingBill] = useState(false);

  // Customer Details & 2 Payment Methods: CASH or ONLINE
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'ONLINE'>('CASH');
  const [discountPercentage, setDiscountPercentage] = useState<number>(0);
  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const [discountPctInput, setDiscountPctInput] = useState<string>('');
  const [discountAmtInput, setDiscountAmtInput] = useState<string>('');
  const [lastEditedDiscount, setLastEditedDiscount] = useState<'PERCENT' | 'AMOUNT'>('PERCENT');
  const [taxPercentage, setTaxPercentage] = useState<number>(0);
  const [taxAmount, setTaxAmount] = useState<number>(0);
  const [taxPctInput, setTaxPctInput] = useState<string>('');
  const [taxAmtInput, setTaxAmtInput] = useState<string>('');
  const [lastEditedTax, setLastEditedTax] = useState<'PERCENT' | 'AMOUNT'>('PERCENT');
  const [notes, setNotes] = useState('');

  const resetDiscountState = () => {
    setDiscountPercentage(0);
    setDiscountAmount(0);
    setDiscountPctInput('');
    setDiscountAmtInput('');
    setLastEditedDiscount('PERCENT');
  };

  const resetTaxState = () => {
    setTaxPercentage(0);
    setTaxAmount(0);
    setTaxPctInput('');
    setTaxAmtInput('');
    setLastEditedTax('PERCENT');
  };

  // Processing sale state
  const [completingSale, setCompletingSale] = useState(false);
  const [completedBill, setCompletedBill] = useState<BillDto | null>(null);

  const STORAGE_KEY = 'pos_active_operator_id';

  // Registered Billing Users & Active Operating User
  const [registeredBillingUsers, setRegisteredBillingUsers] = useState<BillingUserDto[]>([]);
  const [selectedOperatorId, setSelectedOperatorId] = useState<string>(() => {
    try {
      return localStorage.getItem('pos_active_operator_id') || '';
    } catch {
      return '';
    }
  });
  const [showOperatorModal, setShowOperatorModal] = useState<boolean>(false);
  const [, setLoadingBillingUsers] = useState<boolean>(false);

  const changeOperator = (newId: string) => {
    setSelectedOperatorId(newId);
    try {
      if (newId) {
        localStorage.setItem(STORAGE_KEY, newId);
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {}
  };

  // Search & Catalog Modal
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [catalogProducts, setCatalogProducts] = useState<ScannedProductDto[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);

  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const scannerBufferRef = useRef<string>('');
  const lastKeyTimeRef = useRef<number>(0);
  const scanningLockRef = useRef<boolean>(false);

  // Fetch registered billing users from Super Admin
  useEffect(() => {
    let isCurrent = true;
    const fetchUsers = async () => {
      setLoadingBillingUsers(true);
      try {
        const res = await ipcClient.listBillingUsers();
        if (!isCurrent) return;
        if (res.success) {
          setRegisteredBillingUsers(res.data);

          // Check if an operator was already selected or saved in session storage
          let activeId = selectedOperatorId;
          if (!activeId) {
            try {
              activeId = localStorage.getItem(STORAGE_KEY) || '';
            } catch {}
          }

          const matchedUser = res.data.find((u) => u.id === activeId);
          if (matchedUser) {
            // Already chosen and valid across tab switches: preserve without popup!
            setSelectedOperatorId(matchedUser.id);
          } else if (!editingBillId && res.data.length > 0) {
            // Only prompt if NO operator has been chosen yet
            setShowOperatorModal(true);
          }
        }
      } catch (err) {
        console.error('Error fetching billing users:', err);
      } finally {
        if (isCurrent) {
          setLoadingBillingUsers(false);
        }
      }
    };

    void fetchUsers();
    return () => {
      isCurrent = false;
    };
  }, []);

  // Load existing bill when editingBillId is provided
  useEffect(() => {
    if (!editingBillId) {
      setEditingBill(null);
      return;
    }

    let isCurrent = true;
    setLoadingEditingBill(true);

    const loadBill = async () => {
      try {
        const res = await ipcClient.getBillById(editingBillId);
        if (!isCurrent) return;

        if (res.success) {
          const bill = res.data;
          setEditingBill(bill);
          if (bill.billingUserId) {
            setSelectedOperatorId(bill.billingUserId);
          }
          setCustomerName(bill.customerName || '');
          setCustomerPhone(bill.customerPhone || '');
          const pm = (bill.paymentMethod || '').toUpperCase();
          setPaymentMethod(pm === 'ONLINE' || pm === 'UPI' || pm === 'CARD' ? 'ONLINE' : 'CASH');
          const billPct = bill.discountPercentage || 0;
          const billAmt = bill.discount || 0;
          setDiscountPercentage(billPct);
          setDiscountAmount(billAmt);
          setDiscountPctInput(billPct > 0 ? (billPct % 1 === 0 ? String(billPct) : billPct.toFixed(2)) : '');
          setDiscountAmtInput(billAmt > 0 ? (billAmt % 1 === 0 ? String(billAmt) : billAmt.toFixed(2)) : '');
          setLastEditedDiscount(billPct > 0 ? 'PERCENT' : 'AMOUNT');
          const billTaxPct = bill.taxPercentage || 0;
          const billTaxAmt = bill.tax || 0;
          setTaxPercentage(billTaxPct);
          setTaxAmount(billTaxAmt);
          setTaxPctInput(billTaxPct > 0 ? (billTaxPct % 1 === 0 ? String(billTaxPct) : billTaxPct.toFixed(2)) : '');
          setTaxAmtInput(billTaxAmt > 0 ? (billTaxAmt % 1 === 0 ? String(billTaxAmt) : billTaxAmt.toFixed(2)) : '');
          setLastEditedTax(billTaxPct > 0 ? 'PERCENT' : 'AMOUNT');
          setNotes(bill.notes || '');

          const mappedCart: CartItem[] = await Promise.all(
            (bill.items || []).map(async (it) => {
              let detailsObj: any = {};
              if (it.detailsJson) {
                try {
                  detailsObj = JSON.parse(it.detailsJson);
                } catch {}
              }

              // Retrieve the real current stock of this product from database
              let currentStock = 0;
              try {
                const scanRes = await ipcClient.scanBillingProduct(it.barcode);
                if (scanRes.success) {
                  currentStock = scanRes.data.stockQuantity;
                }
              } catch {}

              // For a bill being edited, available stock is current inventory + quantity already in this bill
              const totalAvailable = Math.round((currentStock + it.quantity) * 100) / 100;

              return {
                id: it.productId || it.id,
                companyId: it.companyId,
                companyName: it.companyName,
                companyCode: it.companyName.includes('Company A') ? 'COMPANY_A' : 'COMPANY_B',
                categoryId: '',
                categoryName: it.categoryName || 'General',
                name: it.productName,
                barcode: it.barcode,
                stockQuantity: totalAvailable,
                unitPrice: it.unitPrice,
                priceType: 'FIXED',
                pricingBreakdown: `Unit: ₹${it.unitPrice.toLocaleString()}`,
                details: detailsObj,
                cartQuantity: it.quantity,
                itemTotal: it.totalPrice,
              };
            })
          );

          setCart(mappedCart);
          showSuccess(`Loaded Invoice #${bill.invoiceNumber} for editing.`);
        } else {
          showError(res.error || 'Failed to retrieve invoice for editing.');
        }
      } catch {
        showError('Error loading bill for editing.');
      } finally {
        if (isCurrent) {
          setLoadingEditingBill(false);
        }
      }
    };

    void loadBill();

    return () => {
      isCurrent = false;
    };
  }, [editingBillId]);

  // Auto-focus barcode input on mount, modal close, and when clicking non-editable UI areas
  useEffect(() => {
    if (!catalogOpen && !completedBill && !showOperatorModal) {
      barcodeInputRef.current?.focus();
    }

    const handleDocumentClick = (e: MouseEvent) => {
      // If a modal is open, do not disrupt focus inside modal
      if (catalogOpen || Boolean(completedBill) || showOperatorModal) return;

      const target = e.target as HTMLElement | null;
      if (!target) return;

      // Allow natural focus inside other inputs / textareas / contenteditables
      const isInteractiveInput =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable ||
        Boolean(target.closest('input')) ||
        Boolean(target.closest('textarea'));

      if (isInteractiveInput) return;

      // When clicking outside editable inputs (e.g. table, whitespace, card, button action),
      // smoothly restore focus to barcode input so the next physical scanner trigger works immediately
      setTimeout(() => {
        if (!catalogOpen && !Boolean(completedBill) && !showOperatorModal) {
          barcodeInputRef.current?.focus();
        }
      }, 50);
    };

    document.addEventListener('click', handleDocumentClick);
    return () => document.removeEventListener('click', handleDocumentClick);
  }, [completedBill, catalogOpen, editingBillId, showOperatorModal]);

  // Load catalog for search modal
  const handleOpenCatalog = async () => {
    setCatalogOpen(true);
    setLoadingCatalog(true);
    try {
      const res = await ipcClient.searchBillingProducts(searchQuery);
      if (res.success) {
        setCatalogProducts(res.data);
      } else {
        showError(res.error || 'Failed to load products.');
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
      } else {
        showError(res.error || 'Search failed.');
      }
    } catch {
      showError('Search failed.');
    } finally {
      setLoadingCatalog(false);
    }
  };

  // Add scanned product to cart with strict stock availability checking
  const addProductToCart = (product: ScannedProductDto) => {
    const isMeter = isMeterProduct(product);
    const unit = isMeter ? 'meters' : 'units';

    // 1. Check if product is completely out of stock
    if (product.stockQuantity <= 0) {
      showError(`"${product.name}" is completely out of stock (Available: 0 ${unit}).`);
      return;
    }

    const existingIndex = cart.findIndex((item) => item.id === product.id);
    if (existingIndex >= 0) {
      const currentItem = cart[existingIndex];
      const step = isMeter ? 0.5 : 1;
      const nextQty = Math.round((currentItem.cartQuantity + step) * 100) / 100;

      // Check if increasing exceeds actual available stock
      if (nextQty > product.stockQuantity) {
        showError(
          `Cannot add more. Maximum available stock for "${product.name}" is ${product.stockQuantity} ${unit} (You already have ${currentItem.cartQuantity} ${unit} in cart).`
        );
        return;
      }

      setCart((prev) => {
        const updated = [...prev];
        updated[existingIndex] = {
          ...currentItem,
          cartQuantity: nextQty,
          itemTotal: Math.round(currentItem.unitPrice * nextQty * 100) / 100,
        };
        return updated;
      });
    } else {
      const initialQty = 1;
      if (initialQty > product.stockQuantity) {
        // For fractional meter product where only e.g. 0.5m is left in stock
        if (isMeter && product.stockQuantity > 0) {
          const newItem: CartItem = {
            ...product,
            cartQuantity: product.stockQuantity,
            itemTotal: Math.round(product.unitPrice * product.stockQuantity * 100) / 100,
          };
          setCart((prev) => [newItem, ...prev]);
        } else {
          showError(`Cannot add "${product.name}". Insufficient stock available (${product.stockQuantity} ${unit}).`);
          return;
        }
      } else {
        const newItem: CartItem = {
          ...product,
          cartQuantity: initialQty,
          itemTotal: Math.round(product.unitPrice * 100) / 100,
        };
        setCart((prev) => [newItem, ...prev]);
      }
    }

    showSuccess(`Added "${product.name}" to cart`);
    setBarcodeInput('');
    setTimeout(() => {
      barcodeInputRef.current?.focus();
    }, 50);
  };

  // Dedicated barcode scan executor (used by direct form submit, global keyboard listener, and hardware laser scanner)
  const executeBarcodeScan = async (rawCode: string) => {
    const code = rawCode.trim();
    if (!code || scanningLockRef.current) return;

    scanningLockRef.current = true;
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
      setBarcodeInput('');
      scannerBufferRef.current = '';
      scanningLockRef.current = false;
      setTimeout(() => {
        barcodeInputRef.current?.focus();
      }, 50);
    }
  };

  // Handle Barcode Scan Form Submit
  const handleScanSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    await executeBarcodeScan(barcodeInput);
  };

  // Cart item quantity adjustments with strict backend stock limits
  const updateQuantity = (productId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.id === productId) {
            const isMeter = isMeterProduct(item);
            const unit = isMeter ? 'meters' : 'units';
            const minQty = isMeter ? 0.1 : 1;
            const newQty = Math.round((item.cartQuantity + delta) * 100) / 100;

            // Prevent increasing beyond available stock
            if (delta > 0 && newQty > item.stockQuantity) {
              showError(
                `Cannot increase. Maximum available stock for "${item.name}" is ${item.stockQuantity} ${unit}.`
              );
              return item;
            }

            const clampedQty = Math.max(minQty, newQty);
            return {
              ...item,
              cartQuantity: clampedQty,
              itemTotal: Math.round(item.unitPrice * clampedQty * 100) / 100,
            };
          }
          return item;
        })
        .filter((item) => item.cartQuantity > 0)
    );
    setTimeout(() => {
      barcodeInputRef.current?.focus();
    }, 50);
  };

  const setDirectQuantity = (productId: string, qty: number) => {
    setCart((prev) =>
      prev.map((item) => {
        if (item.id === productId) {
          const isMeter = isMeterProduct(item);
          const unit = isMeter ? 'meters' : 'units';
          const minQty = isMeter ? 0.05 : 1;
          const requestedQty = Math.round(qty * 100) / 100;

          if (requestedQty > item.stockQuantity) {
            showError(
              `Requested quantity (${requestedQty} ${unit}) exceeds available stock (${item.stockQuantity} ${unit}) for "${item.name}". Clamped to available stock.`
            );
          }

          const maxAllowed = Math.max(minQty, item.stockQuantity);
          const clampedQty = Math.max(minQty, Math.min(maxAllowed, requestedQty));
          return {
            ...item,
            cartQuantity: clampedQty,
            itemTotal: Math.round(item.unitPrice * clampedQty * 100) / 100,
          };
        }
        return item;
      })
    );
  };

  const removeCartItem = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.id !== productId));
    setTimeout(() => {
      barcodeInputRef.current?.focus();
    }, 50);
  };

  const clearCart = () => {
    if (cart.length === 0) return;
    if (window.confirm('Are you sure you want to clear all items from the current bill?')) {
      setCart([]);
      resetDiscountState();
      resetTaxState();
      setNotes('');
      barcodeInputRef.current?.focus();
    }
  };

  // Financial calculations
  const subtotal = Math.round(cart.reduce((sum, item) => sum + item.unitPrice * item.cartQuantity, 0) * 100) / 100;
  const totalDiscountAmount =
    lastEditedDiscount === 'AMOUNT'
      ? Math.min(subtotal, Math.round(discountAmount * 100) / 100)
      : Math.round(subtotal * (discountPercentage / 100) * 100) / 100;
  const effectiveDiscountPercentage =
    subtotal > 0 ? Math.round((totalDiscountAmount / subtotal) * 100 * 100) / 100 : discountPercentage;
  const netSubtotal = Math.max(0, Math.round((subtotal - totalDiscountAmount) * 100) / 100);
  const totalTaxAmount =
    lastEditedTax === 'AMOUNT'
      ? Math.max(0, Math.round(taxAmount * 100) / 100)
      : Math.round(netSubtotal * (taxPercentage / 100) * 100) / 100;
  const effectiveTaxPercentage =
    netSubtotal > 0 ? Math.round((totalTaxAmount / netSubtotal) * 100 * 100) / 100 : taxPercentage;
  const grandTotal = Math.max(0, Math.round((netSubtotal + totalTaxAmount) * 100) / 100);

  // Synchronize discount when percent input changes
  const handleDiscountPercentChange = (valStr: string) => {
    setLastEditedDiscount('PERCENT');
    setDiscountPctInput(valStr);

    if (!valStr.trim()) {
      setDiscountPercentage(0);
      setDiscountAmount(0);
      setDiscountAmtInput('');
      return;
    }

    const val = parseFloat(valStr);
    if (isNaN(val)) {
      setDiscountPercentage(0);
      setDiscountAmount(0);
      setDiscountAmtInput('');
      return;
    }

    const clampedPct = Math.max(0, Math.min(100, val));
    setDiscountPercentage(clampedPct);

    if (subtotal > 0) {
      const computedAmt = Math.round(subtotal * (clampedPct / 100) * 100) / 100;
      setDiscountAmount(computedAmt);
      setDiscountAmtInput(computedAmt > 0 ? (computedAmt % 1 === 0 ? String(computedAmt) : computedAmt.toFixed(2)) : '');
    } else {
      setDiscountAmount(0);
      setDiscountAmtInput('');
    }
  };

  // Synchronize discount when amount (₹) input changes
  const handleDiscountAmountChange = (valStr: string) => {
    setLastEditedDiscount('AMOUNT');
    setDiscountAmtInput(valStr);

    if (!valStr.trim()) {
      setDiscountAmount(0);
      setDiscountPercentage(0);
      setDiscountPctInput('');
      return;
    }

    const val = parseFloat(valStr);
    if (isNaN(val)) {
      setDiscountAmount(0);
      setDiscountPercentage(0);
      setDiscountPctInput('');
      return;
    }

    const maxAllowed = subtotal > 0 ? subtotal : val;
    const clampedAmt = Math.max(0, Math.min(maxAllowed, val));
    setDiscountAmount(clampedAmt);

    if (subtotal > 0) {
      const computedPct = Math.min(100, Math.round((clampedAmt / subtotal) * 100 * 100) / 100);
      setDiscountPercentage(computedPct);
      setDiscountPctInput(computedPct > 0 ? (computedPct % 1 === 0 ? String(computedPct) : computedPct.toFixed(2)) : '');
    } else {
      setDiscountPercentage(0);
      setDiscountPctInput('');
    }
  };

  // Preset discount buttons (0%, 5%, 10%, 15%, 20%)
  const handlePresetDiscount = (pct: number) => {
    setLastEditedDiscount('PERCENT');
    if (pct <= 0) {
      setDiscountPercentage(0);
      setDiscountAmount(0);
      setDiscountPctInput('');
      setDiscountAmtInput('');
      return;
    }

    setDiscountPercentage(pct);
    setDiscountPctInput(String(pct));
    if (subtotal > 0) {
      const computedAmt = Math.round(subtotal * (pct / 100) * 100) / 100;
      setDiscountAmount(computedAmt);
      setDiscountAmtInput(computedAmt > 0 ? (computedAmt % 1 === 0 ? String(computedAmt) : computedAmt.toFixed(2)) : '');
    } else {
      setDiscountAmount(0);
      setDiscountAmtInput('');
    }
  };

  // Synchronize discount amount and percent whenever subtotal changes (items added / removed / qty changed)
  useEffect(() => {
    if (subtotal <= 0) {
      if (lastEditedDiscount === 'AMOUNT') {
        setDiscountPercentage(0);
        setDiscountPctInput('');
      } else {
        setDiscountAmount(0);
        setDiscountAmtInput('');
      }
      return;
    }

    if (lastEditedDiscount === 'PERCENT' && discountPercentage > 0) {
      const computedAmt = Math.round(subtotal * (discountPercentage / 100) * 100) / 100;
      setDiscountAmount(computedAmt);
      setDiscountAmtInput(computedAmt > 0 ? (computedAmt % 1 === 0 ? String(computedAmt) : computedAmt.toFixed(2)) : '');
    } else if (lastEditedDiscount === 'AMOUNT' && discountAmount > 0) {
      const clampedAmt = Math.min(subtotal, discountAmount);
      setDiscountAmount(clampedAmt);
      setDiscountAmtInput(clampedAmt > 0 ? (clampedAmt % 1 === 0 ? String(clampedAmt) : clampedAmt.toFixed(2)) : '');
      const computedPct = Math.min(100, Math.round((clampedAmt / subtotal) * 100 * 100) / 100);
      setDiscountPercentage(computedPct);
      setDiscountPctInput(computedPct > 0 ? (computedPct % 1 === 0 ? String(computedPct) : computedPct.toFixed(2)) : '');
    }
  }, [subtotal]);

  // Synchronize tax when percent input changes
  const handleTaxPercentChange = (valStr: string) => {
    setLastEditedTax('PERCENT');
    setTaxPctInput(valStr);

    if (!valStr.trim()) {
      setTaxPercentage(0);
      setTaxAmount(0);
      setTaxAmtInput('');
      return;
    }

    const val = parseFloat(valStr);
    if (isNaN(val)) {
      setTaxPercentage(0);
      setTaxAmount(0);
      setTaxAmtInput('');
      return;
    }

    const clampedPct = Math.max(0, val);
    setTaxPercentage(clampedPct);

    if (netSubtotal > 0) {
      const computedAmt = Math.round(netSubtotal * (clampedPct / 100) * 100) / 100;
      setTaxAmount(computedAmt);
      setTaxAmtInput(computedAmt > 0 ? (computedAmt % 1 === 0 ? String(computedAmt) : computedAmt.toFixed(2)) : '');
    } else {
      setTaxAmount(0);
      setTaxAmtInput('');
    }
  };

  // Synchronize tax when amount (₹) input changes
  const handleTaxAmountChange = (valStr: string) => {
    setLastEditedTax('AMOUNT');
    setTaxAmtInput(valStr);

    if (!valStr.trim()) {
      setTaxAmount(0);
      setTaxPercentage(0);
      setTaxPctInput('');
      return;
    }

    const val = parseFloat(valStr);
    if (isNaN(val)) {
      setTaxAmount(0);
      setTaxPercentage(0);
      setTaxPctInput('');
      return;
    }

    const clampedAmt = Math.max(0, val);
    setTaxAmount(clampedAmt);

    if (netSubtotal > 0) {
      const computedPct = Math.round((clampedAmt / netSubtotal) * 100 * 100) / 100;
      setTaxPercentage(computedPct);
      setTaxPctInput(computedPct > 0 ? (computedPct % 1 === 0 ? String(computedPct) : computedPct.toFixed(2)) : '');
    } else {
      setTaxPercentage(0);
      setTaxPctInput('');
    }
  };

  // Preset tax buttons (0%, 3%, 5%, 12%, 18%)
  const handlePresetTax = (pct: number) => {
    setLastEditedTax('PERCENT');
    if (pct <= 0) {
      setTaxPercentage(0);
      setTaxAmount(0);
      setTaxPctInput('');
      setTaxAmtInput('');
      return;
    }

    setTaxPercentage(pct);
    setTaxPctInput(String(pct));
    if (netSubtotal > 0) {
      const computedAmt = Math.round(netSubtotal * (pct / 100) * 100) / 100;
      setTaxAmount(computedAmt);
      setTaxAmtInput(computedAmt > 0 ? (computedAmt % 1 === 0 ? String(computedAmt) : computedAmt.toFixed(2)) : '');
    } else {
      setTaxAmount(0);
      setTaxAmtInput('');
    }
  };

  // Synchronize tax amount and percent whenever netSubtotal changes (items added / removed / qty changed / discount changed)
  useEffect(() => {
    if (netSubtotal <= 0) {
      if (lastEditedTax === 'AMOUNT') {
        setTaxPercentage(0);
        setTaxPctInput('');
      } else {
        setTaxAmount(0);
        setTaxAmtInput('');
      }
      return;
    }

    if (lastEditedTax === 'PERCENT' && taxPercentage > 0) {
      const computedAmt = Math.round(netSubtotal * (taxPercentage / 100) * 100) / 100;
      setTaxAmount(computedAmt);
      setTaxAmtInput(computedAmt > 0 ? (computedAmt % 1 === 0 ? String(computedAmt) : computedAmt.toFixed(2)) : '');
    } else if (lastEditedTax === 'AMOUNT' && taxAmount > 0) {
      const computedPct = Math.round((taxAmount / netSubtotal) * 100 * 100) / 100;
      setTaxPercentage(computedPct);
      setTaxPctInput(computedPct > 0 ? (computedPct % 1 === 0 ? String(computedPct) : computedPct.toFixed(2)) : '');
    }
  }, [netSubtotal]);

  // Complete Sale or Update Existing Bill
  const handleCompleteSale = async () => {
    if (cart.length === 0) {
      showInfo('Cannot complete bill with empty cart. Please scan or add products.');
      return;
    }

    const selectedOperator = registeredBillingUsers.find((u) => u.id === selectedOperatorId);
    if (!selectedOperator) {
      showError('Mandatory: Please select which registered Billing User is operating the billing system.');
      setShowOperatorModal(true);
      return;
    }

    // Pre-flight check: ensure no cart item exceeds available stock
    for (const item of cart) {
      const isMeter = isMeterProduct(item);
      const unit = isMeter ? 'meters' : 'units';
      if (item.cartQuantity > item.stockQuantity) {
        showError(
          `Cannot complete bill. Item "${item.name}" has ${item.cartQuantity} ${unit} in cart, but only ${item.stockQuantity} ${unit} available in stock.`
        );
        return;
      }
    }

    setCompletingSale(true);
    try {
      const items: CreateBillItemInput[] = cart.map((item) => {
        const itemDisc = Math.round(item.unitPrice * (effectiveDiscountPercentage / 100) * 100) / 100;
        const netUnitPrice = Math.round((item.unitPrice - itemDisc) * 100) / 100;
        return {
          productId: item.id,
          companyId: item.companyId,
          companyName: item.companyName,
          barcode: item.barcode,
          productName: item.name,
          categoryName: item.categoryName,
          unitPrice: item.unitPrice,
          discountPercentage: effectiveDiscountPercentage,
          discountAmount: itemDisc,
          netUnitPrice,
          quantity: item.cartQuantity,
          detailsJson: item.details ? JSON.stringify(item.details) : undefined,
        };
      });

      if (editingBillId) {
        const res = await ipcClient.updateBill({
          id: editingBillId,
          billingUserId: selectedOperator.id,
          billingUserName: selectedOperator.name,
          customerName: customerName.trim() || undefined,
          customerPhone: customerPhone.trim() || undefined,
          paymentMethod,
          discountPercentage: effectiveDiscountPercentage,
          discount: totalDiscountAmount,
          taxPercentage: effectiveTaxPercentage,
          tax: totalTaxAmount,
          notes: notes.trim() || undefined,
          items,
        });

        if (res.success) {
          setCompletedBill(res.data);
          showSuccess(`Invoice #${res.data.invoiceNumber} updated successfully!`);
          setCart([]);
          setCustomerName('');
          setCustomerPhone('');
          resetDiscountState();
          resetTaxState();
          setNotes('');
          setEditingBill(null);
          if (onCancelEdit) {
            onCancelEdit();
          }
        } else {
          showError(res.error || 'Failed to update bill.');
        }
      } else {
        const res = await ipcClient.createBill({
          billingUserId: selectedOperator.id,
          billingUserName: selectedOperator.name,
          customerName: customerName.trim() || undefined,
          customerPhone: customerPhone.trim() || undefined,
          paymentMethod,
          discountPercentage: effectiveDiscountPercentage,
          discount: totalDiscountAmount,
          taxPercentage: effectiveTaxPercentage,
          tax: totalTaxAmount,
          notes: notes.trim() || undefined,
          items,
        });

        if (res.success) {
          setCompletedBill(res.data);
          showSuccess(`Invoice #${res.data.invoiceNumber} generated successfully!`);
          setCart([]);
          setCustomerName('');
          setCustomerPhone('');
          resetDiscountState();
          resetTaxState();
          setNotes('');
        } else {
          showError(res.error || 'Failed to complete sale.');
        }
      }
    } catch (err: any) {
      showError(err.message || 'Error processing bill.');
    } finally {
      setCompletingSale(false);
    }
  };

  // Hardware Barcode Scanner & Global Hotkey Handler
  useEffect(() => {
    let scanTimeout: NodeJS.Timeout | null = null;

    const handleKeyDown = (e: KeyboardEvent) => {
      // If modal is open, handle ESC and let modal inputs work normally
      if (catalogOpen || Boolean(completedBill) || showOperatorModal) {
        if (e.key === 'Escape') {
          if (catalogOpen) {
            e.preventDefault();
            setCatalogOpen(false);
            setTimeout(() => barcodeInputRef.current?.focus(), 50);
          }
        }
        return;
      }

      // F2 toggles catalog modal
      if (e.key === 'F2') {
        e.preventDefault();
        void handleOpenCatalog();
        return;
      }

      // F4 navigates to bills history
      if (e.key === 'F4' && onNavigateToHistory) {
        e.preventDefault();
        onNavigateToHistory();
        return;
      }

      // Ctrl+Enter or Cmd+Enter completes sale
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        if (cart.length > 0 && !completingSale) {
          e.preventDefault();
          void handleCompleteSale();
        }
        return;
      }

      // Detect active element
      const activeEl = document.activeElement as HTMLElement | null;
      const isBarcodeFocused = activeEl === barcodeInputRef.current;
      const isOtherInputFocused =
        activeEl &&
        activeEl !== barcodeInputRef.current &&
        (activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          activeEl.isContentEditable);

      const now = Date.now();
      const timeDiff = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;

      // Hardware Barcode Scanners typically send characters with < 50ms intervals
      const isFastTyping = timeDiff < 60;

      // Handle Enter (Scanner Terminator or user manual Enter)
      if (e.key === 'Enter') {
        // If focus was NOT in any other input, or if rapid scanner buffer has collected a barcode
        if (!isOtherInputFocused) {
          e.preventDefault();
          const codeToScan =
            scannerBufferRef.current.trim() ||
            barcodeInput.trim() ||
            barcodeInputRef.current?.value.trim() ||
            '';

          if (codeToScan) {
            scannerBufferRef.current = '';
            void executeBarcodeScan(codeToScan);
          }
          return;
        }

        // If another input was focused, but the keys came in as a rapid scanner burst (length >= 3 and fast typing)
        if (isOtherInputFocused && scannerBufferRef.current.length >= 3) {
          e.preventDefault();
          const scannedCode = scannerBufferRef.current.trim();
          scannerBufferRef.current = '';

          // Remove the scanned barcode from the other input if it was typed there
          if (activeEl instanceof HTMLInputElement || activeEl instanceof HTMLTextAreaElement) {
            const currentVal = activeEl.value;
            if (currentVal.endsWith(scannedCode)) {
              activeEl.value = currentVal.slice(0, -scannedCode.length).trim();
              activeEl.dispatchEvent(new Event('input', { bubbles: true }));
            }
          }

          void executeBarcodeScan(scannedCode);
          return;
        }

        return;
      }

      // If modifier keys are pressed (Ctrl, Alt, Meta), ignore
      if (e.ctrlKey || e.altKey || e.metaKey) return;

      // Only process single printable characters
      if (e.key.length === 1) {
        if (isFastTyping) {
          scannerBufferRef.current += e.key;
        } else {
          // Reset buffer on new sequence
          scannerBufferRef.current = e.key;
        }

        // Reset buffer after 250ms of inactivity if no Enter arrives
        if (scanTimeout) clearTimeout(scanTimeout);
        scanTimeout = setTimeout(() => {
          scannerBufferRef.current = '';
        }, 250);

        // If focus is NOT on any input/textarea (e.g. user clicked on table, button, card, whitespace)
        // Redirect typing directly to the barcode input!
        if (!isOtherInputFocused && !isBarcodeFocused) {
          e.preventDefault();
          if (barcodeInputRef.current) {
            barcodeInputRef.current.focus();
            setBarcodeInput((prev) => prev + e.key);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (scanTimeout) clearTimeout(scanTimeout);
    };
  }, [
    catalogOpen,
    completedBill,
    showOperatorModal,
    onNavigateToHistory,
    cart,
    completingSale,
    barcodeInput,
  ]);

  if (loadingEditingBill) {
    return (
      <div className="flex h-full w-full items-center justify-center p-12">
        <div className="flex flex-col items-center gap-3">
          <div className="h-9 w-9 animate-spin rounded-full border-3 border-amber-600 border-t-transparent" />
          <span className="text-xs font-semibold text-stone-600 tracking-wide">
            Loading invoice data for editing...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-6 pb-12">
      {/* Top Header Bar: Clean POS Status & Quick Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-cream-300 bg-white px-5 py-3.5 shadow-xs">
        <div className="flex items-center gap-3.5">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-amber-600 to-amber-700 font-bold text-white shadow-md shadow-amber-600/25">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-stone-900 tracking-tight">POS Billing Terminal</h2>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800 border border-emerald-200">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live Terminal
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-stone-500">
              <span>Operating Cashier:</span>
              {registeredBillingUsers.find((u) => u.id === selectedOperatorId) ? (
                <span className="font-bold text-stone-900 bg-amber-100/70 border border-amber-300 rounded-md px-2 py-0.5 text-xs">
                  {registeredBillingUsers.find((u) => u.id === selectedOperatorId)?.name}
                </span>
              ) : (
                <span className="font-bold text-rose-600 bg-rose-50 border border-rose-200 rounded-md px-2 py-0.5 text-xs">
                  Not Selected
                </span>
              )}
              <button
                type="button"
                onClick={() => setShowOperatorModal(true)}
                className="text-[11px] font-bold text-amber-700 hover:text-amber-800 underline ml-0.5"
              >
                {selectedOperatorId ? 'Switch' : 'Select Operator *'}
              </button>
            </div>
          </div>
        </div>

        {/* Quick Top Controls */}
        <div className="flex items-center gap-2">
          {/* Direct Operator Selection Dropdown */}
          <div className="flex items-center gap-1.5 rounded-xl border border-cream-300 bg-cream-50/80 px-2.5 py-1.5 shadow-2xs">
            <span className="text-[11px] font-bold text-stone-700">Operator:</span>
            <select
              id="top-select-billing-operator"
              value={selectedOperatorId}
              onChange={(e) => {
                changeOperator(e.target.value);
                const op = registeredBillingUsers.find((u) => u.id === e.target.value);
                if (op) {
                  showSuccess(`Active operator changed to: ${op.name}`);
                }
              }}
              className="rounded-lg border border-cream-300 bg-white px-2 py-1 text-xs font-semibold text-stone-800 focus:outline-none focus:border-amber-600"
            >
              <option value="">-- Select Billing User * --</option>
              {registeredBillingUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>

          {onNavigateToHistory && (
            <button
              type="button"
              onClick={onNavigateToHistory}
              title="View past sales and reprint receipts (F4)"
              className="flex items-center gap-1.5 rounded-xl border border-cream-300 bg-white hover:bg-cream-50 px-3.5 py-2 text-xs font-semibold text-stone-700 shadow-2xs transition"
            >
              <svg className="h-4 w-4 text-stone-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Past Invoices</span>
              <kbd className="hidden sm:inline-block rounded bg-cream-200 px-1 py-0.2 text-[10px] font-mono font-medium text-stone-600">F4</kbd>
            </button>
          )}

          <button
            type="button"
            onClick={handleOpenCatalog}
            title="Browse full inventory catalog (F2)"
            className="flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50/80 hover:bg-amber-100/80 px-3.5 py-2 text-xs font-bold text-amber-900 shadow-2xs transition"
          >
            <svg className="h-4 w-4 text-amber-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
            <span>Browse Catalog</span>
            <kbd className="hidden sm:inline-block rounded bg-amber-200/80 px-1 py-0.2 text-[10px] font-mono font-bold text-amber-800">F2</kbd>
          </button>
        </div>
      </div>

      {/* EDIT BILL BANNER (Active only when cashier is modifying an existing invoice) */}
      {editingBill && (
        <div className="flex items-center justify-between gap-4 rounded-2xl border border-amber-400/80 bg-gradient-to-r from-amber-50 via-amber-100/60 to-amber-50 p-4 shadow-sm animate-in fade-in duration-150">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-600 font-bold text-white shadow-md shadow-amber-600/30">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-extrabold text-amber-950 uppercase tracking-wide">
                  Editing Invoice #{editingBill.invoiceNumber}
                </span>
                <span className="rounded-full bg-amber-200/90 border border-amber-300 px-2 py-0.5 text-[10px] font-bold text-amber-900">
                  Original Date: {new Date(editingBill.createdAt).toLocaleDateString()}
                </span>
                <span className="rounded-full bg-amber-200/90 border border-amber-300 px-2 py-0.5 text-[10px] font-bold text-amber-900">
                  Cashier: {editingBill.billingUserName}
                </span>
              </div>
              <p className="text-xs text-amber-900/90 mt-0.5">
                Saving changes will automatically update line items and recalculate invoice totals.
              </p>
            </div>
          </div>
          {onCancelEdit && (
            <button
              type="button"
              onClick={onCancelEdit}
              className="rounded-xl border border-amber-300 bg-white hover:bg-amber-100/60 px-3.5 py-1.5 text-xs font-bold text-amber-900 transition shadow-2xs"
            >
              Cancel Edit
            </button>
          )}
        </div>
      )}

      {/* Barcode Command Bar (High-Speed Scanner Input with Always-On Hardware Scanner Capture) */}
      <div
        onClick={() => barcodeInputRef.current?.focus()}
        className="rounded-2xl border border-cream-300 bg-white p-3.5 shadow-sm transition hover:border-amber-400 cursor-text"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2 px-1">
          <div className="flex items-center gap-2">
            <span className="flex h-2.5 w-2.5 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
            <span className="text-xs font-bold text-stone-800 tracking-wide">
              Hardware Scanner Active
            </span>
            <span className="text-[11px] font-medium text-stone-500">
              • Scan anytime without clicking input first
            </span>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-stone-500">
            <span>
              Press <kbd className="rounded bg-cream-100 border border-cream-300 px-1.5 py-0.5 text-[10px] font-mono font-semibold text-stone-700">F2</kbd> for Catalog
            </span>
            <span>•</span>
            <span>
              Press <kbd className="rounded bg-cream-100 border border-cream-300 px-1.5 py-0.5 text-[10px] font-mono font-semibold text-stone-700">Ctrl+Enter</kbd> to Checkout
            </span>
          </div>
        </div>

        <form onSubmit={handleScanSubmit} className="flex gap-2.5 items-center">
          <div className="relative flex-1">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-amber-700">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
              </svg>
            </div>
            <input
              ref={barcodeInputRef}
              id="pos-barcode-scanner-input"
              type="text"
              value={barcodeInput}
              onChange={(e) => setBarcodeInput(e.target.value)}
              placeholder="Point handheld laser scanner at product barcode, or type barcode (e.g. AGJ000001) & press Enter..."
              disabled={scanning}
              className="w-full rounded-xl border border-cream-300 bg-cream-50/70 pl-11 pr-24 py-3 text-sm font-mono font-medium text-stone-900 placeholder-stone-400 focus:border-amber-600 focus:bg-white focus:outline-none focus:ring-3 focus:ring-amber-600/15 transition"
            />
            <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
              <span className="rounded bg-cream-200/90 border border-cream-300 px-2 py-0.5 text-[10px] font-mono font-semibold text-stone-600">
                ↵ Enter
              </span>
            </div>
          </div>

          <button
            type="submit"
            disabled={scanning || !barcodeInput.trim()}
            className="flex items-center gap-2 rounded-xl bg-amber-600 hover:bg-amber-500 px-6 py-3 text-sm font-bold text-white shadow-md shadow-amber-600/20 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {scanning ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                </svg>
                <span>Add Item</span>
              </>
            )}
          </button>
        </form>
      </div>

      {/* 1. CURRENT ORDER ITEMS TABLE — FULL WIDTH (ALWAYS VISIBLE TABLE WITH HEADERS) */}
      <div className="w-full flex flex-col rounded-2xl border border-cream-300 bg-white shadow-sm overflow-hidden">
        {/* Table Header Bar */}
        <div className="flex items-center justify-between border-b border-cream-200 px-6 py-3.5 bg-cream-50/75">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-600 text-white font-bold shadow-2xs">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-bold text-stone-900">Current Order Items</h3>
              <p className="text-[11px] text-stone-500">
                {cart.length} {cart.length === 1 ? 'line item' : 'line items'} • {cart.reduce((s, i) => s + i.cartQuantity, 0)} total units in bill
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {cart.length > 0 && (
              <button
                type="button"
                onClick={clearCart}
                className="flex items-center gap-1.5 text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 px-3 py-1.5 rounded-xl border border-rose-200 transition shadow-2xs"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                <span>Clear Cart</span>
              </button>
            )}
          </div>
        </div>

        {/* The Full Width POS Grid Table */}
        <div className="w-full overflow-x-auto min-h-[220px]">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-cream-300 bg-cream-100/80 text-[11px] font-bold uppercase tracking-wider text-stone-700">
                <th className="py-3 px-3.5 text-center w-12 border-r border-cream-200/80">#</th>
                <th className="py-3 px-4 w-36 border-r border-cream-200/80">Barcode</th>
                <th className="py-3 px-4 min-w-[260px] border-r border-cream-200/80">Product Name & Category</th>
                <th className="py-3 px-4 text-right w-36 border-r border-cream-200/80">Rate (₹)</th>
                <th className="py-3 px-4 text-center w-40 border-r border-cream-200/80">Quantity / Length</th>
                <th className="py-3 px-4 text-right w-40 border-r border-cream-200/80">Line Total (₹)</th>
                <th className="py-3 px-3 text-center w-14"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cream-100">
              {cart.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center bg-cream-50/20">
                    <div className="flex flex-col items-center justify-center gap-2.5 text-stone-400">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-700 border border-amber-200/80 mb-1 shadow-2xs">
                        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                        </svg>
                      </div>
                      <span className="text-sm font-bold text-stone-700">No products added yet</span>
                      <p className="text-xs text-stone-500 max-w-sm">
                        Scan product barcode with handheld scanner, enter code above, or click{' '}
                        <button
                          type="button"
                          onClick={handleOpenCatalog}
                          className="font-bold text-amber-700 hover:underline"
                        >
                          Browse Catalog (F2)
                        </button>{' '}
                        to add products.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                cart.map((item, index) => {
                  const lineTotal = Math.round(item.unitPrice * item.cartQuantity * 100) / 100;
                  const isMeter = isMeterProduct(item);

                  return (
                    <tr key={item.id} className="hover:bg-amber-50/20 even:bg-cream-50/30 transition">
                      {/* Row Index */}
                      <td className="py-3.5 px-3.5 text-center text-stone-400 font-mono text-xs border-r border-cream-100">
                        {index + 1}
                      </td>

                      {/* Barcode Tag */}
                      <td className="py-3.5 px-4 border-r border-cream-100 whitespace-nowrap">
                        <span className="font-mono font-bold text-xs text-stone-800 bg-cream-100 px-2 py-0.5 rounded border border-cream-200 shadow-2xs">
                          {item.barcode}
                        </span>
                      </td>

                      {/* Product Name & Category */}
                      <td className="py-3.5 px-4 border-r border-cream-100">
                        <div className="font-bold text-stone-900 text-sm flex items-center gap-2">
                          <span>{item.name}</span>
                          {typeof item.stockQuantity === 'number' && item.stockQuantity < 999 && (
                            <span
                              className={`text-[9px] font-bold px-1.5 py-0.2 rounded border ${
                                item.stockQuantity <= 0
                                  ? 'bg-rose-50 text-rose-700 border-rose-300'
                                  : item.stockQuantity <= 3
                                  ? 'bg-amber-50 text-amber-700 border-amber-300'
                                  : isMeter
                                  ? 'bg-cyan-50 text-cyan-800 border-cyan-200'
                                  : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              }`}
                            >
                              {item.stockQuantity <= 0
                                ? 'Out of stock'
                                : isMeter
                                ? `Stock: ${item.stockQuantity} Meters`
                                : `Stock: ${item.stockQuantity} pcs`}
                            </span>
                          )}
                          {isMeter && (
                            <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-cyan-100 text-cyan-900 border border-cyan-300">
                              📏 Sold by Meter
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-stone-500 font-medium mt-0.5">
                          {item.categoryName}
                        </div>
                        {item.pricingBreakdown && (
                          <div className="text-[10px] text-amber-700 font-medium mt-0.5">
                            {item.pricingBreakdown}
                          </div>
                        )}
                      </td>

                      {/* Unit Rate */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap border-r border-cream-100">
                        <div className="font-bold text-stone-800 text-xs font-mono">
                          ₹{item.unitPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          {isMeter && <span className="text-[10px] font-bold text-cyan-800 bg-cyan-50 border border-cyan-200 rounded px-1 ml-1">/ meter</span>}
                        </div>
                      </td>

                      {/* Quantity / Length Controls (Supports Fractional Meters with Real Stock Enforcement) */}
                      <td className="py-3.5 px-4 whitespace-nowrap text-center border-r border-cream-100">
                        {isMeter ? (
                          <div className="flex flex-col items-center">
                            <div className="inline-flex items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={() => updateQuantity(item.id, -0.5)}
                                className="flex h-7 w-7 items-center justify-center rounded-lg border border-cyan-300 bg-cyan-50 font-bold text-cyan-900 hover:bg-cyan-100 shadow-2xs transition"
                                title="Decrease by 0.5 meter"
                              >
                                -
                              </button>
                              <div className="relative">
                                <input
                                  type="number"
                                  min="0.1"
                                  step="0.1"
                                  max={item.stockQuantity}
                                  value={item.cartQuantity}
                                  onChange={(e) => {
                                    const val = parseFloat(e.target.value);
                                    if (!isNaN(val) && val > 0) setDirectQuantity(item.id, val);
                                  }}
                                  className={`w-16 rounded-md border ${
                                    item.cartQuantity > item.stockQuantity
                                      ? 'border-red-500 bg-red-50 text-red-900 ring-2 ring-red-500/20'
                                      : 'border-cyan-300 bg-white text-stone-900'
                                  } py-1 pr-4 text-center text-xs font-bold focus:border-cyan-600 focus:outline-hidden`}
                                />
                                <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[10px] font-bold text-cyan-600 pointer-events-none">
                                  m
                                </span>
                              </div>
                              <button
                                type="button"
                                disabled={item.cartQuantity >= item.stockQuantity}
                                onClick={() => updateQuantity(item.id, 0.5)}
                                className="flex h-7 w-7 items-center justify-center rounded-lg border border-cyan-300 bg-cyan-50 font-bold text-cyan-900 hover:bg-cyan-100 disabled:opacity-40 disabled:cursor-not-allowed shadow-2xs transition"
                                title={item.cartQuantity >= item.stockQuantity ? `Max available: ${item.stockQuantity}m` : "Increase by 0.5 meter"}
                              >
                                +
                              </button>
                            </div>
                            <div className="flex items-center gap-1.5 mt-1">
                              <span className="text-[9px] font-bold text-cyan-800 bg-cyan-50 border border-cyan-200 rounded px-1.5 py-0.2">
                                {item.cartQuantity} {item.cartQuantity === 1 ? 'Meter' : 'Meters'}
                              </span>
                              <span className="text-[9px] font-medium text-stone-500">
                                (Max: <strong className="font-mono text-stone-800">{item.stockQuantity}m</strong>)
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center">
                            <div className="inline-flex items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={() => updateQuantity(item.id, -1)}
                                className="flex h-7 w-7 items-center justify-center rounded-lg border border-cream-300 bg-white font-bold text-stone-700 hover:bg-cream-100 shadow-2xs transition"
                              >
                                -
                              </button>
                              <input
                                type="number"
                                min="1"
                                max={item.stockQuantity}
                                value={item.cartQuantity}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value, 10);
                                  if (!isNaN(val)) setDirectQuantity(item.id, val);
                                }}
                                className={`w-12 rounded-md border ${
                                  item.cartQuantity > item.stockQuantity
                                    ? 'border-red-500 bg-red-50 text-red-900 ring-2 ring-red-500/20'
                                    : 'border-cream-300 bg-white text-stone-900'
                                } py-1 text-center text-xs font-bold focus:border-amber-600 focus:outline-hidden`}
                              />
                              <button
                                type="button"
                                disabled={item.cartQuantity >= item.stockQuantity}
                                onClick={() => updateQuantity(item.id, 1)}
                                className="flex h-7 w-7 items-center justify-center rounded-lg border border-cream-300 bg-white font-bold text-stone-700 hover:bg-cream-100 disabled:opacity-40 disabled:cursor-not-allowed shadow-2xs transition"
                                title={item.cartQuantity >= item.stockQuantity ? `Max available: ${item.stockQuantity}` : "Increase quantity"}
                              >
                                +
                              </button>
                            </div>
                            <span className="text-[9px] font-medium text-stone-500 mt-1">
                              Available: <strong className="font-mono text-stone-800">{item.stockQuantity}</strong>
                            </span>
                          </div>
                        )}
                      </td>

                      {/* Line Total */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap border-r border-cream-100">
                        <div className="font-bold text-stone-900 text-sm font-mono">
                          ₹{lineTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                      </td>

                      {/* Action: Remove Item */}
                      <td className="py-3.5 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => removeCartItem(item.id)}
                          className="rounded-lg p-1.5 text-stone-400 hover:bg-rose-50 hover:text-rose-600 transition"
                          title="Remove from cart"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {cart.length > 0 && (
              <tfoot className="border-t-2 border-cream-300 bg-cream-50/90 font-bold text-stone-800 text-xs">
                <tr>
                  <td colSpan={3} className="py-3.5 px-4 text-stone-600 font-sans border-r border-cream-200">
                    Total: {cart.length} line items ({cart.reduce((s, i) => s + i.cartQuantity, 0)} units)
                  </td>
                  <td className="py-3.5 px-4 text-right text-stone-400 border-r border-cream-200">
                    —
                  </td>
                  <td className="py-3.5 px-4 text-center font-mono border-r border-cream-200">
                    {cart.reduce((s, i) => s + i.cartQuantity, 0)}
                  </td>
                  <td className="py-3.5 px-4 text-right font-black text-amber-800 text-sm font-mono border-r border-cream-200">
                    ₹{subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* 2. PAYMENT, CUSTOMER & CHECKOUT SECTION (Positioned Directly Below the Table) */}
      <div className="w-full grid grid-cols-1 lg:grid-cols-3 gap-5 items-stretch">
        {/* Card 1: Customer Details & Order Remarks */}
        <div className="rounded-2xl border border-cream-300 bg-white p-5 shadow-sm flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between border-b border-cream-200 pb-2.5 mb-3.5">
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-100 text-amber-800">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <h3 className="text-sm font-bold text-stone-900">Customer Details</h3>
              </div>
              <span className="text-[10px] font-semibold text-stone-400">Optional</span>
            </div>

            <div className="space-y-3">
              {/* Operating Billing User Selector (Mandatory) */}
              <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[11px] font-bold text-stone-800 flex items-center gap-1.5">
                    <svg className="h-4 w-4 text-amber-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    <span>Operating Billing User</span>
                    <span className="text-rose-500 font-bold">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowOperatorModal(true)}
                    className="text-[10px] font-bold text-amber-700 hover:text-amber-900 underline"
                  >
                    Change / Popup
                  </button>
                </div>

                <select
                  id="card-select-billing-operator"
                  value={selectedOperatorId}
                  onChange={(e) => {
                    changeOperator(e.target.value);
                    const op = registeredBillingUsers.find((u) => u.id === e.target.value);
                    if (op) {
                      showSuccess(`Operating cashier set to: ${op.name}`);
                    }
                  }}
                  className={`w-full rounded-lg border px-2.5 py-1.5 text-xs font-bold transition focus:outline-none focus:ring-2 focus:ring-amber-600/20 ${
                    selectedOperatorId
                      ? 'border-amber-300 bg-white text-stone-900'
                      : 'border-rose-300 bg-rose-50/50 text-rose-800'
                  }`}
                >
                  <option value="">-- Mandatory: Select Billing User * --</option>
                  {registeredBillingUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
                {!selectedOperatorId && (
                  <p className="mt-1 text-[10px] font-semibold text-rose-600">
                    Required: Select which registered user is operating this bill.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-[11px] font-bold text-stone-700">Customer Name</label>
                <div className="relative mt-1">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-stone-400">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="e.g. Ramesh Kumar"
                    className="w-full rounded-xl border border-cream-300 bg-cream-50/50 pl-9 pr-3 py-2 text-xs text-stone-900 placeholder-stone-400 focus:border-amber-600 focus:bg-white focus:outline-none transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-stone-700">Mobile Phone</label>
                <div className="relative mt-1">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-stone-400">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                  </div>
                  <input
                    type="text"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="e.g. +91 98765 43210"
                    className="w-full rounded-xl border border-cream-300 bg-cream-50/50 pl-9 pr-3 py-2 text-xs text-stone-900 placeholder-stone-400 focus:border-amber-600 focus:bg-white focus:outline-none transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-stone-700">Invoice Remarks / Notes</label>
                <div className="relative mt-1">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-stone-400">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                    </svg>
                  </div>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="e.g. Gift wrap, custom order"
                    className="w-full rounded-xl border border-cream-300 bg-cream-50/50 pl-9 pr-3 py-2 text-xs text-stone-900 placeholder-stone-400 focus:border-amber-600 focus:bg-white focus:outline-none transition"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-cream-200 bg-cream-50/50 p-2.5 text-[11px] text-stone-500 flex items-center gap-2">
            <span className="text-amber-600">ℹ️</span>
            <span>Customer info prints on invoice and links with records.</span>
          </div>
        </div>

        {/* Card 2: Payment Method & Cash Tender Drawer */}
        <div className="rounded-2xl border border-cream-300 bg-white p-5 shadow-sm flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between border-b border-cream-200 pb-2.5 mb-3.5">
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-100 text-emerald-800">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <h3 className="text-sm font-bold text-stone-900">Payment Method</h3>
              </div>
              <span className="rounded-full bg-cream-200/80 px-2 py-0.5 text-[10px] font-bold text-stone-700">
                {paymentMethod === 'CASH' ? 'Cash Tender' : 'Digital Payment'}
              </span>
            </div>

            {/* 2 Payment Options */}
            <div className="grid grid-cols-2 gap-2.5 mb-3.5">
              {(
                [
                  { key: 'CASH', label: 'Cash', icon: '💵', sub: 'Cash Register' },
                  { key: 'ONLINE', label: 'Online', icon: '📱', sub: 'UPI / QR / Card' },
                ] as const
              ).map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setPaymentMethod(m.key)}
                  className={`flex flex-col items-center justify-center rounded-xl border py-2.5 px-2 text-xs font-bold transition ${
                    paymentMethod === m.key
                      ? 'border-amber-600 bg-amber-600 text-white shadow-xs'
                      : 'border-cream-300 bg-white text-stone-700 hover:bg-cream-50'
                  }`}
                >
                  <span className="text-base mb-0.5">{m.icon}</span>
                  <span className="text-xs">{m.label}</span>
                  <span
                    className={`text-[10px] font-medium ${
                      paymentMethod === m.key ? 'text-amber-100' : 'text-stone-400'
                    }`}
                  >
                    {m.sub}
                  </span>
                </button>
              ))}
            </div>

            {/* When CASH vs ONLINE informational box */}
            {paymentMethod === 'CASH' ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3.5 space-y-1 text-xs text-emerald-950">
                <div className="flex items-center gap-2 font-bold text-emerald-900">
                  <span className="h-2 w-2 rounded-full bg-emerald-600" />
                  <span>Cash Payment Mode Active</span>
                </div>
                <p className="text-[11px] text-emerald-800 leading-relaxed">
                  Collect cash directly from the customer at counter upon checkout.
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-sky-200 bg-sky-50/80 p-3.5 space-y-2 text-xs text-sky-950">
                <div className="flex items-center gap-2 font-bold text-sky-900">
                  <span className="h-2 w-2 rounded-full bg-sky-600 animate-pulse" />
                  <span>Online Payment Mode Active</span>
                </div>
                <p className="text-[11px] text-sky-800 leading-relaxed">
                  Present customer with store UPI QR code, swipe card on EDC machine, or confirm net banking transfer.
                </p>
                <div className="flex items-center gap-2 pt-1 font-mono text-[10px] text-sky-700">
                  <span>✓ UPI QR</span>
                  <span>•</span>
                  <span>✓ POS Card</span>
                  <span>•</span>
                  <span>✓ Digital Wallets</span>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-cream-200 bg-cream-50/50 p-2.5 text-[11px] text-stone-500 flex items-center gap-2">
            <span className="text-emerald-600">⚡</span>
            <span>Instant inventory auto-deduction upon sale completion.</span>
          </div>
        </div>

        {/* Card 3: Financial Summary & Primary Checkout Button */}
        <div className="rounded-2xl border border-cream-300 bg-white p-5 shadow-sm flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between border-b border-cream-200 pb-2.5 mb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-100 text-amber-800">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                </div>
                <h3 className="text-sm font-bold text-stone-900">Bill Summary</h3>
              </div>
              <span className="font-mono text-[11px] font-bold text-stone-600">
                {cart.reduce((s, i) => s + i.cartQuantity, 0)} Units Total
              </span>
            </div>

            {/* Subtotal, Discount, Tax lines */}
            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between text-stone-600">
                <span>Items Gross Subtotal:</span>
                <span className="font-bold text-stone-900">
                  ₹{subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>

              {/* Discount Controls (Bidirectional % and ₹ inputs) */}
              <div className="rounded-xl border border-cream-200 bg-cream-50/50 p-2.5 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-stone-800">
                  <span className="flex items-center gap-1.5">
                    <span>🏷️</span> Bill Discount
                  </span>
                  <span className="text-[10px] text-stone-400 font-normal">
                    Enter either % or ₹
                  </span>
                </div>

                {/* Dual Inputs: % and ₹ */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="block text-[10px] font-semibold text-stone-600">
                      Discount (%)
                    </label>
                    <div className="flex items-center rounded-lg border border-cream-300 bg-white px-2 py-1 shadow-2xs focus-within:border-amber-600 focus-within:ring-1 focus-within:ring-amber-600/30">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.5"
                        value={discountPctInput}
                        onChange={(e) => handleDiscountPercentChange(e.target.value)}
                        placeholder="0"
                        className="w-full text-right text-xs font-bold text-stone-900 focus:outline-none bg-transparent"
                      />
                      <span className="ml-1 text-xs font-bold text-stone-500">%</span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[10px] font-semibold text-stone-600">
                      Discount (₹)
                    </label>
                    <div className="flex items-center rounded-lg border border-cream-300 bg-white px-2 py-1 shadow-2xs focus-within:border-amber-600 focus-within:ring-1 focus-within:ring-amber-600/30">
                      <span className="mr-1 text-xs font-bold text-stone-500">₹</span>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={discountAmtInput}
                        onChange={(e) => handleDiscountAmountChange(e.target.value)}
                        placeholder="0.00"
                        className="w-full text-right text-xs font-bold text-stone-900 focus:outline-none bg-transparent"
                      />
                    </div>
                  </div>
                </div>

                {/* Quick Presets */}
                <div className="flex items-center gap-1 pt-0.5">
                  {[0, 5, 10, 15, 20].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => handlePresetDiscount(pct)}
                      className={`flex-1 rounded-lg py-1 text-[10px] font-bold border transition ${
                        discountPercentage === pct && (lastEditedDiscount === 'PERCENT' || pct === 0)
                          ? 'bg-amber-600 text-white border-amber-600 shadow-2xs'
                          : 'bg-white text-stone-600 border-cream-300 hover:bg-cream-100'
                      }`}
                    >
                      {pct === 0 ? 'None' : `${pct}%`}
                    </button>
                  ))}
                </div>

                {/* Discount Savings Banner */}
                {totalDiscountAmount > 0 && (
                  <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-2.5 py-1.5 text-[11px] text-emerald-800 flex items-center justify-between">
                    <span className="font-semibold flex items-center gap-1">
                      <span>✓</span> Discount Savings:
                    </span>
                    <span className="font-bold">
                      -₹{totalDiscountAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      {effectiveDiscountPercentage > 0 && (
                        <span className="ml-1 text-[10px] font-medium text-emerald-600">
                          ({effectiveDiscountPercentage}%)
                        </span>
                      )}
                    </span>
                  </div>
                )}
              </div>

              {/* Tax / GST Controls (Bidirectional % and ₹ inputs) */}
              <div className="rounded-xl border border-cream-200 bg-cream-50/50 p-2.5 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-stone-800">
                  <span className="flex items-center gap-1.5">
                    <span>🏛️</span> Tax / GST
                  </span>
                  <span className="text-[10px] text-stone-400 font-normal">
                    Enter either % or ₹
                  </span>
                </div>

                {/* Dual Inputs: % and ₹ */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="block text-[10px] font-semibold text-stone-600">
                      Tax / GST (%)
                    </label>
                    <div className="flex items-center rounded-lg border border-cream-300 bg-white px-2 py-1 shadow-2xs focus-within:border-amber-600 focus-within:ring-1 focus-within:ring-amber-600/30">
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        value={taxPctInput}
                        onChange={(e) => handleTaxPercentChange(e.target.value)}
                        placeholder="0"
                        className="w-full text-right text-xs font-bold text-stone-900 focus:outline-none bg-transparent"
                      />
                      <span className="ml-1 text-xs font-bold text-stone-500">%</span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[10px] font-semibold text-stone-600">
                      Tax Amount (₹)
                    </label>
                    <div className="flex items-center rounded-lg border border-cream-300 bg-white px-2 py-1 shadow-2xs focus-within:border-amber-600 focus-within:ring-1 focus-within:ring-amber-600/30">
                      <span className="mr-1 text-xs font-bold text-stone-500">₹</span>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={taxAmtInput}
                        onChange={(e) => handleTaxAmountChange(e.target.value)}
                        placeholder="0.00"
                        className="w-full text-right text-xs font-bold text-stone-900 focus:outline-none bg-transparent"
                      />
                    </div>
                  </div>
                </div>

                {/* Quick Presets for GST: None, 3% (Jewellery GST), 5%, 12%, 18% */}
                <div className="flex items-center gap-1 pt-0.5">
                  {[0, 3, 5, 12, 18].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => handlePresetTax(pct)}
                      className={`flex-1 rounded-lg py-1 text-[10px] font-bold border transition ${
                        taxPercentage === pct && (lastEditedTax === 'PERCENT' || pct === 0)
                          ? 'bg-amber-600 text-white border-amber-600 shadow-2xs'
                          : 'bg-white text-stone-600 border-cream-300 hover:bg-cream-100'
                      }`}
                    >
                      {pct === 0 ? 'None' : `${pct}%`}
                    </button>
                  ))}
                </div>

                {/* Tax Callout Banner */}
                {totalTaxAmount > 0 && (
                  <div className="rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-1.5 text-[11px] text-amber-900 flex items-center justify-between">
                    <span className="font-semibold flex items-center gap-1">
                      <span>+</span> Added Tax / GST:
                    </span>
                    <span className="font-bold">
                      +₹{totalTaxAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      {effectiveTaxPercentage > 0 && (
                        <span className="ml-1 text-[10px] font-medium text-amber-700">
                          ({effectiveTaxPercentage}%)
                        </span>
                      )}
                    </span>
                  </div>
                )}
              </div>

              {/* Grand Total Callout Box */}
              <div className="border-t-2 border-dashed border-amber-300/80 bg-amber-50/60 rounded-xl p-3 flex justify-between items-center">
                <div>
                  <span className="font-bold text-stone-900 text-sm block">Grand Total:</span>
                  <span className="text-[10px] text-stone-500">Net Payable Amount</span>
                </div>
                <span className="text-2xl font-black text-amber-700 tracking-tight">
                  ₹{grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>

          {/* Complete Sale Primary CTA Button */}
          <div className="space-y-2 pt-2">
            <button
              type="button"
              onClick={handleCompleteSale}
              disabled={completingSale || cart.length === 0}
              className="w-full rounded-xl bg-gradient-to-r from-amber-600 via-amber-600 to-amber-700 py-3.5 text-sm font-bold text-white shadow-lg shadow-amber-600/25 hover:from-amber-500 hover:to-amber-600 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {completingSale ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  <span>{editingBillId ? 'Updating Invoice...' : 'Processing Sale & Bill...'}</span>
                </>
              ) : (
                <>
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>
                    {editingBillId
                      ? 'Save & Update Invoice'
                      : `Complete Sale (₹${grandTotal.toLocaleString()})`}
                  </span>
                </>
              )}
            </button>
            <div className="text-center">
              <span className="text-[10px] text-stone-400 font-mono">
                Shortcut: <kbd className="rounded bg-cream-100 px-1.5 py-0.5 text-stone-600 font-semibold border border-cream-300">Ctrl + Enter</kbd> to complete sale
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Catalog Search & Browse Modal (No company tags shown) */}
      {catalogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-cream-300 bg-white p-5 shadow-2xl flex flex-col max-h-[85vh] animate-in fade-in duration-150">
            <div className="flex items-center justify-between border-b border-cream-200 pb-3">
              <div>
                <h3 className="text-base font-bold text-stone-900">Inventory Catalog</h3>
                <p className="text-xs text-stone-500">
                  Search products by name or barcode to add directly into current cart
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCatalogOpen(false)}
                className="rounded-lg p-1.5 text-stone-400 hover:bg-cream-100 hover:text-stone-700 transition"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Search Bar */}
            <div className="mt-3.5">
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-stone-400">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <input
                  type="text"
                  autoFocus
                  value={searchQuery}
                  onChange={(e) => void handleSearchProducts(e.target.value)}
                  placeholder="Search by name, barcode, or category..."
                  className="w-full rounded-xl border border-cream-300 bg-cream-50/60 pl-9 pr-4 py-2.5 text-xs text-stone-900 placeholder-stone-400 focus:border-amber-600 focus:bg-white focus:outline-none transition"
                />
              </div>
            </div>

            {/* Product List */}
            <div className="mt-3 flex-1 overflow-y-auto divide-y divide-cream-100 pr-1">
              {loadingCatalog ? (
                <div className="flex items-center justify-center py-12 text-stone-500 text-xs">
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-amber-600 border-t-transparent mr-2" />
                  Searching products...
                </div>
              ) : catalogProducts.length === 0 ? (
                <div className="py-12 text-center text-xs text-stone-500">
                  No products found matching &quot;{searchQuery}&quot;.
                </div>
              ) : (
                catalogProducts.map((p) => {
                  const isMeter = isMeterProduct(p);
                  return (
                    <div
                      key={p.id}
                      className="flex items-center justify-between py-3 px-2 hover:bg-cream-50/70 rounded-xl transition"
                    >
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-xs text-stone-900">{p.name}</span>
                          {isMeter && (
                            <span className="rounded bg-cyan-100 text-cyan-800 text-[9px] font-bold px-1.5 py-0.2 border border-cyan-300">
                              📏 Sold by Meter
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-stone-500 font-mono mt-0.5">
                          {p.barcode} • {p.categoryName} •{' '}
                          <span className="font-semibold text-stone-700">
                            Stock: {p.stockQuantity} {isMeter ? 'Meters' : 'Units'}
                          </span>
                        </div>
                        {p.pricingBreakdown && (
                          <div className="text-[10px] text-amber-700 font-medium mt-0.5">
                            {p.pricingBreakdown}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="text-right font-bold text-stone-900 text-xs">
                          ₹{p.unitPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          {isMeter && <span className="text-[10px] text-cyan-800 font-bold bg-cyan-50 border border-cyan-200 rounded px-1 ml-1">/ m</span>}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            addProductToCart(p);
                            setCatalogOpen(false);
                          }}
                          className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-500 transition shadow-2xs"
                        >
                          + Add to Cart
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

      {/* Single Customer Invoice Receipt Modal */}
      <SalesReceiptModal
        isOpen={Boolean(completedBill)}
        onClose={() => setCompletedBill(null)}
        bill={completedBill}
        session={session}
        onStartNewSale={() => setCompletedBill(null)}
      />

      {/* Mandatory Operator Selection Popup */}
      {showOperatorModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl border border-cream-300 bg-white p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 border-b border-cream-200 pb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 font-bold text-lg">
                👤
              </div>
              <div>
                <h3 className="text-base font-bold text-stone-900">
                  Select Operating Billing User
                </h3>
                <p className="text-xs text-stone-500">
                  Specify who is currently operating the POS billing counter
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-4">
              <p className="text-xs text-stone-600 leading-relaxed">
                Before ringing up bills, please select which registered Billing User is operating the terminal.
                This operator name will be recorded on the invoice and stored in the database.
              </p>

              {registeredBillingUsers.length === 0 ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-3.5 text-xs text-rose-800">
                  <div className="font-bold flex items-center gap-1.5">
                    <span>⚠️</span> No Billing Users Found
                  </div>
                  <p className="mt-1 text-[11px] text-rose-700">
                    No Billing Users have been registered by the Super Admin yet. Please have the Super Admin login and add billing users in the User Management section.
                  </p>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1.5">
                    Operating Billing User <span className="text-rose-500">*</span>
                  </label>
                  <select
                    id="modal-select-billing-operator"
                    value={selectedOperatorId}
                    onChange={(e) => setSelectedOperatorId(e.target.value)}
                    className="w-full rounded-xl border border-cream-300 bg-cream-50/50 px-3.5 py-2.5 text-sm font-semibold text-stone-900 transition focus:border-amber-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-600/20"
                  >
                    <option value="">-- Choose Registered Billing User * --</option>
                    {registeredBillingUsers.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 border-t border-cream-200 pt-3.5">
                {selectedOperatorId && (
                  <button
                    type="button"
                    onClick={() => setShowOperatorModal(false)}
                    className="rounded-xl border border-cream-300 bg-white px-4 py-2 text-xs font-semibold text-stone-700 hover:bg-cream-100 transition"
                  >
                    Close
                  </button>
                )}
                <button
                  id="btn-confirm-operator"
                  type="button"
                  disabled={!selectedOperatorId}
                  onClick={() => {
                    if (!selectedOperatorId) {
                      showError('Please select a Billing User to proceed.');
                      return;
                    }
                    const op = registeredBillingUsers.find((u) => u.id === selectedOperatorId);
                    if (op) {
                      changeOperator(op.id);
                      showSuccess(`Operating cashier set to: ${op.name}`);
                    }
                    setShowOperatorModal(false);
                  }}
                  className="rounded-xl bg-amber-600 hover:bg-amber-700 px-5 py-2.5 text-xs font-bold text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Confirm Operating User
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
