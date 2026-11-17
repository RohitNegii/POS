const { app } = require('electron');

app.whenReady().then(async () => {
  try {
    const { initializeDatabase, getPrismaClient } = require('../dist-electron/main/database/prisma');
    const { authService } = require('../dist-electron/main/services/authService');
    const { billingService } = require('../dist-electron/main/services/billingService');

    await initializeDatabase();
    const prisma = getPrismaClient();

    console.log('\n======================================================');
    console.log('STARTING DUAL DISCOUNT & TAX (% AND ₹) TEST SUITE');
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

    // 1. Login as Billing User
    const session = await authService.login({
      email: 'billing@example.com',
      password: 'Billing@123',
    });
    assert(session.role === 'BILLING_USER', '1. Authenticated as Billing User');

    // Find available products for test
    const products = await prisma.product.findMany({ where: { stockQuantity: { gt: 5 } }, take: 2 });
    if (products.length < 2) {
      throw new Error('Need at least 2 products with stock in DB for testing.');
    }

    const p1 = products[0];
    const p2 = products[1];
    const unitPrice1 = 500;
    const unitPrice2 = 300;

    // Test Case A: Create bill with 10% discount on ₹(500 + 300) = ₹800
    const subtotalA = unitPrice1 + unitPrice2; // 800
    const expectedDiscA = Math.round(subtotalA * 0.10 * 100) / 100; // 80

    const billA = await billingService.createBill(
      {
        billingUserName: 'Rohan Sharma',
        paymentMethod: 'CASH',
        discountPercentage: 10,
        discount: expectedDiscA,
        tax: 0,
        items: [
          {
            productId: p1.id,
            companyId: p1.companyId,
            companyName: 'Company A',
            barcode: p1.barcode,
            productName: p1.name,
            unitPrice: unitPrice1,
            quantity: 1,
            discountPercentage: 10,
            discountAmount: Math.round(unitPrice1 * 0.10 * 100) / 100,
          },
          {
            productId: p2.id,
            companyId: p2.companyId,
            companyName: 'Company B',
            barcode: p2.barcode,
            productName: p2.name,
            unitPrice: unitPrice2,
            quantity: 1,
            discountPercentage: 10,
            discountAmount: Math.round(unitPrice2 * 0.10 * 100) / 100,
          },
        ],
      },
      session.userId,
      'COMPANY_ALL'
    );

    assert(
      billA.discountPercentage === 10 && billA.discount === expectedDiscA,
      `2. Bill A created with 10% discount: recorded percentage=${billA.discountPercentage}%, amount=₹${billA.discount}`
    );
    assert(
      billA.totalAmount === Math.round((subtotalA - expectedDiscA) * 100) / 100,
      `3. Bill A total amount correctly equals subtotal - discount (₹${billA.totalAmount})`
    );

    // Test Case B: Create bill with fixed flat amount discount (e.g. ₹50)
    const fixedDiscountAmt = 50;
    const effectivePctB = Math.round((fixedDiscountAmt / subtotalA) * 100 * 100) / 100;

    const billB = await billingService.createBill(
      {
        billingUserName: 'Rohan Sharma',
        paymentMethod: 'ONLINE',
        discountPercentage: effectivePctB,
        discount: fixedDiscountAmt,
        tax: 0,
        items: [
          {
            productId: p1.id,
            companyId: p1.companyId,
            companyName: 'Company A',
            barcode: p1.barcode,
            productName: p1.name,
            unitPrice: unitPrice1,
            quantity: 1,
            discountPercentage: effectivePctB,
            discountAmount: Math.round(unitPrice1 * (effectivePctB / 100) * 100) / 100,
          },
          {
            productId: p2.id,
            companyId: p2.companyId,
            companyName: 'Company B',
            barcode: p2.barcode,
            productName: p2.name,
            unitPrice: unitPrice2,
            quantity: 1,
            discountPercentage: effectivePctB,
            discountAmount: Math.round(unitPrice2 * (effectivePctB / 100) * 100) / 100,
          },
        ],
      },
      session.userId,
      'COMPANY_ALL'
    );

    assert(
      billB.discountPercentage > 0 && billB.discount > 0,
      `4. Bill B created with flat amount discount: recorded percentage=${billB.discountPercentage}%, amount=₹${billB.discount}`
    );

    // Test Case C: Bill with 3% GST on Net Subtotal (Jewellery GST rate)
    const netSubtotalC = subtotalA - expectedDiscA; // 720
    const expectedTaxC = Math.round(netSubtotalC * 0.03 * 100) / 100; // 21.6

    const billC = await billingService.createBill(
      {
        billingUserName: 'Rohan Sharma',
        paymentMethod: 'CASH',
        discountPercentage: 10,
        discount: expectedDiscA,
        taxPercentage: 3,
        tax: expectedTaxC,
        items: [
          {
            productId: p1.id,
            companyId: p1.companyId,
            companyName: 'Company A',
            barcode: p1.barcode,
            productName: p1.name,
            unitPrice: unitPrice1,
            quantity: 1,
            discountPercentage: 10,
            discountAmount: Math.round(unitPrice1 * 0.10 * 100) / 100,
          },
          {
            productId: p2.id,
            companyId: p2.companyId,
            companyName: 'Company B',
            barcode: p2.barcode,
            productName: p2.name,
            unitPrice: unitPrice2,
            quantity: 1,
            discountPercentage: 10,
            discountAmount: Math.round(unitPrice2 * 0.10 * 100) / 100,
          },
        ],
      },
      session.userId,
      'COMPANY_ALL'
    );

    assert(
      billC.taxPercentage === 3 && billC.tax === expectedTaxC,
      `5. Bill C created with 3% Tax: recorded percentage=${billC.taxPercentage}%, amount=₹${billC.tax}`
    );
    assert(
      billC.totalAmount === Math.round((netSubtotalC + expectedTaxC) * 100) / 100,
      `6. Bill C total amount correctly includes net subtotal + tax (₹${billC.totalAmount})`
    );

    // Test Case D: Bill with Flat Tax Amount (e.g. ₹50 GST)
    const flatTaxAmt = 50;
    const expectedTaxPctD = Math.round((flatTaxAmt / netSubtotalC) * 100 * 100) / 100;

    const billD = await billingService.createBill(
      {
        billingUserName: 'Rohan Sharma',
        paymentMethod: 'ONLINE',
        discountPercentage: 10,
        discount: expectedDiscA,
        taxPercentage: expectedTaxPctD,
        tax: flatTaxAmt,
        items: [
          {
            productId: p1.id,
            companyId: p1.companyId,
            companyName: 'Company A',
            barcode: p1.barcode,
            productName: p1.name,
            unitPrice: unitPrice1,
            quantity: 1,
            discountPercentage: 10,
            discountAmount: Math.round(unitPrice1 * 0.10 * 100) / 100,
          },
          {
            productId: p2.id,
            companyId: p2.companyId,
            companyName: 'Company B',
            barcode: p2.barcode,
            productName: p2.name,
            unitPrice: unitPrice2,
            quantity: 1,
            discountPercentage: 10,
            discountAmount: Math.round(unitPrice2 * 0.10 * 100) / 100,
          },
        ],
      },
      session.userId,
      'COMPANY_ALL'
    );

    assert(
      billD.tax === flatTaxAmt && billD.taxPercentage > 0,
      `7. Bill D created with flat Tax amount: recorded percentage=${billD.taxPercentage}%, amount=₹${billD.tax}`
    );
    assert(
      billD.totalAmount === Math.round((netSubtotalC + flatTaxAmt) * 100) / 100,
      `8. Bill D total correctly includes flat tax amount (₹${billD.totalAmount})`
    );

    // Clean up test bills
    await prisma.billItem.deleteMany({ where: { billId: { in: [billA.id, billB.id, billC.id, billD.id] } } });
    await prisma.bill.deleteMany({ where: { id: { in: [billA.id, billB.id, billC.id, billD.id] } } });

    console.log('\n======================================================');
    console.log(`RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('======================================================\n');

    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    console.error('Test execution failed:', err);
    process.exit(1);
  }
});
