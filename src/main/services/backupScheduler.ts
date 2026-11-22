import cron, { ScheduledTask } from 'node-cron';
import { googleDriveService } from './googleDriveService';
import { backupService } from './backupService';
import { getPrismaClient } from '../database/prisma';

export class BackupScheduler {
  private activeTask: ScheduledTask | null = null;
  private currentScheduledTime: string = '22:00';
  private isEnabled: boolean = true;
  private isInitialized: boolean = false;

  /**
   * Initializes the scheduler on Electron application startup.
   */
  public init(): void {
    if (this.isInitialized) {
      return;
    }
    this.isInitialized = true;

    const config = backupService.getConfig();
    this.currentScheduledTime = config.scheduledTime || '22:00';
    this.isEnabled = config.schedulerEnabled;

    if (this.isEnabled) {
      this.scheduleCronJob(this.currentScheduledTime);
    }

    // Run missed-backup check 10 seconds after application launch
    // to give database and window time to initialize smoothly
    setTimeout(() => {
      void this.checkAndRunMissedBackup();
    }, 10000);
  }

  /**
   * Applies new schedule configuration and updates active cron job.
   */
  public applyConfig(scheduledTime: string, enabled: boolean): void {
    this.currentScheduledTime = scheduledTime;
    this.isEnabled = enabled;

    if (this.activeTask) {
      this.activeTask.stop();
      this.activeTask = null;
    }

    if (this.isEnabled) {
      this.scheduleCronJob(this.currentScheduledTime);
    }
  }

  /**
   * Converts "HH:MM" (e.g. "22:00") into a daily cron expression.
   * Default: 0 0 22 * * * (At 22:00 every day)
   */
  private scheduleCronJob(timeStr: string): void {
    const parts = timeStr.split(':');
    const hour = parseInt(parts[0], 10) || 22;
    const minute = parseInt(parts[1], 10) || 0;

    const cronExpr = `${minute} ${hour} * * *`;

    try {
      this.activeTask = cron.schedule(cronExpr, async () => {
        console.log(`[BACKUP_SCHEDULER] Triggering scheduled daily backup at ${timeStr}...`);
        try {
          const driveStatus = googleDriveService.getStatus();
          if (!driveStatus.isConnected) {
            console.log('[BACKUP_SCHEDULER] Skipped scheduled backup: Google Drive is not connected.');
            return;
          }

          await backupService.performBackup('AUTOMATIC');
          console.log('[BACKUP_SCHEDULER] Scheduled backup completed successfully.');
        } catch (err: any) {
          console.error('[BACKUP_SCHEDULER] Scheduled backup failed:', err.message);
        }
      });
    } catch (err) {
      console.error('[BACKUP_SCHEDULER] Failed to schedule cron task:', err);
    }
  }

  /**
   * Computes the ISO string of the next scheduled backup run.
   */
  public getNextScheduledRun(): string | undefined {
    if (!this.isEnabled) {
      return undefined;
    }

    const parts = this.currentScheduledTime.split(':');
    const targetHour = parseInt(parts[0], 10) || 22;
    const targetMinute = parseInt(parts[1], 10) || 0;

    const now = new Date();
    const nextRun = new Date(now);
    nextRun.setHours(targetHour, targetMinute, 0, 0);

    // If today's scheduled time has already passed, next run is tomorrow
    if (now.getTime() >= nextRun.getTime()) {
      nextRun.setDate(nextRun.getDate() + 1);
    }

    return nextRun.toISOString();
  }

  /**
   * Missed-backup check on startup:
   * If the POS application was closed or computer was switched off when the backup was scheduled,
   * automatically performs the pending backup.
   */
  public async checkAndRunMissedBackup(): Promise<boolean> {
    const driveStatus = googleDriveService.getStatus();
    if (!driveStatus.isConnected || !this.isEnabled) {
      return false;
    }

    try {
      const prisma = getPrismaClient();

      const parts = this.currentScheduledTime.split(':');
      const targetHour = parseInt(parts[0], 10) || 22;
      const targetMinute = parseInt(parts[1], 10) || 0;

      const now = new Date();
      // Calculate when the most recent scheduled backup should have run
      const latestScheduledTime = new Date(now);
      latestScheduledTime.setHours(targetHour, targetMinute, 0, 0);

      if (now.getTime() < latestScheduledTime.getTime()) {
        // We are before today's scheduled time, so the expected last run was yesterday's scheduled time
        latestScheduledTime.setDate(latestScheduledTime.getDate() - 1);
      }

      // Check the latest successful backup in database history
      const lastSuccess = await prisma.backupHistory.findFirst({
        where: { status: 'SUCCESS' },
        orderBy: { createdAt: 'desc' },
      });

      // If no successful backup exists or last successful backup was before the latest scheduled time:
      // A scheduled backup was missed while the computer was off!
      const isMissed = !lastSuccess || lastSuccess.createdAt.getTime() < latestScheduledTime.getTime();

      if (isMissed) {
        console.log('[BACKUP_SCHEDULER] Missed scheduled backup detected! Running pending backup...');
        await backupService.performBackup('MISSED_SCHEDULED');
        return true;
      }
    } catch (err: any) {
      console.warn('[BACKUP_SCHEDULER] Missed backup check notice:', err.message);
    }

    return false;
  }

  /**
   * Cleanly stops the active scheduler task on application shutdown.
   */
  public stop(): void {
    if (this.activeTask) {
      this.activeTask.stop();
      this.activeTask = null;
    }
    this.isInitialized = false;
  }
}

export const backupScheduler = new BackupScheduler();
