import { app } from 'electron';
import { APP_CONSTANTS } from '../../shared/constants/appConstants';
import { DatabasePingPayload, SystemStatusPayload } from '../../shared/types/ipc';
import {
  getDatabasePaths,
  getJournalMode,
  getPrismaClient,
  METADATA_KEYS,
} from '../database/prisma';
import { companyService } from './companyService';

/**
 * Application Service for system diagnostics and database status verification.
 * All database access goes through Prisma ORM in the Main Process.
 */
export class SystemService {
  public async getSystemStatus(): Promise<SystemStatusPayload> {
    const prisma = getPrismaClient();
    const paths = getDatabasePaths();

    const [records, companies] = await Promise.all([
      prisma.appMetadata.findMany(),
      companyService.getCompanies(),
    ]);

    const recordMap = new Map<string, string>(
      records.map((item) => [item.key, item.value])
    );

    const firstInitializedAt =
      recordMap.get(METADATA_KEYS.FIRST_INITIALIZED_AT) ?? new Date().toISOString();
    const launchCount =
      parseInt(recordMap.get(METADATA_KEYS.LAUNCH_COUNT) ?? '1', 10) || 1;
    const lastLaunchedAt =
      recordMap.get(METADATA_KEYS.LAST_LAUNCHED_AT) ?? firstInitializedAt;

    return {
      runtime: {
        appName: APP_CONSTANTS.APP_NAME,
        appVersion: app.getVersion(),
        phase: APP_CONSTANTS.APP_PHASE,
        isPackaged: app.isPackaged,
        platform: process.platform,
        arch: process.arch,
        electronVersion: process.versions.electron ?? 'unknown',
        chromeVersion: process.versions.chrome ?? 'unknown',
        nodeVersion: process.versions.node ?? 'unknown',
        timestamp: new Date().toISOString(),
      },
      database: {
        connected: true,
        provider: 'sqlite',
        databasePath: paths.databaseFilePath,
        userDataDir: paths.userDataDir,
        journalMode: getJournalMode().toUpperCase(),
        firstInitializedAt,
        launchCount,
        lastLaunchedAt,
        metadataRecordCount: records.length,
        isOutsideRestrictedDirs: paths.isOutsideRestrictedDirs,
        companyCount: companies.length,
        companies: companies.map((c) => ({
          id: c.id,
          name: c.name,
          code: c.code,
          createdAt: c.createdAt,
        })),
      },
    };
  }

  public async pingDatabase(): Promise<DatabasePingPayload> {
    const prisma = getPrismaClient();
    const startTime = performance.now();

    // Execute a lightweight read query via Prisma ORM against SQLite
    const [initRecord, launchRecord] = await Promise.all([
      prisma.appMetadata.findUnique({
        where: { key: METADATA_KEYS.FIRST_INITIALIZED_AT },
      }),
      prisma.appMetadata.findUnique({
        where: { key: METADATA_KEYS.LAUNCH_COUNT },
      }),
    ]);

    const latencyMs = Math.max(1, Math.round((performance.now() - startTime) * 100) / 100);

    return {
      ok: true,
      latencyMs,
      checkedAt: new Date().toISOString(),
      launchCount: launchRecord ? parseInt(launchRecord.value, 10) || 1 : 1,
      firstInitializedAt: initRecord?.value ?? new Date().toISOString(),
    };
  }
}

export const systemService = new SystemService();
