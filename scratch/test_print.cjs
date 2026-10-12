const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

app.whenReady().then(async () => {
  const printWin = new BrowserWindow({
    show: false,
    width: 800,
    height: 600,
    backgroundColor: '#ffffff',
    webPreferences: {
      sandbox: true,
    },
  });

  const effectiveWidthMm = 50;
  const effectiveHeightMm = 25;
  const verticalPaddingMm = 1.0;
  const horizontalPaddingMm = 1.5;

  const slipHtml = `
    <style>
      @media print {
        @page {
          size: ${effectiveWidthMm}mm ${effectiveHeightMm}mm;
          margin: 0mm !important;
        }
        html, body {
          margin: 0 !important;
          padding: 0 !important;
          width: ${effectiveWidthMm}mm !important;
          height: auto !important;
          overflow: visible !important;
          background: #ffffff !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        .barcode-label-page {
          width: ${effectiveWidthMm}mm !important;
          height: ${effectiveHeightMm}mm !important;
          max-height: ${effectiveHeightMm}mm !important;
          page-break-after: always !important;
          break-after: page !important;
          page-break-inside: avoid !important;
          break-inside: avoid !important;
          box-sizing: border-box !important;
          margin: 0 auto !important;
          padding: ${verticalPaddingMm}mm ${horizontalPaddingMm}mm !important;
          display: flex !important;
          flex-direction: column !important;
          justify-content: space-between !important;
          align-items: center !important;
          text-align: center !important;
          overflow: hidden !important;
          background: #ffffff !important;
          color: #000000 !important;
        }
        .barcode-label-page:last-child {
          page-break-after: auto !important;
          break-after: auto !important;
        }
      }
    </style>
    <div class="barcode-label-page">
      <div style="width: 100%; text-align: center; line-height: 1.1; overflow: hidden;">
        <div style="font-size: 7pt; font-weight: bold; color: #000000; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
          Gold Ring
        </div>
      </div>
      <div style="width: 100%; display: flex; align-items: center; justify-content: center; flex: 1; min-height: 0; margin: 0.5mm 0; overflow: hidden;">
        <div class="flex items-center justify-center w-full max-w-full overflow-hidden ">
          <svg width="134" height="40" viewBox="0 0 134 40" style="width: 100%; max-width: 100%; height: auto; display: block;">
            <rect x="0" y="0" width="134" height="40" fill="#ffffff"/>
            <rect x="10" y="5" width="2" height="25" fill="#000000"/>
            <rect x="15" y="5" width="4" height="25" fill="#000000"/>
            <rect x="22" y="5" width="1" height="25" fill="#000000"/>
            <rect x="26" y="5" width="3" height="25" fill="#000000"/>
            <text x="67" y="38" text-anchor="middle" font-family="monospace" font-size="9" fill="#000000">12345678</text>
          </svg>
        </div>
      </div>
      <div style="width: 100%; display: flex; align-items: center; justify-content: space-between; font-size: 7pt; line-height: 1.1; padding-top: 0.4mm; border-top: 0.5pt solid #000000; box-sizing: border-box; overflow: hidden;">
        <div style="font-weight: bold; color: #000000;">Rs 15,000</div>
        <div style="font-family: monospace; font-weight: bold; color: #000000;">12345678</div>
      </div>
    </div>
  `;

  const fullHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Barcode Labels</title>
  <style>
    @page {
      size: ${effectiveWidthMm}mm ${effectiveHeightMm}mm;
      margin: 0mm !important;
    }
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      width: ${effectiveWidthMm}mm !important;
      height: auto !important;
      min-height: 0 !important;
      overflow: visible !important;
      background: #ffffff !important;
      background-color: #ffffff !important;
      color: #000000 !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      font-family: Arial, sans-serif;
    }
    * {
      box-sizing: border-box !important;
    }
    .barcode-label-page {
      width: ${effectiveWidthMm}mm !important;
      height: ${effectiveHeightMm}mm !important;
      max-height: ${effectiveHeightMm}mm !important;
      page-break-after: always !important;
      break-after: page !important;
      page-break-inside: avoid !important;
      break-inside: avoid !important;
      box-sizing: border-box !important;
      margin: 0 auto !important;
      padding: ${verticalPaddingMm}mm ${horizontalPaddingMm}mm !important;
      display: flex !important;
      flex-direction: column !important;
      justify-content: space-between !important;
      align-items: center !important;
      text-align: center !important;
      overflow: hidden !important;
      background: #ffffff !important;
      background-color: #ffffff !important;
      color: #000000 !important;
    }
    .barcode-label-page:last-child {
      page-break-after: auto !important;
      break-after: auto !important;
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background: #ffffff; background-color: #ffffff;">
  ${slipHtml}
</body>
</html>
  `;

  await printWin.loadURL('about:blank');
  const escapedHtml = fullHtml
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$/g, '\\$');

  await printWin.webContents.executeJavaScript(
    `document.open(); document.write(\`${escapedHtml}\`); document.close();`
  );

  await new Promise((r) => setTimeout(r, 400));

  // Check document innerHTML in printWin
  const pageContent = await printWin.webContents.executeJavaScript(
    `({ html: document.documentElement.outerHTML, bodyHeight: document.body.scrollHeight, childCount: document.body.children.length })`
  );
  console.log('PRINT WIN CONTENT INFO:', JSON.stringify(pageContent, null, 2));

  // Let's print to PDF using Letter page size (what MS Print to PDF does)
  const pdfBufferLetter = await printWin.webContents.printToPDF({
    pageSize: 'Letter',
    margins: { marginType: 'none' },
    printBackground: true,
  });
  console.log('PDF Letter size in bytes:', pdfBufferLetter.length);
  fs.writeFileSync('scratch/output_letter.pdf', pdfBufferLetter);

  // Let's also print to PDF using custom pageSize
  const pdfBufferCustom = await printWin.webContents.printToPDF({
    pageSize: {
      width: 50 * 1000,
      height: 25 * 1000,
    },
    margins: { marginType: 'none' },
    printBackground: true,
  });
  console.log('PDF Custom size in bytes:', pdfBufferCustom.length);
  fs.writeFileSync('scratch/output_custom.pdf', pdfBufferCustom);

  app.quit();
});
