import { Company } from '@prisma/client';
import { getPrismaClient } from '../database/prisma';

export interface CompanySummary {
  id: string;
  name: string;
  code: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Company Service — Phase 1 Fixed Company Foundation.
 *
 * IMPORTANT ARCHITECTURAL CONSTRAINTS:
 * - Companies are fixed system entities (Company A and Company B).
 * - There is NO Company Management UI and NO Company CRUD.
 * - This service provides read-only queries for diagnostics, verification,
 *   and future authentication scoping.
 * - Do NOT add createCompany, updateCompany, or deleteCompany methods.
 */
export class CompanyService {
  /**
   * Returns all fixed system companies.
   */
  public async getCompanies(): Promise<CompanySummary[]> {
    const prisma = getPrismaClient();
    const companies: Company[] = await prisma.company.findMany({
      orderBy: { code: 'asc' },
    });

    return companies.map((c) => ({
      id: c.id,
      name: c.name,
      code: c.code,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    }));
  }

  /**
   * Returns total number of companies in the database (always 2).
   */
  public async getCompanyCount(): Promise<number> {
    const prisma = getPrismaClient();
    return prisma.company.count();
  }

  /**
   * Finds a company by its unique system code (e.g. 'COMPANY_A' or 'COMPANY_B').
   */
  public async getCompanyByCode(code: string): Promise<CompanySummary | null> {
    const prisma = getPrismaClient();
    const company = await prisma.company.findUnique({
      where: { code },
    });

    if (!company) {
      return null;
    }

    return {
      id: company.id,
      name: company.name,
      code: company.code,
      createdAt: company.createdAt.toISOString(),
      updatedAt: company.updatedAt.toISOString(),
    };
  }

  /**
   * Finds a company by its permanent UUID.
   */
  public async getCompanyById(id: string): Promise<CompanySummary | null> {
    const prisma = getPrismaClient();
    const company = await prisma.company.findUnique({
      where: { id },
    });

    if (!company) {
      return null;
    }

    return {
      id: company.id,
      name: company.name,
      code: company.code,
      createdAt: company.createdAt.toISOString(),
      updatedAt: company.updatedAt.toISOString(),
    };
  }
}

export const companyService = new CompanyService();
