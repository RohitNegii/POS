const { app } = require('electron');

app.whenReady().then(async () => {
  try {
    const { initializeDatabase, getPrismaClient } = require('../dist-electron/main/database/prisma');
    const { authService } = require('../dist-electron/main/services/authService');
    const { billingService } = require('../dist-electron/main/services/billingService');

    await initializeDatabase();
    const prisma = getPrismaClient();

    console.log('\n======================================================');
    console.log('STARTING CUSTOMER RECORDS GROUPED STRICTLY BY PHONE TEST');
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

    // 1. Authenticate as Billing User
    const session = await authService.login({
      email: 'billing@example.com',
      password: 'Billing@123',
    });
    assert(session.role === 'BILLING_USER', '1. Authenticated as Billing User');

    // Find test products from database
    const prods = await prisma.product.findMany({
      where: { isArchived: false },
      take: 2,
    });
    assert(prods.length >= 1, '2. Retrieved test products');

    const testProd = prods[0];
    const uniquePhone1 = `9988${Math.floor(100000 + Math.random() * 900000)}`;
    const uniquePhone2 = `9911${Math.floor(100000 + Math.random() * 900000)}`;

    console.log(`[Test Setup] Phone 1: ${uniquePhone1}, Phone 2: ${uniquePhone2}`);

    // Create Bill 1: Customer "Aarav", Phone 1
    const bill1 = await billingService.createBill({
      billingUserName: 'Billing Cashier',
      customerName: 'Aarav',
      customerPhone: uniquePhone1,
      paymentMethod: 'CASH',
      items: [
        {
          companyId: testProd.companyId,
          companyName: 'Store',
          barcode: testProd.barcode,
          productName: testProd.name,
          unitPrice: 500,
          quantity: 2,
          totalPrice: 1000,
        },
      ],
    });
    assert(Boolean(bill1.id), `3. Created Bill 1 for "Aarav" with phone ${uniquePhone1} (Total: ₹1000)`);

    // Create Bill 2: Customer "Aarav Kumar" (different name), SAME Phone 1 (different visit)
    const bill2 = await billingService.createBill({
      billingUserName: 'Billing Cashier',
      customerName: 'Aarav Kumar',
      customerPhone: uniquePhone1,
      paymentMethod: 'UPI',
      items: [
        {
          companyId: testProd.companyId,
          companyName: 'Store',
          barcode: testProd.barcode,
          productName: testProd.name,
          unitPrice: 750,
          quantity: 1,
          totalPrice: 750,
        },
      ],
    });
    assert(Boolean(bill2.id), `4. Created Bill 2 for "Aarav Kumar" with SAME phone ${uniquePhone1} (Total: ₹750)`);

    // Create Bill 3: Customer "Aarav" (SAME name as Bill 1), but DIFFERENT Phone 2
    const bill3 = await billingService.createBill({
      billingUserName: 'Billing Cashier',
      customerName: 'Aarav',
      customerPhone: uniquePhone2,
      paymentMethod: 'CARD',
      items: [
        {
          companyId: testProd.companyId,
          companyName: 'Store',
          barcode: testProd.barcode,
          productName: testProd.name,
          unitPrice: 1200,
          quantity: 1,
          totalPrice: 1200,
        },
      ],
    });
    assert(Boolean(bill3.id), `5. Created Bill 3 for "Aarav" with DIFFERENT phone ${uniquePhone2} (Total: ₹1200)`);

    // Fetch customer records
    const allRecords = await billingService.listCustomerRecords();
    assert(Array.isArray(allRecords) && allRecords.length >= 2, '6. listCustomerRecords returned array');

    // Check Customer 1 (Phone 1)
    const cust1 = allRecords.find((c) => c.customerPhone === uniquePhone1);
    assert(Boolean(cust1), `7. Found single grouped customer entry for phone ${uniquePhone1}`);
    assert(cust1.totalBillsCount === 2, `8. Phone ${uniquePhone1} has totalBillsCount === 2`);
    assert(cust1.bills.length === 2, `9. Phone ${uniquePhone1} has exactly 2 bills in its ledger`);
    assert(cust1.totalSpent === 1750, `10. Phone ${uniquePhone1} totalSpent === ₹1750 (1000 + 750)`);

    const hasBill1 = cust1.bills.some((b) => b.id === bill1.id);
    const hasBill2 = cust1.bills.some((b) => b.id === bill2.id);
    assert(hasBill1 && hasBill2, `11. Both Bill 1 and Bill 2 are listed inside Phone 1's profile`);

    // Check Customer 2 (Phone 2) - same name "Aarav" but MUST NOT be merged with Customer 1
    const cust2 = allRecords.find((c) => c.customerPhone === uniquePhone2);
    assert(Boolean(cust2), `12. Found separate customer entry for phone ${uniquePhone2}`);
    assert(cust2.totalBillsCount === 1, `13. Phone ${uniquePhone2} has totalBillsCount === 1`);
    assert(cust2.totalSpent === 1200, `14. Phone ${uniquePhone2} totalSpent === ₹1200`);
    assert(cust2.customerPhone !== cust1.customerPhone, `15. Verified Phone 1 and Phone 2 are separate customer profiles despite identical first name`);

    // Test Search by Phone
    const searchPhoneRes = await billingService.listCustomerRecords(uniquePhone1);
    assert(
      searchPhoneRes.length === 1 && searchPhoneRes[0].customerPhone === uniquePhone1,
      `16. Search by phone "${uniquePhone1}" returned exactly the 1 matching customer`
    );

    // Test Search by Name
    const searchNameRes = await billingService.listCustomerRecords('Aarav');
    const matchedPhones = searchNameRes.map((c) => c.customerPhone);
    assert(
      matchedPhones.includes(uniquePhone1) && matchedPhones.includes(uniquePhone2),
      '17. Search by name "Aarav" matched both customer profiles'
    );

    console.log('\n======================================================');
    console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('======================================================\n');

    if (failed > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  } catch (err) {
    console.error('Unexpected error in test runner:', err);
    process.exit(1);
  }
});
