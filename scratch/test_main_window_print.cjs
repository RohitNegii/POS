const { app, BrowserWindow } = require('electron');
const fs = require('fs');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 800,
  });

  // Load standard POS HTML structure with index.css
  const indexCss = fs.readFileSync('src/renderer/index.css', 'utf8');
  
  const testHtml = `
<!DOCTYPE html>
<html>
<head>
  <style>
    ${indexCss}
  </style>
</head>
<body class="printing-barcode">
  <div id="root">
    <div style="height: 1000px; background: red;">Main POS App Content</div>
  </div>
  <div id="printable-barcode-slip">
    <div class="barcode-label-page" style="width: 50mm; height: 25mm; border: 1px solid black;">
      Label 1
    </div>
  </div>
</body>
</html>
  `;

  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(testHtml)}`);
  await new Promise((r) => setTimeout(r, 500));

  const pdf = await win.webContents.printToPDF({
    pageSize: 'Letter',
    printBackground: true,
  });

  fs.writeFileSync('scratch/test_main_window.pdf', pdf);
  const pdfText = pdf.toString('utf8');
  const pages = pdfText.match(/\/Type\s*\/Page[^s]/g);
  console.log('Main window print page count:', pages ? pages.length : 0);

  app.quit();
});
