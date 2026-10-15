import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { AuthSessionPayload, ProductDto, PurchaseDto } from '../../shared/types/ipc';
import { BarcodeGraphic, BarcodePrintSize } from './BarcodeGraphic';
import { generateActualPurchasePriceCode } from '../../shared/utils/purchaseCode';

export interface BatchBarcodePrintModalProps {
  purchase: PurchaseDto;
  session: AuthSessionPayload;
  isOpen: boolean;
  onClose: () => void;
  products?: ProductDto[];
}

export interface SizeOption {
  id: BarcodePrintSize;
  title: string;
  widthMm: number;
  heightMm: number;
  dimensionsMm: string;
  dimensionsInches: string;
  useCase: string;
  previewWidthPx: number;
  previewHeightPx: number;
  isJewellery?: boolean;
}

const SIZE_OPTIONS: SizeOption[] = [
  {
    id: 'std_50x25',
    title: '50 × 25 mm (Standard 1-Up Roll)',
    widthMm: 50,
    heightMm: 25,
    dimensionsMm: '50 × 25 mm',
    dimensionsInches: '2.0" × 1.0"',
    useCase: 'Most common standard thermal barcode sticker roll for retail POS & price labeling',
    previewWidthPx: 260,
    previewHeightPx: 130,
  },
  {
    id: 'retail_50x35',
    title: '50 × 35 mm (Medium Retail Label)',
    widthMm: 50,
    heightMm: 35,
    dimensionsMm: '50 × 35 mm',
    dimensionsInches: '2.0" × 1.4"',
    useCase: 'Standard price tags with extra vertical space for multi-line details',
    previewWidthPx: 260,
    previewHeightPx: 182,
  },
  {
    id: 'compact_50x30',
    title: '50 × 30 mm (Compact Label)',
    widthMm: 50,
    heightMm: 30,
    dimensionsMm: '50 × 30 mm',
    dimensionsInches: '2.0" × 1.2"',
    useCase: 'Compact retail packaging, bottles, and boxes',
    previewWidthPx: 260,
    previewHeightPx: 156,
  },
  {
    id: 'square_50x50',
    title: '50 × 50 mm (Square Label)',
    widthMm: 50,
    heightMm: 50,
    dimensionsMm: '50 × 50 mm',
    dimensionsInches: '2.0" × 2.0"',
    useCase: 'Square gift boxes, jars, décor, and garment tags',
    previewWidthPx: 220,
    previewHeightPx: 220,
  },
  {
    id: 'small_38x25',
    title: '38 × 25 mm (Small Sticker)',
    widthMm: 38,
    heightMm: 25,
    dimensionsMm: '38 × 25 mm',
    dimensionsInches: '1.5" × 1.0"',
    useCase: 'Small jewellery boxes, cosmetics, pouch tags, small items',
    previewWidthPx: 240,
    previewHeightPx: 158,
  },
  {
    id: 'large_60x40',
    title: '60 × 40 mm (Large Retail / Box Label)',
    widthMm: 60,
    heightMm: 40,
    dimensionsMm: '60 × 40 mm',
    dimensionsInches: '2.4" × 1.6"',
    useCase: 'Large price tags, boxed items, cartons, shelf labels',
    previewWidthPx: 270,
    previewHeightPx: 180,
  },
  {
    id: 'jewellery_100x13',
    title: '100 × 13 mm (BAR-CODING TECH® Tag)',
    widthMm: 100,
    heightMm: 13,
    dimensionsMm: '100 × 13 mm (Print: 55 × 13 mm)',
    dimensionsInches: '3.94" × 0.51"',
    useCase: 'Polyester price stickers with 45mm non-gum tail loop for jewellery (rings, bangles)',
    previewWidthPx: 440,
    previewHeightPx: 80,
    isJewellery: true,
  },
  {
    id: 'custom',
    title: 'Custom Sticker Dimensions',
    widthMm: 50,
    heightMm: 25,
    dimensionsMm: 'Custom mm',
    dimensionsInches: 'Custom',
    useCase: 'Enter your exact physical roll sticker measurements in millimeters',
    previewWidthPx: 260,
    previewHeightPx: 130,
  },
];

const PREFERENCE_KEY = 'pos_barcode_label_preferences_v2';

interface ResolvedItem {
  id: string;
  productId: string;
  name: string;
  barcode: string;
  categoryName: string;
  unitCost: number;
  quantityBought: number;
  copies: number;
  selected: boolean;
  purchaseCode: string;
  priceDisplay: string | null;
  isGoldSilverJewellery: boolean;
  purityWeightDisplay: string | null;
  weightText: string | null;
  product: ProductDto;
}

export const BatchBarcodePrintModal: React.FC<BatchBarcodePrintModalProps> = ({
  purchase,
  session,
  isOpen,
  onClose,
  products = [],
}) => {
  // Load saved preferences with safe fallbacks
  const savedPrefs = useMemo(() => {
    try {
      const raw = localStorage.getItem(PREFERENCE_KEY);
      if (raw) return JSON.parse(raw);
    } catch {
      // Ignore JSON parse errors
    }
    return null;
  }, []);

  // Initialize item list with quantities from purchase
  const [itemsState, setItemsState] = useState<ResolvedItem[]>([]);
  const [previewIndex, setPreviewIndex] = useState<number>(0);

  // Initialize and sync items when purchase changes or modal opens
  useEffect(() => {
    if (!isOpen || !purchase) return;

    const resolved: ResolvedItem[] = (purchase.items || []).map((item, idx) => {
      const matchedProd = products.find(
        (p) => p.id === item.productId || (item.barcode && p.barcode === item.barcode)
      );

      const isGoldSilver = matchedProd?.fieldValues
        ? matchedProd.fieldValues.some((fv) => {
            const key = fv.categoryField?.fieldKey?.toLowerCase() || '';
            const name = fv.categoryField?.name?.toLowerCase() || '';
            return key === 'purity' || name.includes('purity');
          })
        : false;

      // Extract purity and weight for jewellery tags
      const purityFv = matchedProd?.fieldValues?.find(
        (fv) =>
          fv.categoryField?.fieldKey?.toLowerCase() === 'purity' ||
          fv.categoryField?.name?.toLowerCase().includes('purity')
      );
      const purityText = purityFv?.valueText || null;

      const weightFv = matchedProd?.fieldValues?.find(
        (fv) =>
          fv.categoryField?.fieldKey?.toLowerCase() === 'weight' ||
          fv.categoryField?.fieldKey?.toLowerCase() === 'designweight' ||
          fv.categoryField?.name?.toLowerCase().includes('weight')
      );
      const weightText =
        weightFv?.valueNumber !== null && weightFv?.valueNumber !== undefined
          ? `${weightFv.valueNumber}g`
          : weightFv?.valueText || null;

      const purityWeightDisplay = [purityText, weightText].filter(Boolean).join(' • ') || null;

      // Extract purchase code (COMPLISENT cipher e.g. TTTCTT)
      const purchaseCode =
        matchedProd?.actualPurchasePriceCode ||
        generateActualPurchasePriceCode(item.unitCost > 0 ? item.unitCost : matchedProd?.actualPurchasePrice) ||
        '';

      // Selling price display
      let priceDisplay: string | null = null;
      if (!isGoldSilver && matchedProd) {
        if (matchedProd.sellingPrice !== null && matchedProd.sellingPrice !== undefined) {
          priceDisplay = `₹${Number(matchedProd.sellingPrice).toLocaleString('en-IN')}`;
        } else {
          const priceField = matchedProd.fieldValues?.find((fv) => {
            const key = fv.categoryField?.fieldKey?.toLowerCase() || '';
            const name = fv.categoryField?.name?.toLowerCase() || '';
            return (
              key === 'sellingprice' ||
              key.includes('price') ||
              name.includes('price') ||
              key.includes('rate') ||
              name.includes('rate')
            );
          });
          if (priceField?.valueNumber !== null && priceField?.valueNumber !== undefined) {
            priceDisplay = `₹${priceField.valueNumber.toLocaleString('en-IN')}`;
          } else if (priceField?.valueText) {
            const val = priceField.valueText.trim();
            priceDisplay = val.startsWith('₹') ? val : `₹${val}`;
          }
        }
      }

      // Default synthetic product if not present in catalog
      const finalProd: ProductDto = matchedProd || {
        id: item.productId || `item-${item.id || idx}`,
        companyId: session.companyId,
        categoryId: '',
        name: item.productName,
        barcode: item.barcode,
        stockQuantity: item.currentStock,
        isArchived: false,
        createdAt: item.createdAt || new Date().toISOString(),
        updatedAt: item.updatedAt || new Date().toISOString(),
        categoryName: item.categoryName || 'General',
        fieldValues: [],
        actualPurchasePrice: item.unitCost,
        actualPurchasePriceCode: purchaseCode,
        sellingPrice: null,
      };

      const defaultCopies = Math.max(1, Math.round(item.quantityBought || 1));

      return {
        id: item.id || `item-${idx}`,
        productId: item.productId || `item-${idx}`,
        name: item.productName,
        barcode: item.barcode,
        categoryName: item.categoryName || 'General',
        unitCost: item.unitCost,
        quantityBought: item.quantityBought,
        copies: defaultCopies,
        selected: true,
        purchaseCode,
        priceDisplay,
        isGoldSilverJewellery: isGoldSilver,
        purityWeightDisplay,
        weightText,
        product: finalProd,
      };
    });

    setItemsState(resolved);
    setPreviewIndex(0);
  }, [isOpen, purchase, products, session.companyId]);

  const [selectedSize, setSelectedSize] = useState<BarcodePrintSize>(() => {
    if (savedPrefs?.selectedSize) {
      if (savedPrefs.selectedSize === 'small') return 'small_38x25';
      if (savedPrefs.selectedSize === 'medium') return 'retail_50x35';
      if (savedPrefs.selectedSize === 'large' || savedPrefs.selectedSize === 'large_75x50') return 'large_60x40';
      return savedPrefs.selectedSize;
    }
    return 'std_50x25';
  });

  const [customWidthMm, setCustomWidthMm] = useState<number>(savedPrefs?.customWidthMm || 50);
  const [customHeightMm, setCustomHeightMm] = useState<number>(savedPrefs?.customHeightMm || 25);
  // Standard label configuration defaults
  const showProductName = true;
  const showCategory = false;
  const showPurityWeight = true;
  const showPrice = true;
  const showPurchaseCode = true;
  const showBarcodeValue = true;
  const horizontalPaddingMm = 1.5;
  const verticalPaddingMm = 1.0;
  const horizontalOffsetMm = 0;
  const [isPrinting, setIsPrinting] = useState<boolean>(false);

  // Persist preference updates
  useEffect(() => {
    try {
      localStorage.setItem(
        PREFERENCE_KEY,
        JSON.stringify({
          selectedSize,
          customWidthMm,
          customHeightMm,
        })
      );
    } catch {
      // Ignore localStorage write failures
    }
  }, [selectedSize, customWidthMm, customHeightMm]);

  // Ensure cleanup on modal close / unmount
  useEffect(() => {
    return () => {
      document.body.classList.remove('printing-barcode');
      setIsPrinting(false);
    };
  }, []);

  if (!isOpen || !purchase) return null;

  const activeOption =
    SIZE_OPTIONS.find((opt) => opt.id === selectedSize) || SIZE_OPTIONS[0];

  const effectiveWidthMm =
    selectedSize === 'custom' ? Math.max(20, customWidthMm || 50) : activeOption.widthMm;
  const effectiveHeightMm =
    selectedSize === 'custom' ? Math.max(10, customHeightMm || 25) : activeOption.heightMm;

  // Selected items and total sticker count
  const selectedItems = itemsState.filter((it) => it.selected && it.copies > 0);
  const totalStickersToPrint = selectedItems.reduce((acc, it) => acc + it.copies, 0);

  // Currently previewed item
  const currentPreviewItem = itemsState[previewIndex] || itemsState[0] || null;

  // Helpers to update items
  const handleToggleSelect = (index: number) => {
    setItemsState((prev) =>
      prev.map((it, idx) => (idx === index ? { ...it, selected: !it.selected } : it))
    );
  };

  const handleCopiesChange = (index: number, newCopies: number) => {
    const valid = Math.max(0, Math.min(2000, newCopies || 0));
    setItemsState((prev) =>
      prev.map((it, idx) =>
        idx === index ? { ...it, copies: valid, selected: valid > 0 ? it.selected : false } : it
      )
    );
  };

  const handleSelectAll = (select: boolean) => {
    setItemsState((prev) => prev.map((it) => ({ ...it, selected: select })));
  };

  const handleResetToBoughtQty = () => {
    setItemsState((prev) =>
      prev.map((it) => ({
        ...it,
        copies: Math.max(1, Math.round(it.quantityBought || 1)),
        selected: true,
      }))
    );
  };

  const handleSetAllToOneCopy = () => {
    setItemsState((prev) => prev.map((it) => ({ ...it, copies: 1, selected: true })));
  };

  // Build the list of stickers for portal rendering
  const printableList: Array<{ item: ResolvedItem; copyNumber: number }> = [];
  for (const it of selectedItems) {
    for (let c = 1; c <= it.copies; c++) {
      printableList.push({ item: it, copyNumber: c });
    }
  }

  // Execute Batch Print via clean offscreen window
  const executePrint = async () => {
    if (totalStickersToPrint === 0) return;

    setIsPrinting(true);
    document.body.classList.add('printing-barcode');

    setTimeout(async () => {
      try {
        const slip = document.getElementById('printable-batch-barcode-slip');

        // Ensure JsBarcode useEffect has executed and populated all SVGs with rect/text elements
        let attempts = 0;
        while (attempts < 15) {
          const svgs = slip?.querySelectorAll('svg');
          const allRendered =
            svgs && svgs.length > 0 && Array.from(svgs).every((s) => s.children.length > 0);
          if (allRendered) break;
          await new Promise((resolve) => setTimeout(resolve, 60));
          attempts++;
        }

        const rawHtml = slip ? slip.innerHTML : '';
        const slipHtml = rawHtml.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '').trim();

        const fullHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Purchase Barcode Labels (${purchase.purchaseNumber})</title>
  <style>
    @page {
      size: ${effectiveWidthMm}mm ${effectiveHeightMm}mm;
      margin: 0mm !important;
    }
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      width: ${effectiveWidthMm}mm !important;
      height: auto !important;
      min-height: 0 !important;
      overflow: visible !important;
      background: #ffffff !important;
      background-color: #ffffff !important;
      color: #000000 !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      font-family: Arial, sans-serif;
    }
    * {
      box-sizing: border-box !important;
    }

    /* Layout & Display Utilities */
    .flex { display: flex !important; }
    .inline-flex { display: inline-flex !important; }
    .flex-col { flex-direction: column !important; }
    .flex-row { flex-direction: row !important; }
    .flex-1 { flex: 1 1 0% !important; }
    .shrink-0 { flex-shrink: 0 !important; }
    .items-center { align-items: center !important; }
    .items-stretch { align-items: stretch !important; }
    .justify-between { justify-content: space-between !important; }
    .justify-around { justify-content: space-around !important; }
    .justify-center { justify-content: center !important; }
    .justify-start { justify-content: flex-start !important; }
    .block { display: block !important; }
    .inline-block { display: inline-block !important; }
    .box-border { box-sizing: border-box !important; }
    .overflow-hidden { overflow: hidden !important; }

    /* Sizing Utilities */
    .w-full { width: 100% !important; }
    .h-full { height: 100% !important; }
    .max-w-full { max-width: 100% !important; }
    .max-h-full { max-height: 100% !important; }
    .h-auto { height: auto !important; }
    .min-h-0 { min-height: 0 !important; }

    /* Typography Utilities */
    .text-left { text-align: left !important; }
    .text-right { text-align: right !important; }
    .text-center { text-align: center !important; }
    .truncate { overflow: hidden !important; text-overflow: ellipsis !important; white-space: nowrap !important; }
    .leading-none { line-height: 1 !important; }
    .leading-tight { line-height: 1.15 !important; }
    .font-mono { font-family: monospace !important; }
    .font-bold { font-weight: bold !important; }
    .font-semibold { font-weight: 600 !important; }
    .tracking-wider { letter-spacing: 0.05em !important; }
    .tracking-tight { letter-spacing: -0.025em !important; }
    .text-black { color: #000000 !important; }

    /* Barcode SVG scaling - respects container height and width */
    svg {
      width: 100% !important;
      max-width: 100% !important;
      max-height: 100% !important;
      height: auto !important;
      display: block !important;
      margin: 0 auto !important;
    }

    /* Standard thermal label page */
    .barcode-label-page {
      width: ${effectiveWidthMm}mm !important;
      height: ${effectiveHeightMm}mm !important;
      max-height: ${effectiveHeightMm}mm !important;
      page-break-after: always !important;
      break-after: page !important;
      page-break-inside: avoid !important;
      break-inside: avoid !important;
      box-sizing: border-box !important;
      margin: 0 auto !important;
      padding: ${verticalPaddingMm}mm ${horizontalPaddingMm}mm !important;
      display: flex !important;
      flex-direction: column !important;
      justify-content: space-between !important;
      align-items: center !important;
      text-align: center !important;
      overflow: hidden !important;
      background: #ffffff !important;
      background-color: #ffffff !important;
      color: #000000 !important;
      transform: ${horizontalOffsetMm ? `translateX(${horizontalOffsetMm}mm)` : 'none'} !important;
    }

    /* Jewellery dumbbell tag page: Exactly 100mm x 13mm matching @page size and physical roll */
    .barcode-label-page.barcode-label-jewellery {
      width: 100mm !important;
      height: 13mm !important;
      max-height: 13mm !important;
      margin: 0 !important;
      padding: 0 !important;
      display: flex !important;
      flex-direction: row !important;
      justify-content: flex-start !important;
      align-items: center !important;
      text-align: left !important;
      overflow: hidden !important;
      transform: ${horizontalOffsetMm ? `translateX(${horizontalOffsetMm}mm)` : 'none'} !important;
    }

    .barcode-label-page:last-child {
      page-break-after: auto !important;
      break-after: auto !important;
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background: #ffffff; background-color: #ffffff;">
  ${slipHtml}
</body>
</html>
        `;

        if (window.posApi?.printBarcode) {
          await window.posApi.printBarcode({
            html: fullHtml,
            widthMm: effectiveWidthMm,
            heightMm: effectiveHeightMm,
          });
        } else {
          window.print();
        }
      } catch (err) {
        console.error('Batch barcode printing failed:', err);
      } finally {
        setTimeout(() => {
          document.body.classList.remove('printing-barcode');
          setIsPrinting(false);
        }, 800);
      }
    }, 280);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/65 p-4 backdrop-blur-sm select-text print:hidden">
      <div className="flex h-[94vh] max-h-[890px] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-cream-300 bg-white shadow-2xl">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-cream-200 px-6 py-4 bg-cream-50/80">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-600 text-white font-bold text-xs shadow-xs">
                🏷
              </span>
              <h2 className="text-base font-bold text-stone-900">
                Print Purchase Barcode Labels
              </h2>
              <span className="rounded-md border border-amber-300 bg-amber-50 px-2.5 py-0.5 font-mono text-xs font-bold text-amber-900">
                {purchase.purchaseNumber}
              </span>
              <span className="rounded-md border border-cream-300 bg-white px-2 py-0.5 text-xs font-semibold text-stone-700 shadow-2xs">
                {purchase.vendorName}
              </span>
              <span className="rounded-full bg-amber-600/10 border border-amber-500/20 px-2.5 py-0.5 text-xs font-bold text-amber-800">
                {selectedItems.length} Products • {totalStickersToPrint} Stickers
              </span>
            </div>
            <p className="mt-1 text-xs text-stone-500">
              Print all barcode stickers for this inward purchase entry. Each product defaults to its purchased quantity on the invoice.
            </p>
          </div>

          <button
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

        {/* Modal Body */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left Panel: Items Selection & Format Options */}
          <div className="w-full lg:w-7/12 overflow-y-auto p-6 space-y-5 border-r border-cream-200">
            {/* Products Table in Purchase Entry */}
            <div className="rounded-2xl border border-cream-300 bg-cream-50/40 p-4 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-stone-800">
                    Products in this Purchase Entry ({itemsState.length})
                  </h3>
                  <p className="text-[11px] text-stone-500">
                    Select products and adjust sticker copy counts as needed
                  </p>
                </div>

                {/* Quick Presets */}
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleResetToBoughtQty}
                    className="rounded-lg border border-cream-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-stone-700 hover:bg-cream-100 shadow-2xs transition"
                    title="Reset all copies to invoice bought quantities"
                  >
                    Reset to Bought Qty
                  </button>
                  <button
                    type="button"
                    onClick={handleSetAllToOneCopy}
                    className="rounded-lg border border-cream-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-stone-700 hover:bg-cream-100 shadow-2xs transition"
                    title="Set all item copies to 1"
                  >
                    Set All to 1
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectAll(selectedItems.length < itemsState.length)}
                    className="rounded-lg border border-cream-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-stone-700 hover:bg-cream-100 shadow-2xs transition"
                  >
                    {selectedItems.length === itemsState.length ? 'Deselect All' : 'Select All'}
                  </button>
                </div>
              </div>

              {/* Items List */}
              <div className="max-h-60 overflow-y-auto rounded-xl border border-cream-200 bg-white divide-y divide-cream-100">
                {itemsState.map((item, index) => {
                  const isCurrentPreview = previewIndex === index;
                  return (
                    <div
                      key={item.id}
                      className={`flex items-center justify-between p-3 transition ${
                        isCurrentPreview ? 'bg-amber-50/60 ring-1 ring-inset ring-amber-400/50' : 'hover:bg-cream-50/50'
                      }`}
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0 pr-3">
                        <input
                          type="checkbox"
                          checked={item.selected}
                          onChange={() => handleToggleSelect(index)}
                          className="h-4 w-4 rounded border-cream-300 text-amber-600 focus:ring-amber-500 shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span
                              onClick={() => setPreviewIndex(index)}
                              className="font-bold text-xs text-stone-900 truncate hover:text-amber-800 cursor-pointer"
                              title="Click to preview this sticker"
                            >
                              {item.name}
                            </span>
                            {item.isGoldSilverJewellery && (
                              <span className="rounded bg-amber-100 px-1.5 py-0.2 text-[9px] font-bold text-amber-900 shrink-0">
                                Jewellery
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-stone-500 mt-0.5 font-mono">
                            <span className="text-stone-700 font-semibold">{item.barcode}</span>
                            <span>•</span>
                            <span>Bought: <strong>{item.quantityBought}</strong> units</span>
                            {item.purchaseCode && (
                              <>
                                <span>•</span>
                                <span className="text-amber-800 font-bold bg-amber-50 px-1 rounded border border-amber-200">
                                  {item.purchaseCode}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Quantity Controls & Preview Button */}
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => setPreviewIndex(index)}
                          className={`rounded px-2 py-1 text-[10px] font-bold transition ${
                            isCurrentPreview
                              ? 'bg-amber-600 text-white'
                              : 'bg-cream-100 text-stone-600 hover:bg-cream-200'
                          }`}
                        >
                          Preview
                        </button>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleCopiesChange(index, item.copies - 1)}
                            className="h-6 w-6 rounded bg-white border border-cream-300 text-stone-700 hover:bg-cream-100 text-xs font-bold flex items-center justify-center shadow-2xs"
                          >
                            -
                          </button>
                          <input
                            type="number"
                            min={0}
                            max={2000}
                            value={item.copies}
                            onChange={(e) => handleCopiesChange(index, parseInt(e.target.value, 10) || 0)}
                            className="h-6 w-12 rounded border border-cream-300 bg-white text-center text-xs font-bold text-stone-900 focus:border-amber-600 focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => handleCopiesChange(index, item.copies + 1)}
                            className="h-6 w-6 rounded bg-white border border-cream-300 text-stone-700 hover:bg-cream-100 text-xs font-bold flex items-center justify-center shadow-2xs"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Sticker Dimensions / Roll Format */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-stone-800">
                  Sticker Dimensions / Roll Format <span className="text-rose-500">*</span>
                </label>
                <span className="text-[10px] text-stone-500 font-mono">
                  {effectiveWidthMm}mm × {effectiveHeightMm}mm
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {SIZE_OPTIONS.map((opt) => {
                  const isSelected = selectedSize === opt.id;
                  return (
                    <div
                      key={opt.id}
                      onClick={() => setSelectedSize(opt.id)}
                      className={`cursor-pointer rounded-xl border p-2.5 transition ${
                        isSelected
                          ? 'border-amber-500 bg-amber-50/50 ring-1 ring-amber-500/50 shadow-xs'
                          : 'border-cream-200 bg-white hover:border-cream-300 hover:bg-cream-50/50 shadow-2xs'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="batch-barcode-print-size"
                            id={`batch-size-radio-${opt.id}`}
                            checked={isSelected}
                            onChange={() => setSelectedSize(opt.id)}
                            className="h-3.5 w-3.5 text-amber-600 border-cream-300 focus:ring-amber-500"
                          />
                          <label
                            htmlFor={`batch-size-radio-${opt.id}`}
                            className="text-xs font-bold text-stone-900 cursor-pointer select-none"
                          >
                            {opt.title}
                          </label>
                        </div>
                        <span className="rounded bg-cream-100 px-1.5 py-0.5 text-[9px] font-mono text-stone-700 border border-cream-200 font-semibold">
                          {opt.dimensionsMm}
                        </span>
                      </div>
                      <p className="mt-1 pl-5.5 text-[10px] text-stone-500 leading-normal line-clamp-1">
                        {opt.useCase}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Custom Measurements Input */}
            {selectedSize === 'custom' && (
              <div className="rounded-xl border border-amber-300 bg-amber-50/40 p-4 space-y-3">
                <h4 className="text-xs font-bold text-stone-900 flex items-center gap-1.5">
                  <span>📐</span>
                  <span>Enter Custom Roll Measurements</span>
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-stone-700 mb-1">
                      Sticker Width (mm)
                    </label>
                    <input
                      type="number"
                      min={20}
                      max={150}
                      value={customWidthMm}
                      onChange={(e) => setCustomWidthMm(Math.max(20, Math.min(150, parseInt(e.target.value, 10) || 50)))}
                      className="w-full h-8 rounded-lg border border-cream-300 bg-white px-2.5 text-xs font-bold text-stone-900 focus:border-amber-600 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-stone-700 mb-1">
                      Sticker Height (mm)
                    </label>
                    <input
                      type="number"
                      min={10}
                      max={150}
                      value={customHeightMm}
                      onChange={(e) => setCustomHeightMm(Math.max(10, Math.min(150, parseInt(e.target.value, 10) || 25)))}
                      className="w-full h-8 rounded-lg border border-cream-300 bg-white px-2.5 text-xs font-bold text-stone-900 focus:border-amber-600 focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            )}

          </div>

          {/* Right Panel: Sticker Live Preview & Print Actions */}
          <div className="w-full lg:w-5/12 flex flex-col justify-between p-6 bg-cream-50/40">
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-stone-600">
                    Live Sticker Preview
                  </h3>
                  {currentPreviewItem && (
                    <span className="rounded bg-cream-200/70 px-1.5 py-0.5 text-[10px] font-bold text-stone-700">
                      Item {previewIndex + 1} of {itemsState.length}
                    </span>
                  )}
                </div>
                <span className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800">
                  {effectiveWidthMm} × {effectiveHeightMm} mm
                </span>
              </div>

              {/* Tag Preview Area */}
              <div className="flex flex-col items-center justify-center p-5 rounded-2xl border border-cream-200 bg-cream-100/70 min-h-[300px]">
                {currentPreviewItem ? (
                  selectedSize === 'jewellery_100x13' ? (
                    /* 100mm x 13mm Jewellery Dumbbell Tag Preview */
                    <div className="w-full max-w-md flex flex-col items-center space-y-3">
                      <div className="w-full flex justify-between text-[10px] text-stone-500 font-semibold px-2">
                        <span>◄ Printable Zone (55mm × 13mm) ►</span>
                        <span>◄ Non-Gum Tail (45mm) ►</span>
                      </div>

                      <div className="w-full flex items-center bg-transparent drop-shadow-md">
                        <div className="w-[58%] h-[68px] bg-white rounded-l-md border-2 border-stone-800 flex items-stretch overflow-hidden relative">
                          {/* Left Flap */}
                          <div className="w-1/2 p-1.5 flex flex-col justify-between text-left overflow-hidden border-r border-dashed border-stone-300">
                            {showProductName && (
                              <div className="font-bold text-stone-900 text-[10px] leading-tight truncate" title={currentPreviewItem.name}>
                                {currentPreviewItem.name}
                              </div>
                            )}
                            {showPurityWeight && currentPreviewItem.purityWeightDisplay && (
                              <div className="font-semibold text-amber-900 text-[9px] leading-tight">
                                {currentPreviewItem.purityWeightDisplay}
                              </div>
                            )}
                            {!currentPreviewItem.isGoldSilverJewellery && showPrice && currentPreviewItem.priceDisplay && (
                              <div className="font-bold font-mono text-stone-900 text-[10px] leading-tight">
                                {currentPreviewItem.priceDisplay}
                              </div>
                            )}
                          </div>

                          {/* Right Flap */}
                          <div className="w-1/2 p-1 flex flex-col items-center justify-center text-center overflow-hidden">
                            <BarcodeGraphic
                              barcode={currentPreviewItem.barcode}
                              size="jewellery_100x13"
                              height={16}
                              width={0.8}
                              displayValue={false}
                            />
                            <div className="w-full flex items-center justify-between font-mono text-[8.5px] font-bold text-stone-800 tracking-wider mt-0.5 px-0.5">
                              <span className="text-[8px] font-bold text-stone-900">
                                {currentPreviewItem.isGoldSilverJewellery
                                  ? (showPurityWeight && currentPreviewItem.weightText ? currentPreviewItem.weightText : '')
                                  : (showPrice && currentPreviewItem.priceDisplay ? currentPreviewItem.priceDisplay : '')}
                              </span>
                              <span className="text-[8px] font-mono ml-auto">
                                {showPurchaseCode && currentPreviewItem.purchaseCode ? currentPreviewItem.purchaseCode : currentPreviewItem.barcode}
                              </span>
                            </div>
                          </div>

                          <div className="absolute bottom-0.5 left-1/2 -translate-x-1/2 text-[7px] text-stone-400 font-mono select-none">
                            fold
                          </div>
                        </div>

                        {/* Tail Loop */}
                        <div className="w-[42%] h-[28px] bg-stone-200/90 border-y-2 border-r-2 border-dashed border-stone-400 rounded-r-full flex items-center justify-center relative overflow-hidden">
                          <span className="text-[8px] font-semibold text-stone-600 tracking-tight whitespace-nowrap px-1">
                            Tail Loop
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Standard Thermal Barcode Sticker Preview */
                    <div className="flex flex-col items-center">
                      <div
                        style={{
                          width: `${Math.min(300, activeOption.previewWidthPx)}px`,
                          height: `${Math.min(200, activeOption.previewHeightPx)}px`,
                          transform: horizontalOffsetMm ? `translateX(${horizontalOffsetMm * 3}px)` : undefined,
                        }}
                        className="bg-white text-black rounded-lg shadow-xl p-2.5 border border-stone-300 flex flex-col justify-between items-center transition-all duration-200 relative select-none"
                      >
                        {/* Top: Product Name */}
                        <div className="w-full text-center overflow-hidden">
                          {showProductName && (
                            <div className="font-bold text-stone-900 leading-tight text-xs truncate">
                              {currentPreviewItem.name}
                            </div>
                          )}
                          {showCategory && (
                            <div className="text-stone-500 text-[9px] leading-tight truncate">
                              {currentPreviewItem.categoryName}
                            </div>
                          )}
                        </div>

                        {/* Middle: Scannable Barcode */}
                        <div className="w-full flex items-center justify-center my-auto py-1">
                          <BarcodeGraphic
                            barcode={currentPreviewItem.barcode}
                            size={selectedSize}
                            displayValue={showBarcodeValue}
                          />
                        </div>

                        {/* Bottom Row */}
                        <div className="w-full flex items-center justify-between pt-1 border-t border-stone-800 text-xs">
                          <div className="font-bold text-stone-900 text-left truncate pr-1">
                            {currentPreviewItem.isGoldSilverJewellery
                              ? (showPurityWeight && currentPreviewItem.purityWeightDisplay ? currentPreviewItem.purityWeightDisplay : '')
                              : (showPrice && currentPreviewItem.priceDisplay ? currentPreviewItem.priceDisplay : '')}
                          </div>

                          <div className="font-mono font-bold text-stone-900 text-right tracking-wider truncate pl-1">
                            {showPurchaseCode && currentPreviewItem.purchaseCode
                              ? currentPreviewItem.purchaseCode
                              : (showBarcodeValue ? '' : currentPreviewItem.barcode)}
                          </div>
                        </div>
                      </div>

                      <div className="mt-2 text-[10px] text-stone-500 font-mono flex items-center gap-2">
                        <span>Copies to print for this item: <strong>{currentPreviewItem.copies}</strong></span>
                        <span>•</span>
                        <span>Sticker {effectiveWidthMm}×{effectiveHeightMm}mm</span>
                      </div>
                    </div>
                  )
                ) : (
                  <div className="text-xs text-stone-400">No product selected</div>
                )}
              </div>

              {/* Navigation between preview items */}
              {itemsState.length > 1 && (
                <div className="mt-2 flex items-center justify-between text-xs">
                  <button
                    type="button"
                    onClick={() => setPreviewIndex((prev) => (prev > 0 ? prev - 1 : itemsState.length - 1))}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-stone-600 hover:text-stone-900 px-2 py-1 rounded bg-cream-100 hover:bg-cream-200 transition"
                  >
                    ◀ Prev Item
                  </button>
                  <span className="text-[11px] font-semibold text-stone-600 truncate max-w-[200px]">
                    {currentPreviewItem?.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPreviewIndex((prev) => (prev < itemsState.length - 1 ? prev + 1 : 0))}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-stone-600 hover:text-stone-900 px-2 py-1 rounded bg-cream-100 hover:bg-cream-200 transition"
                  >
                    Next Item ▶
                  </button>
                </div>
              )}

              {/* Batch Summary Box */}
              <div className="mt-4 rounded-xl border border-cream-200 bg-white p-3.5 space-y-1.5 text-xs text-stone-600">
                <div className="flex justify-between">
                  <span>Selected Products:</span>
                  <strong className="text-stone-900">{selectedItems.length} of {itemsState.length} items</strong>
                </div>
                <div className="flex justify-between">
                  <span>Total Barcode Stickers:</span>
                  <strong className="text-amber-800 font-bold">{totalStickersToPrint} stickers</strong>
                </div>
                <div className="flex justify-between">
                  <span>Format:</span>
                  <span className="font-mono text-stone-800">{activeOption.dimensionsMm}</span>
                </div>
              </div>
            </div>

            {/* Print Action Buttons */}
            <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-cream-200 mt-4">
              <button
                type="button"
                onClick={onClose}
                disabled={isPrinting}
                className="rounded-lg border border-cream-300 bg-white px-3.5 py-2 text-xs font-semibold text-stone-700 hover:bg-cream-100 transition disabled:opacity-50 shadow-xs"
              >
                Cancel
              </button>

              {/* Primary Batch Print */}
              <button
                id="btn-batch-confirm-print"
                type="button"
                onClick={() => executePrint()}
                disabled={isPrinting || totalStickersToPrint === 0}
                className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-amber-500 transition disabled:opacity-50"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                {isPrinting ? 'Opening Print Dialog...' : `Print All ${totalStickersToPrint} Stickers`}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Render Portal into document.body during printing */}
      {createPortal(
        <div
          id="printable-batch-barcode-slip"
          style={{
            margin: 0,
            padding: 0,
            width: '100%',
            backgroundColor: '#ffffff',
          }}
        >
          {printableList.map(({ item, copyNumber }) => (
            selectedSize === 'jewellery_100x13' ? (
              /* BAR-CODING TECH® 100mm x 13mm Roll Tag */
              <div
                key={`${item.id}-${copyNumber}`}
                className="barcode-label-page barcode-label-jewellery"
                style={{
                  width: '100mm',
                  height: '13mm',
                  maxHeight: '13mm',
                  margin: '0',
                  padding: '0',
                  display: 'flex',
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'flex-start',
                  boxSizing: 'border-box',
                  overflow: 'hidden',
                  background: '#ffffff',
                  transform: horizontalOffsetMm ? `translateX(${horizontalOffsetMm}mm)` : undefined,
                }}
              >
                {/* Printable Zone: 55mm × 13mm */}
                <div
                  style={{
                    width: '55mm',
                    minWidth: '55mm',
                    maxWidth: '55mm',
                    height: '13mm',
                    maxHeight: '13mm',
                    boxSizing: 'border-box',
                    padding: '0.5mm 1mm',
                    display: 'flex',
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    overflow: 'hidden',
                  }}
                >
                  {/* Left Flap: 26.5mm */}
                  <div
                    style={{
                      width: '26.5mm',
                      minWidth: '26.5mm',
                      maxWidth: '26.5mm',
                      height: '12mm',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-around',
                      overflow: 'hidden',
                      textAlign: 'left',
                      boxSizing: 'border-box',
                      lineHeight: 1.15,
                    }}
                  >
                    {showProductName && (
                      <div
                        style={{
                          fontSize: '7pt',
                          fontWeight: 'bold',
                          color: '#000000',
                          lineHeight: 1,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={item.name}
                      >
                        {item.name}
                      </div>
                    )}
                    {showPurityWeight && item.purityWeightDisplay && (
                      <div
                        style={{
                          fontSize: '6pt',
                          fontWeight: 600,
                          color: '#000000',
                          lineHeight: 1,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {item.purityWeightDisplay}
                      </div>
                    )}
                    {!item.isGoldSilverJewellery && showPrice && item.priceDisplay && (
                      <div
                        style={{
                          fontSize: '7pt',
                          fontWeight: 'bold',
                          fontFamily: 'monospace',
                          color: '#000000',
                          lineHeight: 1,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {item.priceDisplay}
                      </div>
                    )}
                  </div>

                  {/* Fold Line */}
                  <div
                    style={{
                      width: '1px',
                      height: '10mm',
                      borderRight: '1px dotted #000000',
                      margin: '0 0.5mm',
                      flexShrink: 0,
                    }}
                  />

                  {/* Right Flap: 26.5mm */}
                  <div
                    style={{
                      width: '26.5mm',
                      minWidth: '26.5mm',
                      maxWidth: '26.5mm',
                      height: '12mm',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'hidden',
                      textAlign: 'center',
                      boxSizing: 'border-box',
                    }}
                  >
                    <div
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flex: '1 1 0%',
                        minHeight: 0,
                        maxHeight: '8mm',
                        overflow: 'hidden',
                      }}
                    >
                      <BarcodeGraphic
                        barcode={item.barcode}
                        size="jewellery_100x13"
                        height={15}
                        width={0.8}
                        displayValue={false}
                        className="h-full max-h-full"
                      />
                    </div>
                    <div
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontFamily: 'monospace',
                        fontSize: '5.5pt',
                        fontWeight: 'bold',
                        color: '#000000',
                        letterSpacing: '0.05em',
                        lineHeight: 1,
                        marginTop: '0.3mm',
                        padding: '0 0.5mm',
                        boxSizing: 'border-box',
                        flexShrink: 0,
                        overflow: 'hidden',
                      }}
                    >
                      <span style={{ textAlign: 'left', fontWeight: 'bold' }}>
                        {item.isGoldSilverJewellery
                          ? (showPurityWeight && item.weightText ? item.weightText : '')
                          : (showPrice && item.priceDisplay ? item.priceDisplay : '')}
                      </span>
                      <span style={{ textAlign: 'right', marginLeft: 'auto' }}>
                        {showPurchaseCode && item.purchaseCode ? item.purchaseCode : item.barcode}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Non-Gum Tail Loop */}
                <div
                  style={{
                    width: '45mm',
                    minWidth: '45mm',
                    maxWidth: '45mm',
                    height: '13mm',
                    flexShrink: 0,
                  }}
                  aria-hidden="true"
                />
              </div>
            ) : (
              /* Standard Thermal Barcode Sticker */
              <div
                key={`${item.id}-${copyNumber}`}
                className="barcode-label-page barcode-label-standard"
              >
                {/* 1. Top Section */}
                <div
                  style={{
                    width: '100%',
                    textAlign: 'center',
                    lineHeight: 1.1,
                    overflow: 'hidden',
                    flexShrink: 0,
                  }}
                >
                  {showProductName && (
                    <div
                      style={{
                        fontSize: effectiveHeightMm <= 25 ? '7pt' : '8pt',
                        fontWeight: 'bold',
                        color: '#000000',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {item.name}
                    </div>
                  )}
                  {showCategory && (
                    <div
                      style={{
                        fontSize: '6pt',
                        color: '#333333',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {item.categoryName}
                    </div>
                  )}
                </div>

                {/* 2. Middle Section: Scannable Barcode */}
                <div
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flex: '1 1 0%',
                    minHeight: 0,
                    maxHeight: '100%',
                    margin: '0.3mm 0',
                    overflow: 'hidden',
                  }}
                >
                  <BarcodeGraphic
                    barcode={item.barcode}
                    size={selectedSize}
                    displayValue={showBarcodeValue}
                    className="h-full max-h-full"
                  />
                </div>

                {/* 3. Bottom Section: RATE on LEFT, CODE on RIGHT */}
                <div
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: effectiveHeightMm <= 25 ? '7pt' : '8pt',
                    lineHeight: 1.1,
                    paddingTop: '0.4mm',
                    borderTop: '0.5pt solid #000000',
                    boxSizing: 'border-box',
                    overflow: 'hidden',
                    flexShrink: 0,
                  }}
                >
                  <div
                    style={{
                      fontWeight: 'bold',
                      color: '#000000',
                      textAlign: 'left',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      paddingRight: '1mm',
                    }}
                  >
                    {item.isGoldSilverJewellery
                      ? (showPurityWeight && item.purityWeightDisplay ? item.purityWeightDisplay : '')
                      : (showPrice && item.priceDisplay ? item.priceDisplay : '')}
                  </div>

                  <div
                    style={{
                      fontFamily: 'monospace',
                      fontWeight: 'bold',
                      color: '#000000',
                      textAlign: 'right',
                      letterSpacing: '0.5px',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      paddingLeft: '1mm',
                    }}
                  >
                    {showPurchaseCode && item.purchaseCode
                      ? item.purchaseCode
                      : (showBarcodeValue ? '' : item.barcode)}
                  </div>
                </div>
              </div>
            )
          ))}
        </div>,
        document.body
      )}
    </div>
  );
};
