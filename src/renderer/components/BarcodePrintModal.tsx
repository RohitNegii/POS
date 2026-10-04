import React, { useState } from 'react';
import type { AuthSessionPayload, ProductDto } from '../../shared/types/ipc';
import { BarcodeGraphic, BarcodePrintSize } from './BarcodeGraphic';
import { generateActualPurchasePriceCode } from '../../shared/utils/purchaseCode';

interface BarcodePrintModalProps {
  product: ProductDto | null;
  session: AuthSessionPayload;
  isOpen: boolean;
  onClose: () => void;
}

interface SizeOption {
  id: BarcodePrintSize;
  title: string;
  dimensionsMm: string;
  dimensionsInches: string;
  useCase: string;
  previewWidthPx: number;
  previewMinHeightPx: number;
}

const SIZE_OPTIONS: SizeOption[] = [
  {
    id: 'jewellery_100x13',
    title: 'BAR-CODING TECH® Jewellery Tag',
    dimensionsMm: '100 × 13 mm (Print: 55 × 13 mm)',
    dimensionsInches: '3.94" × 0.51" (Print: 2.17" × 0.51")',
    useCase: 'Polyester price stickers with 45mm non-gum tail loop (Rings, necklaces, bangles, earrings)',
    previewWidthPx: 440,
    previewMinHeightPx: 80,
  },
  {
    id: 'small',
    title: 'Small Rectangular Sticker',
    dimensionsMm: '38 × 25 mm',
    dimensionsInches: '1.5" × 1.0"',
    useCase: 'Compact retail price stickers, small boxes, pouch tags',
    previewWidthPx: 160,
    previewMinHeightPx: 110,
  },
  {
    id: 'medium',
    title: 'Medium Label',
    dimensionsMm: '50 × 35 mm',
    dimensionsInches: '2.0" × 1.4"',
    useCase: 'Standard retail tags, boxed items, tabletop décor',
    previewWidthPx: 220,
    previewMinHeightPx: 155,
  },
  {
    id: 'large',
    title: 'Large Shelf / Roll Label',
    dimensionsMm: '75 × 50 mm',
    dimensionsInches: '3.0" × 2.0"',
    useCase: 'Shelf tags, fabric rolls, meter-based home décor, cartons',
    previewWidthPx: 300,
    previewMinHeightPx: 200,
  },
];

export const BarcodePrintModal: React.FC<BarcodePrintModalProps> = ({
  product,
  session: _session,
  isOpen,
  onClose,
}) => {
  const [selectedSize, setSelectedSize] = useState<BarcodePrintSize>('jewellery_100x13');
  const [copies, setCopies] = useState<number>(1);
  const [showProductName, setShowProductName] = useState<boolean>(true);
  const [showCategory, setShowCategory] = useState<boolean>(false);
  const [showPurityWeight, setShowPurityWeight] = useState<boolean>(true);
  const [showPrice, setShowPrice] = useState<boolean>(true);
  const [showPurchaseCode, setShowPurchaseCode] = useState<boolean>(true);
  const [isPrinting, setIsPrinting] = useState<boolean>(false);

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

  // Extract purchase price code (COMPLISENT mapping)
  const purchaseCode =
    product.actualPurchasePriceCode ||
    generateActualPurchasePriceCode(product.actualPurchasePrice);

  // Extract selling price (dynamic jewellery rate or static field)
  const priceDisplay = product.calculatedJewelleryPrice
    ? `₹${product.calculatedJewelleryPrice.finalPrice.toLocaleString()}`
    : (() => {
        const priceField = product.fieldValues?.find((fv) => {
          const key = fv.categoryField?.fieldKey?.toLowerCase() || '';
          const name = fv.categoryField?.name?.toLowerCase() || '';
          return (
            key.includes('price') ||
            name.includes('price') ||
            key.includes('rate') ||
            name.includes('rate')
          );
        });
        return (
          priceField?.valueText ||
          (priceField?.valueNumber !== null && priceField?.valueNumber !== undefined
            ? `₹${priceField.valueNumber.toLocaleString()}`
            : null)
        );
      })();

  const activeOption =
    SIZE_OPTIONS.find((opt) => opt.id === selectedSize) || SIZE_OPTIONS[0];

  const handlePrint = () => {
    setIsPrinting(true);
    setTimeout(() => {
      window.print();
      setIsPrinting(false);
    }, 150);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 p-4 backdrop-blur-sm select-text">
      <div className="flex h-[92vh] max-h-[860px] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-cream-300 bg-white shadow-2xl">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-cream-200 px-6 py-4 bg-cream-50/70">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-base font-bold text-stone-900">
                Print Barcode Label
              </h2>
              <span className="rounded-full border border-amber-300/80 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                {product.name}
              </span>
              <span className="rounded border border-cream-300 bg-white px-2 py-0.5 font-mono text-xs text-stone-700 shadow-xs">
                {product.barcode}
              </span>
            </div>
            <p className="mt-1 text-xs text-stone-500">
              Compatible with <span className="font-semibold text-amber-900">BAR-CODING TECH® 100mm × 13mm</span> & standard thermal price tags.
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

        {/* Modal Body: Left column settings, Right column live preview */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left Settings Panel */}
          <div className="w-full md:w-1/2 overflow-y-auto p-6 space-y-5 border-r border-cream-200">
            {/* Tag Specs Card */}
            <div className="rounded-xl border border-amber-300/90 bg-amber-50/60 p-3.5">
              <div className="flex items-start gap-2.5">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-amber-600 text-white font-bold text-[10px]">
                  🏷️
                </div>
                <div className="text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-amber-950">
                      BAR-CODING TECH® Jewellery Tag
                    </span>
                    <span className="rounded bg-amber-200/70 px-1.5 py-0.2 text-[9px] font-bold text-amber-900">
                      Partial Gum
                    </span>
                  </div>
                  <p className="mt-1 text-stone-600 text-[11px] leading-relaxed">
                    Total: <strong className="text-stone-800">100mm × 13mm</strong> | Printable Area: <strong className="text-stone-800">55mm × 13mm</strong>. White gloss polyester finish with 45mm non-gum tail loop protecting jewellery against adhesive residue.
                  </p>
                </div>
              </div>
            </div>

            {/* Label Size Selection */}
            <div>
              <label className="block text-xs font-semibold text-stone-800 mb-2">
                Label Format / Sticker Size <span className="text-rose-500">*</span>
              </label>
              <div className="grid grid-cols-1 gap-2.5">
                {SIZE_OPTIONS.map((opt) => {
                  const isSelected = selectedSize === opt.id;
                  return (
                    <div
                      key={opt.id}
                      onClick={() => setSelectedSize(opt.id)}
                      className={`cursor-pointer rounded-xl border p-3 transition ${
                        isSelected
                          ? 'border-amber-500 bg-amber-50/50 ring-1 ring-amber-500/50'
                          : 'border-cream-200 bg-white hover:border-cream-300 hover:bg-cream-50/50 shadow-xs'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <input
                            type="radio"
                            name="barcode-print-size"
                            id={`size-radio-${opt.id}`}
                            checked={isSelected}
                            onChange={() => setSelectedSize(opt.id)}
                            className="h-4 w-4 text-amber-600 border-cream-300 focus:ring-amber-500"
                          />
                          <label
                            htmlFor={`size-radio-${opt.id}`}
                            className="text-xs font-bold text-stone-900 cursor-pointer select-none"
                          >
                            {opt.title}
                          </label>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="rounded bg-cream-100 px-2 py-0.5 text-[10px] font-mono text-stone-700 border border-cream-200 font-semibold">
                            {opt.dimensionsMm}
                          </span>
                        </div>
                      </div>
                      <p className="mt-1.5 pl-6 text-[11px] text-stone-500 leading-normal">
                        {opt.useCase}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Print Options */}
            <div className="rounded-xl border border-cream-200 bg-cream-50/50 p-4 space-y-3.5">
              <h4 className="text-xs font-semibold text-stone-800">
                Label Content & Copies
              </h4>

              {/* Number of Copies */}
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-xs text-stone-700 font-medium">Number of Copies</label>
                  <p className="text-[10px] text-stone-500">How many labels to print (1 roll = 2000)</p>
                </div>
                <div className="flex items-center gap-2">
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

              {/* Toggles */}
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-cream-200">
                <label className="flex items-center gap-2 text-xs text-stone-700 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={showProductName}
                    onChange={(e) => setShowProductName(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-cream-300 text-amber-600 focus:ring-amber-500"
                  />
                  <span>Product Name</span>
                </label>

                {purityWeightDisplay && (
                  <label className="flex items-center gap-2 text-xs text-stone-700 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={showPurityWeight}
                      onChange={(e) => setShowPurityWeight(e.target.checked)}
                      className="h-3.5 w-3.5 rounded border-cream-300 text-amber-600 focus:ring-amber-500"
                    />
                    <span>Purity & Weight</span>
                  </label>
                )}

                {priceDisplay && (
                  <label className="flex items-center gap-2 text-xs text-stone-700 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={showPrice}
                      onChange={(e) => setShowPrice(e.target.checked)}
                      className="h-3.5 w-3.5 rounded border-cream-300 text-amber-600 focus:ring-amber-500"
                    />
                    <span>Price / Live Rate</span>
                  </label>
                )}

                {purchaseCode && (
                  <label className="flex items-center gap-2 text-xs text-stone-700 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={showPurchaseCode}
                      onChange={(e) => setShowPurchaseCode(e.target.checked)}
                      className="h-3.5 w-3.5 rounded border-cream-300 text-amber-600 focus:ring-amber-500"
                    />
                    <span className="flex items-center gap-1">
                      <span>Price Code</span>
                      <span className="font-mono text-[9px] font-bold text-amber-900 bg-amber-100 px-1 rounded border border-amber-300">
                        {purchaseCode}
                      </span>
                    </span>
                  </label>
                )}

                <label className="flex items-center gap-2 text-xs text-stone-700 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={showCategory}
                    onChange={(e) => setShowCategory(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-cream-300 text-amber-600 focus:ring-amber-500"
                  />
                  <span>Category Name</span>
                </label>
              </div>
            </div>
          </div>

          {/* Right Live Preview Panel */}
          <div className="w-full md:w-1/2 flex flex-col justify-between p-6 bg-cream-50/40">
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-stone-600">
                  Physical Sticker Preview
                </h3>
                <span className="rounded-full border border-amber-300/80 bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800">
                  {activeOption.title}
                </span>
              </div>

              {/* Tag Preview Area */}
              <div className="flex flex-col items-center justify-center p-6 rounded-2xl border border-cream-200 bg-cream-100/60 min-h-[340px]">
                {selectedSize === 'jewellery_100x13' ? (
                  /* Physical 100mm x 13mm Dumbbell Jewellery Tag Preview */
                  <div className="w-full max-w-md flex flex-col items-center space-y-3">
                    {/* Zone indicators */}
                    <div className="w-full flex justify-between text-[10px] text-stone-500 font-semibold px-2">
                      <span>◄ Printable Zone (55mm × 13mm) ►</span>
                      <span>◄ Non-Gum Tail (45mm) ►</span>
                    </div>

                    {/* The 100mm Tag representation */}
                    <div className="w-full flex items-center bg-transparent drop-shadow-md">
                      {/* Printable 55mm zone (with Left and Right Flaps) */}
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
                          {showPrice && priceDisplay && (
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
                            height={20}
                            width={0.85}
                            displayValue={false}
                          />
                          <div className="w-full flex items-center justify-between font-mono text-[8.5px] font-bold text-stone-800 tracking-wider mt-0.5 px-0.5">
                            {showPurchaseCode && purchaseCode ? (
                              <span className="text-[8px] bg-stone-100 px-1 rounded border border-stone-200 text-stone-700" title="Actual Purchase Price Code (COMPLISENT)">
                                {purchaseCode}
                              </span>
                            ) : (
                              <span />
                            )}
                            <span className="text-[8.5px] ml-auto">{product.barcode}</span>
                          </div>
                        </div>

                        {/* Fold indicator badge */}
                        <div className="absolute bottom-0.5 left-1/2 -translate-x-1/2 text-[7px] text-stone-400 font-mono select-none">
                          fold
                        </div>
                      </div>

                      {/* 45mm Non-Gum / Clear Loop Tail */}
                      <div className="w-[42%] h-[28px] bg-stone-200/90 border-y-2 border-r-2 border-dashed border-stone-400 rounded-r-full flex items-center justify-center relative overflow-hidden">
                        <span className="text-[8px] font-semibold text-stone-600 tracking-tight whitespace-nowrap px-1">
                          Partial Gum Tail Loop
                        </span>
                      </div>
                    </div>

                    <div className="text-[10px] text-stone-500 text-center leading-relaxed">
                      💡 <strong>How it applies:</strong> Peels from roll → Tail loops through ring/necklace with zero gum residue → The two 27.5mm flaps fold back-to-back showing barcode on one side and price/details on the other.
                    </div>
                  </div>
                ) : (
                  /* Standard Rectangular Sticker Preview */
                  <div
                    style={{
                      width: `${activeOption.previewWidthPx}px`,
                      minHeight: `${activeOption.previewMinHeightPx}px`,
                    }}
                    className={`bg-white text-stone-900 rounded-lg shadow-xl p-3 border-2 border-dashed border-stone-300 flex flex-col items-center justify-between transition-all duration-200 ${
                      selectedSize === 'small' ? 'text-[9px]' : selectedSize === 'medium' ? 'text-[11px]' : 'text-xs'
                    }`}
                  >
                    <div className="w-full text-center border-b border-cream-200 pb-1">
                      {showProductName && (
                        <div className="font-bold text-stone-900 leading-tight mt-0.5 truncate">
                          {product.name}
                        </div>
                      )}
                      {showCategory && (
                        <div className="text-stone-500 text-[9px] leading-tight">
                          {product.categoryName}
                        </div>
                      )}
                    </div>

                    <div className="my-1.5 flex justify-center w-full">
                      <BarcodeGraphic
                        barcode={product.barcode}
                        size={selectedSize}
                      />
                    </div>

                    <div className="w-full flex items-center justify-between text-stone-700 pt-1 border-t border-cream-200 text-[10px]">
                      {showPurchaseCode && purchaseCode ? (
                        <span className="font-mono font-bold text-[9px] text-stone-700 tracking-wider bg-stone-100 px-1.5 py-0.5 rounded border border-stone-200" title="Actual Purchase Price Code (COMPLISENT)">
                          {purchaseCode}
                        </span>
                      ) : (
                        <span />
                      )}
                      {showPrice && priceDisplay && (
                        <span className="font-bold text-stone-900">{priceDisplay}</span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-3 text-center text-[11px] text-stone-500">
                Standard Code 128 encoding. Compatible with handheld optical laser & 2D image scanners.
              </div>
            </div>

            {/* Print Action Buttons */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-cream-200 mt-4">
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
                onClick={handlePrint}
                disabled={isPrinting}
                className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-amber-500 transition disabled:opacity-50"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                {isPrinting ? 'Printing...' : `Print ${copies} ${copies > 1 ? 'Labels' : 'Label'} (${activeOption.title})`}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Hidden Printable Container — Rendered ONLY during @media print */}
      <div
        id="printable-barcode-slip"
        className="hidden print:block fixed inset-0 bg-white text-black p-0 m-0 z-99999"
      >
        <div className="flex flex-col items-start">
          {Array.from({ length: copies }).map((_, copyIndex) => (
            selectedSize === 'jewellery_100x13' ? (
              /* BAR-CODING TECH® 55mm x 13mm Printable Area */
              <div
                key={copyIndex}
                style={{
                  width: '55mm',
                  height: '13mm',
                  maxHeight: '13mm',
                  pageBreakAfter: 'always',
                  pageBreakInside: 'avoid',
                }}
                className="flex items-center justify-between bg-white text-black box-border overflow-hidden px-1 py-0.5 border border-dashed border-gray-300"
              >
                {/* Left Flap: 26mm x 12mm */}
                <div
                  style={{ width: '26mm', height: '11mm' }}
                  className="flex flex-col justify-around leading-tight overflow-hidden text-left"
                >
                  {showProductName && (
                    <div className="text-[7pt] font-bold text-black truncate leading-none">
                      {product.name}
                    </div>
                  )}
                  {showPurityWeight && purityWeightDisplay && (
                    <div className="text-[6pt] font-semibold text-black leading-none">
                      {purityWeightDisplay}
                    </div>
                  )}
                  {showPrice && priceDisplay && (
                    <div className="text-[7pt] font-bold text-black font-mono leading-none">
                      {priceDisplay}
                    </div>
                  )}
                </div>

                {/* Dotted fold line */}
                <div style={{ height: '10mm' }} className="border-r border-dotted border-gray-400 mx-0.5" />

                {/* Right Flap: 26mm x 12mm */}
                <div
                  style={{ width: '26mm', height: '11mm' }}
                  className="flex flex-col items-center justify-center overflow-hidden text-center"
                >
                  <BarcodeGraphic
                    barcode={product.barcode}
                    size="jewellery_100x13"
                    height={16}
                    width={0.8}
                    displayValue={false}
                  />
                  <div className="w-full flex items-center justify-between font-mono text-[5.5pt] font-bold text-black tracking-wider leading-none mt-0.5 px-0.5">
                    {showPurchaseCode && purchaseCode ? (
                      <span>{purchaseCode}</span>
                    ) : (
                      <span />
                    )}
                    <span className="ml-auto">{product.barcode}</span>
                  </div>
                </div>
              </div>
            ) : (
              /* Standard Rectangular Stickers */
              <div
                key={copyIndex}
                style={{
                  width: selectedSize === 'small' ? '38mm' : selectedSize === 'medium' ? '50mm' : '75mm',
                  minHeight: selectedSize === 'small' ? '25mm' : selectedSize === 'medium' ? '35mm' : '50mm',
                  pageBreakAfter: 'always',
                  pageBreakInside: 'avoid',
                }}
                className="border border-dashed border-gray-400 p-2 flex flex-col items-center justify-between text-center box-border mb-2"
              >
                {showProductName && (
                  <div className="text-xs font-bold text-black leading-tight mt-0.5 truncate w-full">
                    {product.name}
                  </div>
                )}
                {showCategory && (
                  <div className="text-[9px] text-gray-600 leading-tight">
                    {product.categoryName}
                  </div>
                )}

                <div className="my-1 flex justify-center w-full">
                  <BarcodeGraphic
                    barcode={product.barcode}
                    size={selectedSize}
                  />
                </div>

                <div className="w-full flex items-center justify-between text-black text-[10px] pt-0.5 border-t border-gray-300">
                  {showPurchaseCode && purchaseCode ? (
                    <span className="font-mono font-bold text-[8pt] text-black tracking-wider">
                      {purchaseCode}
                    </span>
                  ) : (
                    <span />
                  )}
                  {showPrice && priceDisplay && (
                    <span className="font-bold">{priceDisplay}</span>
                  )}
                </div>
              </div>
            )
          ))}
        </div>
      </div>
    </div>
  );
};
