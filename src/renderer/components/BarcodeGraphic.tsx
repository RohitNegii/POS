import React, { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';

export type BarcodePrintSize =
  | 'std_50x25'
  | 'retail_50x35'
  | 'compact_50x30'
  | 'square_50x50'
  | 'small_38x25'
  | 'large_60x40'
  | 'jewellery_100x13'
  | 'custom'
  // Backward compatibility aliases
  | 'small'
  | 'medium'
  | 'large'
  | 'large_75x50';

interface BarcodeGraphicProps {
  barcode: string;
  className?: string;
  size?: BarcodePrintSize;
  width?: number;
  height?: number;
  fontSize?: number;
  margin?: number;
  displayValue?: boolean;
}

const SIZE_PRESETS: Record<
  BarcodePrintSize,
  { width: number; height: number; fontSize: number; margin: number }
> = {
  // Standard 50 x 25 mm thermal sticker roll (most popular in retail POS)
  std_50x25: {
    width: 1.0,
    height: 24,
    fontSize: 8.5,
    margin: 2,
  },
  // 50 x 35 mm retail label
  retail_50x35: {
    width: 1.15,
    height: 32,
    fontSize: 9.5,
    margin: 3,
  },
  // 50 x 30 mm compact sticker
  compact_50x30: {
    width: 1.05,
    height: 28,
    fontSize: 9,
    margin: 2,
  },
  // 50 x 50 mm square sticker
  square_50x50: {
    width: 1.25,
    height: 40,
    fontSize: 10,
    margin: 4,
  },
  // 38 x 25 mm compact retail tag
  small_38x25: {
    width: 0.85,
    height: 20,
    fontSize: 7.5,
    margin: 2,
  },
  // 60 x 40 mm large retail / box label
  large_60x40: {
    width: 1.3,
    height: 42,
    fontSize: 10.5,
    margin: 4,
  },
  // BAR-CODING TECH® Jewellery Dumbbell Tag
  jewellery_100x13: {
    width: 0.8,
    height: 16,
    fontSize: 7,
    margin: 1,
  },
  // Custom size fallback
  custom: {
    width: 1.0,
    height: 24,
    fontSize: 8.5,
    margin: 2,
  },
  // Backward compatibility aliases
  small: {
    width: 0.85,
    height: 20,
    fontSize: 7.5,
    margin: 2,
  },
  medium: {
    width: 1.1,
    height: 30,
    fontSize: 9.5,
    margin: 3,
  },
  large: {
    width: 1.3,
    height: 42,
    fontSize: 10.5,
    margin: 4,
  },
  large_75x50: {
    width: 1.3,
    height: 42,
    fontSize: 10.5,
    margin: 4,
  },
};

/**
 * Standard Code 128 scannable barcode graphic component.
 * Renders into an SVG element with high optical contrast suitable for 1D/2D POS barcode readers.
 *
 * Automatically computes SVG viewBox so bars and human-readable text scale proportionally
 * and never clip at sticker boundaries.
 */
export const BarcodeGraphic: React.FC<BarcodeGraphicProps> = ({
  barcode,
  className = '',
  size = 'std_50x25',
  width,
  height,
  fontSize,
  margin,
  displayValue = true,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);

  const preset = SIZE_PRESETS[size] || SIZE_PRESETS.std_50x25;
  const effectiveWidth = width ?? preset.width;
  const effectiveHeight = height ?? preset.height;
  const effectiveFontSize = fontSize ?? preset.fontSize;
  const effectiveMargin = margin ?? preset.margin;

  useEffect(() => {
    if (svgRef.current && barcode) {
      try {
        // Clear previous SVG contents
        while (svgRef.current.firstChild) {
          svgRef.current.removeChild(svgRef.current.firstChild);
        }

        JsBarcode(svgRef.current, barcode, {
          format: 'CODE128',
          lineColor: '#000000', // Pure black for crisp thermal optical scanning
          background: '#ffffff',
          width: effectiveWidth,
          height: effectiveHeight,
          displayValue,
          fontSize: effectiveFontSize,
          textMargin: 1,
          font: 'monospace',
          fontOptions: 'bold',
          margin: effectiveMargin,
        });

        // Ensure responsive SVG scaling without clipping at container sides
        const svg = svgRef.current;
        const naturalWidth = svg.getAttribute('width');
        const naturalHeight = svg.getAttribute('height');

        if (naturalWidth && naturalHeight) {
          const wNum = parseFloat(naturalWidth);
          const hNum = parseFloat(naturalHeight);
          if (!isNaN(wNum) && !isNaN(hNum) && wNum > 0 && hNum > 0) {
            svg.setAttribute('viewBox', `0 0 ${wNum} ${hNum}`);
          }
        }
        // Remove raw pixel width & height attributes set by JsBarcode so they do not override responsive/CSS scaling
        svg.removeAttribute('width');
        svg.removeAttribute('height');
        svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        svg.style.width = '100%';
        svg.style.maxWidth = '100%';
        svg.style.maxHeight = '100%';
        svg.style.height = 'auto';
        svg.style.display = 'block';
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
      className={`flex items-center justify-center w-full max-w-full overflow-hidden ${className}`}
      style={{ minHeight: 0 }}
    >
      <svg
        ref={svgRef}
        className="block mx-auto max-w-full h-auto"
        style={{ width: '100%', maxWidth: '100%', maxHeight: '100%', height: 'auto', display: 'block' }}
      />
    </div>
  );
};

