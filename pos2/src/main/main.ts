import { app, BrowserWindow, Menu } from 'electron';
import * as path from 'path';
import { APP_CONSTANTS } from '../shared/constants/appConstants';
import { disconnectDatabase, initializeDatabase } from './database/prisma';
import { registerAllIpcHandlers } from './ipc';
import { authService } from './services/authService';
import { systemService } from './services/systemService';

let mainWindow: BrowserWindow | null = null;
const isSmokeTest = process.env.POS_SMOKE_TEST === '1';

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock && !isSmokeTest) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
  });
}

async function createMainWindow(): Promise<void> {
  Menu.setApplicationMenu(null);

  const preloadPath = path.join(__dirname, '../preload/preload.js');

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 700,
    title: APP_CONSTANTS.APP_NAME,
    backgroundColor: '#FAF6EE',
    show: !isSmokeTest,
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      devTools: !app.isPackaged,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(() => {
    return { action: 'deny' };
  });

  if (!app.isPackaged) {
    mainWindow.webContents.on('before-input-event', (event, input) => {
      if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
        mainWindow?.webContents.toggleDevTools();
        event.preventDefault();
      }
    });
  }

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    await mainWindow.loadURL(devServerUrl);
  } else {
    const indexHtmlPath = path.join(__dirname, '../../dist/index.html');
    await mainWindow.loadFile(indexHtmlPath);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (isSmokeTest && mainWindow) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    console.log('[SMOKE TEST] Verifying POS 2 startup & auth...');
    const status = await systemService.getSystemStatus();
    console.log('[SMOKE TEST] System Status:', status);

    // Verify Company A login
    const sessionA = await authService.login({ email: 'adminA@example.com', password: 'Admin@123' });
    console.log('[SMOKE TEST] Company A Login OK:', sessionA.companyName);

    // Verify Company B login
    const sessionB = await authService.login({ email: 'adminB@example.com', password: 'Admin@123' });
    console.log('[SMOKE TEST] Company B Login OK:', sessionB.companyName);

    // Verify Billing User login
    const sessionBilling = await authService.login({ email: 'billing@example.com', password: 'Billing@123' });
    console.log('[SMOKE TEST] Billing User Login OK:', sessionBilling.name, sessionBilling.role);

    await authService.logout();
    console.log('[SMOKE TEST] ALL POS 2 SMOKE TESTS PASSED!');
    app.quit();
  }
}

app.whenReady().then(async () => {
  try {
    console.log('[MAIN] Initializing POS 2 Database...');
    await initializeDatabase();
    console.log('[MAIN] Registering IPC Handlers...');
    registerAllIpcHandlers();
    console.log('[MAIN] Creating Window...');
    await createMainWindow();
  } catch (err) {
    console.error('[MAIN] Startup Error:', err);
    app.quit();
  }
});

app.on('window-all-closed', async () => {
  if (process.platform !== 'darwin') {
    await disconnectDatabase();
    app.quit();
  }
});

app.on('before-quit', async () => {
  await disconnectDatabase();
});
