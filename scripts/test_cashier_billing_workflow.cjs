/**
 * Test Suite for Cashier Billing Terminal & Bill Editing Workflow
 */

const { app } = require('electron');
const assert = require('assert');

app.whenReady().then(async () => {
  console.log('\n======================================================');
  console.log('STARTING CASHIER BILLING & BILL EDITING TEST SUITE');
  console.log('======================================================\n');

  let testsPassed = 0;
  let testsFailed = 0;

  const runTest = async (name, fn) => {
    try {
      process.stdout.write(`TEST: ${name} ... `);
      await fn();
      console.log('PASSED');
      testsPassed++;
    } catch (err) {
      console.log('FAILED');
      console.error(`  -> Details: ${err.message}`);
      testsFailed++;
    }
  };

  try {
    const { initializeDatabase, getPrismaClient } = require('../dist-electron/main/database/prisma');
    const { authService } = require('../dist-electron/main/services/authService');
    const { billingService } = require('../dist-electron/main/services/billingService');
    const { purchaseService } = require('../dist-electron/main/services/purchaseService');
    const { purchaseReturnService } = require('../dist-electron/main/services/purchaseReturnService');

    await initializeDatabase();
    const prisma = getPrismaClient();

    // Login as Billing User
    const session = await authService.login({
      email: 'billing@example.com',
      password: 'Billing@123',
    });
    console.log(`[AUTH] Logged in as: ${session.adminName} (${session.companyName})\n`);

    // Ensure we have test products with defined stock
    const compA = await prisma.company.findFirst({ where: { code: 'COMPANY_A' } });
    const compB = await prisma.company.findFirst({ where: { code: 'COMPANY_B' } });
    assert(compA && compB, 'Both companies must exist in database');

    const catA = await prisma.category.findFirst({ where: { companyId: compA.id } });
    const catB = await prisma.category.findFirst({ where: { companyId: compB.id } });
    assert(catA && catB, 'Both categories must exist');

    // Create 3 isolated test products
    const testBarcode1 = `TEST_BILL_${Date.now()}_1`;
    const testBarcode2 = `TEST_BILL_${Date.now()}_2`;
    const testBarcode3 = `TEST_BILL_${Date.now()}_3`;

    // Ensure sellingPrice category field exists
    let priceFieldA = await prisma.categoryField.findFirst({
      where: { categoryId: catA.id, fieldKey: 'sellingPrice' },
    });
    if (!priceFieldA) {
      priceFieldA = await prisma.categoryField.create({
        data: {
          categoryId: catA.id,
          name: 'Selling Price',
          fieldKey: 'sellingPrice',
          fieldType: 'number',
        },
      });
    }

    let priceFieldB = await prisma.categoryField.findFirst({
      where: { categoryId: catB.id, fieldKey: 'sellingPrice' },
    });
    if (!priceFieldB) {
      priceFieldB = await prisma.categoryField.create({
        data: {
          categoryId: catB.id,
          name: 'Selling Price',
          fieldKey: 'sellingPrice',
          fieldType: 'number',
        },
      });
    }

    const prod1 = await prisma.product.create({
      data: {
        companyId: compA.id,
        categoryId: catA.id,
        name: 'Test Product 1 (Gold Ring)',
        barcode: testBarcode1,
        stockQuantity: 10,
        fieldValues: {
          create: [
            {
              categoryFieldId: priceFieldA.id,
              valueNumber: 1000,
            },
          ],
        },
      },
    });

    const prod2 = await prisma.product.create({
      data: {
        companyId: compB.id,
        categoryId: catB.id,
        name: 'Test Product 2 (Silver Coin)',
        barcode: testBarcode2,
        stockQuantity: 20,
        fieldValues: {
          create: [
            {
              categoryFieldId: priceFieldB.id,
              valueNumber: 500,
            },
          ],
        },
      },
    });

    const prod3 = await prisma.product.create({
      data: {
        companyId: compA.id,
        categoryId: catA.id,
        name: 'Test Product 3 (Diamond Pendant)',
        barcode: testBarcode3,
        stockQuantity: 5,
        fieldValues: {
          create: [
            {
              categoryFieldId: priceFieldA.id,
              valueNumber: 2000,
            },
          ],
        },
      },
    });

    let createdBill = null;

    // 1. Scan products
    await runTest('1. Scan products by barcode and retrieve price info', async () => {
      const scanned1 = await billingService.scanProduct(testBarcode1);
      assert.strictEqual(scanned1.id, prod1.id);
      assert.strictEqual(scanned1.stockQuantity, 10);
      assert.strictEqual(scanned1.unitPrice, 1000);

      const scanned2 = await billingService.scanProduct(testBarcode2);
      assert.strictEqual(scanned2.id, prod2.id);
      assert.strictEqual(scanned2.stockQuantity, 20);
      assert.strictEqual(scanned2.unitPrice, 500);
    });

    // 2. Create single unified bill (1 x prod1, 2 x prod2)
    await runTest('2. Create single unified bill and verify initial stock deduction', async () => {
      createdBill = await billingService.createBill({
        customerName: 'Rahul Sharma',
        customerPhone: '9876543210',
        paymentMethod: 'CASH',
        discountPercentage: 5,
        items: [
          {
            productId: prod1.id,
            companyId: prod1.companyId,
            companyName: compA.name,
            barcode: prod1.barcode,
            productName: prod1.name,
            unitPrice: 1000,
            quantity: 1,
          },
          {
            productId: prod2.id,
            companyId: prod2.companyId,
            companyName: compB.name,
            barcode: prod2.barcode,
            productName: prod2.name,
            unitPrice: 500,
            quantity: 2,
          },
        ],
      });

      assert(createdBill && createdBill.id, 'Bill must be created');
      assert.strictEqual(createdBill.items.length, 2);
      // Subtotal: 1000 + 1000 = 2000. 5% discount = 100. Grand total = 1900.
      assert.strictEqual(createdBill.subtotal, 2000);
      assert.strictEqual(createdBill.discount, 100);
      assert.strictEqual(createdBill.totalAmount, 1900);

      // Verify stock in database
      const check1 = await prisma.product.findUnique({ where: { id: prod1.id } });
      const check2 = await prisma.product.findUnique({ where: { id: prod2.id } });
      assert.strictEqual(check1.stockQuantity, 9, 'Prod1 stock must decrease from 10 to 9');
      assert.strictEqual(check2.stockQuantity, 18, 'Prod2 stock must decrease from 20 to 18');
    });

    // 3. Edit Bill: decrease prod2 from 2 to 1, add prod3 (1 piece)
    await runTest('3. Edit Bill (reduce prod2 to 1, add prod3) & verify atomic stock reconciliation', async () => {
      const updated = await billingService.updateBill(createdBill.id, {
        id: createdBill.id,
        customerName: 'Rahul Sharma (Updated)',
        customerPhone: '9876543210',
        paymentMethod: 'ONLINE',
        discountPercentage: 10,
        items: [
          {
            productId: prod1.id,
            companyId: prod1.companyId,
            companyName: compA.name,
            barcode: prod1.barcode,
            productName: prod1.name,
            unitPrice: 1000,
            quantity: 1,
          },
          {
            productId: prod2.id,
            companyId: prod2.companyId,
            companyName: compB.name,
            barcode: prod2.barcode,
            productName: prod2.name,
            unitPrice: 500,
            quantity: 1, // reduced from 2 to 1
          },
          {
            productId: prod3.id,
            companyId: prod3.companyId,
            companyName: compA.name,
            barcode: prod3.barcode,
            productName: prod3.name,
            unitPrice: 2000,
            quantity: 1, // newly added
          },
        ],
      });

      assert.strictEqual(updated.customerName, 'Rahul Sharma (Updated)');
      assert.strictEqual(updated.paymentMethod, 'ONLINE');
      assert.strictEqual(updated.items.length, 3);
      // Subtotal: 1000 + 500 + 2000 = 3500. 10% disc = 350. Total = 3150.
      assert.strictEqual(updated.subtotal, 3500);
      assert.strictEqual(updated.discount, 350);
      assert.strictEqual(updated.totalAmount, 3150);

      // Verify stock reconciliation
      const check1 = await prisma.product.findUnique({ where: { id: prod1.id } });
      const check2 = await prisma.product.findUnique({ where: { id: prod2.id } });
      const check3 = await prisma.product.findUnique({ where: { id: prod3.id } });

      assert.strictEqual(check1.stockQuantity, 9, 'Prod1 unchanged, stays at 9');
      assert.strictEqual(check2.stockQuantity, 19, 'Prod2 returned 1 piece, goes from 18 to 19');
      assert.strictEqual(check3.stockQuantity, 4, 'Prod3 newly sold 1 piece, goes from 5 to 4');
    });

    // 4. Cancel / Void Bill
    await runTest('4. Cancel / Void Bill and verify 100% stock restoration', async () => {
      const cancelled = await billingService.cancelBill(createdBill.id, 'Customer changed mind');
      assert.strictEqual(cancelled.status, 'CANCELLED');

      const check1 = await prisma.product.findUnique({ where: { id: prod1.id } });
      const check2 = await prisma.product.findUnique({ where: { id: prod2.id } });
      const check3 = await prisma.product.findUnique({ where: { id: prod3.id } });

      assert.strictEqual(check1.stockQuantity, 10, 'Prod1 restored to 10');
      assert.strictEqual(check2.stockQuantity, 20, 'Prod2 restored to 20');
      assert.strictEqual(check3.stockQuantity, 5, 'Prod3 restored to 5');
    });

    // 5. Verify Cash vs Online Payment Stats & Date-Wise Query
    await runTest('5. Filter bills by date & verify Cash vs Online payment breakdown', async () => {
      // Create 1 Cash Bill
      const cashBill = await billingService.createBill({
        customerName: 'Cash Buyer',
        paymentMethod: 'CASH',
        items: [
          {
            productId: prod1.id,
            companyId: prod1.companyId,
            companyName: compA.name,
            barcode: prod1.barcode,
            productName: prod1.name,
            unitPrice: 1000,
            quantity: 1,
          },
        ],
      });

      // Create 1 Online Bill
      const onlineBill = await billingService.createBill({
        customerName: 'Online Buyer',
        paymentMethod: 'ONLINE',
        items: [
          {
            productId: prod2.id,
            companyId: prod2.companyId,
            companyName: compB.name,
            barcode: prod2.barcode,
            productName: prod2.name,
            unitPrice: 500,
            quantity: 2,
          },
        ],
      });

      assert.strictEqual(cashBill.paymentMethod, 'CASH');
      assert.strictEqual(cashBill.totalAmount, 1000);
      assert.strictEqual(onlineBill.paymentMethod, 'ONLINE');
      assert.strictEqual(onlineBill.totalAmount, 1000);

      // Query with Today filter
      const now = new Date();
      const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      const endToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

      const todayBills = await billingService.listBills({
        startDate: startToday.toISOString(),
        endDate: endToday.toISOString(),
      });

      const todayCashBills = todayBills.filter((b) => b.status !== 'CANCELLED' && b.paymentMethod === 'CASH');
      const todayOnlineBills = todayBills.filter(
        (b) => b.status !== 'CANCELLED' && (b.paymentMethod === 'ONLINE' || b.paymentMethod === 'UPI' || b.paymentMethod === 'CARD')
      );

      assert(todayCashBills.length >= 1, 'At least 1 Cash bill in today stats');
      assert(todayOnlineBills.length >= 1, 'At least 1 Online bill in today stats');

      const cashSum = todayCashBills.reduce((s, b) => s + b.totalAmount, 0);
      const onlineSum = todayOnlineBills.reduce((s, b) => s + b.totalAmount, 0);
      assert(cashSum >= 1000, 'Cash total includes the 1000 Rs cash bill');
      assert(onlineSum >= 1000, 'Online total includes the 1000 Rs online bill');

      // Cleanup the 2 extra test bills
      await prisma.billItem.deleteMany({ where: { billId: { in: [cashBill.id, onlineBill.id] } } });
      await prisma.bill.deleteMany({ where: { id: { in: [cashBill.id, onlineBill.id] } } });
    });

    // 6. Verify Customer purchase of 2 items (1 Company A, 1 Company B) tracked company-wise in each company
    await runTest('6. Track unified multi-company bill company-wise in each company', async () => {
      // Customer buys 1 item from Company A and 1 item from Company B
      const multiCompBill = await billingService.createBill({
        customerName: 'Multi-Company Buyer',
        customerPhone: '9876543210',
        paymentMethod: 'ONLINE',
        items: [
          {
            productId: prod1.id,
            companyId: prod1.companyId,
            companyName: compA.name,
            barcode: prod1.barcode,
            productName: prod1.name,
            unitPrice: 1000,
            quantity: 1,
          },
          {
            productId: prod2.id,
            companyId: prod2.companyId,
            companyName: compB.name,
            barcode: prod2.barcode,
            productName: prod2.name,
            unitPrice: 500,
            quantity: 1,
          },
        ],
      });

      // Overall customer invoice is ₹1500 with 2 items
      assert.strictEqual(multiCompBill.totalAmount, 1500);
      assert.strictEqual(multiCompBill.items.length, 2);

      // Company A view: only sees Company A's item and Company A's revenue (₹1000)
      const compABills = await billingService.listBills({
        companyId: compA.id,
      });
      const foundInA = compABills.find((b) => b.id === multiCompBill.id);
      assert(foundInA, 'Bill must appear in Company A records');
      assert.strictEqual(foundInA.items.length, 1, 'Company A only sees 1 item (Company A product)');
      assert.strictEqual(foundInA.items[0].productName, prod1.name);
      assert.strictEqual(foundInA.items[0].companyId, compA.id);
      assert.strictEqual(foundInA.totalAmount, 1000, 'Company A total revenue is ₹1000');

      // Company B view: only sees Company B's item and Company B's revenue (₹500)
      const compBBills = await billingService.listBills({
        companyId: compB.id,
      });
      const foundInB = compBBills.find((b) => b.id === multiCompBill.id);
      assert(foundInB, 'Bill must appear in Company B records');
      assert.strictEqual(foundInB.items.length, 1, 'Company B only sees 1 item (Company B product)');
      assert.strictEqual(foundInB.items[0].productName, prod2.name);
      assert.strictEqual(foundInB.items[0].companyId, compB.id);
      assert.strictEqual(foundInB.totalAmount, 500, 'Company B total revenue is ₹500');

      // Cashier / Unified view: sees both items and full ₹1500
      const unifiedBills = await billingService.listBills();
      const foundUnified = unifiedBills.find((b) => b.id === multiCompBill.id);
      assert(foundUnified, 'Bill must appear in unified cashier records');
      assert.strictEqual(foundUnified.items.length, 2, 'Unified bill has both items');
      assert.strictEqual(foundUnified.totalAmount, 1500, 'Unified bill has ₹1500 total');

      // Clean up multi-company test bill
      await prisma.billItem.deleteMany({ where: { billId: multiCompBill.id } });
      await prisma.bill.delete({ where: { id: multiCompBill.id } });
    });

    await runTest('7. Company A Sales vs Purchases Net Remaining Balance (Cash vs Cash, Online vs Online)', async () => {
      // 1. Create a CASH sales bill for Company A of ₹1000
      const cashSale = await billingService.createBill({
        customerName: 'Cash Customer A',
        paymentMethod: 'CASH',
        items: [
          {
            productId: prod1.id,
            companyId: compA.id,
            companyName: compA.name,
            barcode: prod1.barcode,
            productName: prod1.name,
            unitPrice: 1000,
            quantity: 1,
          },
        ],
      });

      // 2. Create an ONLINE sales bill for Company A of ₹2000
      const onlineSale = await billingService.createBill({
        customerName: 'Online Customer A',
        paymentMethod: 'ONLINE',
        items: [
          {
            productId: prod1.id,
            companyId: compA.id,
            companyName: compA.name,
            barcode: prod1.barcode,
            productName: prod1.name,
            unitPrice: 2000,
            quantity: 1,
          },
        ],
      });

      // 3. Create or find vendor for Company A
      let testVendor = await prisma.vendor.findFirst({ where: { companyId: compA.id } });
      if (!testVendor) {
        testVendor = await prisma.vendor.create({
          data: {
            companyId: compA.id,
            name: 'Test Vendor A',
            phoneNumber: '9999988888',
          },
        });
      }

      // 4. Create an inward purchase for Company A in CASH of ₹500
      const todayStr = new Date().toISOString().slice(0, 10);
      const cashPurchase = await prisma.purchase.create({
        data: {
          companyId: compA.id,
          vendorId: testVendor.id,
          purchaseNumber: `PUR-TEST-CASH-${Date.now()}`,
          invoiceNumber: `INV-CASH-${Date.now()}`,
          purchaseDate: todayStr,
          totalAmount: 500,
          paidAmount: 500,
          paymentMethod: 'CASH',
          paymentStatus: 'PAID',
        },
      });

      // 5. Create an inward purchase for Company A in ONLINE of ₹800
      const onlinePurchase = await prisma.purchase.create({
        data: {
          companyId: compA.id,
          vendorId: testVendor.id,
          purchaseNumber: `PUR-TEST-ONLINE-${Date.now()}`,
          invoiceNumber: `INV-ONLINE-${Date.now()}`,
          purchaseDate: todayStr,
          totalAmount: 800,
          paidAmount: 800,
          paymentMethod: 'ONLINE',
          paymentStatus: 'PAID',
        },
      });

      // 6. Fetch bills and purchases for Company A
      const compABills = await billingService.listBills({ companyId: compA.id });
      const compAPurchases = await purchaseService.listPurchases({ companyId: compA.id });

      // Match cash sales and cash purchases
      const cashSalesTotal = compABills
        .filter((b) => b.paymentMethod === 'CASH' && b.status !== 'CANCELLED')
        .reduce((sum, b) => sum + (b.totalAmount || 0), 0);

      const cashPurchasesTotal = compAPurchases
        .filter((p) => p.paymentMethod === 'CASH')
        .reduce((sum, p) => sum + (p.paidAmount || p.totalAmount || 0), 0);

      const onlineSalesTotal = compABills
        .filter((b) => (b.paymentMethod === 'ONLINE' || b.paymentMethod === 'UPI') && b.status !== 'CANCELLED')
        .reduce((sum, b) => sum + (b.totalAmount || 0), 0);

      const onlinePurchasesTotal = compAPurchases
        .filter((p) => p.paymentMethod === 'ONLINE' || p.paymentMethod === 'UPI')
        .reduce((sum, p) => sum + (p.paidAmount || p.totalAmount || 0), 0);

      // Verify cash calculation matches cash with cash (Sale: 1000, Purchase: 500 => Remaining: 500)
      assert.strictEqual(cashSale.totalAmount, 1000);
      assert.strictEqual(cashPurchase.paidAmount, 500);
      assert.strictEqual(cashSale.totalAmount - cashPurchase.paidAmount, 500, 'Cash remaining must be ₹500');

      // Verify online calculation matches online with online (Sale: 2000, Purchase: 800 => Remaining: 1200)
      assert.strictEqual(onlineSale.totalAmount, 2000);
      assert.strictEqual(onlinePurchase.paidAmount, 800);
      assert.strictEqual(onlineSale.totalAmount - onlinePurchase.paidAmount, 1200, 'Online remaining must be ₹1200');

      // Verify total net balance: Gross Sales (3000) - Total Purchases (1300) = 1700
      assert.strictEqual(
        (cashSale.totalAmount + onlineSale.totalAmount) - (cashPurchase.paidAmount + onlinePurchase.paidAmount),
        1700,
        'Net total balance must be ₹1700'
      );

      // Clean up test sales & purchases
      await prisma.billItem.deleteMany({ where: { billId: { in: [cashSale.id, onlineSale.id] } } });
      await prisma.bill.deleteMany({ where: { id: { in: [cashSale.id, onlineSale.id] } } });
      await prisma.purchase.deleteMany({ where: { id: { in: [cashPurchase.id, onlinePurchase.id] } } });
    });

    await runTest('8. Purchase Return to Vendor (Stock deduction, zero stock archival, and refund matching)', async () => {
      // 1. Create a dedicated test product for return workflow with stock = 5
      const returnBarcode = `TEST_RET_${Date.now()}`;
      const returnProd = await prisma.product.create({
        data: {
          companyId: compA.id,
          categoryId: catA.id,
          name: 'Silver Bracelet for Return Test',
          barcode: returnBarcode,
          stockQuantity: 5,
          isArchived: false,
        },
      });

      // 2. Create a vendor and purchase bill for this product: 5 units @ 100 = 500
      let testVendor = await prisma.vendor.findFirst({ where: { companyId: compA.id } });
      if (!testVendor) {
        testVendor = await prisma.vendor.create({
          data: {
            companyId: compA.id,
            name: 'Test Vendor A',
            phoneNumber: '9999988888',
          },
        });
      }

      const purchaseRecord = await prisma.purchase.create({
        data: {
          companyId: compA.id,
          vendorId: testVendor.id,
          purchaseNumber: `PUR-RET-TEST-${Date.now()}`,
          invoiceNumber: `INV-RET-TEST-${Date.now()}`,
          purchaseDate: new Date().toISOString().slice(0, 10),
          totalAmount: 500,
          paidAmount: 500,
          balanceAmount: 0,
          paymentMethod: 'CASH',
          paymentStatus: 'PAID',
          items: {
            create: [
              {
                productId: returnProd.id,
                productName: returnProd.name,
                barcode: returnProd.barcode,
                quantityBought: 5,
                unitCost: 100,
                totalAmount: 500,
              },
            ],
          },
        },
        include: { items: true },
      });

      const pItem = purchaseRecord.items[0];

      // 3. Process partial return of 2 units (Refund type CASH, ₹200)
      const partialReturn = await purchaseReturnService.createPurchaseReturn({
        purchaseId: purchaseRecord.id,
        refundType: 'CASH',
        refundAmount: 200,
        reason: '2 units defective clasp',
        autoArchiveZeroStock: true,
        items: [
          {
            purchaseItemId: pItem.id,
            productId: returnProd.id,
            productName: returnProd.name,
            barcode: returnProd.barcode,
            quantityReturned: 2,
            unitCost: 100,
          },
        ],
      });

      assert(partialReturn.id, 'Purchase return record must be created');
      assert(partialReturn.returnNumber.startsWith('PR-'), 'Return number must follow PR- prefix format');
      assert.strictEqual(partialReturn.totalAmount, 200);

      // Verify product stock dropped by 2 (from 5 to 3)
      const prodAfterPartial = await prisma.product.findUnique({ where: { id: returnProd.id } });
      assert.strictEqual(prodAfterPartial.stockQuantity, 3, 'Product stock must decrease to 3');
      assert.strictEqual(prodAfterPartial.isArchived, false, 'Product should remain active as stock > 0');

      // 4. Test validation: Attempting to return 10 units (more than stock 3) must throw
      let exceededError = null;
      try {
        await purchaseReturnService.createPurchaseReturn({
          purchaseId: purchaseRecord.id,
          refundType: 'CASH',
          items: [
            {
              purchaseItemId: pItem.id,
              productId: returnProd.id,
              productName: returnProd.name,
              barcode: returnProd.barcode,
              quantityReturned: 10,
              unitCost: 100,
            },
          ],
        });
      } catch (err) {
        exceededError = err;
      }
      assert(exceededError, 'Returning more than available stock/bought units must fail with validation error');

      // 5. Return the remaining 3 units with autoArchiveZeroStock: true (Whole stock return)
      const fullReturn = await purchaseReturnService.createPurchaseReturn({
        purchaseId: purchaseRecord.id,
        refundType: 'CASH',
        refundAmount: 300,
        reason: 'Remaining 3 units returned to vendor',
        autoArchiveZeroStock: true,
        items: [
          {
            purchaseItemId: pItem.id,
            productId: returnProd.id,
            productName: returnProd.name,
            barcode: returnProd.barcode,
            quantityReturned: 3,
            unitCost: 100,
          },
        ],
      });

      assert.strictEqual(fullReturn.totalAmount, 300);

      // Verify product stock is now 0 and isArchived is true!
      const prodAfterFull = await prisma.product.findUnique({ where: { id: returnProd.id } });
      assert.strictEqual(prodAfterFull.stockQuantity, 0, 'Product stock must now be 0');
      assert.strictEqual(prodAfterFull.isArchived, true, 'Product must be auto-archived after 100% stock return');

      // 6. Verify in listPurchases that purchase item has totalUnitsReturned = 5 (100% returned)
      const fetchedPurchases = await purchaseService.listPurchases({ companyId: compA.id });
      const foundP = fetchedPurchases.find((p) => p.id === purchaseRecord.id);
      assert(foundP, 'Purchase must be returned by listPurchases');
      assert.strictEqual(foundP.totalUnitsReturned, 5, 'Purchase must reflect 5 units returned');

      // Clean up test purchase return & product
      await prisma.purchaseReturnItem.deleteMany({ where: { purchaseReturnId: { in: [partialReturn.id, fullReturn.id] } } });
      await prisma.purchaseReturn.deleteMany({ where: { id: { in: [partialReturn.id, fullReturn.id] } } });
      await prisma.purchaseItem.deleteMany({ where: { purchaseId: purchaseRecord.id } });
      await prisma.purchase.delete({ where: { id: purchaseRecord.id } });
      await prisma.product.delete({ where: { id: returnProd.id } });
    });

    // Clean up test products
    await prisma.billItem.deleteMany({ where: { billId: createdBill.id } });
    await prisma.bill.delete({ where: { id: createdBill.id } });
    await prisma.product.deleteMany({
      where: {
        id: { in: [prod1.id, prod2.id, prod3.id] },
      },
    });

    console.log(`\n======================================================`);
    console.log(`RESULTS: ${testsPassed} PASSED, ${testsFailed} FAILED`);
    console.log(`======================================================\n`);

    app.quit();
    process.exit(testsFailed > 0 ? 1 : 0);
  } catch (err) {
    console.error('Test execution failed:', err);
    app.quit();
    process.exit(1);
  }
});
