import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { APP_CONSTANTS } from '../../shared/constants/appConstants';

export interface DatabasePathResolution {
  userDataDir: string;
  appDataDir: string;
  databaseFilePath: string;
  databaseUrl: string;
  isOutsideRestrictedDirs: boolean;
}

/**
 * Resolves and validates the SQLite database path inside Electron's userData/app-data directory.
 * Enforces the safety rule that the database NEVER lives inside source, dist, build, or installation folders.
 */
export function resolveDatabasePaths(): DatabasePathResolution {
  const userDataDir = app.getPath('userData');
  const appDataDir = path.join(userDataDir, APP_CONSTANTS.DATABASE_DIR_NAME);

  if (!fs.existsSync(appDataDir)) {
    fs.mkdirSync(appDataDir, { recursive: true });
  }

  const databaseFilePath = path.join(appDataDir, APP_CONSTANTS.DATABASE_FILE_NAME);
  const normalizedDbPath = path.resolve(databaseFilePath).toLowerCase();

  const appRoot = path.resolve(app.getAppPath()).toLowerCase();
  const cwdRoot = path.resolve(process.cwd()).toLowerCase();
  const exeDir = path.resolve(path.dirname(app.getPath('exe'))).toLowerCase();
  const resourcesDir = process.resourcesPath
    ? path.resolve(process.resourcesPath).toLowerCase()
    : '';

  const restrictedRoots = [
    appRoot,
    cwdRoot,
    path.join(cwdRoot, 'src'),
    path.join(cwdRoot, 'dist'),
    path.join(cwdRoot, 'dist-electron'),
    path.join(cwdRoot, 'build'),
    path.join(cwdRoot, 'release'),
    exeDir,
    resourcesDir,
  ].filter(Boolean);

  const isInsideRestricted = restrictedRoots.some(
    (restricted) =>
      normalizedDbPath === restricted ||
      normalizedDbPath.startsWith(restricted + path.sep)
  );

  if (isInsideRestricted) {
    throw new Error(
      `[DATABASE SAFETY VIOLATION] SQLite database path (${databaseFilePath}) resolved inside a restricted directory.`
    );
  }

  // Convert Windows backslashes to forward slashes for Prisma SQLite connection URL
  const normalizedUrlPath = databaseFilePath.replace(/\\/g, '/');
  const databaseUrl = `file:${normalizedUrlPath}`;

  return {
    userDataDir,
    appDataDir,
    databaseFilePath,
    databaseUrl,
    isOutsideRestrictedDirs: !isInsideRestricted,
  };
}
