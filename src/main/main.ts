import { app, BrowserWindow, Menu } from 'electron';
import * as path from 'path';
import { APP_CONSTANTS } from '../shared/constants/appConstants';
import { disconnectDatabase, initializeDatabase } from './database/prisma';
import { registerAllIpcHandlers } from './ipc';
import { authService } from './services/authService';
import { categoryService } from './services/categoryService';
import { systemService } from './services/systemService';

let mainWindow: BrowserWindow | null = null;

const isSmokeTest = process.env.POS_SMOKE_TEST === '1';

// Enforce single application instance for SQLite database safety
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
    backgroundColor: '#020617',
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

  // Block creation of arbitrary popups/windows
  mainWindow.webContents.setWindowOpenHandler(() => {
    return { action: 'deny' };
  });

  // Enable F12 and Ctrl+Shift+I to open Chrome DevTools for debugging in development
  if (!app.isPackaged) {
    mainWindow.webContents.on('before-input-event', (event, input) => {
      if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
        mainWindow?.webContents.toggleDevTools();
        event.preventDefault();
      }
    });
  }

  // Load Vite Dev Server with HMR in development, or compiled static assets in production
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
    // Wait briefly for React to mount and complete initial renders
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const status = await systemService.getSystemStatus();
    const ping = await systemService.pingDatabase();

    // TEST 3: Invalid password test
    let test3WrongPasswordRejected = false;
    try {
      await authService.login({ email: 'adminA@example.com', password: 'WrongPassword@999' });
    } catch {
      test3WrongPasswordRejected = true;
    }

    // TEST 4: Non-existent email test
    let test4NonExistentEmailRejected = false;
    try {
      await authService.login({ email: 'unknown@example.com', password: 'Admin@123' });
    } catch {
      test4NonExistentEmailRejected = true;
    }

    // TEST 1 & 5: Company A Login & Session Context
    const sessionA = await authService.login({ email: 'adminA@example.com', password: 'Admin@123' });
    const companyAId = authService.getAuthenticatedCompanyId();
    const protectedOpCompanyA = await authService.testProtectedOperation();

    // TEST 7: Logout
    await authService.logout();
    const sessionAfterLogout = authService.getSession();

    // TEST 8: Protected operation after logout rejected
    let test8ProtectedOpAfterLogoutRejected = false;
    try {
      await authService.testProtectedOperation();
    } catch {
      test8ProtectedOpAfterLogoutRejected = true;
    }

    // TEST 2 & 6: Company B Login & Session Context
    const sessionB = await authService.login({ email: 'adminB@example.com', password: 'Admin@123' });
    const companyBId = authService.getAuthenticatedCompanyId();
    const protectedOpCompanyB = await authService.testProtectedOperation();

    // ==========================================
    // PHASE 3 TESTS — CATEGORY MANAGEMENT & ISOLATION
    // ==========================================

    // Log in as Company A Admin
    await authService.login({ email: 'adminA@example.com', password: 'Admin@123' });

    // TEST 1: Company A creates category "Artificial Jewellery"
    let categoryA = (await categoryService.listCategories()).find((c) => c.name === 'Artificial Jewellery');
    if (!categoryA) {
      categoryA = await categoryService.createCategory({
        name: 'Artificial Jewellery',
        description: 'Artificial and imitation jewellery for Company A',
      });
    }
    const test1CategoryABelongsToCompanyA = categoryA.companyId === sessionA.companyId;

    // TEST 4: Company A attempts to create duplicate "Artificial Jewellery" -> Rejected
    let test4DuplicateInCompanyARejected = false;
    try {
      await categoryService.createCategory({
        name: 'Artificial Jewellery',
        description: 'Duplicate attempt',
      });
    } catch {
      test4DuplicateInCompanyARejected = true;
    }

    // TEST 6: Logout and verify category operation without session is rejected
    await authService.logout();
    let test6UnauthenticatedCategoryOpRejected = false;
    try {
      await categoryService.listCategories();
    } catch {
      test6UnauthenticatedCategoryOpRejected = true;
    }

    // Log in as Company B Admin
    await authService.login({ email: 'adminB@example.com', password: 'Admin@123' });

    // TEST 2: Company B listing does NOT contain Company A's category ID
    const companyBCategories = await categoryService.listCategories();
    const test2CompanyBDoesNotSeeCompanyACategory = !companyBCategories.some(
      (c) => c.id === categoryA?.id
    );

    // TEST 3: Company B creates "Artificial Jewellery" -> Allowed (names unique per company)
    let categoryB = companyBCategories.find((c) => c.name === 'Artificial Jewellery');
    if (!categoryB) {
      categoryB = await categoryService.createCategory({
        name: 'Artificial Jewellery',
        description: 'Artificial jewellery for Company B',
      });
    }
    const test3CompanyBCreatesSameNameAllowed =
      Boolean(categoryB) && categoryB.companyId === sessionB.companyId && categoryB.id !== categoryA.id;

    // Log in back as Company A Admin
    await authService.login({ email: 'adminA@example.com', password: 'Admin@123' });

    // TEST 5: Company A Admin attempts to update Company B's category -> Rejected
    let test5CrossCompanyUpdateRejected = false;
    try {
      await categoryService.updateCategory(categoryB.id, {
        name: 'Hacked Category Name',
        description: 'Unauthorized modification attempt',
      });
    } catch {
      test5CrossCompanyUpdateRejected = true;
    }

    // Final clean up session
    await authService.logout();

    const rootHtmlLength = await mainWindow.webContents.executeJavaScript(
      'document.getElementById("root")?.innerHTML.length ?? 0'
    );
    const pageText = await mainWindow.webContents.executeJavaScript(
      'document.body?.innerText ?? ""'
    );

    console.log(
      'SMOKE_TEST_RESULT:' +
        JSON.stringify({
          electronLaunched: true,
          reactRendered: rootHtmlLength > 100 && pageText.includes('Retail POS Desktop'),
          rootHtmlLength,
          status,
          ping,
          phase2Tests: {
            test1LoginCompanyA: sessionA.companyCode === 'COMPANY_A' && sessionA.adminName === 'Company A Admin',
            test2LoginCompanyB: sessionB.companyCode === 'COMPANY_B' && sessionB.adminName === 'Company B Admin',
            test3WrongPasswordRejected,
            test4NonExistentEmailRejected,
            test5CompanyAIdMatches: companyAId === sessionA.companyId && protectedOpCompanyA.companyId === sessionA.companyId,
            test6CompanyBIdMatches: companyBId === sessionB.companyId && protectedOpCompanyB.companyId === sessionB.companyId,
            test7LogoutSuccess: sessionAfterLogout === null,
            test8ProtectedOpRejectedAfterLogout: test8ProtectedOpAfterLogoutRejected,
            distinctCompanyIds: sessionA.companyId !== sessionB.companyId,
          },
          phase3Tests: {
            test1CategoryABelongsToCompanyA,
            test2CompanyBDoesNotSeeCompanyACategory,
            test3CompanyBCreatesSameNameAllowed,
            test4DuplicateInCompanyARejected,
            test5CrossCompanyUpdateRejected,
            test6UnauthenticatedCategoryOpRejected,
            categoryAId: categoryA.id,
            categoryBId: categoryB.id,
            distinctCategoryIds: categoryA.id !== categoryB.id,
          },
        })
    );
    app.quit();
  }
}

app
  .whenReady()
  .then(async () => {
    await initializeDatabase();
    registerAllIpcHandlers();
    await createMainWindow();

    app.on('activate', async () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        await createMainWindow();
      }
    });
  })
  .catch((error) => {
    console.error('[MAIN PROCESS FATAL ERROR]:', error);
    app.quit();
  });

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async () => {
  await disconnectDatabase();
});
