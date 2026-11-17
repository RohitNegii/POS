/**
 * Test Suite for Super Admin Role & Billing User Management
 */

const { app } = require('electron');
const assert = require('assert');

app.whenReady().then(async () => {
  console.log('\n======================================================');
  console.log('STARTING SUPER ADMIN & BILLING USER MANAGEMENT TEST SUITE');
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
    const { billingUserService } = require('../dist-electron/main/services/billingUserService');
    const { billingService } = require('../dist-electron/main/services/billingService');

    await initializeDatabase();
    const prisma = getPrismaClient();

    // 1. Super Admin Login
    await runTest('1. Super Admin login and session role verification', async () => {
      const session = await authService.login({
        email: 'superadmin@example.com',
        password: 'SuperAdmin@123',
      });
      assert.strictEqual(session.role, 'SUPER_ADMIN', 'Session role must be SUPER_ADMIN');
      assert.strictEqual(session.email, 'superadmin@example.com');
      assert.strictEqual(session.companyCode, 'ALL');
    });

    // 2. Super Admin Billing User CRUD
    let createdUser1 = null;
    let createdUser2 = null;
    await runTest('2. Super Admin can create new Billing Users', async () => {
      const testName1 = `Operator_Alpha_${Date.now()}`;
      const testName2 = `Operator_Beta_${Date.now()}`;

      createdUser1 = await billingUserService.createBillingUser({ name: testName1 });
      assert(createdUser1.id, 'User 1 must have an id');
      assert.strictEqual(createdUser1.name, testName1);

      createdUser2 = await billingUserService.createBillingUser({ name: testName2 });
      assert(createdUser2.id, 'User 2 must have an id');
      assert.strictEqual(createdUser2.name, testName2);

      // Verify stored in DB
      const dbUser = await prisma.billingUser.findUnique({ where: { id: createdUser1.id } });
      assert(dbUser, 'User 1 must exist in sqlite billing_users table');
      assert.strictEqual(dbUser.name, testName1);
    });

    await runTest('3. Duplicate Billing User name rejection', async () => {
      assert(createdUser1);
      let errorThrown = false;
      try {
        await billingUserService.createBillingUser({ name: createdUser1.name });
      } catch (err) {
        errorThrown = true;
        assert(err.message.includes('already exists'), 'Error must specify duplicate name');
      }
      assert(errorThrown, 'Creating duplicate billing user name must throw an error');
    });

    await runTest('4. Super Admin can view the list of all Billing Users', async () => {
      const users = await billingUserService.listBillingUsers();
      assert(Array.isArray(users), 'Should return an array');
      assert(users.length >= 2, 'Should have at least the 2 created users');
      const found1 = users.some((u) => u.id === createdUser1.id);
      const found2 = users.some((u) => u.id === createdUser2.id);
      assert(found1 && found2, 'Both created users must appear in list');
    });

    await runTest('5. Super Admin can edit existing Billing User names', async () => {
      assert(createdUser1);
      const updatedName = `${createdUser1.name}_EDITED`;
      const updated = await billingUserService.updateBillingUser(createdUser1.id, {
        id: createdUser1.id,
        name: updatedName,
      });
      assert.strictEqual(updated.name, updatedName);

      const dbUser = await prisma.billingUser.findUnique({ where: { id: createdUser1.id } });
      assert.strictEqual(dbUser.name, updatedName);
    });

    await runTest('6. Super Admin can delete Billing Users', async () => {
      assert(createdUser2);
      const delRes = await billingUserService.deleteBillingUser(createdUser2.id);
      assert.strictEqual(delRes.id, createdUser2.id);

      const check = await prisma.billingUser.findUnique({ where: { id: createdUser2.id } });
      assert.strictEqual(check, null, 'Deleted user must no longer exist in billing_users');
    });

    // 3. Permission Enforcement: Billing User & Company Admin cannot manage users
    await runTest('7. Billing User cannot create, edit, or delete billing users', async () => {
      // Login as Billing User
      await authService.login({
        email: 'billing@example.com',
        password: 'Billing@123',
      });

      // Billing user can list
      const list = await billingUserService.listBillingUsers();
      assert(Array.isArray(list), 'Billing user must be able to view billing users list');

      // But cannot create
      let createBlocked = false;
      try {
        await billingUserService.createBillingUser({ name: 'Unauthorized Operator' });
      } catch (err) {
        createBlocked = true;
        assert(err.message.includes('Forbidden') || err.message.includes('Super Admin'));
      }
      assert(createBlocked, 'Billing user must be blocked from creating users');

      // Cannot edit
      let editBlocked = false;
      try {
        await billingUserService.updateBillingUser(createdUser1.id, {
          id: createdUser1.id,
          name: 'Hacked Name',
        });
      } catch (err) {
        editBlocked = true;
        assert(err.message.includes('Forbidden') || err.message.includes('Super Admin'));
      }
      assert(editBlocked, 'Billing user must be blocked from updating users');

      // Cannot delete
      let deleteBlocked = false;
      try {
        await billingUserService.deleteBillingUser(createdUser1.id);
      } catch (err) {
        deleteBlocked = true;
        assert(err.message.includes('Forbidden') || err.message.includes('Super Admin'));
      }
      assert(deleteBlocked, 'Billing user must be blocked from deleting users');
    });

    await runTest('8. Company Admin cannot create, edit, or delete billing users', async () => {
      // Login as Company A Admin
      await authService.login({
        email: 'adminA@example.com',
        password: 'Admin@123',
      });

      let createBlocked = false;
      try {
        await billingUserService.createBillingUser({ name: 'Admin Created Operator' });
      } catch (err) {
        createBlocked = true;
      }
      assert(createBlocked, 'Company Admin must be blocked from creating billing users');
    });

    // 4. Billing Workflow with Operator Attribution
    let testBillId = null;
    await runTest('9. Bill created by Billing User associates and stores selected operator in database', async () => {
      // Login as Billing User
      await authService.login({
        email: 'billing@example.com',
        password: 'Billing@123',
      });

      // Get an existing product
      const product = await prisma.product.findFirst({
        where: { isArchived: false, stockQuantity: { gt: 0 } },
        include: { company: true },
      });
      assert(product, 'Must have at least one product with stock');

      // Use createdUser1 as the selected operator
      const dbUser = await prisma.billingUser.findUnique({ where: { id: createdUser1.id } });
      assert(dbUser);

      const bill = await billingService.createBill({
        billingUserId: dbUser.id,
        billingUserName: dbUser.name,
        customerName: 'Test Customer',
        customerPhone: '9876543210',
        paymentMethod: 'CASH',
        items: [
          {
            productId: product.id,
            companyId: product.companyId,
            companyName: product.company.name,
            barcode: product.barcode,
            productName: product.name,
            unitPrice: 500,
            quantity: 1,
          },
        ],
      });

      testBillId = bill.id;
      assert.strictEqual(bill.billingUserId, dbUser.id);
      assert.strictEqual(bill.billingUserName, dbUser.name);

      // Verify in DB directly
      const savedBill = await prisma.bill.findUnique({ where: { id: bill.id } });
      assert.strictEqual(savedBill.billingUserId, dbUser.id);
      assert.strictEqual(savedBill.billingUserName, dbUser.name);
    });

    await runTest('10. Billing history and search returns the selected operator name', async () => {
      const dbUser = await prisma.billingUser.findUnique({ where: { id: createdUser1.id } });
      assert(dbUser);

      // Filter bills searching by operator name
      const results = await billingService.listBills({ search: dbUser.name });
      assert(results.length >= 1, 'Should find bill by operator name');
      const found = results.find((b) => b.id === testBillId);
      assert(found, 'Created bill must be found');
      assert.strictEqual(found.billingUserName, dbUser.name);
    });

    await runTest('10b. Filter bills specifically by billingUserId and billingUserName filter', async () => {
      const dbUser = await prisma.billingUser.findUnique({ where: { id: createdUser1.id } });
      assert(dbUser);

      // Filter bills specifically using the dedicated billing user filter
      const filteredResults = await billingService.listBills({
        billingUserId: dbUser.id,
        billingUserName: dbUser.name,
      });
      assert(filteredResults.length >= 1, 'Should find bill filtered by billing user');
      const found = filteredResults.find((b) => b.id === testBillId);
      assert(found, 'Created bill must be found when filtering by billing user');
      assert.strictEqual(found.billingUserId, dbUser.id);
      assert.strictEqual(found.billingUserName, dbUser.name);

      // Verify that filtering by a non-existent user returns no matches for this bill
      const nonExistentFilter = await billingService.listBills({
        billingUserId: 'non_existent_id',
        billingUserName: 'Non Existent Operator',
      });
      const notFound = nonExistentFilter.find((b) => b.id === testBillId);
      assert.strictEqual(notFound, undefined, 'Bill must NOT appear under non-matching billing user filter');
    });

    await runTest('11. Deleting a billing user preserves historical bill attribution', async () => {
      // Login as Super Admin to delete user1
      await authService.login({
        email: 'superadmin@example.com',
        password: 'SuperAdmin@123',
      });

      await billingUserService.deleteBillingUser(createdUser1.id);

      // Bill must still exist and still have the operator's name
      const pastBill = await prisma.bill.findUnique({ where: { id: testBillId } });
      assert(pastBill, 'Bill must still exist');
      assert.strictEqual(pastBill.billingUserName, `${createdUser1.name}_EDITED`);
    });

    // 5. Existing 2 Company Admins remain fully operational
    await runTest('12. Company Admin 1 and Company Admin 2 accounts remain fully operational', async () => {
      const sessionA = await authService.login({
        email: 'adminA@example.com',
        password: 'Admin@123',
      });
      assert.strictEqual(sessionA.role, 'COMPANY_ADMIN');
      assert.strictEqual(sessionA.companyCode, 'COMPANY_A');

      const sessionB = await authService.login({
        email: 'adminB@example.com',
        password: 'Admin@123',
      });
      assert.strictEqual(sessionB.role, 'COMPANY_ADMIN');
      assert.strictEqual(sessionB.companyCode, 'COMPANY_B');
    });

    console.log('\n======================================================');
    console.log(`RESULTS: ${testsPassed} PASSED, ${testsFailed} FAILED`);
    console.log('======================================================\n');

    process.exit(testsFailed > 0 ? 1 : 0);
  } catch (err) {
    console.error('\nUNHANDLED EXCEPTION IN TEST RUNNER:', err);
    process.exit(1);
  }
});
