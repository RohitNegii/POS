const { app } = require('electron');

app.whenReady().then(async () => {
  try {
    const { initializeDatabase, getPrismaClient } = require('../dist-electron/main/database/prisma');
    const { authService } = require('../dist-electron/main/services/authService');
    const { purchaseService } = require('../dist-electron/main/services/purchaseService');

    await initializeDatabase();
    const prisma = getPrismaClient();

    console.log('\n======================================================');
    console.log('STARTING PURCHASE UTR & DESCRIPTION TEST SUITE');
    console.log('======================================================\n');

    let passed = 0;
    let failed = 0;

    function assert(condition, message) {
      if (condition) {
        console.log(`TEST: ${message} ... PASSED`);
        passed++;
      } else {
        console.error(`TEST: ${message} ... FAILED`);
        failed++;
      }
    }

    // --- COMPANY ADMIN 1 TESTING ---
    const session1 = await authService.login({
      email: 'adminA@example.com',
      password: 'Admin@123',
    });
    assert(session1.role === 'COMPANY_ADMIN', '1. Company Admin 1 logged in');

    const vendor1 = await prisma.vendor.findFirst({
      where: { companyId: session1.companyId },
    });
    assert(Boolean(vendor1), '2. Vendor found for Company Admin 1');

    const prod1 = await prisma.product.findFirst({
      where: { companyId: session1.companyId, isArchived: false },
    });
    assert(Boolean(prod1), '3. Product found for Company Admin 1');

    // Test A: CASH payment without UTR (should succeed)
    const cashPurchase1 = await purchaseService.createPurchase({
      vendorId: vendor1.id,
      invoiceNumber: `TEST-CASH-${Date.now()}`,
      purchaseDate: '2026-11-15',
      paymentMethod: 'CASH',
      description: 'Cash purchase for monthly stock replenishment',
      items: [
        {
          productId: prod1.id,
          productName: prod1.name,
          quantityBought: 2,
          unitCost: 150,
        },
      ],
    });
    assert(
      cashPurchase1.paymentMethod === 'CASH' &&
        cashPurchase1.utr === null &&
        cashPurchase1.description === 'Cash purchase for monthly stock replenishment',
      '4. Cash purchase created without UTR, optional description saved correctly'
    );

    // Test B: ONLINE payment without UTR (should fail)
    let onlineWithoutUtrFailed = false;
    try {
      await purchaseService.createPurchase({
        vendorId: vendor1.id,
        invoiceNumber: `TEST-ONLINE-FAIL-${Date.now()}`,
        purchaseDate: '2026-11-15',
        paymentMethod: 'ONLINE',
        items: [
          {
            productId: prod1.id,
            productName: prod1.name,
            quantityBought: 1,
            unitCost: 200,
          },
        ],
      });
    } catch (err) {
      onlineWithoutUtrFailed = true;
      assert(
        err.message.includes('UTR / Transaction Reference number is required'),
        `5. Online purchase without UTR correctly rejected: "${err.message}"`
      );
    }
    assert(onlineWithoutUtrFailed, '5b. Online purchase without UTR threw expected validation error');

    // Test C: ONLINE payment with UTR (should succeed)
    const testUtr1 = 'UTR-HDFC-99887766';
    const onlinePurchase1 = await purchaseService.createPurchase({
      vendorId: vendor1.id,
      invoiceNumber: `TEST-ONLINE-OK-${Date.now()}`,
      purchaseDate: '2026-11-15',
      paymentMethod: 'ONLINE',
      utr: testUtr1,
      description: 'Online bank transfer via NEFT',
      items: [
        {
          productId: prod1.id,
          productName: prod1.name,
          quantityBought: 1,
          unitCost: 200,
        },
      ],
    });
    assert(
      onlinePurchase1.paymentMethod === 'ONLINE' &&
        onlinePurchase1.utr === testUtr1 &&
        onlinePurchase1.description === 'Online bank transfer via NEFT',
      `6. Online purchase created with required UTR "${onlinePurchase1.utr}" and description`
    );

    // --- COMPANY ADMIN 2 TESTING ---
    const session2 = await authService.login({
      email: 'adminB@example.com',
      password: 'Admin@123',
    });
    assert(session2.role === 'COMPANY_ADMIN', '7. Company Admin 2 logged in');

    const vendor2 = await prisma.vendor.findFirst({
      where: { companyId: session2.companyId },
    });
    assert(Boolean(vendor2), '8. Vendor found for Company Admin 2');

    const prod2 = await prisma.product.findFirst({
      where: { companyId: session2.companyId, isArchived: false },
    });
    assert(Boolean(prod2), '9. Product found for Company Admin 2');

    const testUtr2 = 'UPI-SBI-202611151234';
    const onlinePurchase2 = await purchaseService.createPurchase({
      vendorId: vendor2.id,
      invoiceNumber: `TEST-COMPB-ONLINE-${Date.now()}`,
      purchaseDate: '2026-11-15',
      paymentMethod: 'ONLINE',
      utr: testUtr2,
      description: 'Company B UPI purchase for store inventory',
      items: [
        {
          productId: prod2.id,
          productName: prod2.name,
          quantityBought: 3,
          unitCost: 350,
        },
      ],
    });
    assert(
      onlinePurchase2.paymentMethod === 'ONLINE' &&
        onlinePurchase2.utr === testUtr2 &&
        onlinePurchase2.description === 'Company B UPI purchase for store inventory',
      `10. Company Admin 2 online purchase created with UTR "${onlinePurchase2.utr}" and description`
    );

    // Test D: Updating purchase with new UTR and description
    const updatedPurchase2 = await purchaseService.updatePurchase({
      id: onlinePurchase2.id,
      vendorId: vendor2.id,
      invoiceNumber: onlinePurchase2.invoiceNumber,
      purchaseDate: '2026-11-15',
      paymentMethod: 'ONLINE',
      utr: 'UTR-UPDATED-55443322',
      description: 'Updated description for Company B purchase',
      items: [
        {
          productId: prod2.id,
          productName: prod2.name,
          quantityBought: 3,
          unitCost: 350,
        },
      ],
    });
    assert(
      updatedPurchase2.utr === 'UTR-UPDATED-55443322' &&
        updatedPurchase2.description === 'Updated description for Company B purchase',
      `11. Updated purchase successfully preserved new UTR and description`
    );

    // Clean up test purchases
    await prisma.purchaseItem.deleteMany({
      where: {
        purchaseId: { in: [cashPurchase1.id, onlinePurchase1.id, onlinePurchase2.id] },
      },
    });
    await prisma.purchase.deleteMany({
      where: {
        id: { in: [cashPurchase1.id, onlinePurchase1.id, onlinePurchase2.id] },
      },
    });

    console.log('\n======================================================');
    console.log(`RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('======================================================\n');

    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    console.error('Test execution failed:', err);
    process.exit(1);
  }
});
