import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { AuthSessionPayload, ProductDto, PrinterInfo } from '../../shared/types/ipc';
import { BarcodeGraphic, BarcodePrintSize } from './BarcodeGraphic';
import { generateActualPurchasePriceCode } from '../../shared/utils/purchaseCode';
import { useToast } from '../context/ToastContext';
import { ipcClient } from '../services/ipcClient';

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
  defaultBarcodeHeight: number;
  defaultBarcodeWidth: number;
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
    useCase: 'Most common thermal barcode sticker roll for retail POS & price labeling',
    previewWidthPx: 260,
    previewHeightPx: 130,
    defaultBarcodeHeight: 24,
    defaultBarcodeWidth: 1.0,
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
    defaultBarcodeHeight: 32,
    defaultBarcodeWidth: 1.15,
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
    defaultBarcodeHeight: 28,
    defaultBarcodeWidth: 1.05,
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
    defaultBarcodeHeight: 40,
    defaultBarcodeWidth: 1.25,
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
    defaultBarcodeHeight: 20,
    defaultBarcodeWidth: 0.85,
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
    defaultBarcodeHeight: 42,
    defaultBarcodeWidth: 1.3,
  },
  {
    id: 'jewellery_85x15',
    title: '85 × 15 mm (Jewellery Rat-Tail Tag)',
    widthMm: 85,
    heightMm: 15,
    dimensionsMm: '85 × 15 mm (Print: 55 × 15 mm)',
    dimensionsInches: '3.35" × 0.59"',
    useCase: 'Jewellery price tag with 55mm printable head on left and 30mm tail loop on right',
    previewWidthPx: 420,
    previewHeightPx: 80,
    defaultBarcodeHeight: 18,
    defaultBarcodeWidth: 0.8,
    isJewellery: true,
  },
  {
    id: 'jewellery_100x13',
    title: '100 × 13 mm (BAR-CODING TECH® Tag)',
    widthMm: 100,
    heightMm: 13,
    dimensionsMm: '100 × 13 mm (Print: 55 × 13 mm)',
    dimensionsInches: '3.94" × 0.51"',
    useCase: 'Polyester price stickers with 55mm printable head on left and 45mm non-gum tail loop on right',
    previewWidthPx: 440,
    previewHeightPx: 80,
    defaultBarcodeHeight: 16,
    defaultBarcodeWidth: 0.8,
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
    defaultBarcodeHeight: 24,
    defaultBarcodeWidth: 1.0,
  },
];

const PREFERENCE_KEY = 'pos_barcode_label_preferences_v3';

export const BarcodePrintModal: React.FC<BarcodePrintModalProps> = ({
  product,
  session: _session,
  isOpen,
  onClose,
  initialCopies,
}) => {
  const { showError, showSuccess } = useToast();

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

  // 1. Printer selection state
  const [printers, setPrinters] = useState<PrinterInfo[]>([]);
  const [loadingPrinters, setLoadingPrinters] = useState<boolean>(false);
  const [selectedPrinter, setSelectedPrinter] = useState<string>(() => savedPrefs?.selectedPrinter || '');
  const [directPrint, setDirectPrint] = useState<boolean>(() =>
    typeof savedPrefs?.directPrint === 'boolean' ? savedPrefs.directPrint : true
  );

  // 2. Dimensions & Size state
  const [selectedSize, setSelectedSize] = useState<BarcodePrintSize>(() => {
    if (savedPrefs?.selectedSize) {
      if (savedPrefs.selectedSize === 'small') return 'small_38x25';
      if (savedPrefs.selectedSize === 'medium') return 'retail_50x35';
      if (savedPrefs.selectedSize === 'large' || savedPrefs.selectedSize === 'large_75x50') return 'large_60x40';
      return savedPrefs.selectedSize;
    }
    return isGoldSilverJewellery ? 'jewellery_85x15' : 'std_50x25';
  });

  const [customWidthMm, setCustomWidthMm] = useState<number>(savedPrefs?.customWidthMm || 50);
  const [customHeightMm, setCustomHeightMm] = useState<number>(savedPrefs?.customHeightMm || 25);
  const [copies, setCopies] = useState<number>(() => {
    return initialCopies && initialCopies > 0 ? Math.round(initialCopies) : (savedPrefs?.copies || 1);
  });

  // 3. Barcode appearance state
  const [barcodeHeight, setBarcodeHeight] = useState<number>(() => savedPrefs?.barcodeHeight || 24);
  const [barcodeWidthScale, setBarcodeWidthScale] = useState<number>(() => savedPrefs?.barcodeWidthScale || 1.0);

  // 4. Typography & Spacing state
  const [fontSizeScale, setFontSizeScale] = useState<number>(() => savedPrefs?.fontSizeScale || 100);
  const [horizontalPaddingMm, setHorizontalPaddingMm] = useState<number>(() =>
    typeof savedPrefs?.horizontalPaddingMm === 'number' ? savedPrefs.horizontalPaddingMm : 1.5
  );
  const [verticalPaddingMm, setVerticalPaddingMm] = useState<number>(() =>
    typeof savedPrefs?.verticalPaddingMm === 'number' ? savedPrefs.verticalPaddingMm : 1.0
  );
  const [horizontalOffsetMm, setHorizontalOffsetMm] = useState<number>(() =>
    typeof savedPrefs?.horizontalOffsetMm === 'number' ? savedPrefs.horizontalOffsetMm : 0
  );

  // 5. Visibility toggles
  const [showProductName, setShowProductName] = useState<boolean>(() =>
    typeof savedPrefs?.showProductName === 'boolean' ? savedPrefs.showProductName : true
  );
  const [showCategory, setShowCategory] = useState<boolean>(() =>
    typeof savedPrefs?.showCategory === 'boolean' ? savedPrefs.showCategory : false
  );
  const [showPurityWeight, setShowPurityWeight] = useState<boolean>(() =>
    typeof savedPrefs?.showPurityWeight === 'boolean' ? savedPrefs.showPurityWeight : true
  );
  const [showPrice, setShowPrice] = useState<boolean>(() =>
    typeof savedPrefs?.showPrice === 'boolean' ? savedPrefs.showPrice : true
  );
  const [showPurchaseCode, setShowPurchaseCode] = useState<boolean>(() =>
    typeof savedPrefs?.showPurchaseCode === 'boolean' ? savedPrefs.showPurchaseCode : true
  );
  const [showBarcodeValue, setShowBarcodeValue] = useState<boolean>(() =>
    typeof savedPrefs?.showBarcodeValue === 'boolean' ? savedPrefs.showBarcodeValue : true
  );

  // 6. Preview controls
  const [previewMode, setPreviewMode] = useState<'single' | 'roll'>('single');
  const [previewZoom, setPreviewZoom] = useState<number>(100);
  const [isPrinting, setIsPrinting] = useState<boolean>(false);

  // Fetch installed system printers on open
  const fetchPrinters = async () => {
    setLoadingPrinters(true);
    try {
      const res = await ipcClient.getPrinters();
      if (res.success && res.data) {
        setPrinters(res.data);
        setSelectedPrinter((current) => {
          if (current && res.data.some((p) => p.name === current)) return current;
          const def = res.data.find((p) => p.isDefault);
          return def ? def.name : res.data[0]?.name || '';
        });
      }
    } catch (err) {
      console.warn('Failed to load system printers:', err);
    } finally {
      setLoadingPrinters(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      void fetchPrinters();
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && initialCopies && initialCopies > 0) {
      setCopies(Math.round(initialCopies));
    }
  }, [isOpen, initialCopies, product?.id]);

  // Handle preset size changes and adapt default barcode dimensions
  const handleSelectSize = (sizeId: BarcodePrintSize) => {
    setSelectedSize(sizeId);
    const opt = SIZE_OPTIONS.find((s) => s.id === sizeId);
    if (!opt) return;

    setBarcodeHeight(opt.defaultBarcodeHeight);
    setBarcodeWidthScale(opt.defaultBarcodeWidth);

    if (opt.isJewellery) {
      setVerticalPaddingMm(0);
      setHorizontalPaddingMm(0);
    } else if (sizeId === 'small_38x25') {
      setVerticalPaddingMm(0.8);
      setHorizontalPaddingMm(1.0);
    } else if (sizeId === 'std_50x25') {
      setVerticalPaddingMm(1.0);
      setHorizontalPaddingMm(1.5);
    } else {
      setVerticalPaddingMm(1.5);
      setHorizontalPaddingMm(2.0);
    }
  };

  // Persist preference updates to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(
        PREFERENCE_KEY,
        JSON.stringify({
          selectedPrinter,
          directPrint,
          selectedSize,
          customWidthMm,
          customHeightMm,
          copies,
          barcodeHeight,
          barcodeWidthScale,
          fontSizeScale,
          horizontalPaddingMm,
          verticalPaddingMm,
          horizontalOffsetMm,
          showProductName,
          showCategory,
          showPurityWeight,
          showPrice,
          showPurchaseCode,
          showBarcodeValue,
        })
      );
    } catch {
      // Ignore localStorage write failures
    }
  }, [
    selectedPrinter,
    directPrint,
    selectedSize,
    customWidthMm,
    customHeightMm,
    copies,
    barcodeHeight,
    barcodeWidthScale,
    fontSizeScale,
    horizontalPaddingMm,
    verticalPaddingMm,
    horizontalOffsetMm,
    showProductName,
    showCategory,
    showPurityWeight,
    showPrice,
    showPurchaseCode,
    showBarcodeValue,
  ]);

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

  // Extract selling making charges per gram (for jewellery down left corner)
  const makingChargeFv = product.fieldValues?.find((fv) => {
    const key = fv.categoryField?.fieldKey?.toLowerCase() || '';
    const name = fv.categoryField?.name?.toLowerCase() || '';
    return key === 'makingchargespergram' || key === 'makingchargepergram' || name.includes('making charge');
  });
  const makingChargePerGram =
    makingChargeFv?.valueNumber !== null && makingChargeFv?.valueNumber !== undefined && Number(makingChargeFv.valueNumber) > 0
      ? Number(makingChargeFv.valueNumber)
      : product.calculatedJewelleryPrice?.makingChargePerGram && product.calculatedJewelleryPrice.makingChargePerGram > 0
      ? product.calculatedJewelleryPrice.makingChargePerGram
      : null;
  const makingChargeDisplay = makingChargePerGram !== null ? `MC: ₹${makingChargePerGram}/g` : null;

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
    selectedSize === 'custom' ? Math.max(15, customWidthMm || 50) : activeOption.widthMm;
  const effectiveHeightMm =
    selectedSize === 'custom' ? Math.max(10, customHeightMm || 25) : activeOption.heightMm;

  // Physical label printing execution via clean offscreen window
  const executePrint = async () => {
    if (isPrinting) return;
    setIsPrinting(true);
    document.body.classList.add('printing-barcode');

    setTimeout(async () => {
      try {
        const slip = document.getElementById('printable-barcode-slip');

        // Ensure JsBarcode SVG effects have fired and populated all SVGs with rect/text elements
        let attempts = 0;
        while (attempts < 12) {
          const svgs = slip?.querySelectorAll('svg');
          const allRendered =
            svgs && svgs.length > 0 && Array.from(svgs).every((s) => s.children.length > 0);
          if (allRendered) break;
          await new Promise((resolve) => setTimeout(resolve, 50));
          attempts++;
        }

        const rawHtml = slip ? slip.innerHTML : '';
        const slipHtml = rawHtml.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '').trim();

        const fullHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Barcode Labels - ${product.name}</title>
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
    .flex { display: flex !important; }
    .flex-col { flex-direction: column !important; }
    .flex-row { flex-direction: row !important; }
    .items-center { align-items: center !important; }
    .items-stretch { align-items: stretch !important; }
    .justify-between { justify-content: space-between !important; }
    .justify-center { justify-content: center !important; }
    .justify-start { justify-content: flex-start !important; }
    .w-full { width: 100% !important; }
    .h-full { height: 100% !important; }
    .truncate { overflow: hidden !important; text-overflow: ellipsis !important; white-space: nowrap !important; }
    .font-mono { font-family: monospace !important; }
    .font-bold { font-weight: bold !important; }
    .text-black { color: #000000 !important; }

    svg {
      width: 100% !important;
      max-width: 100% !important;
      max-height: 100% !important;
      height: auto !important;
      display: block !important;
      margin: 0 auto !important;
    }

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

    .barcode-label-page.barcode-label-jewellery-85x15 {
      width: 85mm !important;
      height: 15mm !important;
      max-height: 15mm !important;
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

        const printRes = await ipcClient.printBarcode({
          html: fullHtml,
          widthMm: effectiveWidthMm,
          heightMm: effectiveHeightMm,
          deviceName: selectedPrinter || undefined,
          copies: 1, // Full count is generated as distinct pages in the continuous HTML stream
          silent: directPrint && Boolean(selectedPrinter),
        });

        if (!printRes.success) {
          showError(printRes.error || 'Failed to print barcode label.');
        } else if (printRes.data?.printed === false) {
          // Dialog cancelled
        } else {
          showSuccess(
            selectedPrinter
              ? `Printed ${copies} ${copies > 1 ? 'labels' : 'label'} on "${selectedPrinter}"`
              : `Barcode ${copies > 1 ? 'labels' : 'label'} sent to printer.`
          );
        }
      } catch (err: any) {
        showError(err.message || 'Error occurred while printing.');
      } finally {
        setTimeout(() => {
          document.body.classList.remove('printing-barcode');
          setIsPrinting(false);
        }, 600);
      }
    }, 250);
  };

  const copiesToPrint = copies;

  // Single sticker visual preview dimensions
  const previewCanvasWidthPx = Math.round(
    Math.min(480, Math.max(220, effectiveWidthMm * 4.6)) * (previewZoom / 100)
  );
  const previewCanvasHeightPx = Math.round(
    Math.min(300, Math.max(90, effectiveHeightMm * 4.6)) * (previewZoom / 100)
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 p-4 backdrop-blur-sm select-text print:hidden">
      <div className="flex h-[94vh] max-h-[890px] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-cream-300 bg-white shadow-2xl">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-cream-200 px-6 py-3.5 bg-cream-50/80">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-base font-bold text-stone-900">
                Barcode Label Studio &amp; Printing
              </h2>
              <span className="rounded-full border border-amber-300/80 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                {product.name}
              </span>
              <span className="rounded border border-cream-300 bg-white px-2 py-0.5 font-mono text-xs text-stone-700 shadow-xs">
                {product.barcode}
              </span>
              {isGoldSilverJewellery && (
                <span className="rounded-full border border-amber-400 bg-amber-100/90 px-2 py-0.5 text-[10px] font-bold text-amber-900 shadow-2xs">
                  Gold/Silver (Dynamic Rate)
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-stone-500">
              Live design preview &amp; native Electron hardware printer output with zero margins.
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
          <div className="w-full md:w-[48%] overflow-y-auto p-5 space-y-4 border-r border-cream-200">
            {/* 1. Printer & Copies Configuration Card */}
            <div className="rounded-xl border border-amber-400/80 bg-amber-50/60 p-3.5 space-y-3 shadow-2xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="flex h-2.5 w-2.5 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                  </span>
                  <label className="text-xs font-bold text-amber-950 uppercase tracking-wide">
                    Destination Printer (Windows)
                  </label>
                </div>
                <button
                  type="button"
                  onClick={fetchPrinters}
                  disabled={loadingPrinters}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800 hover:text-amber-950 transition"
                  title="Refresh installed printers"
                >
                  <svg
                    className={`h-3.5 w-3.5 ${loadingPrinters ? 'animate-spin' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                  <span>{loadingPrinters ? 'Detecting...' : 'Refresh'}</span>
                </button>
              </div>

              {/* Printer Dropdown */}
              <div className="relative">
                <select
                  value={selectedPrinter}
                  onChange={(e) => setSelectedPrinter(e.target.value)}
                  className="w-full rounded-lg border border-amber-300 bg-white py-2 pl-3 pr-8 text-xs font-semibold text-stone-900 shadow-2xs focus:border-amber-600 focus:outline-none focus:ring-1 focus:ring-amber-500"
                >
                  {printers.length === 0 ? (
                    <option value="">Default Windows Printer (System Dialog)</option>
                  ) : (
                    printers.map((p) => (
                      <option key={p.name} value={p.name}>
                        {p.displayName || p.name} {p.isDefault ? '★ [Default]' : ''}
                      </option>
                    ))
                  )}
                  <option value="">[Prompt Windows System Print Dialog]</option>
                </select>
              </div>

              {/* Direct Print Toggle */}
              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={directPrint}
                    onChange={(e) => setDirectPrint(e.target.checked)}
                    className="h-3.5 w-3.5 rounded text-amber-600 border-amber-300 focus:ring-amber-500"
                  />
                  <span className="text-[11px] font-medium text-amber-950">
                    Direct 1-Click Print (Thermal Roll Auto Spooling)
                  </span>
                </label>
                <span className="text-[10px] text-amber-800 font-mono">
                  {directPrint ? 'Direct' : 'Dialog'}
                </span>
              </div>

              {/* Copies Stepper */}
              <div className="flex items-center justify-between border-t border-amber-200/80 pt-2.5">
                <div>
                  <span className="text-xs font-bold text-amber-950">Print Copies</span>
                  <p className="text-[10px] text-stone-600">Total stickers to print</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setCopies(Math.max(1, copies - 1))}
                    className="h-7 w-7 rounded bg-white border border-amber-300 text-stone-800 hover:bg-amber-100/60 text-xs font-bold flex items-center justify-center shadow-2xs"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    min={1}
                    max={2000}
                    value={copies}
                    onChange={(e) => setCopies(Math.max(1, Math.min(2000, parseInt(e.target.value, 10) || 1)))}
                    className="h-7 w-14 rounded border border-amber-300 bg-white text-center text-xs font-bold text-stone-900 focus:border-amber-600 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setCopies(Math.min(2000, copies + 1))}
                    className="h-7 w-7 rounded bg-white border border-amber-300 text-stone-800 hover:bg-amber-100/60 text-xs font-bold flex items-center justify-center shadow-2xs"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Quick Copies Pills */}
              <div className="flex items-center gap-1">
                {[1, 2, 5, 10, 25, 50].map((qty) => (
                  <button
                    key={qty}
                    type="button"
                    onClick={() => setCopies(qty)}
                    className={`flex-1 py-0.5 rounded text-[10px] font-bold border transition ${
                      copies === qty
                        ? 'bg-amber-700 text-white border-amber-700 shadow-2xs'
                        : 'bg-white text-stone-700 border-amber-200 hover:bg-amber-100/50'
                    }`}
                  >
                    {qty}
                  </button>
                ))}
              </div>
            </div>

            {/* 2. Sticker Dimensions / Roll Format */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-stone-800">
                  Label Format &amp; Dimensions
                </label>
                <span className="text-[11px] font-mono font-bold text-amber-800">
                  {effectiveWidthMm}mm × {effectiveHeightMm}mm
                </span>
              </div>
              <div className="grid grid-cols-1 gap-1.5 max-h-[190px] overflow-y-auto pr-1">
                {SIZE_OPTIONS.map((opt) => {
                  const isSelected = selectedSize === opt.id;
                  return (
                    <div
                      key={opt.id}
                      onClick={() => handleSelectSize(opt.id)}
                      className={`cursor-pointer rounded-lg border px-3 py-2 transition ${
                        isSelected
                          ? 'border-amber-500 bg-amber-50/70 ring-1 ring-amber-500/40 shadow-xs'
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
                            onChange={() => handleSelectSize(opt.id)}
                            className="h-3 w-3 text-amber-600 border-cream-300 focus:ring-amber-500"
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
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Custom Dimensions Input (if Custom selected) */}
            {selectedSize === 'custom' && (
              <div className="rounded-xl border border-amber-300 bg-amber-50/40 p-3 space-y-2">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-stone-700 mb-1">
                      Width (mm)
                    </label>
                    <input
                      type="number"
                      min={15}
                      max={150}
                      value={customWidthMm}
                      onChange={(e) => setCustomWidthMm(Math.max(15, Math.min(150, parseInt(e.target.value, 10) || 50)))}
                      className="w-full h-8 rounded-lg border border-cream-300 bg-white px-2.5 text-xs font-bold text-stone-900 focus:border-amber-600 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-stone-700 mb-1">
                      Height (mm)
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

            {/* 3. Barcode Size & Appearance */}
            <div className="rounded-xl border border-cream-200 bg-white p-3 space-y-2.5 shadow-2xs">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-stone-800">
                  Barcode Bar Dimensions
                </label>
                <span className="text-[11px] font-mono text-stone-600 font-bold">
                  H: {barcodeHeight}px • W: {barcodeWidthScale}x
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex justify-between text-[10px] text-stone-500 mb-1">
                    <span>Barcode Height</span>
                    <span>{barcodeHeight}px</span>
                  </div>
                  <input
                    type="range"
                    min={12}
                    max={50}
                    step={2}
                    value={barcodeHeight}
                    onChange={(e) => setBarcodeHeight(parseInt(e.target.value, 10))}
                    className="w-full accent-amber-600 cursor-pointer"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-[10px] text-stone-500 mb-1">
                    <span>Bar Density / Width</span>
                    <span>{barcodeWidthScale}x</span>
                  </div>
                  <div className="flex gap-1">
                    {[0.8, 1.0, 1.2, 1.4].map((scale) => (
                      <button
                        key={scale}
                        type="button"
                        onClick={() => setBarcodeWidthScale(scale)}
                        className={`flex-1 py-1 rounded text-[10px] font-bold border transition ${
                          barcodeWidthScale === scale
                            ? 'bg-amber-600 text-white border-amber-600'
                            : 'bg-cream-50 text-stone-700 border-cream-200 hover:bg-cream-100'
                        }`}
                      >
                        {scale}x
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* 4. Fine-Tuning: Font Size & Spacing Margins */}
            <div className="rounded-xl border border-cream-200 bg-white p-3 space-y-2.5 shadow-2xs">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-stone-800">
                  Typography &amp; Spacing
                </label>
                <span className="text-[11px] font-mono text-stone-600">
                  Font: {fontSizeScale}%
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-stone-500 mb-1">Font Size Scale</label>
                  <div className="flex gap-1">
                    {[80, 100, 120, 135].map((scale) => (
                      <button
                        key={scale}
                        type="button"
                        onClick={() => setFontSizeScale(scale)}
                        className={`flex-1 py-1 rounded text-[10px] font-bold border transition ${
                          fontSizeScale === scale
                            ? 'bg-amber-600 text-white border-amber-600'
                            : 'bg-cream-50 text-stone-700 border-cream-200 hover:bg-cream-100'
                        }`}
                      >
                        {scale}%
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-[10px] text-stone-500 mb-1">
                    <span>Roll Offset (Calibrate)</span>
                    <span>{horizontalOffsetMm > 0 ? `+${horizontalOffsetMm}` : horizontalOffsetMm} mm</span>
                  </div>
                  <input
                    type="range"
                    min={-4}
                    max={4}
                    step={0.5}
                    value={horizontalOffsetMm}
                    onChange={(e) => setHorizontalOffsetMm(parseFloat(e.target.value))}
                    className="w-full accent-amber-600 cursor-pointer"
                  />
                </div>
              </div>

              {/* Margins/Padding */}
              <div className="grid grid-cols-2 gap-3 pt-1 border-t border-cream-100">
                <div>
                  <div className="flex justify-between text-[10px] text-stone-500 mb-1">
                    <span>Horizontal Padding</span>
                    <span>{horizontalPaddingMm} mm</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={4}
                    step={0.5}
                    value={horizontalPaddingMm}
                    onChange={(e) => setHorizontalPaddingMm(parseFloat(e.target.value))}
                    className="w-full accent-amber-600 cursor-pointer"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-[10px] text-stone-500 mb-1">
                    <span>Vertical Padding</span>
                    <span>{verticalPaddingMm} mm</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={3}
                    step={0.5}
                    value={verticalPaddingMm}
                    onChange={(e) => setVerticalPaddingMm(parseFloat(e.target.value))}
                    className="w-full accent-amber-600 cursor-pointer"
                  />
                </div>
              </div>
            </div>

            {/* 5. Content Visibility Toggles */}
            <div className="rounded-xl border border-cream-200 bg-white p-3 space-y-2 shadow-2xs">
              <label className="text-xs font-bold text-stone-800 block">
                Content Visibility Toggles
              </label>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={showProductName}
                    onChange={(e) => setShowProductName(e.target.checked)}
                    className="h-3.5 w-3.5 rounded text-amber-600 border-cream-300 focus:ring-amber-500"
                  />
                  <span className="text-stone-800 text-[11px] font-medium">Product Name</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={showPrice}
                    disabled={isGoldSilverJewellery}
                    onChange={(e) => setShowPrice(e.target.checked)}
                    className="h-3.5 w-3.5 rounded text-amber-600 border-cream-300 focus:ring-amber-500 disabled:opacity-50"
                  />
                  <span className="text-stone-800 text-[11px] font-medium">
                    {isGoldSilverJewellery ? 'Price (Dynamic Rate)' : 'Selling Price'}
                  </span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={showBarcodeValue}
                    onChange={(e) => setShowBarcodeValue(e.target.checked)}
                    className="h-3.5 w-3.5 rounded text-amber-600 border-cream-300 focus:ring-amber-500"
                  />
                  <span className="text-stone-800 text-[11px] font-medium">Barcode Text</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={showPurchaseCode}
                    onChange={(e) => setShowPurchaseCode(e.target.checked)}
                    className="h-3.5 w-3.5 rounded text-amber-600 border-cream-300 focus:ring-amber-500"
                  />
                  <span className="text-stone-800 text-[11px] font-medium">Purchase Code</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={showCategory}
                    onChange={(e) => setShowCategory(e.target.checked)}
                    className="h-3.5 w-3.5 rounded text-amber-600 border-cream-300 focus:ring-amber-500"
                  />
                  <span className="text-stone-800 text-[11px] font-medium">Category Name</span>
                </label>

                {isGoldSilverJewellery && (
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={showPurityWeight}
                      onChange={(e) => setShowPurityWeight(e.target.checked)}
                      className="h-3.5 w-3.5 rounded text-amber-600 border-cream-300 focus:ring-amber-500"
                    />
                    <span className="text-stone-800 text-[11px] font-medium">Purity &amp; Weight</span>
                  </label>
                )}
              </div>
            </div>
          </div>

          {/* Right Live Preview Panel */}
          <div className="w-full md:w-[52%] flex flex-col justify-between p-5 bg-stone-100/70 border-l border-cream-200">
            <div>
              {/* Preview Controls Bar */}
              <div className="flex items-center justify-between mb-3 px-1">
                <div className="flex items-center gap-2">
                  <div className="flex rounded-lg border border-cream-300 bg-white p-0.5 shadow-2xs">
                    <button
                      type="button"
                      onClick={() => setPreviewMode('single')}
                      className={`px-2.5 py-1 rounded text-xs font-bold transition ${
                        previewMode === 'single'
                          ? 'bg-amber-600 text-white shadow-2xs'
                          : 'text-stone-600 hover:text-stone-900'
                      }`}
                    >
                      Single Sticker (1:1)
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewMode('roll')}
                      className={`px-2.5 py-1 rounded text-xs font-bold transition ${
                        previewMode === 'roll'
                          ? 'bg-amber-600 text-white shadow-2xs'
                          : 'text-stone-600 hover:text-stone-900'
                      }`}
                    >
                      Roll Strip View
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs font-bold text-amber-900">
                    {effectiveWidthMm} × {effectiveHeightMm} mm
                  </span>
                  <div className="flex items-center gap-1 bg-white border border-cream-300 rounded px-1.5 py-0.5 text-[11px] font-bold text-stone-700 shadow-2xs">
                    <button
                      type="button"
                      onClick={() => setPreviewZoom((z) => Math.max(75, z - 15))}
                      className="hover:text-amber-600"
                    >
                      -
                    </button>
                    <span className="w-8 text-center">{previewZoom}%</span>
                    <button
                      type="button"
                      onClick={() => setPreviewZoom((z) => Math.min(150, z + 15))}
                      className="hover:text-amber-600"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>

              {/* Tag Preview Canvas */}
              <div className="flex flex-col items-center justify-center p-6 rounded-2xl border border-cream-300 bg-gradient-to-b from-stone-200/50 to-stone-300/40 min-h-[380px] max-h-[440px] overflow-auto shadow-inner relative">
                {selectedSize === 'jewellery_85x15' ? (
                  /* 85mm x 15mm Jewellery Rat-Tail Tag Preview */
                  <div className="w-full max-w-lg flex flex-col items-center space-y-3">
                    <div className="w-full flex justify-between text-[10px] text-stone-500 font-semibold px-2">
                      <span>◄ Printable Head (55mm × 15mm) ►</span>
                      <span>◄ Non-Gum Tail (30mm) ►</span>
                    </div>

                    <div className="w-full flex items-center bg-transparent drop-shadow-md">
                      {/* Printable Head: 55mm (Left Flap: 27.5mm + Right Flap: 27.5mm) */}
                      <div className="w-[65%] h-[74px] bg-white rounded-l-md border-2 border-stone-800 flex items-stretch overflow-hidden relative">
                        {/* Left Flap: 27.5mm */}
                        <div className="w-1/2 p-1.5 flex flex-col justify-between text-left overflow-hidden border-r border-dashed border-stone-300">
                          <div>
                            {showProductName && (
                              <div
                                className="font-bold text-stone-900 leading-tight truncate"
                                style={{ fontSize: `${10 * (fontSizeScale / 100)}px` }}
                                title={product.name}
                              >
                                {product.name}
                              </div>
                            )}
                            {showPurityWeight && (
                              <div
                                className="font-semibold text-amber-900 leading-tight mt-0.5 truncate"
                                style={{ fontSize: `${9 * (fontSizeScale / 100)}px` }}
                              >
                                {purityWeightDisplay || (weightText ? `Wt: ${weightText}` : '')}
                              </div>
                            )}
                          </div>

                          <div className="w-full flex items-end justify-between leading-none pt-1 border-t border-stone-200 font-bold">
                            <span
                              className="text-amber-800 font-bold truncate max-w-[55%]"
                              style={{ fontSize: `${8.5 * (fontSizeScale / 100)}px` }}
                            >
                              {isGoldSilverJewellery
                                ? (makingChargeDisplay || (makingChargePerGram ? `MC: ₹${makingChargePerGram}/g` : 'MC: -'))
                                : (showPrice && priceDisplay ? priceDisplay : '')}
                            </span>
                            <span
                              className="font-mono text-stone-900 tracking-wider truncate max-w-[45%] text-right ml-auto"
                              style={{ fontSize: `${8.5 * (fontSizeScale / 100)}px` }}
                            >
                              {showPurchaseCode && purchaseCode ? purchaseCode : ''}
                            </span>
                          </div>
                        </div>

                        {/* Right Flap: 27.5mm */}
                        <div className="w-1/2 p-1 flex flex-col items-center justify-center text-center overflow-hidden">
                          <BarcodeGraphic
                            barcode={product.barcode}
                            size="jewellery_85x15"
                            height={barcodeHeight}
                            width={barcodeWidthScale}
                            displayValue={showBarcodeValue}
                          />
                        </div>

                        <div className="absolute bottom-0.5 left-1/2 -translate-x-1/2 text-[7px] text-stone-400 font-mono select-none">
                          fold
                        </div>
                      </div>

                      {/* Tail Loop: 30mm */}
                      <div className="w-[35%] h-[24px] bg-stone-200/90 border-y-2 border-r-2 border-dashed border-stone-400 rounded-r-md flex items-center justify-center relative overflow-hidden">
                        <span className="text-[8px] font-semibold text-stone-600 tracking-tight whitespace-nowrap px-1">
                          Tail Loop (30mm)
                        </span>
                      </div>
                    </div>
                  </div>
                ) : selectedSize === 'jewellery_100x13' ? (
                  /* 100mm x 13mm Jewellery Rat-Tail Tag Preview */
                  <div className="w-full max-w-md flex flex-col items-center space-y-3">
                    <div className="w-full flex justify-between text-[10px] text-stone-500 font-semibold px-2">
                      <span>◄ Printable Head (55mm × 13mm) ►</span>
                      <span>◄ Non-Gum Tail (45mm) ►</span>
                    </div>

                    <div className="w-full flex items-center bg-transparent drop-shadow-md">
                      <div className="w-[55%] h-[68px] bg-white rounded-l-md border-2 border-stone-800 flex items-stretch overflow-hidden relative">
                        {/* Left Flap: 27.5mm */}
                        <div className="w-1/2 p-1.5 flex flex-col justify-between text-left overflow-hidden border-r border-dashed border-stone-300">
                          <div>
                            {showProductName && (
                              <div
                                className="font-bold text-stone-900 leading-tight truncate"
                                style={{ fontSize: `${9.5 * (fontSizeScale / 100)}px` }}
                                title={product.name}
                              >
                                {product.name}
                              </div>
                            )}
                            {showPurityWeight && (
                              <div
                                className="font-semibold text-amber-900 leading-tight mt-0.5 truncate"
                                style={{ fontSize: `${8.5 * (fontSizeScale / 100)}px` }}
                              >
                                {purityWeightDisplay || (weightText ? `Wt: ${weightText}` : '')}
                              </div>
                            )}
                          </div>

                          <div className="w-full flex items-end justify-between leading-none pt-1 border-t border-stone-200 font-bold">
                            <span
                              className="text-amber-800 font-bold truncate max-w-[55%]"
                              style={{ fontSize: `${8 * (fontSizeScale / 100)}px` }}
                            >
                              {isGoldSilverJewellery
                                ? (makingChargeDisplay || (makingChargePerGram ? `MC: ₹${makingChargePerGram}/g` : 'MC: -'))
                                : (showPrice && priceDisplay ? priceDisplay : '')}
                            </span>
                            <span
                              className="font-mono text-stone-900 tracking-wider truncate max-w-[45%] text-right ml-auto"
                              style={{ fontSize: `${8 * (fontSizeScale / 100)}px` }}
                            >
                              {showPurchaseCode && purchaseCode ? purchaseCode : ''}
                            </span>
                          </div>
                        </div>

                        {/* Right Flap: 27.5mm */}
                        <div className="w-1/2 p-1 flex flex-col items-center justify-center text-center overflow-hidden">
                          <BarcodeGraphic
                            barcode={product.barcode}
                            size="jewellery_100x13"
                            height={barcodeHeight}
                            width={barcodeWidthScale}
                            displayValue={showBarcodeValue}
                          />
                        </div>

                        <div className="absolute bottom-0.5 left-1/2 -translate-x-1/2 text-[7px] text-stone-400 font-mono select-none">
                          fold
                        </div>
                      </div>

                      {/* Tail Loop: 45mm */}
                      <div className="w-[45%] h-[24px] bg-stone-200/90 border-y-2 border-r-2 border-dashed border-stone-400 rounded-r-md flex items-center justify-center relative overflow-hidden">
                        <span className="text-[8px] font-semibold text-stone-600 tracking-tight whitespace-nowrap px-1">
                          Tail Loop (45mm)
                        </span>
                      </div>
                    </div>
                  </div>
                ) : previewMode === 'roll' ? (
                  /* Multi-Sticker Roll Strip Preview */
                  <div className="w-full max-w-xs flex flex-col items-center space-y-2 py-2">
                    <span className="text-[10px] font-mono text-stone-500 uppercase tracking-wider font-semibold">
                      Continuous Roll Paper Strip ({copies} Total)
                    </span>
                    <div className="w-full bg-white rounded-xl shadow-xl border border-stone-300 p-2 flex flex-col divide-y-2 divide-dashed divide-stone-300">
                      {[1, 2, 3].map((itemNum) => (
                        <div
                          key={itemNum}
                          style={{
                            padding: `${verticalPaddingMm * 2.8}px ${horizontalPaddingMm * 2.8}px`,
                            transform: horizontalOffsetMm ? `translateX(${horizontalOffsetMm * 2.8}px)` : undefined,
                          }}
                          className="flex flex-col justify-between items-center py-2 relative"
                        >
                          <span className="absolute top-1 right-1 text-[8px] font-mono text-stone-400">
                            #{itemNum}
                          </span>
                          {showProductName && (
                            <div
                              className="font-bold text-stone-900 text-center truncate w-full"
                              style={{ fontSize: `${(effectiveHeightMm <= 25 ? 9 : 10) * (fontSizeScale / 100)}px` }}
                            >
                              {product.name}
                            </div>
                          )}
                          <div className="my-1 w-full flex justify-center">
                            <BarcodeGraphic
                              barcode={product.barcode}
                              size={selectedSize}
                              height={Math.round(barcodeHeight * 0.75)}
                              width={barcodeWidthScale}
                              displayValue={showBarcodeValue}
                            />
                          </div>
                          <div className="w-full flex items-center justify-between text-xs font-bold pt-0.5 border-t border-stone-300">
                            <span
                              className="text-stone-900 truncate"
                              style={{ fontSize: `${(effectiveHeightMm <= 25 ? 8.5 : 9.5) * (fontSizeScale / 100)}px` }}
                            >
                              {showPrice && priceDisplay ? priceDisplay : ''}
                            </span>
                            <span
                              className="font-mono text-stone-900 truncate ml-auto"
                              style={{ fontSize: `${(effectiveHeightMm <= 25 ? 8.5 : 9.5) * (fontSizeScale / 100)}px` }}
                            >
                              {showPurchaseCode && purchaseCode ? purchaseCode : ''}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  /* Standard 1:1 Thermal Barcode Sticker Canvas */
                  <div className="flex flex-col items-center">
                    <div
                      style={{
                        width: `${previewCanvasWidthPx}px`,
                        height: `${previewCanvasHeightPx}px`,
                        padding: `${verticalPaddingMm * 3.78}px ${horizontalPaddingMm * 3.78}px`,
                        transform: horizontalOffsetMm ? `translateX(${horizontalOffsetMm * 3.78}px)` : undefined,
                      }}
                      className="bg-white text-black rounded-lg shadow-xl border-2 border-stone-800 flex flex-col justify-between items-center transition-all duration-150 relative select-none"
                    >
                      {/* Top: Product Name & Category */}
                      <div className="w-full text-center overflow-hidden">
                        {showProductName && (
                          <div
                            className="font-bold text-stone-900 leading-tight truncate"
                            style={{
                              fontSize: `${(effectiveHeightMm <= 25 ? 10.5 : 12) * (fontSizeScale / 100)}px`,
                            }}
                          >
                            {product.name}
                          </div>
                        )}
                        {showCategory && (
                          <div
                            className="text-stone-500 leading-tight truncate"
                            style={{ fontSize: `${9 * (fontSizeScale / 100)}px` }}
                          >
                            {product.categoryName}
                          </div>
                        )}
                      </div>

                      {/* Middle: Barcode Graphic */}
                      <div className="w-full flex items-center justify-center my-auto py-0.5">
                        <BarcodeGraphic
                          barcode={product.barcode}
                          size={selectedSize}
                          height={barcodeHeight}
                          width={barcodeWidthScale}
                          displayValue={showBarcodeValue}
                        />
                      </div>

                      {/* Bottom Row: Price on Left, Code on Right */}
                      <div className="w-full flex items-center justify-between pt-1 border-t border-stone-800 text-xs">
                        <div
                          className="font-bold text-stone-900 text-left truncate pr-1"
                          style={{
                            fontSize: `${(effectiveHeightMm <= 25 ? 10 : 11.5) * (fontSizeScale / 100)}px`,
                          }}
                        >
                          {isGoldSilverJewellery
                            ? (showPurityWeight && purityWeightDisplay ? purityWeightDisplay : '')
                            : (showPrice && priceDisplay ? priceDisplay : '')}
                        </div>

                        <div
                          className="font-mono font-bold text-stone-900 text-right tracking-wider truncate pl-1"
                          style={{
                            fontSize: `${(effectiveHeightMm <= 25 ? 10 : 11.5) * (fontSizeScale / 100)}px`,
                          }}
                        >
                          {showPurchaseCode && purchaseCode ? purchaseCode : (showBarcodeValue ? '' : product.barcode)}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 text-[10px] text-stone-500 font-mono flex items-center gap-3">
                      <span>Rate on <strong>Left</strong></span>
                      <span>•</span>
                      <span>Code on <strong>Right</strong></span>
                      <span>•</span>
                      <span>Centered on <strong>{effectiveWidthMm}×{effectiveHeightMm}mm</strong></span>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-2 text-center text-[11px] text-stone-500 font-medium">
                Live interactive rendering. Matches hardware printer thermal head output 1:1.
              </div>
            </div>

            {/* Print Action Bottom Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-cream-200 mt-2 bg-white/70 p-3 rounded-xl border">
              <div className="text-xs">
                <span className="font-bold text-stone-800">
                  Target: {selectedPrinter ? selectedPrinter : 'Default Windows Printer'}
                </span>
                <p className="text-[11px] text-stone-500">
                  {directPrint ? 'Direct hardware spooling (Zero dialog)' : 'Windows OS Print Dialog'}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isPrinting}
                  className="rounded-lg border border-cream-300 bg-white px-4 py-2 text-xs font-semibold text-stone-700 hover:bg-cream-100 transition disabled:opacity-50 shadow-xs"
                >
                  Cancel
                </button>

                <button
                  id="btn-confirm-print-barcode"
                  type="button"
                  onClick={() => executePrint()}
                  disabled={isPrinting}
                  className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-amber-500 transition disabled:opacity-50"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
                    />
                  </svg>
                  {isPrinting
                    ? 'Spooling to Printer...'
                    : `Print ${copies} ${copies > 1 ? 'Labels' : 'Label'} (${effectiveWidthMm}×{effectiveHeightMm}mm)`}
                </button>
              </div>
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

                .flex { display: flex !important; }
                .flex-col { flex-direction: column !important; }
                .flex-row { flex-direction: row !important; }
                .items-center { align-items: center !important; }
                .items-stretch { align-items: stretch !important; }
                .justify-between { justify-content: space-between !important; }
                .justify-center { justify-content: center !important; }
                .justify-start { justify-content: flex-start !important; }
                .w-full { width: 100% !important; }
                .h-full { height: 100% !important; }
                .truncate { overflow: hidden !important; text-overflow: ellipsis !important; white-space: nowrap !important; }
                .font-mono { font-family: monospace !important; }
                .font-bold { font-weight: bold !important; }
                .text-black { color: #000000 !important; }

                svg {
                  width: 100% !important;
                  max-width: 100% !important;
                  max-height: 100% !important;
                  height: auto !important;
                  display: block !important;
                  margin: 0 auto !important;
                }

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

                .barcode-label-page.barcode-label-jewellery-85x15 {
                  width: 85mm !important;
                  height: 15mm !important;
                  max-height: 15mm !important;
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
            selectedSize === 'jewellery_85x15' ? (
              /* 85mm x 15mm Jewellery Rat-Tail Tag */
              <div
                key={copyIndex}
                className="barcode-label-page barcode-label-jewellery-85x15"
                style={{
                  width: '85mm',
                  height: '15mm',
                  maxHeight: '15mm',
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
                {/* Printable Head: Exactly 55mm × 15mm on the left */}
                <div
                  style={{
                    width: '55mm',
                    minWidth: '55mm',
                    maxWidth: '55mm',
                    height: '15mm',
                    maxHeight: '15mm',
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
                      height: '14mm',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      overflow: 'hidden',
                      textAlign: 'left',
                      boxSizing: 'border-box',
                      lineHeight: 1.15,
                    }}
                  >
                    <div>
                      {showProductName && (
                        <div
                          style={{
                            fontSize: `${6.5 * (fontSizeScale / 100)}pt`,
                            fontWeight: 'bold',
                            color: '#000000',
                            lineHeight: 1.1,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                          title={product.name}
                        >
                          {product.name}
                        </div>
                      )}
                      {showPurityWeight && (purityWeightDisplay || weightText) && (
                        <div
                          style={{
                            fontSize: `${6 * (fontSizeScale / 100)}pt`,
                            fontWeight: 600,
                            color: '#000000',
                            lineHeight: 1,
                            marginTop: '0.3mm',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {purityWeightDisplay || (weightText ? `Wt: ${weightText}` : '')}
                        </div>
                      )}
                    </div>

                    <div
                      style={{
                        width: '100%',
                        display: 'flex',
                        flexDirection: 'row',
                        alignItems: 'flex-end',
                        justifyContent: 'space-between',
                        lineHeight: 1,
                        overflow: 'hidden',
                      }}
                    >
                      <span
                        style={{
                          fontSize: `${5.5 * (fontSizeScale / 100)}pt`,
                          fontWeight: 'bold',
                          color: '#000000',
                          textAlign: 'left',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          maxWidth: '16mm',
                        }}
                      >
                        {isGoldSilverJewellery
                          ? (makingChargeDisplay || (makingChargePerGram ? `MC: ₹${makingChargePerGram}/g` : 'MC: -'))
                          : (showPrice && priceDisplay ? priceDisplay : '')}
                      </span>
                      <span
                        style={{
                          fontFamily: 'monospace',
                          fontSize: `${5.5 * (fontSizeScale / 100)}pt`,
                          fontWeight: 'bold',
                          color: '#000000',
                          textAlign: 'right',
                          letterSpacing: '0.5px',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          maxWidth: '10mm',
                          marginLeft: 'auto',
                        }}
                      >
                        {showPurchaseCode && purchaseCode ? purchaseCode : ''}
                      </span>
                    </div>
                  </div>

                  {/* Right Flap: 26.5mm */}
                  <div
                    style={{
                      width: '26.5mm',
                      minWidth: '26.5mm',
                      maxWidth: '26.5mm',
                      height: '14mm',
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
                        maxHeight: '9.5mm',
                        overflow: 'hidden',
                      }}
                    >
                      <BarcodeGraphic
                        barcode={product.barcode}
                        size="jewellery_85x15"
                        height={barcodeHeight}
                        width={barcodeWidthScale}
                        displayValue={showBarcodeValue}
                        className="h-full max-h-full"
                      />
                    </div>
                  </div>
                </div>

                {/* Non-Gum Tail Loop: 30mm */}
                <div
                  style={{
                    width: '30mm',
                    minWidth: '30mm',
                    maxWidth: '30mm',
                    height: '15mm',
                    flexShrink: 0,
                  }}
                  aria-hidden="true"
                />
              </div>
            ) : selectedSize === 'jewellery_100x13' ? (
              /* BAR-CODING TECH® 100mm x 13mm Roll Tag */
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
                {/* Printable Head: Exactly 55mm × 13mm on the left */}
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
                      justifyContent: 'space-between',
                      overflow: 'hidden',
                      textAlign: 'left',
                      boxSizing: 'border-box',
                      lineHeight: 1.15,
                    }}
                  >
                    <div>
                      {showProductName && (
                        <div
                          style={{
                            fontSize: `${6.5 * (fontSizeScale / 100)}pt`,
                            fontWeight: 'bold',
                            color: '#000000',
                            lineHeight: 1.1,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                          title={product.name}
                        >
                          {product.name}
                        </div>
                      )}
                      {showPurityWeight && (purityWeightDisplay || weightText) && (
                        <div
                          style={{
                            fontSize: `${5.5 * (fontSizeScale / 100)}pt`,
                            fontWeight: 600,
                            color: '#000000',
                            lineHeight: 1,
                            marginTop: '0.3mm',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {purityWeightDisplay || (weightText ? `Wt: ${weightText}` : '')}
                        </div>
                      )}
                    </div>

                    <div
                      style={{
                        width: '100%',
                        display: 'flex',
                        flexDirection: 'row',
                        alignItems: 'flex-end',
                        justifyContent: 'space-between',
                        lineHeight: 1,
                        overflow: 'hidden',
                      }}
                    >
                      <span
                        style={{
                          fontSize: `${5.5 * (fontSizeScale / 100)}pt`,
                          fontWeight: 'bold',
                          color: '#000000',
                          textAlign: 'left',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          maxWidth: '16mm',
                        }}
                      >
                        {isGoldSilverJewellery
                          ? (makingChargeDisplay || (makingChargePerGram ? `MC: ₹${makingChargePerGram}/g` : 'MC: -'))
                          : (showPrice && priceDisplay ? priceDisplay : '')}
                      </span>
                      <span
                        style={{
                          fontFamily: 'monospace',
                          fontSize: `${5.5 * (fontSizeScale / 100)}pt`,
                          fontWeight: 'bold',
                          color: '#000000',
                          textAlign: 'right',
                          letterSpacing: '0.5px',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          maxWidth: '10mm',
                          marginLeft: 'auto',
                        }}
                      >
                        {showPurchaseCode && purchaseCode ? purchaseCode : ''}
                      </span>
                    </div>
                  </div>

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
                        height={barcodeHeight}
                        width={barcodeWidthScale}
                        displayValue={showBarcodeValue}
                        className="h-full max-h-full"
                      />
                    </div>
                  </div>
                </div>

                {/* Non-Gum Tail: 45mm */}
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
                        fontSize: `${(effectiveHeightMm <= 25 ? 7 : 8) * (fontSizeScale / 100)}pt`,
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
                        fontSize: `${6 * (fontSizeScale / 100)}pt`,
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
                    margin: '0.2mm 0',
                    overflow: 'hidden',
                  }}
                >
                  <BarcodeGraphic
                    barcode={product.barcode}
                    size={selectedSize}
                    height={barcodeHeight}
                    width={barcodeWidthScale}
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
                    fontSize: `${(effectiveHeightMm <= 25 ? 7 : 8) * (fontSizeScale / 100)}pt`,
                    lineHeight: 1.1,
                    paddingTop: '0.4mm',
                    borderTop: '0.5pt solid #000000',
                    boxSizing: 'border-box',
                    overflow: 'hidden',
                    flexShrink: 0,
                  }}
                >
                  {/* Left: Rate / Dynamic rate */}
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
