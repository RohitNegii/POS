const { app } = require('electron');

app.whenReady().then(async () => {
  try {
    const { initializeDatabase, getPrismaClient } = require('../dist-electron/main/database/prisma');
    const { authService } = require('../dist-electron/main/services/authService');
    const { purchaseService } = require('../dist-electron/main/services/purchaseService');

    await initializeDatabase();
    const prisma = getPrismaClient();

    console.log('\n======================================================');
    console.log('STARTING 7-DAY OVERDUE PURCHASE NOTIFICATIONS TEST SUITE');
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

    // Helper to calculate past date string 'YYYY-MM-DD'
    function getPastDateString(daysAgo) {
      const d = new Date();
      d.setDate(d.getDate() - daysAgo);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }

    const date3DaysAgo = getPastDateString(3);
    const date7DaysAgo = getPastDateString(7);
    const date14DaysAgo = getPastDateString(14);
    const date10DaysAgo = getPastDateString(10);
    const date8DaysAgo = getPastDateString(8);

    console.log(`[Date Context] 3 days ago: ${date3DaysAgo}, 7 days ago: ${date7DaysAgo}, 14 days ago: ${date14DaysAgo}`);

    // --- 1. LOGIN AS COMPANY ADMIN 1 ---
    const session1 = await authService.login({
      email: 'adminA@example.com',
      password: 'Admin@123',
    });
    assert(session1.role === 'COMPANY_ADMIN', '1. Company Admin 1 logged in successfully');

    const vendor1 = await prisma.vendor.findFirst({
      where: { companyId: session1.companyId },
    });
    assert(Boolean(vendor1), '2. Vendor found for Company Admin 1');

    const prod1 = await prisma.product.findFirst({
      where: { companyId: session1.companyId, isArchived: false },
    });
    assert(Boolean(prod1), '3. Product found for Company Admin 1');

    // Create Purchase A: 3 days ago, NO_PAYMENT (not yet overdue)
    const p3DaysAgo = await purchaseService.createPurchase({
      vendorId: vendor1.id,
      invoiceNumber: `TEST-3D-${Date.now()}`,
      purchaseDate: date3DaysAgo,
      paymentMethod: 'NO_PAYMENT',
      paymentStatus: 'UNPAID',
      items: [
        {
          productId: prod1.id,
          productName: prod1.name,
          quantityBought: 2,
          unitCost: 500,
        },
      ],
    });
    assert(p3DaysAgo.balanceAmount === 1000 && p3DaysAgo.paymentStatus === 'UNPAID', '4. Created 3-day-old purchase with NO_PAYMENT');

    // Create Purchase B: 7 days ago, NO_PAYMENT (exact threshold - should be overdue)
    const p7DaysAgo = await purchaseService.createPurchase({
      vendorId: vendor1.id,
      invoiceNumber: `TEST-7D-${Date.now()}`,
      purchaseDate: date7DaysAgo,
      paymentMethod: 'NO_PAYMENT',
      paymentStatus: 'UNPAID',
      items: [
        {
          productId: prod1.id,
          productName: prod1.name,
          quantityBought: 3,
          unitCost: 1000,
        },
      ],
    });
    assert(p7DaysAgo.balanceAmount === 3000 && p7DaysAgo.paymentStatus === 'UNPAID', '5. Created 7-day-old purchase with NO_PAYMENT');

    // Create Purchase C: 14 days ago, NO_PAYMENT (7 days overdue)
    const p14DaysAgo = await purchaseService.createPurchase({
      vendorId: vendor1.id,
      invoiceNumber: `TEST-14D-${Date.now()}`,
      purchaseDate: date14DaysAgo,
      paymentMethod: 'NO_PAYMENT',
      paymentStatus: 'UNPAID',
      items: [
        {
          productId: prod1.id,
          productName: prod1.name,
          quantityBought: 1,
          unitCost: 4500,
        },
      ],
    });
    assert(p14DaysAgo.balanceAmount === 4500 && p14DaysAgo.paymentStatus === 'UNPAID', '6. Created 14-day-old purchase with NO_PAYMENT');

    // Create Purchase D: 10 days ago, PAID in full (should NOT be overdue because balance = 0)
    const p10DaysPaid = await purchaseService.createPurchase({
      vendorId: vendor1.id,
      invoiceNumber: `TEST-PAID-${Date.now()}`,
      purchaseDate: date10DaysAgo,
      paymentMethod: 'CASH',
      paymentStatus: 'PAID',
      amountPaid: 2000,
      items: [
        {
          productId: prod1.id,
          productName: prod1.name,
          quantityBought: 2,
          unitCost: 1000,
        },
      ],
    });
    assert(p10DaysPaid.balanceAmount === 0 && p10DaysPaid.paymentStatus === 'PAID', '7. Created 10-day-old purchase PAID in full');

    // Query Overdue Purchases for Company A
    const overdueA = await purchaseService.getOverduePurchases(7);
    console.log(`[Company A Overdue Query] Total count: ${overdueA.overdueCount}, Total amount: ₹${overdueA.totalOverdueAmount}`);

    const found3D = overdueA.items.find((item) => item.id === p3DaysAgo.id);
    assert(!found3D, '8. Purchase from 3 days ago is NOT in overdue list (< 7 days)');

    const foundPaid = overdueA.items.find((item) => item.id === p10DaysPaid.id);
    assert(!foundPaid, '9. Fully paid purchase from 10 days ago is NOT in overdue list');

    const found7D = overdueA.items.find((item) => item.id === p7DaysAgo.id);
    assert(
      Boolean(found7D) && found7D.daysElapsed === 7 && found7D.daysOverdue === 0 && found7D.balanceAmount === 3000,
      `10. Purchase from 7 days ago IS in overdue list (daysElapsed=7, daysOverdue=0, balance=3000)`
    );

    const found14D = overdueA.items.find((item) => item.id === p14DaysAgo.id);
    assert(
      Boolean(found14D) && found14D.daysElapsed === 14 && found14D.daysOverdue === 7 && found14D.balanceAmount === 4500,
      `11. Purchase from 14 days ago IS in overdue list (daysElapsed=14, daysOverdue=7, balance=4500)`
    );

    // --- 2. SETTLE PAYMENT ON OVERDUE BILL (p7DaysAgo) ---
    console.log('\n[Settling Payment for 7-day-old purchase...]');
    const settled7D = await purchaseService.updatePurchasePayment({
      id: p7DaysAgo.id,
      paymentStatus: 'PAID',
      paymentMethod: 'ONLINE',
      paidAmount: 3000,
      utr: 'UTR-SETTLE-7D-9999',
      description: 'Settled vendor invoice after 7 day reminder',
    });
    assert(settled7D.paymentStatus === 'PAID' && settled7D.balanceAmount === 0, '12. Successfully settled payment in full with UTR');

    // Re-query overdue list for Company A
    const overdueAfterSettle = await purchaseService.getOverduePurchases(7);
    const foundSettled = overdueAfterSettle.items.find((item) => item.id === p7DaysAgo.id);
    assert(!foundSettled, '13. Settled bill immediately removed from overdue notifications');

    const stillOverdue14D = overdueAfterSettle.items.find((item) => item.id === p14DaysAgo.id);
    assert(Boolean(stillOverdue14D), '14. Unsettled 14-day bill remains in overdue notifications');

    // --- 3. MULTI-COMPANY ISOLATION ---
    console.log('\n[Checking Multi-Company Isolation...]');
    const session2 = await authService.login({
      email: 'adminB@example.com',
      password: 'Admin@123',
    });
    assert(session2.role === 'COMPANY_ADMIN', '15. Company Admin 2 logged in');

    const vendor2 = await prisma.vendor.findFirst({
      where: { companyId: session2.companyId },
    });
    assert(Boolean(vendor2), '16. Vendor found for Company Admin 2');

    const prod2 = await prisma.product.findFirst({
      where: { companyId: session2.companyId, isArchived: false },
    });
    assert(Boolean(prod2), '17. Product found for Company Admin 2');

    // Create 8-day overdue purchase for Company B
    const p8DaysB = await purchaseService.createPurchase({
      vendorId: vendor2.id,
      invoiceNumber: `TEST-COMPB-8D-${Date.now()}`,
      purchaseDate: date8DaysAgo,
      paymentMethod: 'NO_PAYMENT',
      paymentStatus: 'UNPAID',
      items: [
        {
          productId: prod2.id,
          productName: prod2.name,
          quantityBought: 1,
          unitCost: 8000,
        },
      ],
    });
    assert(p8DaysB.balanceAmount === 8000, '18. Created 8-day-old purchase for Company B');

    const overdueB = await purchaseService.getOverduePurchases(7);
    const companyAInB = overdueB.items.find((item) => item.id === p14DaysAgo.id);
    const companyBInB = overdueB.items.find((item) => item.id === p8DaysB.id);

    assert(!companyAInB, '19. Company B does NOT see Company A overdue purchase (Strict Multi-Tenant Isolation)');
    assert(Boolean(companyBInB), '20. Company B correctly sees its own overdue purchase');

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
