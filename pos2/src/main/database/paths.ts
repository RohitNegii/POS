import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { APP_CONSTANTS } from '../../shared/constants/appConstants';

export interface DatabasePathResolution {
  userDataDir: string;
  appDataDir: string;
  databasePath: string;
  databaseUrl: string;
}

export function resolveDatabasePaths(): DatabasePathResolution {
  let userDataDir: string;

  try {
    userDataDir = app.getPath('userData');
  } catch {
    userDataDir = path.join(
      process.env.APPDATA || (process.platform === 'darwin' ? path.join(process.env.HOME || '', 'Library/Application Support') : path.join(process.env.HOME || '', '.config')),
      APP_CONSTANTS.APP_ID
    );
  }

  const appDataDir = path.join(userDataDir, APP_CONSTANTS.DB_SUBDIRECTORY);
  fs.mkdirSync(appDataDir, { recursive: true });

  const databasePath = path.join(appDataDir, APP_CONSTANTS.DATABASE_FILENAME);
  const normalizedPath = databasePath.replace(/\\/g, '/');
  const databaseUrl = `file:${normalizedPath}`;

  return {
    userDataDir,
    appDataDir,
    databasePath,
    databaseUrl,
  };
}
