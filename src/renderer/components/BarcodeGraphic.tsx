import React, { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';

export type BarcodePrintSize = 'jewellery_100x13' | 'small' | 'medium' | 'large';

interface BarcodeGraphicProps {
  barcode: string;
  className?: string;
  size?: BarcodePrintSize;
  width?: number;
  height?: number;
  fontSize?: number;
  displayValue?: boolean;
}

const SIZE_PRESETS: Record<
  BarcodePrintSize,
  { width: number; height: number; fontSize: number; margin: number }
> = {
  jewellery_100x13: {
    width: 0.85,
    height: 18,
    fontSize: 7.5,
    margin: 1,
  },
  small: {
    width: 1.2,
    height: 32,
    fontSize: 10,
    margin: 4,
  },
  medium: {
    width: 1.8,
    height: 52,
    fontSize: 12,
    margin: 8,
  },
  large: {
    width: 2.3,
    height: 75,
    fontSize: 14,
    margin: 10,
  },
};

/**
 * Standard Code 128 scannable barcode graphic component.
 * Renders into an SVG element with high optical contrast suitable for 1D/2D POS barcode readers.
 *
 * Supports print size presets:
 * - 'small'  (Compact jewellery / ring / earring tag: 38mm x 25mm)
 * - 'medium' (Standard retail price / boxed item tag: 50mm x 35mm)
 * - 'large'  (Large shelf / meter fabric roll / carton tag: 75mm x 50mm)
 *
 * NOTE: Changing the label print size does NOT alter the barcode value or product data.
 * All sizes encode the exact same permanent barcode value.
 */
export const BarcodeGraphic: React.FC<BarcodeGraphicProps> = ({
  barcode,
  className = '',
  size = 'medium',
  width,
  height,
  fontSize,
  displayValue = true,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);

  const preset = SIZE_PRESETS[size] || SIZE_PRESETS.medium;
  const effectiveWidth = width ?? preset.width;
  const effectiveHeight = height ?? preset.height;
  const effectiveFontSize = fontSize ?? preset.fontSize;
  const effectiveMargin = preset.margin;

  useEffect(() => {
    if (svgRef.current && barcode) {
      try {
        JsBarcode(svgRef.current, barcode, {
          format: 'CODE128',
          lineColor: '#0f172a', // Deep slate / black for crisp scanning
          background: '#ffffff',
          width: effectiveWidth,
          height: effectiveHeight,
          displayValue,
          fontSize: effectiveFontSize,
          textMargin: 3,
          font: 'monospace',
          fontOptions: 'bold',
          margin: effectiveMargin,
        });
      } catch (err) {
        console.error('Failed to render barcode:', err);
      }
    }
  }, [barcode, effectiveWidth, effectiveHeight, effectiveFontSize, displayValue, effectiveMargin]);

  if (!barcode) {
    return (
      <div className="flex h-16 w-48 items-center justify-center rounded border border-dashed border-cream-300 bg-cream-50 text-xs text-stone-400">
        No barcode
      </div>
    );
  }

  return (
    <div
      className={`inline-block overflow-hidden rounded bg-white p-1 shadow-sm border border-cream-200 ${className}`}
    >
      <svg ref={svgRef} className="block mx-auto max-w-full" />
    </div>
  );
};
