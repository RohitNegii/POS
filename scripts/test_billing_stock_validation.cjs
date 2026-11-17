const assert = require('assert');
const { app } = require('electron');
const path = require('path');

app.whenReady().then(async () => {
  try {
    const { initializeDatabase } = require('../dist-electron/main/database/prisma.js');
    await initializeDatabase();

    const { getPrismaClient } = require('../dist-electron/main/database/prisma.js');
    const prisma = getPrismaClient();

    const { authService } = require('../dist-electron/main/services/authService.js');
    const { billingService } = require('../dist-electron/main/services/billingService.js');

    console.log('\n======================================================');
    console.log('STARTING BILLING STOCK QUANTITY & LENGTH VALIDATION TEST');
    console.log('======================================================\n');

    let passCount = 0;
    let failCount = 0;

    async function runTest(testName, fn) {
      process.stdout.write(`TEST: ${testName} ... `);
      try {
        await fn();
        console.log('PASSED');
        passCount++;
      } catch (err) {
        console.log('FAILED');
        console.error(`  -> Error: ${err.message}`);
        failCount++;
      }
    }

    // 1. Authenticate as Cashier
    await runTest('1. Authenticate as Billing Cashier', async () => {
      const loginRes = await authService.login({
        email: 'billing@example.com',
        password: 'Billing@123',
      });
      assert.strictEqual(loginRes.role, 'BILLING_USER');
    });

    const compA = await prisma.company.findUnique({ where: { code: 'COMPANY_A' } });
    const compB = await prisma.company.findUnique({ where: { code: 'COMPANY_B' } });
    const catA = await prisma.category.findFirst({ where: { companyId: compA.id } });
    const catMeterB = await prisma.category.findFirst({
      where: { companyId: compB.id, name: 'Home Décor — Meter Based' },
    });

    // Setup Test Products:
    // 1. Piece item with exactly 5 units in stock
    const testBarcodePiece = 'STK_PC_' + Date.now().toString().slice(-6);
    const prodPiece = await prisma.product.create({
      data: {
        companyId: compA.id,
        categoryId: catA.id,
        name: 'Limited Stock Silver Ring',
        barcode: testBarcodePiece,
        stockQuantity: 5,
      },
    });

    // 2. Meter item with exactly 10.5 meters in stock
    const testBarcodeMeter = 'STK_MTR_' + Date.now().toString().slice(-6);
    const prodMeter = await prisma.product.create({
      data: {
        companyId: compB.id,
        categoryId: catMeterB.id,
        name: 'Embroidered Velvet Cloth (Per Meter)',
        barcode: testBarcodeMeter,
        stockQuantity: 10.5,
      },
    });

    // 3. Out of stock item (0 units)
    const testBarcodeZero = 'STK_ZERO_' + Date.now().toString().slice(-6);
    const prodZero = await prisma.product.create({
      data: {
        companyId: compA.id,
        categoryId: catA.id,
        name: 'Sold Out Antique Pendant',
        barcode: testBarcodeZero,
        stockQuantity: 0,
      },
    });

    // TEST 2: Attempting to bill zero stock product must fail
    await runTest('2. Backend rejects billing a product with 0 stock', async () => {
      let threw = false;
      try {
        await billingService.createBill({
          items: [
            {
              productId: prodZero.id,
              companyId: compA.id,
              companyName: compA.name,
              barcode: testBarcodeZero,
              productName: prodZero.name,
              categoryName: catA.name,
              unitPrice: 500,
              quantity: 1,
            },
          ],
        });
      } catch (err) {
        threw = true;
        assert(err.message.includes('completely out of stock'), `Expected out of stock message, got: ${err.message}`);
      }
      assert.strictEqual(threw, true, 'Expected error for 0 stock product');
    });

    // TEST 3: Attempting to bill piece item exceeding available units (req 8, avail 5)
    await runTest('3. Backend rejects piece item when requested quantity exceeds available stock', async () => {
      let threw = false;
      try {
        await billingService.createBill({
          items: [
            {
              productId: prodPiece.id,
              companyId: compA.id,
              companyName: compA.name,
              barcode: testBarcodePiece,
              productName: prodPiece.name,
              categoryName: catA.name,
              unitPrice: 350,
              quantity: 8, // Requesting 8 when only 5 exist
            },
          ],
        });
      } catch (err) {
        threw = true;
        assert(err.message.includes('Insufficient stock'), `Expected insufficient stock error, got: ${err.message}`);
        assert(err.message.includes('Available in stock: 5 units'), `Expected available 5 units, got: ${err.message}`);
      }
      assert.strictEqual(threw, true, 'Must reject bill exceeding stock');

      // Verify stock in database remains untouched at 5
      const check = await prisma.product.findUnique({ where: { id: prodPiece.id } });
      assert.strictEqual(check.stockQuantity, 5);
    });

    // TEST 4: Attempting to bill meter item exceeding available length (req 12m, avail 10.5m)
    await runTest('4. Backend rejects meter item when requested length exceeds available meters', async () => {
      let threw = false;
      try {
        await billingService.createBill({
          items: [
            {
              productId: prodMeter.id,
              companyId: compB.id,
              companyName: compB.name,
              barcode: testBarcodeMeter,
              productName: prodMeter.name,
              categoryName: catMeterB.name,
              unitPrice: 400,
              quantity: 12, // Requesting 12m when only 10.5m exist
            },
          ],
        });
      } catch (err) {
        threw = true;
        assert(err.message.includes('Insufficient stock'), `Expected insufficient stock error, got: ${err.message}`);
        assert(err.message.includes('10.5 meters'), `Expected available 10.5 meters, got: ${err.message}`);
      }
      assert.strictEqual(threw, true, 'Must reject bill exceeding meter length');

      // Verify stock in database remains untouched at 10.5
      const check = await prisma.product.findUnique({ where: { id: prodMeter.id } });
      assert.strictEqual(check.stockQuantity, 10.5);
    });

    // TEST 5: Valid purchase within stock limits succeeds and decrements stock
    let validBillId = null;
    await runTest('5. Valid bill within stock limits succeeds and decrements stock accurately', async () => {
      const bill = await billingService.createBill({
        items: [
          {
            productId: prodPiece.id,
            companyId: compA.id,
            companyName: compA.name,
            barcode: testBarcodePiece,
            productName: prodPiece.name,
            categoryName: catA.name,
            unitPrice: 350,
            quantity: 3, // 3 of 5
          },
          {
            productId: prodMeter.id,
            companyId: compB.id,
            companyName: compB.name,
            barcode: testBarcodeMeter,
            productName: prodMeter.name,
            categoryName: catMeterB.name,
            unitPrice: 400,
            quantity: 4.5, // 4.5m of 10.5m
          },
        ],
      });

      validBillId = bill.id;
      assert(bill.invoiceNumber, 'Bill must have invoice number');

      // Verify new stocks
      const pieceCheck = await prisma.product.findUnique({ where: { id: prodPiece.id } });
      const meterCheck = await prisma.product.findUnique({ where: { id: prodMeter.id } });

      assert.strictEqual(pieceCheck.stockQuantity, 2, 'Piece stock must decrease from 5 to 2');
      assert.strictEqual(meterCheck.stockQuantity, 6, 'Meter stock must decrease from 10.5 to 6.0');
    });

    // TEST 6: Editing bill: increasing piece quantity by 5 more (requires 2 + 5 = 7, but only 2 available)
    await runTest('6. Editing bill to increase quantity beyond available stock is rejected', async () => {
      let threw = false;
      try {
        await billingService.updateBill(validBillId, {
          items: [
            {
              productId: prodPiece.id,
              companyId: compA.id,
              companyName: compA.name,
              barcode: testBarcodePiece,
              productName: prodPiece.name,
              categoryName: catA.name,
              unitPrice: 350,
              quantity: 8, // Previously bought 3. To reach 8, needs 5 more. But stock only has 2!
            },
            {
              productId: prodMeter.id,
              companyId: compB.id,
              companyName: compB.name,
              barcode: testBarcodeMeter,
              productName: prodMeter.name,
              categoryName: catMeterB.name,
              unitPrice: 400,
              quantity: 4.5,
            },
          ],
        });
      } catch (err) {
        threw = true;
        assert(err.message.includes('Insufficient stock to increase quantity'), `Got: ${err.message}`);
        assert(err.message.includes('Available in stock: 2 units'), `Got: ${err.message}`);
      }
      assert.strictEqual(threw, true, 'Editing bill with excess stock requirement must throw');

      // Stocks must remain intact
      const pieceCheck = await prisma.product.findUnique({ where: { id: prodPiece.id } });
      assert.strictEqual(pieceCheck.stockQuantity, 2);
    });

    // TEST 7: Editing bill: valid change (increase piece by 1, reduce meter by 1.5m)
    await runTest('7. Editing bill within available stock succeeds and reconciles inventory', async () => {
      const updated = await billingService.updateBill(validBillId, {
        items: [
          {
            productId: prodPiece.id,
            companyId: compA.id,
            companyName: compA.name,
            barcode: testBarcodePiece,
            productName: prodPiece.name,
            categoryName: catA.name,
            unitPrice: 350,
            quantity: 4, // 3 -> 4 (takes 1 more unit from stock)
          },
          {
            productId: prodMeter.id,
            companyId: compB.id,
            companyName: compB.name,
            barcode: testBarcodeMeter,
            productName: prodMeter.name,
            categoryName: catMeterB.name,
            unitPrice: 400,
            quantity: 3, // 4.5m -> 3.0m (returns 1.5m back to stock)
          },
        ],
      });

      assert.strictEqual(updated.items.length, 2);

      // Verify stock in database
      const pieceCheck = await prisma.product.findUnique({ where: { id: prodPiece.id } });
      const meterCheck = await prisma.product.findUnique({ where: { id: prodMeter.id } });

      assert.strictEqual(pieceCheck.stockQuantity, 1, 'Piece stock must decrease from 2 to 1');
      assert.strictEqual(meterCheck.stockQuantity, 7.5, 'Meter stock must increase from 6.0 to 7.5');
    });

    console.log(`\n======================================================`);
    console.log(`RESULTS: ${passCount} PASSED, ${failCount} FAILED`);
    console.log('======================================================\n');

    process.exit(failCount === 0 ? 0 : 1);
  } catch (fatal) {
    console.error('Fatal test error:', fatal);
    process.exit(1);
  }
});
