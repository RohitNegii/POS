import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { AuthSessionPayload, ProductDto } from '../../shared/types/ipc';
import { BarcodeGraphic, BarcodePrintSize } from './BarcodeGraphic';
import { generateActualPurchasePriceCode } from '../../shared/utils/purchaseCode';

interface BarcodePrintModalProps {
  product: ProductDto | null;
  session: AuthSessionPayload;
  isOpen: boolean;
  onClose: () => void;
  initialCopies?: number;
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

export const BarcodePrintModal: React.FC<BarcodePrintModalProps> = ({
  product,
  session: _session,
  isOpen,
  onClose,
  initialCopies,
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

  // Check solely for the purity attribute (identifies gold/silver jewellery priced by daily metal rate)
  const isGoldSilverJewellery = useMemo(() => {
    if (!product?.fieldValues) return false;
    return product.fieldValues.some((fv) => {
      const key = fv.categoryField?.fieldKey?.toLowerCase() || '';
      const name = fv.categoryField?.name?.toLowerCase() || '';
      return key === 'purity' || name.includes('purity');
    });
  }, [product]);

  const [selectedSize, setSelectedSize] = useState<BarcodePrintSize>(() => {
    if (savedPrefs?.selectedSize) {
      // Map old aliases if present
      if (savedPrefs.selectedSize === 'small') return 'small_38x25';
      if (savedPrefs.selectedSize === 'medium') return 'retail_50x35';
      if (savedPrefs.selectedSize === 'large' || savedPrefs.selectedSize === 'large_75x50') return 'large_60x40';
      return savedPrefs.selectedSize;
    }
    return isGoldSilverJewellery ? 'jewellery_100x13' : 'std_50x25';
  });

  const [customWidthMm, setCustomWidthMm] = useState<number>(savedPrefs?.customWidthMm || 50);
  const [customHeightMm, setCustomHeightMm] = useState<number>(savedPrefs?.customHeightMm || 25);
  const [copies, setCopies] = useState<number>(() => {
    return initialCopies && initialCopies > 0 ? Math.round(initialCopies) : 1;
  });

  useEffect(() => {
    if (isOpen && initialCopies && initialCopies > 0) {
      setCopies(Math.round(initialCopies));
    }
  }, [isOpen, initialCopies, product?.id]);

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

  if (!isOpen || !product) return null;

  // Extract purity and weight for jewellery tags
  const purityFv = product.fieldValues?.find(
    (fv) =>
      fv.categoryField?.fieldKey?.toLowerCase() === 'purity' ||
      fv.categoryField?.name?.toLowerCase().includes('purity')
  );
  const purityText = purityFv?.valueText || null;

  const weightFv = product.fieldValues?.find(
    (fv) =>
      fv.categoryField?.fieldKey?.toLowerCase() === 'weight' ||
      fv.categoryField?.fieldKey?.toLowerCase() === 'designweight' ||
      fv.categoryField?.name?.toLowerCase().includes('weight')
  );
  const weightText =
    weightFv?.valueNumber !== null && weightFv?.valueNumber !== undefined
      ? `${weightFv.valueNumber}g`
      : weightFv?.valueText || null;

  const purityWeightDisplay = [purityText, weightText].filter(Boolean).join(' • ');

  // Extract purchase price code (COMPLISENT mapping e.g. TTTCTT)
  const purchaseCode =
    product.actualPurchasePriceCode ||
    generateActualPurchasePriceCode(product.actualPurchasePrice) ||
    '';

  // Extract selling price (EXCLUDED for gold/silver jewellery because their price is calculated dynamically at checkout based on today's metal rate)
  const priceDisplay = isGoldSilverJewellery
    ? null
    : (() => {
        if (product.sellingPrice !== null && product.sellingPrice !== undefined) {
          return `₹${Number(product.sellingPrice).toLocaleString()}`;
        }
        const priceField = product.fieldValues?.find((fv) => {
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
        if (!priceField) return null;
        if (priceField.valueNumber !== null && priceField.valueNumber !== undefined) {
          return `₹${priceField.valueNumber.toLocaleString()}`;
        }
        if (priceField.valueText) {
          const val = priceField.valueText.trim();
          return val.startsWith('₹') ? val : `₹${val}`;
        }
        return null;
      })();

  const activeOption =
    SIZE_OPTIONS.find((opt) => opt.id === selectedSize) || SIZE_OPTIONS[0];

  const effectiveWidthMm =
    selectedSize === 'custom' ? Math.max(20, customWidthMm || 50) : activeOption.widthMm;
  const effectiveHeightMm =
    selectedSize === 'custom' ? Math.max(10, customHeightMm || 25) : activeOption.heightMm;

  // Perform physical label printing via clean offscreen window (Zero backdrop / Zero black leak)
  const executePrint = async () => {
    setIsPrinting(true);
    document.body.classList.add('printing-barcode');

    // Allow React state update (copiesToPrint) to render into DOM,
    // then wait for JsBarcode SVG effects to fire and compute viewBox
    setTimeout(async () => {
      try {
        const slip = document.getElementById('printable-barcode-slip');

        // Ensure JsBarcode useEffect has executed and populated all SVGs with rect/text elements
        let attempts = 0;
        while (attempts < 10) {
          const svgs = slip?.querySelectorAll('svg');
          const allRendered =
            svgs && svgs.length > 0 && Array.from(svgs).every((s) => s.children.length > 0);
          if (allRendered) break;
          await new Promise((resolve) => setTimeout(resolve, 50));
          attempts++;
        }

        const rawHtml = slip ? slip.innerHTML : '';
        // Strip duplicate <style> tag from portal markup so head stylesheet has clean precedence
        const slipHtml = rawHtml.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '').trim();

        const fullHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Barcode Labels</title>
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
        console.error('Barcode printing failed:', err);
      } finally {
        setTimeout(() => {
          document.body.classList.remove('printing-barcode');
          setIsPrinting(false);
        }, 800);
      }
    }, 250);
  };

  const copiesToPrint = copies;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 p-4 backdrop-blur-sm select-text print:hidden">
      <div className="flex h-[92vh] max-h-[860px] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-cream-300 bg-white shadow-2xl">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-cream-200 px-6 py-4 bg-cream-50/70">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-base font-bold text-stone-900">
                Print Barcode Labels
              </h2>
              <span className="rounded-full border border-amber-300/80 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                {product.name}
              </span>
              <span className="rounded border border-cream-300 bg-white px-2 py-0.5 font-mono text-xs text-stone-700 shadow-xs">
                {product.barcode}
              </span>
              {isGoldSilverJewellery && (
                <span className="rounded-full border border-amber-400 bg-amber-100/90 px-2 py-0.5 text-[10px] font-bold text-amber-900 shadow-2xs">
                  Gold/Silver (Live Metal Rate)
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-stone-500">
              Configured for thermal roll barcode printers (TSC, Xprinter, Zebra, TVS, Godex) with 1:1 sticker centering.
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
          {/* Left Settings Panel */}
          <div className="w-full md:w-1/2 overflow-y-auto p-6 space-y-5 border-r border-cream-200">
            {/* Quick Roll Size Notice */}
            <div className="rounded-xl border border-amber-300/90 bg-amber-50/70 p-3.5">
              <div className="flex items-start gap-2.5">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-amber-600 text-white font-bold text-xs">
                  {isGoldSilverJewellery ? '⚖' : '✓'}
                </div>
                <div className="text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-amber-950">
                      {isGoldSilverJewellery ? 'Gold & Silver Jewellery Barcode' : 'Auto-Centered Thermal Layout'}
                    </span>
                    <span className="rounded bg-amber-200/80 px-1.5 py-0.2 text-[9px] font-bold text-amber-900">
                      {isGoldSilverJewellery ? 'Dynamic Daily Rate' : 'Zero Margin Roll'}
                    </span>
                  </div>
                  <p className="mt-1 text-stone-600 text-[11px] leading-relaxed">
                    {isGoldSilverJewellery ? (
                      <>
                        Selling price is <strong>omitted from barcode</strong> because this product is calculated dynamically using today's gold/silver market rate at billing. Purity &amp; weight are printed on the label.
                      </>
                    ) : (
                      <>
                        Labels automatically align in the center of each physical sticker. Rate is printed on the <strong className="text-stone-900">left</strong> and price code on the <strong className="text-stone-900">right</strong> with edge-to-edge optical contrast.
                      </>
                    )}
                  </p>
                </div>
              </div>
            </div>

            {/* Label Size Selection */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-stone-800">
                  Sticker Dimensions / Roll Format <span className="text-rose-500">*</span>
                </label>
                <span className="text-[10px] text-stone-500 font-mono">
                  {effectiveWidthMm}mm × {effectiveHeightMm}mm
                </span>
              </div>
              <div className="grid grid-cols-1 gap-2">
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
                            name="barcode-print-size"
                            id={`size-radio-${opt.id}`}
                            checked={isSelected}
                            onChange={() => setSelectedSize(opt.id)}
                            className="h-3.5 w-3.5 text-amber-600 border-cream-300 focus:ring-amber-500"
                          />
                          <label
                            htmlFor={`size-radio-${opt.id}`}
                            className="text-xs font-bold text-stone-900 cursor-pointer select-none"
                          >
                            {opt.title}
                          </label>
                        </div>
                        <span className="rounded bg-cream-100 px-1.5 py-0.5 text-[10px] font-mono text-stone-700 border border-cream-200 font-semibold">
                          {opt.dimensionsMm}
                        </span>
                      </div>
                      <p className="mt-1 pl-5.5 text-[10.5px] text-stone-500 leading-normal">
                        {opt.useCase}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Custom Dimensions Input (if Custom selected) */}
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

            {/* Copies & Content Selection */}
            <div className="rounded-xl border border-cream-200 bg-cream-50/50 p-4 space-y-3.5">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-xs text-stone-800 font-bold">Number of Copies</label>
                  <p className="text-[10px] text-stone-500">Stickers to print in batch</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setCopies(Math.max(1, copies - 1))}
                    className="h-7 w-7 rounded bg-white border border-cream-300 text-stone-700 hover:bg-cream-100 text-xs font-bold flex items-center justify-center shadow-xs"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    min={1}
                    max={2000}
                    value={copies}
                    onChange={(e) => setCopies(Math.max(1, Math.min(2000, parseInt(e.target.value, 10) || 1)))}
                    className="h-7 w-14 rounded border border-cream-300 bg-white text-center text-xs font-bold text-stone-900 focus:border-amber-600 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setCopies(Math.min(2000, copies + 1))}
                    className="h-7 w-7 rounded bg-white border border-cream-300 text-stone-700 hover:bg-cream-100 text-xs font-bold flex items-center justify-center shadow-xs"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Quick Copies Pills */}
              <div className="flex items-center gap-1.5 pt-1">
                <span className="text-[10px] text-stone-500 font-medium">Presets:</span>
                {[1, 5, 10, 25, 50, 100].map((qty) => (
                  <button
                    key={qty}
                    type="button"
                    onClick={() => setCopies(qty)}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold border transition ${
                      copies === qty
                        ? 'bg-amber-600 text-white border-amber-600'
                        : 'bg-white text-stone-700 border-cream-300 hover:bg-cream-100'
                    }`}
                  >
                    {qty}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Right Live Preview Panel */}
          <div className="w-full md:w-1/2 flex flex-col justify-between p-6 bg-cream-50/40">
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-stone-600">
                  Physical Sticker Live Preview
                </h3>
                <span className="rounded-full border border-amber-300/80 bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800">
                  {effectiveWidthMm} × {effectiveHeightMm} mm
                </span>
              </div>

              {/* Tag Preview Area */}
              <div className="flex flex-col items-center justify-center p-6 rounded-2xl border border-cream-200 bg-cream-100/70 min-h-[360px]">
                {selectedSize === 'jewellery_100x13' ? (
                  /* 100mm x 13mm Jewellery Tag Preview */
                  <div className="w-full max-w-md flex flex-col items-center space-y-3">
                    <div className="w-full flex justify-between text-[10px] text-stone-500 font-semibold px-2">
                      <span>◄ Printable Zone (55mm × 13mm) ►</span>
                      <span>◄ Non-Gum Tail (45mm) ►</span>
                    </div>

                    <div className="w-full flex items-center bg-transparent drop-shadow-md">
                      <div className="w-[58%] h-[68px] bg-white rounded-l-md border-2 border-stone-800 flex items-stretch overflow-hidden relative">
                        {/* Left Flap: 27.5mm */}
                        <div className="w-1/2 p-1.5 flex flex-col justify-between text-left overflow-hidden border-r border-dashed border-stone-300">
                          {showProductName && (
                            <div className="font-bold text-stone-900 text-[10px] leading-tight truncate" title={product.name}>
                              {product.name}
                            </div>
                          )}
                          {showPurityWeight && purityWeightDisplay && (
                            <div className="font-semibold text-amber-900 text-[9px] leading-tight">
                              {purityWeightDisplay}
                            </div>
                          )}
                          {!isGoldSilverJewellery && showPrice && priceDisplay && (
                            <div className="font-bold font-mono text-stone-900 text-[10px] leading-tight">
                              {priceDisplay}
                            </div>
                          )}
                        </div>

                        {/* Right Flap: 27.5mm */}
                        <div className="w-1/2 p-1 flex flex-col items-center justify-center text-center overflow-hidden">
                          <BarcodeGraphic
                            barcode={product.barcode}
                            size="jewellery_100x13"
                            height={16}
                            width={0.8}
                            displayValue={false}
                          />
                          <div className="w-full flex items-center justify-between font-mono text-[8.5px] font-bold text-stone-800 tracking-wider mt-0.5 px-0.5">
                            <span className="text-[8px] font-bold text-stone-900">
                              {isGoldSilverJewellery
                                ? (showPurityWeight && weightText ? weightText : '')
                                : (showPrice && priceDisplay ? priceDisplay : '')}
                            </span>
                            <span className="text-[8px] font-mono ml-auto">
                              {showPurchaseCode && purchaseCode ? purchaseCode : product.barcode}
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
                    {/* Thermal Sticker Roll Representation */}
                    <div
                      style={{
                        width: `${Math.min(320, activeOption.previewWidthPx)}px`,
                        height: `${Math.min(220, activeOption.previewHeightPx)}px`,
                        transform: horizontalOffsetMm ? `translateX(${horizontalOffsetMm * 3}px)` : undefined,
                      }}
                      className="bg-white text-black rounded-lg shadow-xl p-2.5 border border-stone-300 flex flex-col justify-between items-center transition-all duration-200 relative select-none"
                    >
                      {/* Top: Product Name */}
                      <div className="w-full text-center overflow-hidden">
                        {showProductName && (
                          <div className="font-bold text-stone-900 leading-tight text-xs truncate">
                            {product.name}
                          </div>
                        )}
                        {showCategory && (
                          <div className="text-stone-500 text-[9px] leading-tight truncate">
                            {product.categoryName}
                          </div>
                        )}
                      </div>

                      {/* Middle: Scannable Barcode */}
                      <div className="w-full flex items-center justify-center my-auto py-1">
                        <BarcodeGraphic
                          barcode={product.barcode}
                          size={selectedSize}
                          displayValue={showBarcodeValue}
                        />
                      </div>

                      {/* Bottom Row: Info on LEFT, Code on RIGHT */}
                      <div className="w-full flex items-center justify-between pt-1 border-t border-stone-800 text-xs">
                        {/* Left Info: Purity/Weight for Gold/Silver Jewellery, or Price for standard items */}
                        <div className="font-bold text-stone-900 text-left truncate pr-1">
                          {isGoldSilverJewellery
                            ? (showPurityWeight && purityWeightDisplay ? purityWeightDisplay : '')
                            : (showPrice && priceDisplay ? priceDisplay : '')}
                        </div>

                        {/* Code on Right */}
                        <div className="font-mono font-bold text-stone-900 text-right tracking-wider truncate pl-1">
                          {showPurchaseCode && purchaseCode ? purchaseCode : (showBarcodeValue ? '' : product.barcode)}
                        </div>
                      </div>
                    </div>

                    <div className="mt-2 text-[10px] text-stone-500 font-mono flex items-center gap-3">
                      <span>{isGoldSilverJewellery ? 'Purity & Weight' : 'Rate'} on <strong>Left</strong></span>
                      <span>•</span>
                      <span>Code on <strong>Right</strong></span>
                      <span>•</span>
                      <span>Centered on <strong>{effectiveWidthMm}×{effectiveHeightMm}mm</strong></span>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-3 text-center text-[11px] text-stone-500">
                Generated with standard Code 128 format. Optical scanner tested for 1D/2D POS handheld laser readers.
              </div>
            </div>

            {/* Print Action Buttons */}
            <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-cream-200 mt-4">
              <button
                type="button"
                onClick={onClose}
                disabled={isPrinting}
                className="rounded-lg border border-cream-300 bg-white px-4 py-2 text-xs font-semibold text-stone-700 hover:bg-cream-100 transition disabled:opacity-50 shadow-xs"
              >
                Cancel
              </button>

              {/* Primary Batch Print */}
              <button
                id="btn-confirm-print-barcode"
                type="button"
                onClick={() => executePrint()}
                disabled={isPrinting}
                className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-amber-500 transition disabled:opacity-50"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                {isPrinting ? 'Opening Print Dialog...' : `Print ${copies} ${copies > 1 ? 'Labels' : 'Label'} (${effectiveWidthMm}×{effectiveHeightMm}mm)`}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Render Portal into document.body during printing for complete DOM isolation */}
      {createPortal(
        <div
          id="printable-barcode-slip"
          style={{
            margin: 0,
            padding: 0,
            width: '100%',
            backgroundColor: '#ffffff',
          }}
        >
          {/* Dynamic Print Stylesheet with Exact Sticker Dimensions and 0mm Margin */}
          <style>
            {`
              @media print {
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

                /* Tailwind font-size utilities */
                .text-\\\\[5\\\\.5pt\\\\] { font-size: 5.5pt !important; }
                .text-\\\\[6pt\\\\] { font-size: 6pt !important; }
                .text-\\\\[7pt\\\\] { font-size: 7pt !important; }
                .text-\\\\[8pt\\\\] { font-size: 8pt !important; }
                .text-\\\\[8\\\\.5px\\\\] { font-size: 8.5px !important; }
                .text-\\\\[8px\\\\] { font-size: 8px !important; }
                .text-\\\\[9px\\\\] { font-size: 9px !important; }
                .text-\\\\[10px\\\\] { font-size: 10px !important; }

                /* Spacing Utilities */
                .ml-auto { margin-left: auto !important; }
                .mr-auto { margin-right: auto !important; }
                .mx-auto { margin-left: auto !important; margin-right: auto !important; }
                .my-auto { margin-top: auto !important; margin-bottom: auto !important; }
                .mx-0\\\\.5 { margin-left: 0.5mm !important; margin-right: 0.5mm !important; }
                .px-0\\\\.5 { padding-left: 0.5mm !important; padding-right: 0.5mm !important; }
                .py-1 { padding-top: 1mm !important; padding-bottom: 1mm !important; }
                .mt-0\\\\.5 { margin-top: 0.5mm !important; }
                .pt-1 { padding-top: 1mm !important; }
                .pl-1 { padding-left: 1mm !important; }
                .pr-1 { padding-right: 1mm !important; }

                /* Border Utilities */
                .border-r { border-right-width: 1px !important; }
                .border-t { border-top-width: 1px !important; }
                .border-dotted { border-style: dotted !important; }
                .border-black { border-color: #000000 !important; }

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
              }
            `}
          </style>

          {Array.from({ length: copiesToPrint }).map((_, copyIndex) => (
            selectedSize === 'jewellery_100x13' ? (
              /* BAR-CODING TECH® 100mm x 13mm Roll Tag (55mm Printable Zone on Left + 45mm Non-Gum Tail on Right) */
              <div
                key={copyIndex}
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
                {/* Printable Zone: Exactly 55mm × 13mm on the left */}
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
                        title={product.name}
                      >
                        {product.name}
                      </div>
                    )}
                    {showPurityWeight && purityWeightDisplay && (
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
                        {purityWeightDisplay}
                      </div>
                    )}
                    {!isGoldSilverJewellery && showPrice && priceDisplay && (
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
                        {priceDisplay}
                      </div>
                    )}
                  </div>

                  {/* Fold Line: Centered between 26.5mm flaps */}
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
                        barcode={product.barcode}
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
                        {isGoldSilverJewellery
                          ? (showPurityWeight && weightText ? weightText : '')
                          : (showPrice && priceDisplay ? priceDisplay : '')}
                      </span>
                      <span style={{ textAlign: 'right', marginLeft: 'auto' }}>
                        {showPurchaseCode && purchaseCode ? purchaseCode : product.barcode}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Non-Gum Tail Loop Area: Exactly 45mm × 13mm on the right (blank) */}
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
                key={copyIndex}
                className="barcode-label-page barcode-label-standard"
              >
                {/* 1. Top Section: Centered Product Name & Category */}
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
                      {product.name}
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
                      {product.categoryName}
                    </div>
                  )}
                </div>

                {/* 2. Middle Section: Scannable Barcode with Optical Safe Zones */}
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
                    barcode={product.barcode}
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
                  {/* Left: Purity & Weight for Gold/Silver Jewellery, or Rate for regular items */}
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
                    {isGoldSilverJewellery
                      ? (showPurityWeight && purityWeightDisplay ? purityWeightDisplay : '')
                      : (showPrice && priceDisplay ? priceDisplay : '')}
                  </div>

                  {/* Code on Right */}
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
                    {showPurchaseCode && purchaseCode ? purchaseCode : (showBarcodeValue ? '' : product.barcode)}
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
