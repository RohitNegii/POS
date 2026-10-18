/**
 * Comprehensive Test Suite for Vendors, Purchase Entry, and Purchase History
 */

const { app } = require('electron');
const assert = require('assert');

app.whenReady().then(async () => {
  console.log('\n======================================================');
  console.log('STARTING COMPREHENSIVE VENDORS & PURCHASES TEST SUITE');
  console.log('======================================================\n');

  let testsPassed = 0;
  let testsFailed = 0;
  const observations = [];

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
      observations.push({ name, issue: err.message });
    }
  };

  try {
    const { initializeDatabase, getPrismaClient } = require('../dist-electron/main/database/prisma');
    const { authService } = require('../dist-electron/main/services/authService');
    const { categoryService } = require('../dist-electron/main/services/categoryService');
    const { productService } = require('../dist-electron/main/services/productService');
    const { vendorService } = require('../dist-electron/main/services/vendorService');
    const { purchaseService } = require('../dist-electron/main/services/purchaseService');

    await initializeDatabase();
    const prisma = getPrismaClient();

    // Login as Admin A
    const session = await authService.login({
      email: 'admina@example.com',
      password: 'Admin@123',
    });
    console.log(`[AUTH] Logged in as: ${session.adminName} (${session.companyName})\n`);

    // Setup Test Category
    let testCat = await prisma.category.findFirst({
      where: { name: 'Suite Test Category', companyId: session.companyId },
    });
    if (!testCat) {
      testCat = await categoryService.createCategory({
        name: 'Suite Test Category',
        description: 'For testing purchases and vendors',
      });
    }

    // Clean up test vendors/purchases from previous runs if any
    const oldVendors = await prisma.vendor.findMany({
      where: { name: { startsWith: 'TEST_VENDOR_' }, companyId: session.companyId },
    });
    for (const ov of oldVendors) {
      const oldPurchases = await prisma.purchase.findMany({ where: { vendorId: ov.id } });
      for (const op of oldPurchases) {
        await purchaseService.deletePurchase(op.id);
      }
      await prisma.product.deleteMany({ where: { vendorId: ov.id } });
      await prisma.vendor.delete({ where: { id: ov.id } });
    }

    // ==========================================
    // SECTION 1: VENDORS FUNCTIONALITY
    // ==========================================
    console.log('\n--- SECTION 1: VENDORS FUNCTIONALITY ---');

    let vendor1;
    await runTest('1.1 Create Vendor with full details', async () => {
      vendor1 = await vendorService.createVendor({
        name: 'TEST_VENDOR_Alpha Bullion',
        phoneNumber: '9876543210',
        address: '123 Jewellery Bazaar, Zaveri Bazaar, Mumbai',
        gstNumber: '27AAAAA0000A1Z5',
        bankName: 'HDFC Bank',
        accountNumber: '50100123456789',
        ifscCode: 'HDFC0001234',
      });
      assert(vendor1.id, 'Vendor ID must exist');
      assert.strictEqual(vendor1.name, 'TEST_VENDOR_Alpha Bullion');
      assert.strictEqual(vendor1.phoneNumber, '9876543210');
      assert.strictEqual(vendor1.gstNumber, '27AAAAA0000A1Z5');
      assert.strictEqual(vendor1.bankName, 'HDFC Bank');
      assert.strictEqual(vendor1.accountNumber, '50100123456789');
      assert.strictEqual(vendor1.ifscCode, 'HDFC0001234');
      assert.strictEqual(vendor1.purchasesCount, 0);
      assert.strictEqual(vendor1.totalPurchasedAmount, 0);
    });

    await runTest('1.2 Reject Duplicate Vendor Name for same company', async () => {
      try {
        await vendorService.createVendor({
          name: 'TEST_VENDOR_Alpha Bullion',
          phoneNumber: '9111111111',
        });
        assert.fail('Should have thrown error for duplicate name');
      } catch (err) {
        assert(err.message.includes('already exists'), `Expected duplicate error, got: ${err.message}`);
      }
    });

    await runTest('1.3 Reject Empty or Invalid Vendor Name', async () => {
      try {
        await vendorService.createVendor({ name: '   ' });
        assert.fail('Should have failed for whitespace name');
      } catch (err) {
        assert(err.message.includes('required'), `Expected name required error, got: ${err.message}`);
      }
    });

    await runTest('1.4 Retrieve Vendor By ID', async () => {
      const fetched = await vendorService.getVendorById(vendor1.id);
      assert.strictEqual(fetched.id, vendor1.id);
      assert.strictEqual(fetched.name, 'TEST_VENDOR_Alpha Bullion');
      assert.strictEqual(fetched.phoneNumber, '9876543210');
    });

    await runTest('1.5 List Vendors with Search Query (name and phone)', async () => {
      const all = await vendorService.listVendors('Alpha Bullion');
      assert(all.length >= 1, 'Should find at least 1 vendor');
      const found = all.find((v) => v.id === vendor1.id);
      assert(found, 'Created vendor should be in search results');

      const byPhone = await vendorService.listVendors('9876543210');
      assert(byPhone.some((v) => v.id === vendor1.id), 'Should find vendor by phone number');
    });

    await runTest('1.6 Update Vendor details', async () => {
      const updated = await vendorService.updateVendor({
        id: vendor1.id,
        name: 'TEST_VENDOR_Alpha Bullion Updated',
        phoneNumber: '9876500000',
        address: 'Updated Suite 404',
        gstNumber: '27AAAAA0000A1Z5',
        bankName: 'ICICI Bank',
        accountNumber: '000105001234',
        ifscCode: 'ICIC0000001',
      });
      assert.strictEqual(updated.name, 'TEST_VENDOR_Alpha Bullion Updated');
      assert.strictEqual(updated.phoneNumber, '9876500000');
      assert.strictEqual(updated.bankName, 'ICICI Bank');
      vendor1 = updated;
    });

    // ==========================================
    // SECTION 2: PURCHASE ENTRY FUNCTIONALITY
    // ==========================================
    console.log('\n--- SECTION 2: PURCHASE ENTRY FUNCTIONALITY ---');

    // Create a catalog product with opening stock = 5
    const baseProd = await productService.createProduct({
      categoryId: testCat.id,
      name: 'TEST_VENDOR_Product Ring 1',
      stockQuantity: 5,
      purchasePrice: 1000,
      sellingPrice: 1500,
      fieldValues: [],
    });

    await runTest('2.1 Validate required vendor on purchase creation', async () => {
      try {
        await purchaseService.createPurchase({
          vendorId: '',
          invoiceNumber: 'INV-TEST-001',
          items: [{ productId: baseProd.id, quantityBought: 1, unitCost: 1000 }],
        });
        assert.fail('Should fail without vendorId');
      } catch (err) {
        assert(err.message.includes('Vendor is required'), `Got: ${err.message}`);
      }
    });

    await runTest('2.2 Validate required invoice number', async () => {
      try {
        await purchaseService.createPurchase({
          vendorId: vendor1.id,
          invoiceNumber: '',
          items: [{ productId: baseProd.id, quantityBought: 1, unitCost: 1000 }],
        });
        assert.fail('Should fail without invoice number');
      } catch (err) {
        assert(err.message.includes('invoice / bill number is required'), `Got: ${err.message}`);
      }
    });

    await runTest('2.3 Validate at least one item required', async () => {
      try {
        await purchaseService.createPurchase({
          vendorId: vendor1.id,
          invoiceNumber: 'INV-TEST-001',
          items: [],
        });
        assert.fail('Should fail with empty items');
      } catch (err) {
        assert(err.message.includes('at least one product'), `Got: ${err.message}`);
      }
    });

    await runTest('2.4 Validate quantity > 0 and unitCost >= 0', async () => {
      try {
        await purchaseService.createPurchase({
          vendorId: vendor1.id,
          invoiceNumber: 'INV-TEST-001',
          items: [{ productId: baseProd.id, quantityBought: 0, unitCost: 1000 }],
        });
        assert.fail('Should fail with quantity 0');
      } catch (err) {
        assert(err.message.includes('must be greater than 0'), `Got: ${err.message}`);
      }
    });

    let purchase1;
    await runTest('2.5 Create Purchase Bill and verify Calculations (Gross, Discount, CGST, SGST)', async () => {
      // Purchase 10 units @ 1000, discount 500, CGST 1.5%, SGST 1.5%
      // Gross = 10 * 1000 = 10000
      // Taxable = 10000 - 500 = 9500
      // CGST = 9500 * 1.5% = 142.50
      // SGST = 9500 * 1.5% = 142.50
      // Total = 9500 + 142.50 + 142.50 = 9785.00
      purchase1 = await purchaseService.createPurchase({
        vendorId: vendor1.id,
        invoiceNumber: 'INV-TEST-001',
        purchaseDate: '2026-10-17',
        paymentMethod: 'CASH',
        items: [
          {
            productId: baseProd.id,
            quantityBought: 10,
            unitCost: 1000,
            discount: 500,
            cgstRate: 1.5,
            sgstRate: 1.5,
            igstRate: 0,
          },
        ],
      });

      assert(purchase1.id, 'Purchase ID must exist');
      assert.strictEqual(purchase1.invoiceNumber, 'INV-TEST-001');
      assert.strictEqual(purchase1.subtotal, 9500);
      assert.strictEqual(purchase1.taxAmount, 285);
      assert.strictEqual(purchase1.totalAmount, 9785);
      assert.strictEqual(purchase1.paymentStatus, 'PAID');
      assert.strictEqual(purchase1.paidAmount, 9785);
      assert.strictEqual(purchase1.balanceAmount, 0);
    });

    await runTest('2.6 Check Stock Inventory Increment on First Purchase Bill for Existing Product (Issue 1 Fix)', async () => {
      const prodAfter = await productService.getProductById(baseProd.id);
      // baseProd had initial stock = 5, and inward purchase bought 10 units.
      // With the fix, stock MUST be 5 + 10 = 15!
      assert.strictEqual(prodAfter.stockQuantity, 15, `Expected stock to increase from 5 to 15, got ${prodAfter.stockQuantity}`);
    });

    await runTest('2.7 Reject Duplicate Invoice Number under same Vendor', async () => {
      try {
        await purchaseService.createPurchase({
          vendorId: vendor1.id,
          invoiceNumber: 'INV-TEST-001',
          items: [{ productId: baseProd.id, quantityBought: 1, unitCost: 1000 }],
        });
        assert.fail('Should fail with duplicate invoice number');
      } catch (err) {
        assert(err.message.includes('already exists'), `Expected duplicate error, got: ${err.message}`);
      }
    });

    let purchase2;
    await runTest('2.8 Create Purchase Bill with inline Product Draft & NO_PAYMENT (Credit)', async () => {
      purchase2 = await purchaseService.createPurchase({
        vendorId: vendor1.id,
        invoiceNumber: 'INV-TEST-CREDIT-002',
        purchaseDate: '2026-10-17',
        paymentMethod: 'NO_PAYMENT',
        ewayBillNumber: 'EWAY1234567890',
        transporterName: 'VRL Logistics',
        vehicleNumber: 'MH01AB1234',
        items: [
          {
            productId: 'draft_new_item_1',
            quantityBought: 4,
            unitCost: 2500,
            discount: 0,
            cgstRate: 0,
            sgstRate: 0,
            igstRate: 5, // IGST 5% -> 4 * 2500 * 5% = 500
            productDraft: {
              name: 'TEST_VENDOR_Inline Draft Item',
              categoryId: testCat.id,
              purchasePrice: 2500,
              sellingPrice: 3500,
              fieldValues: [],
            },
          },
        ],
      });

      assert.strictEqual(purchase2.subtotal, 10000);
      assert.strictEqual(purchase2.taxAmount, 500);
      assert.strictEqual(purchase2.totalAmount, 10500);
      assert.strictEqual(purchase2.paymentMethod, 'NO_PAYMENT');
      assert.strictEqual(purchase2.paymentStatus, 'UNPAID');
      assert.strictEqual(purchase2.paidAmount, 0);
      assert.strictEqual(purchase2.balanceAmount, 10500);
      assert.strictEqual(purchase2.ewayBillNumber, 'EWAY1234567890');
      assert.strictEqual(purchase2.transporterName, 'VRL Logistics');
      assert.strictEqual(purchase2.vehicleNumber, 'MH01AB1234');

      // Verify the drafted product was actually inserted into product table
      const createdItem = purchase2.items[0];
      assert(createdItem.productId, 'Item should have assigned productId');
      const prodInDb = await productService.getProductById(createdItem.productId);
      assert.strictEqual(prodInDb.name, 'TEST_VENDOR_Inline Draft Item');
      assert.strictEqual(prodInDb.stockQuantity, 4);
    });

    // ==========================================
    // SECTION 3: PURCHASE HISTORY & RECONCILIATION
    // ==========================================
    console.log('\n--- SECTION 3: PURCHASE HISTORY & RECONCILIATION ---');

    await runTest('3.1 Retrieve Purchase By ID with all item lines', async () => {
      const p = await purchaseService.getPurchaseById(purchase1.id);
      assert(p, 'Purchase must be found');
      assert.strictEqual(p.id, purchase1.id);
      assert.strictEqual(p.vendorName, vendor1.name);
      assert.strictEqual(p.items.length, 1);
      assert.strictEqual(p.items[0].productName, baseProd.name);
    });

    await runTest('3.2 List Purchases and Search Filters (Invoice, Vendor, Product)', async () => {
      const byInv = await purchaseService.listPurchases({ search: 'INV-TEST-001' });
      assert(byInv.some((p) => p.id === purchase1.id), 'Must find by invoice number');

      const byVend = await purchaseService.listPurchases({ search: 'Alpha Bullion' });
      assert(byVend.length >= 2, 'Must find both purchases by vendor');

      const byProd = await purchaseService.listPurchases({ search: 'Product Ring 1' });
      assert(byProd.some((p) => p.id === purchase1.id), 'Must find purchase by product name');
    });

    await runTest('3.3 Verify Purchase History KPI calculations (Total Inward, Paid, Outstanding)', async () => {
      const allPurchases = await purchaseService.listPurchases();
      const totalOrders = allPurchases.length;
      const totalInwardValue = allPurchases.reduce((acc, p) => acc + (p.totalAmount || 0), 0);
      const totalPaid = allPurchases.reduce((acc, p) => acc + (p.paidAmount || 0), 0);
      const totalBalance = allPurchases.reduce((acc, p) => acc + (p.balanceAmount || 0), 0);

      assert(totalOrders >= 2, 'Total orders count >= 2');
      assert(totalInwardValue >= 9785 + 10500, 'Total inward value calculation');
      assert(totalPaid >= 9785, 'Total paid calculation');
      assert(totalBalance >= 10500, 'Total pending balance calculation');
    });

    // ==========================================
    // SECTION 4: EDIT BILL & ORPHAN PRODUCT CLEANUP (USER SCENARIO)
    // ==========================================
    console.log('\n--- SECTION 4: EDIT BILL & ORPHAN PRODUCT CLEANUP ---');

    let multiBill;
    let itemToKeepId;
    let itemToRemove1Id;
    let itemToRemove2Id;

    await runTest('4.1 Create Bill with 3 inline draft products (Simulate 5 products)', async () => {
      multiBill = await purchaseService.createPurchase({
        vendorId: vendor1.id,
        invoiceNumber: 'INV-TEST-MULTI-003',
        purchaseDate: '2026-10-17',
        paymentMethod: 'CASH',
        items: [
          {
            productId: 'draft_keep_1',
            quantityBought: 5,
            unitCost: 1000,
            productDraft: {
              name: 'TEST_VENDOR_Keep Me Ring',
              categoryId: testCat.id,
              purchasePrice: 1000,
              sellingPrice: 1500,
              fieldValues: [],
            },
          },
          {
            productId: 'draft_remove_1',
            quantityBought: 2,
            unitCost: 2000,
            productDraft: {
              name: 'TEST_VENDOR_Remove Me Pendant',
              categoryId: testCat.id,
              purchasePrice: 2000,
              sellingPrice: 3000,
              fieldValues: [],
            },
          },
          {
            productId: 'draft_remove_2',
            quantityBought: 3,
            unitCost: 3000,
            productDraft: {
              name: 'TEST_VENDOR_Remove Me Bangle',
              categoryId: testCat.id,
              purchasePrice: 3000,
              sellingPrice: 4500,
              fieldValues: [],
            },
          },
        ],
      });

      assert.strictEqual(multiBill.items.length, 3);
      itemToKeepId = multiBill.items[0].productId;
      itemToRemove1Id = multiBill.items[1].productId;
      itemToRemove2Id = multiBill.items[2].productId;

      // Verify all 3 exist in the product catalog
      assert(await productService.getProductById(itemToKeepId), 'Keep item must exist in catalog');
      assert(await productService.getProductById(itemToRemove1Id), 'Remove item 1 must exist in catalog');
      assert(await productService.getProductById(itemToRemove2Id), 'Remove item 2 must exist in catalog');
    });

    await runTest('4.2 Edit Bill, remove 2 products, and verify orphan cleanup in catalog', async () => {
      // Edit multiBill: remove itemToRemove1 and itemToRemove2, keep itemToKeep with updated name and qty 8
      const updatedBill = await purchaseService.updatePurchase({
        id: multiBill.id,
        vendorId: vendor1.id,
        invoiceNumber: 'INV-TEST-MULTI-003',
        purchaseDate: '2026-10-17',
        paymentMethod: 'CASH',
        items: [
          {
            productId: itemToKeepId,
            productName: 'TEST_VENDOR_Keep Me Ring (Renamed)',
            quantityBought: 8,
            unitCost: 1000,
          },
        ],
      });

      assert.strictEqual(updatedBill.items.length, 1, 'Bill must now only have 1 item');
      assert.strictEqual(updatedBill.items[0].quantityBought, 8);

      // Verify Kept Product has updated stock (5 was initial, now 8) and updated name
      const keptInDb = await productService.getProductById(itemToKeepId);
      assert.strictEqual(keptInDb.name, 'TEST_VENDOR_Keep Me Ring (Renamed)');
      assert.strictEqual(keptInDb.stockQuantity, 8);

      // VERIFY THE 2 REMOVED PRODUCTS ARE COMPLETELY DELETED FROM PRODUCT CATALOG!
      const checkRemoved1 = await prisma.product.findUnique({ where: { id: itemToRemove1Id } });
      assert.strictEqual(checkRemoved1, null, 'Removed product 1 must be purged from product catalog so it no longer shows in Products and Barcodes!');

      const checkRemoved2 = await prisma.product.findUnique({ where: { id: itemToRemove2Id } });
      assert.strictEqual(checkRemoved2, null, 'Removed product 2 must be purged from product catalog so it no longer shows in Products and Barcodes!');
    });

    await runTest('4.3 Delete Purchase Bill and Verify Complete Stock Rollback & Cleanup (Issue 2 Fix)', async () => {
      // Currently keptInDb has stock 8 from multiBill.
      // When multiBill is deleted, since keptInDb has no other purchases or sales, it should be cleaned up!
      await purchaseService.deletePurchase(multiBill.id);

      const checkKept = await prisma.product.findUnique({ where: { id: itemToKeepId } });
      assert.strictEqual(checkKept, null, 'Product inwarded solely on deleted bill must be removed from catalog');
    });

    await runTest('4.4 Delete Purchase Bill with Existing Catalog Product (Stock Rollback)', async () => {
      // baseProd had 15 units (5 opening + 10 from purchase1).
      // Delete purchase1 -> stock must revert back to opening stock 5!
      await purchaseService.deletePurchase(purchase1.id);

      const baseAfterDelete = await productService.getProductById(baseProd.id);
      assert.strictEqual(baseAfterDelete.stockQuantity, 5, `Expected stock to revert back to opening stock 5, got ${baseAfterDelete.stockQuantity}`);
    });

    // Clean up remaining test data
    console.log('\n--- CLEANING UP TEST DATA ---');
    await purchaseService.deletePurchase(purchase2.id);
    const testProds = await prisma.product.findMany({
      where: { name: { startsWith: 'TEST_VENDOR_' } },
      select: { id: true },
    });
    for (const p of testProds) {
      await prisma.productFieldValue.deleteMany({ where: { productId: p.id } });
      await prisma.product.delete({ where: { id: p.id } });
    }
    await vendorService.deleteVendor(vendor1.id);
    console.log('Cleanup completed cleanly.');

    console.log('\n======================================================');
    console.log(`RESULTS: ${testsPassed} PASSED, ${testsFailed} FAILED`);
    console.log('======================================================\n');

    if (observations.length > 0) {
      console.log('OBSERVATIONS & ISSUES FOUND:');
      observations.forEach((o) => console.log(` - [${o.name}]: ${o.issue}`));
    }

  } catch (globalErr) {
    console.error('\n[FATAL TEST RUNNER ERROR]:', globalErr);
  } finally {
    app.quit();
  }
});
