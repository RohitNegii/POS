import { getPrismaClient } from '../database/prisma';

export interface CompanyDto {
  id: string;
  name: string;
  code: string;
  createdAt: string;
  updatedAt: string;
}

export class CompanyService {
  public async listCompanies(): Promise<CompanyDto[]> {
    const prisma = getPrismaClient();
    const companies = await prisma.company.findMany({
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

  public async getCompanyById(id: string): Promise<CompanyDto | null> {
    const prisma = getPrismaClient();
    const company = await prisma.company.findUnique({
      where: { id },
    });
    if (!company) return null;
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
