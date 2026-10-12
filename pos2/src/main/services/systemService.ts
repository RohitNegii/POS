import { app } from 'electron';
import { getPrismaClient } from '../database/prisma';
import type { DatabasePingPayload, SystemStatusPayload } from '../../shared/types/ipc';

export class SystemService {
  public async getSystemStatus(): Promise<SystemStatusPayload> {
    try {
      const prisma = getPrismaClient();
      const companyCount = await prisma.company.count();
      return {
        status: 'ok',
        databaseConnected: true,
        appVersion: app.getVersion() || '0.1.0',
        companyCount,
      };
    } catch {
      return {
        status: 'error',
        databaseConnected: false,
        appVersion: app.getVersion() || '0.1.0',
        companyCount: 0,
      };
    }
  }

  public async pingDatabase(): Promise<DatabasePingPayload> {
    const start = performance.now();
    const prisma = getPrismaClient();
    await prisma.$queryRawUnsafe('SELECT 1;');
    const elapsed = Math.round((performance.now() - start) * 100) / 100;
    return {
      alive: true,
      timestamp: new Date().toISOString(),
      responseTimeMs: elapsed,
    };
  }
}

export const systemService = new SystemService();
