import { getPrismaClient } from '../database/prisma';
import { authService } from './authService';
import type {
  CurrentMetalRatesDto,
  MetalRateDto,
  MetalRateHistoryItemDto,
  MetalType,
  SaveDailyRatesRequest,
} from '../../shared/types/ipc';

export class MetalRateService {
  public getTodayDateString(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  public normalizeDateString(dateStr?: string): string {
    if (!dateStr || !dateStr.trim()) {
      return this.getTodayDateString();
    }
    const trimmed = dateStr.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }
    const parsed = new Date(trimmed);
    if (isNaN(parsed.getTime())) {
      throw new Error(`Invalid effective date "${dateStr}". Expected format YYYY-MM-DD.`);
    }
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  public async saveDailyRates(request: SaveDailyRatesRequest): Promise<CurrentMetalRatesDto> {
    const companyId = authService.getAuthenticatedCompanyId();
    const prisma = getPrismaClient();

    const targetCompanyId = companyId === 'ALL'
      ? (await prisma.company.findFirst({ orderBy: { code: 'asc' } }))?.id || ''
      : companyId;

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
            companyId: targetCompanyId,
            metalType: 'GOLD',
            effectiveDate,
          },
        },
        create: {
          companyId: targetCompanyId,
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
            companyId: targetCompanyId,
            metalType: 'SILVER',
            effectiveDate,
          },
        },
        create: {
          companyId: targetCompanyId,
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

  public async getLatestMetalRate(
    metalType: MetalType,
    asOfDate?: string
  ): Promise<MetalRateDto | null> {
    const companyId = authService.getAuthenticatedCompanyId();
    const prisma = getPrismaClient();
    const targetDate = this.normalizeDateString(asOfDate);

    const where: any = {
      metalType,
      effectiveDate: {
        lte: targetDate,
      },
    };

    if (companyId !== 'ALL') {
      where.companyId = companyId;
    }

    const record = await prisma.metalRate.findFirst({
      where,
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

  public async getRateHistory(): Promise<MetalRateHistoryItemDto[]> {
    const companyId = authService.getAuthenticatedCompanyId();
    const prisma = getPrismaClient();

    const rates = await prisma.metalRate.findMany({
      where: {
        ...(companyId !== 'ALL' ? { companyId } : {}),
      },
      orderBy: [
        { effectiveDate: 'desc' },
        { createdAt: 'desc' },
      ],
    });

    const dateMap = new Map<string, { gold: number | null; silver: number | null; updatedAt: string }>();

    for (const r of rates) {
      const existing = dateMap.get(r.effectiveDate) || {
        gold: null,
        silver: null,
        updatedAt: r.updatedAt.toISOString(),
      };
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
}

export const metalRateService = new MetalRateService();
