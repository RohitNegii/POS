/**
 * Reusable domain service for Gold and Silver Jewellery price calculation.
 *
 * Isolated business logic to ensure calculation formulas can be adjusted
 * or expanded for future POS billing without rewriting product modules.
 *
 * Business Formula:
 * 1. Metal Value = Current Metal Rate × Purity Factor × Weight
 * 2. Making Charges = Making Charge Per Gram × Weight
 * 3. Final Product Price = Metal Value + Making Charges
 */

import type {
  JewelleryPriceCalculationResult,
  MetalType,
} from '../../shared/types/ipc';

export interface PurityResolutionResult {
  purityNormalized: string;
  purityFactor: number;
  metalType: MetalType;
}

/**
 * Standard purity configuration mappings for Gold and Silver
 */
const PURITY_MAP: Record<string, { factor: number; metalType: MetalType }> = {
  // Gold Purities
  '24K': { factor: 1.0, metalType: 'GOLD' },
  '24KT': { factor: 1.0, metalType: 'GOLD' },
  '24 KARAT': { factor: 1.0, metalType: 'GOLD' },
  '999': { factor: 0.999, metalType: 'GOLD' },

  '22K': { factor: 0.916, metalType: 'GOLD' },
  '22KT': { factor: 0.916, metalType: 'GOLD' },
  '22 KARAT': { factor: 0.916, metalType: 'GOLD' },
  '916': { factor: 0.916, metalType: 'GOLD' },

  '18K': { factor: 0.75, metalType: 'GOLD' },
  '18KT': { factor: 0.75, metalType: 'GOLD' },
  '18 KARAT': { factor: 0.75, metalType: 'GOLD' },
  '750': { factor: 0.75, metalType: 'GOLD' },

  '14K': { factor: 0.585, metalType: 'GOLD' },
  '14KT': { factor: 0.585, metalType: 'GOLD' },
  '14 KARAT': { factor: 0.585, metalType: 'GOLD' },
  '585': { factor: 0.585, metalType: 'GOLD' },

  '10K': { factor: 0.417, metalType: 'GOLD' },
  '10KT': { factor: 0.417, metalType: 'GOLD' },

  '9K': { factor: 0.375, metalType: 'GOLD' },
  '9KT': { factor: 0.375, metalType: 'GOLD' },

  // Silver Purities
  'FINE SILVER': { factor: 0.999, metalType: 'SILVER' },
  '999 SILVER': { factor: 0.999, metalType: 'SILVER' },
  'SILVER 999': { factor: 0.999, metalType: 'SILVER' },

  '925 SILVER': { factor: 0.925, metalType: 'SILVER' },
  'SILVER 925': { factor: 0.925, metalType: 'SILVER' },
  '925': { factor: 0.925, metalType: 'SILVER' },
  'STERLING': { factor: 0.925, metalType: 'SILVER' },
  'STERLING SILVER': { factor: 0.925, metalType: 'SILVER' },

  '900 SILVER': { factor: 0.9, metalType: 'SILVER' },
  'COIN SILVER': { factor: 0.9, metalType: 'SILVER' },

  '800 SILVER': { factor: 0.8, metalType: 'SILVER' },
};

export class PricingService {
  /**
   * Resolves a raw purity string (e.g. "22K", "925 Silver", "18KT") into a standardized factor and metal type.
   */
  public resolvePurity(purityInput: string, explicitMetalType?: MetalType): PurityResolutionResult {
    if (!purityInput || typeof purityInput !== 'string') {
      throw new Error('Purity must be a non-empty string.');
    }

    const clean = purityInput.trim().toUpperCase();

    // Direct lookup
    if (PURITY_MAP[clean]) {
      const match = PURITY_MAP[clean];
      return {
        purityNormalized: purityInput.trim(),
        purityFactor: match.factor,
        metalType: explicitMetalType || match.metalType,
      };
    }

    // Check if input is direct decimal factor (e.g. "0.916")
    const numericDirect = parseFloat(clean);
    if (!isNaN(numericDirect) && numericDirect > 0 && numericDirect <= 1.0) {
      return {
        purityNormalized: purityInput.trim(),
        purityFactor: numericDirect,
        metalType: explicitMetalType || 'GOLD',
      };
    }

    // Pattern matching for keys like "22K (916)" or "925 STERLING"
    for (const [key, mapping] of Object.entries(PURITY_MAP)) {
      if (clean.includes(key)) {
        return {
          purityNormalized: purityInput.trim(),
          purityFactor: mapping.factor,
          metalType: explicitMetalType || mapping.metalType,
        };
      }
    }

    // Fallback: If Karat number pattern e.g. "21K" -> 21 / 24
    const karatMatch = clean.match(/^(\d+(?:\.\d+)?)\s*(?:K|KT|KARAT)$/);
    if (karatMatch && karatMatch[1]) {
      const karat = parseFloat(karatMatch[1]);
      if (karat > 0 && karat <= 24) {
        return {
          purityNormalized: `${karat}K`,
          purityFactor: parseFloat((karat / 24).toFixed(3)),
          metalType: explicitMetalType || 'GOLD',
        };
      }
    }

    throw new Error(
      `Unsupported or unrecognized jewellery purity "${purityInput}". Please choose a standard purity (e.g. 24K, 22K, 18K, 14K, 925 Silver, Fine Silver).`
    );
  }

  /**
   * Calculates the jewellery price strictly adhering to the client specification formula:
   *
   * Metal Value = Current Metal Rate × Purity Factor × Weight
   * Making Charges = Making Charge Per Gram × Weight
   * Final Product Price = Metal Value + Making Charges
   */
  public calculateJewelleryPrice(params: {
    metalType: MetalType;
    purity: string;
    purityFactor: number;
    weightGrams: number;
    ratePerGram: number;
    rateEffectiveDate: string;
    makingChargePerGram: number;
  }): JewelleryPriceCalculationResult {
    const {
      metalType,
      purity,
      purityFactor,
      weightGrams,
      ratePerGram,
      rateEffectiveDate,
      makingChargePerGram,
    } = params;

    // Strict Validations
    if (!ratePerGram || ratePerGram <= 0) {
      throw new Error(`Invalid ${metalType} market rate: ₹${ratePerGram}/g. Rate must be greater than zero.`);
    }

    if (!weightGrams || weightGrams <= 0) {
      throw new Error(`Invalid jewellery weight: ${weightGrams}g. Weight must be greater than zero.`);
    }

    if (makingChargePerGram === undefined || makingChargePerGram === null || makingChargePerGram < 0) {
      throw new Error(`Invalid making charges: ₹${makingChargePerGram}/g. Making charge must be non-negative.`);
    }

    if (!purityFactor || purityFactor <= 0 || purityFactor > 1.0) {
      throw new Error(`Invalid purity factor: ${purityFactor}. Must be between 0 and 1.0.`);
    }

    // 1. Metal Value
    const metalValue = Math.round(ratePerGram * purityFactor * weightGrams * 100) / 100;

    // 2. Making Charges
    const totalMakingCharges = Math.round(makingChargePerGram * weightGrams * 100) / 100;

    // 3. Final Product Price (Standard Indian Rupee retail rounding to nearest whole rupee)
    const finalPrice = Math.round(metalValue + totalMakingCharges);

    return {
      metalType,
      purity,
      purityFactor,
      weightGrams,
      ratePerGram,
      rateEffectiveDate,
      metalValue,
      makingChargePerGram,
      totalMakingCharges,
      finalPrice,
      isCalculated: true,
    };
  }
}

export const pricingService = new PricingService();
