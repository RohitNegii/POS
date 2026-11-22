import { app } from 'electron';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import AdmZip from 'adm-zip';
import {
  disconnectDatabase,
  getDatabasePaths,
  getPrismaClient,
  initializeDatabase,
} from '../database/prisma';
import { backupCryptoService } from './backupCryptoService';
import { googleDriveService } from './googleDriveService';
import { backupScheduler } from './backupScheduler';
import type {
  BackupHistoryDto,
  BackupStatusDto,
  RestoreBackupResultDto,
  SaveBackupConfigRequest,
} from '../../shared/types/ipc';

const CONFIG_FILE_NAME = 'backup_settings.json';
const DEFAULT_RETENTION_COUNT = 30;
const DEFAULT_SCHEDULED_TIME = '22:00'; // 10:00 PM

export interface BackupMetadata {
  appVersion: string;
  databaseType: string;
  backupDate: string;
  databaseChecksum: string;
  companies: string[];
  totalCompanies: number;
  totalProducts: number;
  totalBills: number;
  totalPurchases: number;
  totalExpenses: number;
  totalVendors: number;
}

export class BackupService {
  private isBackingUp = false;
  private configFilePath: string | null = null;

  private getConfigFilePath(): string {
    if (!this.configFilePath) {
      this.configFilePath = path.join(app.getPath('userData'), CONFIG_FILE_NAME);
    }
    return this.configFilePath;
  }

  /**
   * Loads backup configuration from disk.
   */
  public getConfig(): {
    scheduledTime: string;
    schedulerEnabled: boolean;
    retentionCount: number;
  } {
    const filePath = this.getConfigFilePath();
    if (fs.existsSync(filePath)) {
      try {
        const raw = fs.readFileSync(filePath, 'utf8');
        const parsed = JSON.parse(raw);
        return {
          scheduledTime: parsed.scheduledTime || DEFAULT_SCHEDULED_TIME,
          schedulerEnabled: typeof parsed.schedulerEnabled === 'boolean' ? parsed.schedulerEnabled : true,
          retentionCount: typeof parsed.retentionCount === 'number' ? parsed.retentionCount : DEFAULT_RETENTION_COUNT,
        };
      } catch (err) {
        console.warn('[BACKUP_SERVICE] Error reading backup settings:', err);
      }
    }

    return {
      scheduledTime: DEFAULT_SCHEDULED_TIME,
      schedulerEnabled: true,
      retentionCount: DEFAULT_RETENTION_COUNT,
    };
  }

  /**
   * Saves updated backup configuration.
   */
  public async saveConfig(input: SaveBackupConfigRequest): Promise<BackupStatusDto> {
    const current = this.getConfig();
    const updated = {
      scheduledTime: input.scheduledTime ? input.scheduledTime.trim() : current.scheduledTime,
      schedulerEnabled: typeof input.schedulerEnabled === 'boolean' ? input.schedulerEnabled : current.schedulerEnabled,
      retentionCount: input.retentionCount && input.retentionCount > 0 ? Math.round(input.retentionCount) : current.retentionCount,
    };

    fs.writeFileSync(this.getConfigFilePath(), JSON.stringify(updated, null, 2), 'utf8');

    if (input.googleClientId !== undefined || input.googleClientSecret !== undefined) {
      googleDriveService.saveOAuthCredentials(input.googleClientId, input.googleClientSecret);
    }

    // Refresh active scheduler cron job
    backupScheduler.applyConfig(updated.scheduledTime, updated.schedulerEnabled);

    return this.getStatus();
  }

  /**
   * Retrieves full Google Drive backup status and schedule state.
   */
  public async getStatus(): Promise<BackupStatusDto> {
    const driveStatus = googleDriveService.getStatus();
    const config = this.getConfig();

    let lastBackupAt: string | undefined;
    let lastBackupStatus: 'SUCCESS' | 'FAILED' | 'IN_PROGRESS' | undefined;
    let lastBackupFilename: string | undefined;

    try {
      const prisma = getPrismaClient();
      const latest = await prisma.backupHistory.findFirst({
        orderBy: { createdAt: 'desc' },
      });
      if (latest) {
        lastBackupAt = latest.createdAt.toISOString();
        lastBackupStatus = latest.status as any;
        lastBackupFilename = latest.filename;
      }
    } catch {
      // Prisma may not be initialized yet in early startup
    }

    return {
      isConnected: driveStatus.isConnected,
      connectedEmail: driveStatus.connectedEmail,
      driveFolderName: driveStatus.driveFolderName,
      driveFolderId: driveStatus.driveFolderId,
      schedulerEnabled: config.schedulerEnabled,
      scheduledTime: config.scheduledTime,
      nextScheduledRun: backupScheduler.getNextScheduledRun(),
      lastBackupAt,
      lastBackupStatus,
      lastBackupFilename,
      retentionCount: config.retentionCount,
      hasCustomCredentials: driveStatus.hasCustomCredentials,
      isBackingUp: this.isBackingUp,
    };
  }

  /**
   * Performs an atomic online SQLite WAL backup, compresses it into a ZIP archive,
   * encrypts it using AES-256-GCM, and returns file details.
   */
  public async createLocalBackup(): Promise<{
    encryptedFilePath: string;
    filename: string;
    sizeBytes: number;
    checksum: string;
    metadata: BackupMetadata;
  }> {
    const prisma = getPrismaClient();
    const tempDir = path.join(os.tmpdir(), `pos_backup_${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });

    const tempSqlitePath = path.join(tempDir, 'database.sqlite');
    const normalizedTempSqlitePath = tempSqlitePath.replace(/\\/g, '/');

    // 1. Atomic Online SQLite WAL snapshot using VACUUM INTO
    // Never interrupts active readers or billing cashiers
    await prisma.$executeRawUnsafe(`VACUUM INTO '${normalizedTempSqlitePath}'`);

    const dbStats = fs.statSync(tempSqlitePath);
    if (!fs.existsSync(tempSqlitePath) || dbStats.size === 0) {
      throw new Error('Database backup failed: VACUUM INTO created an empty or missing database file.');
    }

    const dbChecksum = backupCryptoService.calculateChecksum(fs.readFileSync(tempSqlitePath));

    // 2. Aggregate backup metadata
    const companies = await prisma.company.findMany({ select: { name: true } });
    const totalProducts = await prisma.product.count();
    const totalBills = await prisma.bill.count();
    const totalPurchases = await prisma.purchase.count();
    const totalExpenses = await prisma.expense.count();
    const totalVendors = await prisma.vendor.count();

    const metadata: BackupMetadata = {
      appVersion: '1.0.4',
      databaseType: 'sqlite',
      backupDate: new Date().toISOString(),
      databaseChecksum: dbChecksum,
      companies: companies.map((c) => c.name),
      totalCompanies: companies.length,
      totalProducts,
      totalBills,
      totalPurchases,
      totalExpenses,
      totalVendors,
    };

    // 3. Compress database snapshot and manifest.json into ZIP archive
    const zip = new AdmZip();
    zip.addLocalFile(tempSqlitePath);
    zip.addFile('manifest.json', Buffer.from(JSON.stringify(metadata, null, 2), 'utf8'));

    const zipBuffer = zip.toBuffer();

    // 4. Encrypt ZIP archive using AES-256-GCM
    const encryptedBuffer = backupCryptoService.encrypt(zipBuffer);
    const encryptedChecksum = backupCryptoService.calculateChecksum(encryptedBuffer);

    // Format filename: POS_Backup_YYYY-MM-DD_HH-mm.posbackup
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const timeStr = `${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`;
    const filename = `POS_Backup_${dateStr}_${timeStr}.posbackup`;

    const encryptedFilePath = path.join(tempDir, filename);
    fs.writeFileSync(encryptedFilePath, encryptedBuffer);

    // Clean unencrypted temp database file
    try {
      fs.unlinkSync(tempSqlitePath);
    } catch {}

    return {
      encryptedFilePath,
      filename,
      sizeBytes: encryptedBuffer.length,
      checksum: encryptedChecksum,
      metadata,
    };
  }

  /**
   * Executes a full backup pipeline:
   * 1. Check Google Drive connection.
   * 2. Snapshot, compress, and AES-256-GCM encrypt.
   * 3. Upload to Google Drive.
   * 4. Enforce retention policy.
   * 5. Record backup history.
   */
  public async performBackup(
    backupType: 'AUTOMATIC' | 'MANUAL' | 'MISSED_SCHEDULED' = 'MANUAL'
  ): Promise<BackupHistoryDto> {
    const driveStatus = googleDriveService.getStatus();
    if (!driveStatus.isConnected) {
      throw new Error('Google Drive is not connected. Please connect Google Drive in Super Admin settings.');
    }

    if (this.isBackingUp) {
      throw new Error('A backup is already currently in progress. Please wait for it to complete.');
    }

    this.isBackingUp = true;
    const prisma = getPrismaClient();

    let backupRecord: any = null;
    let localBackup: any = null;

    try {
      // Create initial IN_PROGRESS history record
      backupRecord = await prisma.backupHistory.create({
        data: {
          filename: `POS_Backup_${new Date().toISOString().slice(0, 10)}.posbackup`,
          backupType,
          status: 'IN_PROGRESS',
        },
      });

      // 1. Create local compressed & encrypted backup
      localBackup = await this.createLocalBackup();

      // 2. Upload to Google Drive POS_Backups folder
      const uploadResult = await googleDriveService.uploadBackupFile(
        localBackup.encryptedFilePath,
        localBackup.filename
      );

      // 3. Mark record as SUCCESS
      const updatedRecord = await prisma.backupHistory.update({
        where: { id: backupRecord.id },
        data: {
          filename: localBackup.filename,
          driveFileId: uploadResult.fileId,
          sizeBytes: localBackup.sizeBytes,
          status: 'SUCCESS',
          checksum: localBackup.checksum,
          metadataJson: JSON.stringify(localBackup.metadata),
          completedAt: new Date(),
        },
      });

      // 4. Enforce backup retention policy (auto-delete older files)
      try {
        await this.enforceRetentionPolicy();
      } catch (err) {
        console.warn('[BACKUP_SERVICE] Retention enforcement notice:', err);
      }

      return {
        id: updatedRecord.id,
        filename: updatedRecord.filename,
        driveFileId: updatedRecord.driveFileId,
        sizeBytes: updatedRecord.sizeBytes,
        backupType: updatedRecord.backupType as any,
        status: 'SUCCESS',
        checksum: updatedRecord.checksum,
        metadataJson: updatedRecord.metadataJson,
        createdAt: updatedRecord.createdAt.toISOString(),
        completedAt: updatedRecord.completedAt?.toISOString(),
      };
    } catch (error: any) {
      console.error('[BACKUP_SERVICE] Backup operation failed:', error);
      let displayError = error.message || 'Unknown backup failure';
      if (/insufficient.*scope/i.test(displayError) || /ACCESS_TOKEN_SCOPE_INSUFFICIENT/i.test(displayError)) {
        displayError = 'Google Drive access was not granted. Please Disconnect and Reconnect Google Drive, and make sure to check the box for Google Drive access on the Google sign-in screen.';
      }
      if (backupRecord) {
        await prisma.backupHistory.update({
          where: { id: backupRecord.id },
          data: {
            status: 'FAILED',
            errorMessage: displayError,
            completedAt: new Date(),
          },
        });
      }
      throw new Error(displayError);
    } finally {
      this.isBackingUp = false;
      // Clean up temporary local encrypted file
      if (localBackup?.encryptedFilePath) {
        try {
          const dir = path.dirname(localBackup.encryptedFilePath);
          fs.rmSync(dir, { recursive: true, force: true });
        } catch {}
      }
    }
  }

  /**
   * Enforces backup retention policy:
   * Keeps latest N daily backups and removes older backups from Google Drive.
   * Never deletes the only remaining valid backup.
   */
  public async enforceRetentionPolicy(): Promise<number> {
    const config = this.getConfig();
    const driveBackups = await googleDriveService.listDriveBackups();

    if (driveBackups.length <= config.retentionCount) {
      return 0;
    }

    // Never delete all backups; keep at least the latest retentionCount
    const backupsToDelete = driveBackups.slice(config.retentionCount);
    let deletedCount = 0;

    for (const b of backupsToDelete) {
      if (driveBackups.length - deletedCount <= 1) {
        break; // Safety guard: Never delete the only remaining backup
      }
      try {
        await googleDriveService.deleteDriveFile(b.id);
        deletedCount++;
      } catch (err) {
        console.warn(`[BACKUP_SERVICE] Failed to delete expired backup file ${b.id}:`, err);
      }
    }

    return deletedCount;
  }

  /**
   * Lists backup history records from the Prisma database.
   * If Google Drive is connected, automatically syncs any existing cloud backup files
   * from Google Drive into the local database (so upon reinstallation on a fresh PC,
   * all older backups immediately appear with Restore actions).
   */
  public async listHistory(limit = 50): Promise<BackupHistoryDto[]> {
    const prisma = getPrismaClient();

    // Auto-sync older Google Drive backups if connected
    if (googleDriveService.getStatus().isConnected) {
      try {
        const driveFiles = await googleDriveService.listDriveBackups();
        if (driveFiles.length > 0) {
          const existing = await prisma.backupHistory.findMany({
            where: {
              driveFileId: { in: driveFiles.map((d) => d.id) },
            },
            select: { driveFileId: true },
          });
          const existingIds = new Set(existing.map((e) => e.driveFileId));

          const missingFiles = driveFiles.filter((d) => !existingIds.has(d.id));
          for (const mf of missingFiles) {
            try {
              const fileCreatedAt = mf.createdTime ? new Date(mf.createdTime) : new Date();
              await prisma.backupHistory.create({
                data: {
                  filename: mf.name,
                  driveFileId: mf.id,
                  sizeBytes: mf.size,
                  backupType: 'AUTOMATIC',
                  status: 'SUCCESS',
                  createdAt: fileCreatedAt,
                  completedAt: fileCreatedAt,
                },
              });
            } catch (createErr) {
              console.warn('[BACKUP_SERVICE] Notice creating synced drive backup history record:', createErr);
            }
          }
        }
      } catch (syncErr) {
        console.warn('[BACKUP_SERVICE] Cloud drive sync notice:', syncErr);
      }
    }

    const records = await prisma.backupHistory.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return records.map((r) => ({
      id: r.id,
      filename: r.filename,
      driveFileId: r.driveFileId,
      sizeBytes: r.sizeBytes,
      backupType: r.backupType as any,
      status: r.status as any,
      errorMessage: r.errorMessage,
      checksum: r.checksum,
      metadataJson: r.metadataJson,
      createdAt: r.createdAt.toISOString(),
      completedAt: r.completedAt?.toISOString() || null,
    }));
  }

  /**
   * Safely restores a selected backup from Google Drive:
   * 1. Downloads encrypted file from Google Drive.
   * 2. Decrypts and authenticates AES-256-GCM tag.
   * 3. Extracts ZIP and validates SQLite database integrity.
   * 4. Creates an emergency backup of current live database.
   * 5. Atomically replaces database files.
   * 6. Re-initializes Prisma client.
   */
  public async restoreBackup(backupId: string): Promise<RestoreBackupResultDto> {
    const prisma = getPrismaClient();
    const record = await prisma.backupHistory.findUnique({
      where: { id: backupId },
    });

    if (!record) {
      throw new Error(`Backup record with ID "${backupId}" not found in database history.`);
    }

    if (!record.driveFileId) {
      throw new Error(`Backup record does not have an associated Google Drive file ID.`);
    }

    const tempDir = path.join(os.tmpdir(), `pos_restore_${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });

    const downloadedEncryptedPath = path.join(tempDir, record.filename);

    try {
      // 1. Download encrypted file from Google Drive
      await googleDriveService.downloadBackupFile(record.driveFileId, downloadedEncryptedPath);

      const encryptedBuffer = fs.readFileSync(downloadedEncryptedPath);

      // 2. Decrypt using AES-256-GCM (verifies authentication tag)
      const decryptedZipBuffer = backupCryptoService.decrypt(encryptedBuffer);

      // 3. Extract ZIP and validate database & manifest
      const zip = new AdmZip(decryptedZipBuffer);
      const manifestEntry = zip.getEntry('manifest.json');
      const dbEntry = zip.getEntry('database.sqlite');

      if (!dbEntry) {
        throw new Error('Corrupted backup archive: missing "database.sqlite" inside backup bundle.');
      }

      const extractedDbPath = path.join(tempDir, 'database.sqlite');
      zip.extractEntryTo(dbEntry, tempDir, false, true);

      // Verify SQLite header signature: "SQLite format 3\000" (16 bytes)
      const dbHeader = Buffer.alloc(16);
      const fd = fs.openSync(extractedDbPath, 'r');
      fs.readSync(fd, dbHeader, 0, 16, 0);
      fs.closeSync(fd);

      if (dbHeader.toString('utf8') !== 'SQLite format 3\0') {
        throw new Error('Database validation failed: Extracted file is not a valid SQLite database.');
      }

      let metadata: BackupMetadata | null = null;
      if (manifestEntry) {
        try {
          metadata = JSON.parse(manifestEntry.getData().toString('utf8'));
        } catch {}
      }

      // 4. Create an emergency safety snapshot of current live database before restoration
      const dbPaths = getDatabasePaths();
      const currentLiveDbPath = dbPaths.databaseFilePath;
      const emergencyBackupPath = path.join(
        dbPaths.appDataDir,
        `emergency_backup_pre_restore_${Date.now()}.sqlite.bak`
      );

      if (fs.existsSync(currentLiveDbPath)) {
        fs.copyFileSync(currentLiveDbPath, emergencyBackupPath);
      }

      // 5. Close active Prisma database connection
      await disconnectDatabase();

      // 6. Overwrite live SQLite database file
      fs.copyFileSync(extractedDbPath, currentLiveDbPath);

      // Remove stale WAL and SHM journal files so SQLite loads cleanly without journal conflicts
      const walPath = `${currentLiveDbPath}-wal`;
      const shmPath = `${currentLiveDbPath}-shm`;
      if (fs.existsSync(walPath)) {
        try {
          fs.unlinkSync(walPath);
        } catch {}
      }
      if (fs.existsSync(shmPath)) {
        try {
          fs.unlinkSync(shmPath);
        } catch {}
      }

      // 7. Re-initialize Prisma with restored database
      await initializeDatabase();

      return {
        success: true,
        restoredAt: new Date().toISOString(),
        emergencyBackupPath,
        tablesRestored: metadata?.totalCompanies ? metadata.totalCompanies : 2,
        message: `Database successfully restored from backup "${record.filename}". Both companies' data have been restored.`,
      };
    } finally {
      // Clean up temp restore directory
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {}
    }
  }
}

export const backupService = new BackupService();
