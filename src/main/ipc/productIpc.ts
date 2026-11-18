import { ipcMain, BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../shared/constants/ipcChannels';
import type {
  CreateProductRequest,
  IpcResult,
  ListProductsFilter,
  PrintBarcodeOptions,
  ProductDto,
  UpdateProductRequest,
} from '../../shared/types/ipc';
import { productService } from '../services/productService';

/**
 * Registers IPC handlers for company-scoped product management.
 * Strictly enforces authentication and company isolation on all operations.
 */
export function registerProductIpcHandlers(): void {
  // List Products
  ipcMain.removeHandler(IPC_CHANNELS.PRODUCT_LIST);
  ipcMain.handle(
    IPC_CHANNELS.PRODUCT_LIST,
    async (
      _event,
      options?: ListProductsFilter
    ): Promise<IpcResult<ProductDto[]>> => {
      try {
        const products = await productService.listProducts(options);
        return { success: true, data: products };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to list products.';
        return { success: false, error: message };
      }
    }
  );

  // Get Product by ID
  ipcMain.removeHandler(IPC_CHANNELS.PRODUCT_GET_BY_ID);
  ipcMain.handle(
    IPC_CHANNELS.PRODUCT_GET_BY_ID,
    async (
      _event,
      id: string
    ): Promise<IpcResult<ProductDto>> => {
      try {
        const product = await productService.getProductById(id, true);
        return { success: true, data: product };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to get product.';
        return { success: false, error: message };
      }
    }
  );

  // Create Product
  ipcMain.removeHandler(IPC_CHANNELS.PRODUCT_CREATE);
  ipcMain.handle(
    IPC_CHANNELS.PRODUCT_CREATE,
    async (
      _event,
      input: CreateProductRequest
    ): Promise<IpcResult<ProductDto>> => {
      try {
        const product = await productService.createProduct(input);
        return { success: true, data: product };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to create product.';
        return { success: false, error: message };
      }
    }
  );

  // Update Product
  ipcMain.removeHandler(IPC_CHANNELS.PRODUCT_UPDATE);
  ipcMain.handle(
    IPC_CHANNELS.PRODUCT_UPDATE,
    async (
      _event,
      input: UpdateProductRequest
    ): Promise<IpcResult<ProductDto>> => {
      try {
        const product = await productService.updateProduct(input);
        return { success: true, data: product };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to update product.';
        return { success: false, error: message };
      }
    }
  );

  // Generate Barcode Preview / Sequence
  ipcMain.removeHandler(IPC_CHANNELS.PRODUCT_GENERATE_BARCODE);
  ipcMain.handle(
    IPC_CHANNELS.PRODUCT_GENERATE_BARCODE,
    async (
      _event,
      input: { productName: string; categoryName: string; existingBarcodes?: string[] }
    ): Promise<IpcResult<string>> => {
      try {
        const barcode = await productService.generatePermanentBarcode(
          input.productName,
          input.categoryName,
          undefined,
          undefined,
          input.existingBarcodes
        );
        return { success: true, data: barcode };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to generate barcode.';
        return { success: false, error: message };
      }
    }
  );

  // Delete Product Permanently
  ipcMain.removeHandler(IPC_CHANNELS.PRODUCT_DELETE);
  ipcMain.handle(
    IPC_CHANNELS.PRODUCT_DELETE,
    async (
      _event,
      id: string
    ): Promise<IpcResult<{ id: string }>> => {
      try {
        const result = await productService.deleteProduct(id);
        return { success: true, data: result };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to delete product.';
        return { success: false, error: message };
      }
    }
  );

  // Print Barcode via clean isolated offscreen window (Zero backdrop / Zero black leak)
  ipcMain.removeHandler(IPC_CHANNELS.PRODUCT_PRINT_BARCODE);
  ipcMain.handle(
    IPC_CHANNELS.PRODUCT_PRINT_BARCODE,
    async (
      _event,
      input: string | PrintBarcodeOptions | { html: string; widthMm: number; heightMm: number }
    ): Promise<IpcResult<{ printed: boolean }>> => {
      let printWin: BrowserWindow | null = null;
      try {
        let htmlToPrint = '';
        let targetWidthMm = 50;
        let targetHeightMm = 25;
        let deviceName: string | undefined = undefined;
        let copies = 1;
        let silent = false;
        let landscape = false;

        if (typeof input === 'string') {
          const prod = await productService.getProductById(input);
          targetWidthMm = 50;
          targetHeightMm = 25;
          htmlToPrint = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Barcode Label</title>
  <style>
    @page { size: 50mm 25mm; margin: 0; }
    html, body { margin: 0; padding: 0; background: #ffffff; color: #000000; font-family: Arial, sans-serif; }
    .label { width: 50mm; height: 25mm; box-sizing: border-box; padding: 1mm 1.5mm; display: flex; flex-direction: column; justify-content: space-between; align-items: center; text-align: center; }
  </style>
</head>
<body>
  <div class="label">
    <div style="font-size: 7.5pt; font-weight: bold; overflow: hidden; white-space: nowrap;">${prod.name}</div>
    <div style="font-family: monospace; font-size: 10pt; font-weight: bold; letter-spacing: 2px;">*${prod.barcode}*</div>
    <div style="font-size: 7.5pt; font-weight: bold;">${prod.barcode}</div>
  </div>
</body>
</html>
          `;
        } else {
          htmlToPrint = input.html;
          targetWidthMm = input.widthMm || 50;
          targetHeightMm = input.heightMm || 25;
          if ('deviceName' in input && input.deviceName) {
            deviceName = input.deviceName.trim() || undefined;
          }
          if ('copies' in input && input.copies && input.copies > 0) {
            copies = Math.round(input.copies);
          }
          if ('silent' in input && typeof input.silent === 'boolean') {
            silent = input.silent;
          } else {
            // When a specific printer device is chosen, print directly (silent: true).
            // If no printer device was chosen, open the Windows OS print dialog (silent: false).
            silent = Boolean(deviceName);
          }
          if ('landscape' in input && typeof input.landscape === 'boolean') {
            landscape = input.landscape;
          }
        }

        printWin = new BrowserWindow({
          show: false,
          width: 800,
          height: 600,
          backgroundColor: '#ffffff',
          webPreferences: {
            sandbox: true,
          },
        });

        // Load about:blank first, then inject HTML via document.write().
        // This avoids data:text/html URL issues that cause "App not supported"
        // errors on Windows and unreliable rendering of embedded SVGs.
        await printWin.loadURL('about:blank');

        // Inject the full HTML document into the blank page
        const escapedHtml = htmlToPrint
          .replace(/\\/g, '\\\\')
          .replace(/`/g, '\\`')
          .replace(/\$/g, '\\$');

        await printWin.webContents.executeJavaScript(
          `document.open(); document.write(\`${escapedHtml}\`); document.close();`
        );

        // Wait for the injected content to fully render (SVGs, layout, fonts)
        await new Promise((resolve) => setTimeout(resolve, 450));

        return await new Promise<IpcResult<{ printed: boolean }>>((resolve) => {
          if (!printWin) {
            resolve({ success: false, error: 'Print window failed to initialize' });
            return;
          }

          const printOptions: any = {
            silent,
            printBackground: true,
            pageSize: {
              width: Math.round(targetWidthMm * 1000), // microns
              height: Math.round(targetHeightMm * 1000),
            },
            margins: { marginType: 'none' },
            landscape,
          };

          if (deviceName) {
            printOptions.deviceName = deviceName;
          }
          if (copies && copies > 0) {
            printOptions.copies = copies;
          }

          printWin.webContents.print(
            printOptions,
            (success, failureReason) => {
              // Delay window close to ensure the Windows print spooler
              // has completely finished writing the rendered content
              setTimeout(() => {
                if (printWin) {
                  try {
                    printWin.close();
                  } catch {
                    // Window may already be destroyed
                  }
                  printWin = null;
                }
              }, 4000);

              if (!success) {
                if (failureReason === 'cancelled') {
                  resolve({ success: true, data: { printed: false } });
                } else {
                  resolve({
                    success: false,
                    error: failureReason ? `Printer error: ${failureReason}` : 'Printer offline or unable to print label.',
                  });
                }
              } else {
                resolve({ success: true, data: { printed: true } });
              }
            }
          );
        });
      } catch (error) {
        if (printWin) {
          try {
            printWin.close();
          } catch {
            // ignore
          }
        }
        const message =
          error instanceof Error ? error.message : 'Failed to print barcode.';
        return { success: false, error: message };
      }
    }
  );
}
