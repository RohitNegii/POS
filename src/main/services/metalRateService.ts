/**
 * Service for managing company-scoped Daily Metal Rates (Gold & Silver).
 *
 * Enforces company isolation strictly via authenticated admin session.
 * Stores rate history and provides latest applicable rates for automatic
 * jewellery price calculations.
 */

import { getPrismaClient } from '../database/prisma';
import { authService } from './authService';
import { pricingService } from './pricingService';
import type {
  CurrentMetalRatesDto,
  JewelleryCalculationInput,
  JewelleryPriceCalculationResult,
  MetalRateDto,
  MetalRateHistoryItemDto,
  MetalType,
  SaveDailyRatesRequest,
} from '../../shared/types/ipc';

export class MetalRateService {
  /**
   * Helper to get today's local date string formatted as 'YYYY-MM-DD'.
   */
  public getTodayDateString(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Helper to normalize any input date string to 'YYYY-MM-DD'.
   */
  public normalizeDateString(dateStr?: string): string {
    if (!dateStr || !dateStr.trim()) {
      return this.getTodayDateString();
    }
    const trimmed = dateStr.trim();
    // If format is YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }
    // Attempt parse
    const parsed = new Date(trimmed);
    if (isNaN(parsed.getTime())) {
      throw new Error(`Invalid effective date "${dateStr}". Expected format YYYY-MM-DD.`);
    }
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Saves or updates daily metal rates for the authenticated admin's company.
   * Preserves historical rates while upserting the rate record for the effective date.
   */
  public async saveDailyRates(request: SaveDailyRatesRequest): Promise<CurrentMetalRatesDto> {
    const companyId = authService.getAuthenticatedCompanyId();
    const prisma = getPrismaClient();

    const effectiveDate = this.normalizeDateString(request.effectiveDate);

    if (request.goldRatePerGram === undefined && request.silverRatePerGram === undefined) {
      throw new Error('At least one metal rate (Gold or Silver) must be provided.');
    }

    if (request.goldRatePerGram !== undefined) {
      if (typeof request.goldRatePerGram !== 'number' || isNaN(request.goldRatePerGram) || request.goldRatePerGram <= 0) {
        throw new Error('Gold rate must be a valid positive number greater than 0.');
      }

      await prisma.metalRate.upsert({
        where: {
          companyId_metalType_effectiveDate: {
            companyId,
            metalType: 'GOLD',
            effectiveDate,
          },
        },
        create: {
          companyId,
          metalType: 'GOLD',
          ratePerGram: request.goldRatePerGram,
          effectiveDate,
        },
        update: {
          ratePerGram: request.goldRatePerGram,
        },
      });
    }

    if (request.silverRatePerGram !== undefined) {
      if (typeof request.silverRatePerGram !== 'number' || isNaN(request.silverRatePerGram) || request.silverRatePerGram <= 0) {
        throw new Error('Silver rate must be a valid positive number greater than 0.');
      }

      await prisma.metalRate.upsert({
        where: {
          companyId_metalType_effectiveDate: {
            companyId,
            metalType: 'SILVER',
            effectiveDate,
          },
        },
        create: {
          companyId,
          metalType: 'SILVER',
          ratePerGram: request.silverRatePerGram,
          effectiveDate,
        },
        update: {
          ratePerGram: request.silverRatePerGram,
        },
      });
    }

    return this.getCurrentRates(effectiveDate);
  }

  /**
   * Retrieves the latest applicable metal rate for the company as of a given date.
   */
  public async getLatestMetalRate(metalType: MetalType, asOfDate?: string): Promise<MetalRateDto | null> {
    const companyId = authService.getAuthenticatedCompanyId();
    const prisma = getPrismaClient();
    const targetDate = this.normalizeDateString(asOfDate);

    const record = await prisma.metalRate.findFirst({
      where: {
        companyId,
        metalType,
        effectiveDate: {
          lte: targetDate,
        },
      },
      orderBy: [
        { effectiveDate: 'desc' },
        { createdAt: 'desc' },
      ],
    });

    if (!record) return null;

    return {
      id: record.id,
      companyId: record.companyId,
      metalType: record.metalType as MetalType,
      ratePerGram: record.ratePerGram,
      effectiveDate: record.effectiveDate,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  /**
   * Retrieves current (latest active) Gold and Silver rates for the company.
   */
  public async getCurrentRates(asOfDate?: string): Promise<CurrentMetalRatesDto> {
    const targetDate = this.normalizeDateString(asOfDate);
    const goldRate = await this.getLatestMetalRate('GOLD', targetDate);
    const silverRate = await this.getLatestMetalRate('SILVER', targetDate);

    return {
      goldRate,
      silverRate,
      effectiveDate: targetDate,
    };
  }

  /**
   * Retrieves complete rate history for the company grouped by effective date.
   */
  public async getRateHistory(): Promise<MetalRateHistoryItemDto[]> {
    const companyId = authService.getAuthenticatedCompanyId();
    const prisma = getPrismaClient();

    const rates = await prisma.metalRate.findMany({
      where: { companyId },
      orderBy: [
        { effectiveDate: 'desc' },
        { createdAt: 'desc' },
      ],
    });

    // Group by effectiveDate
    const dateMap = new Map<string, { gold: number | null; silver: number | null; updatedAt: string }>();

    for (const r of rates) {
      const existing = dateMap.get(r.effectiveDate) || { gold: null, silver: null, updatedAt: r.updatedAt.toISOString() };
      if (r.metalType === 'GOLD' && existing.gold === null) {
        existing.gold = r.ratePerGram;
      } else if (r.metalType === 'SILVER' && existing.silver === null) {
        existing.silver = r.ratePerGram;
      }
      if (new Date(r.updatedAt).getTime() > new Date(existing.updatedAt).getTime()) {
        existing.updatedAt = r.updatedAt.toISOString();
      }
      dateMap.set(r.effectiveDate, existing);
    }

    const result: MetalRateHistoryItemDto[] = [];
    for (const [date, info] of dateMap.entries()) {
      result.push({
        effectiveDate: date,
        goldRatePerGram: info.gold,
        silverRatePerGram: info.silver,
        lastUpdated: info.updatedAt,
      });
    }

    return result.sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate));
  }

  /**
   * Calculates live product price for Gold or Silver jewellery parameters.
   * Emits a strict error if current applicable metal rate is missing.
   */
  public async calculatePriceForJewellery(
    input: JewelleryCalculationInput
  ): Promise<JewelleryPriceCalculationResult> {
    const resolution = pricingService.resolvePurity(input.purity, input.metalType);
    const effectiveDate = this.normalizeDateString(input.effectiveDate);

    const latestRate = await this.getLatestMetalRate(resolution.metalType, effectiveDate);

    if (!latestRate || latestRate.ratePerGram <= 0) {
      throw new Error(
        `Missing current ${resolution.metalType} rate for your company. Please enter today's ${resolution.metalType} rate in Daily Metal Rates to calculate product price.`
      );
    }

    return pricingService.calculateJewelleryPrice({
      metalType: resolution.metalType,
      purity: resolution.purityNormalized,
      purityFactor: resolution.purityFactor,
      weightGrams: input.weightGrams,
      ratePerGram: latestRate.ratePerGram,
      rateEffectiveDate: latestRate.effectiveDate,
      makingChargePerGram: input.makingChargePerGram,
    });
  }
}

export const metalRateService = new MetalRateService();
