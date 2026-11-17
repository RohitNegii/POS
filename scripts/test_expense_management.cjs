/**
 * Comprehensive Test Suite for Expense Management Module
 * Tests all 12 required scenarios including role protection, company isolation,
 * atomic balance deduction & reversal, employee salary logic, and audit history.
 */

const { app } = require('electron');
const assert = require('assert');

app.whenReady().then(async () => {
  console.log('\n======================================================');
  console.log('STARTING EXPENSE MANAGEMENT MODULE TEST SUITE');
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
    const { expenseService } = require('../dist-electron/main/services/expenseService');

    await initializeDatabase();
    const prisma = getPrismaClient();

    // Find Company A and Company B
    const compA = await prisma.company.findUnique({ where: { code: 'COMPANY_A' } });
    const compB = await prisma.company.findUnique({ where: { code: 'COMPANY_B' } });
    assert(compA, 'Company A must exist');
    assert(compB, 'Company B must exist');

    // -------------------------------------------------------------
    // 1. Role-Based Access Control
    // -------------------------------------------------------------
    await runTest('1. Access Control: Cashier & Company Admin forbidden from Expense Management', async () => {
      // Login as Billing User
      await authService.login({
        email: 'billing@example.com',
        password: 'Billing@123',
      });

      let rejectedCashier = false;
      try {
        await expenseService.listExpenses();
      } catch (err) {
        rejectedCashier = true;
        assert(err.message.includes('Forbidden') || err.message.includes('Super Admin'));
      }
      assert(rejectedCashier, 'Cashier must be blocked from Expense Management');

      // Login as Company Admin
      await authService.login({
        email: 'adminA@example.com',
        password: 'Admin@123',
      });

      let rejectedAdmin = false;
      try {
        await expenseService.listExpenses();
      } catch (err) {
        rejectedAdmin = true;
        assert(err.message.includes('Forbidden') || err.message.includes('Super Admin'));
      }
      assert(rejectedAdmin, 'Company Admin must be blocked from Expense Management');
    });

    // Login as Super Admin
    await authService.login({
      email: 'superadmin@example.com',
      password: 'SuperAdmin@123',
    });

    // -------------------------------------------------------------
    // 2. Default Expense Categories Seeding
    // -------------------------------------------------------------
    let salaryCategory = null;
    let electricityCategory = null;
    let officeCategory = null;

    await runTest('2. Default Categories: 8 default expense categories seeded', async () => {
      const categories = await expenseService.listExpenseCategories();
      assert(categories.length >= 8, `Expected at least 8 categories, got ${categories.length}`);

      const names = categories.map((c) => c.name);
      const expectedDefaults = [
        'Salary',
        'Conveyance',
        'Electricity',
        'Maintenance',
        'Rent',
        'Internet',
        'Office Expenses',
        'Other Expenses',
      ];

      for (const expected of expectedDefaults) {
        assert(names.includes(expected), `Default category "${expected}" must exist`);
      }

      salaryCategory = categories.find((c) => c.name === 'Salary');
      electricityCategory = categories.find((c) => c.name === 'Electricity');
      officeCategory = categories.find((c) => c.name === 'Office Expenses');
      assert(salaryCategory);
      assert(electricityCategory);
      assert(officeCategory);
    });

    // -------------------------------------------------------------
    // 3. Ensure Baseline Balance for Company A & B
    // -------------------------------------------------------------
    await runTest('3. Baseline Balance: Ensure test sales inflow for Company A and Company B', async () => {
      // Create a test bill with items for Company A and Company B to guarantee sufficient positive funds
      const existingBalances = await expenseService.getCompanyBalances();
      const balA = existingBalances.find((b) => b.companyId === compA.id);
      const balB = existingBalances.find((b) => b.companyId === compB.id);

      // If Company A cash balance < 50000, create a cash bill for test
      if (!balA || balA.cashBalance < 50000) {
        const billA = await prisma.bill.create({
          data: {
            invoiceNumber: `TEST-CASH-A-${Date.now()}`,
            billingUserName: 'Super Admin',
            totalAmount: 100000,
            paymentMethod: 'CASH',
            status: 'COMPLETED',
            items: {
              create: [
                {
                  companyId: compA.id,
                  companyName: compA.name,
                  barcode: `TEST-BC-A-${Date.now()}`,
                  productName: 'Sample Inflow Product A',
                  unitPrice: 100000,
                  quantity: 1,
                  totalPrice: 100000,
                },
              ],
            },
          },
        });
        assert(billA.id);
      }

      // If Company A online balance < 50000, create an online bill for test
      if (!balA || balA.onlineBalance < 50000) {
        await prisma.bill.create({
          data: {
            invoiceNumber: `TEST-ONLINE-A-${Date.now()}`,
            billingUserName: 'Super Admin',
            totalAmount: 100000,
            paymentMethod: 'ONLINE',
            status: 'COMPLETED',
            items: {
              create: [
                {
                  companyId: compA.id,
                  companyName: compA.name,
                  barcode: `TEST-BC-A-ON-${Date.now()}`,
                  productName: 'Sample Online Inflow Product A',
                  unitPrice: 100000,
                  quantity: 1,
                  totalPrice: 100000,
                },
              ],
            },
          },
        });
      }

      // If Company B cash balance < 50000, create a cash bill for test
      if (!balB || balB.cashBalance < 50000) {
        await prisma.bill.create({
          data: {
            invoiceNumber: `TEST-CASH-B-${Date.now()}`,
            billingUserName: 'Super Admin',
            totalAmount: 100000,
            paymentMethod: 'CASH',
            status: 'COMPLETED',
            items: {
              create: [
                {
                  companyId: compB.id,
                  companyName: compB.name,
                  barcode: `TEST-BC-B-${Date.now()}`,
                  productName: 'Sample Inflow Product B',
                  unitPrice: 100000,
                  quantity: 1,
                  totalPrice: 100000,
                },
              ],
            },
          },
        });
      }

      // If Company B online balance < 50000, create an online bill for test
      if (!balB || balB.onlineBalance < 50000) {
        await prisma.bill.create({
          data: {
            invoiceNumber: `TEST-ONLINE-B-${Date.now()}`,
            billingUserName: 'Super Admin',
            totalAmount: 100000,
            paymentMethod: 'ONLINE',
            status: 'COMPLETED',
            items: {
              create: [
                {
                  companyId: compB.id,
                  companyName: compB.name,
                  barcode: `TEST-BC-B-ON-${Date.now()}`,
                  productName: 'Sample Online Inflow Product B',
                  unitPrice: 100000,
                  quantity: 1,
                  totalPrice: 100000,
                },
              ],
            },
          },
        });
      }

      const updatedBalances = await expenseService.getCompanyBalances();
      const updatedA = updatedBalances.find((b) => b.companyId === compA.id);
      const updatedB = updatedBalances.find((b) => b.companyId === compB.id);

      assert(updatedA.cashBalance >= 50000, `Company A cash balance must be >= 50000, got ${updatedA.cashBalance}`);
      assert(updatedA.onlineBalance >= 50000, `Company A online balance must be >= 50000, got ${updatedA.onlineBalance}`);
      assert(updatedB.cashBalance >= 50000, `Company B cash balance must be >= 50000, got ${updatedB.cashBalance}`);
      assert(updatedB.onlineBalance >= 50000, `Company B online balance must be >= 50000, got ${updatedB.onlineBalance}`);
    });

    // -------------------------------------------------------------
    // 4. Add Cash Expense for Company A & Verify Balance Isolation
    // -------------------------------------------------------------
    let expense1 = null;
    let preExpenseBalances = null;

    await runTest('4. Add Cash Expense for Company A & verify strict balance isolation', async () => {
      preExpenseBalances = await expenseService.getCompanyBalances();
      const initA = preExpenseBalances.find((b) => b.companyId === compA.id);
      const initB = preExpenseBalances.find((b) => b.companyId === compB.id);

      const amountToDeduct = 5000;
      expense1 = await expenseService.createExpense({
        companyId: compA.id,
        categoryId: electricityCategory.id,
        amount: amountToDeduct,
        paymentMethod: 'CASH',
        expenseDate: '2026-11-16',
        description: 'Showroom electricity bill payment',
      });

      assert(expense1.id, 'Expense 1 must have an ID');
      assert.strictEqual(expense1.amount, 5000);
      assert.strictEqual(expense1.paymentMethod, 'CASH');

      const postBalances = await expenseService.getCompanyBalances();
      const postA = postBalances.find((b) => b.companyId === compA.id);
      const postB = postBalances.find((b) => b.companyId === compB.id);

      // Company A Cash Balance must decrease by exactly 5,000
      assert.strictEqual(
        postA.cashBalance,
        Math.round((initA.cashBalance - amountToDeduct) * 100) / 100,
        'Company A cash balance must decrease by 5,000'
      );

      // Company A Online Balance must remain completely unchanged
      assert.strictEqual(
        postA.onlineBalance,
        initA.onlineBalance,
        'Company A online balance must be unchanged'
      );

      // Company B Cash and Online Balances must remain completely unchanged
      assert.strictEqual(
        postB.cashBalance,
        initB.cashBalance,
        'Company B cash balance must never be affected by Company A expense'
      );
      assert.strictEqual(
        postB.onlineBalance,
        initB.onlineBalance,
        'Company B online balance must never be affected by Company A expense'
      );
    });

    // -------------------------------------------------------------
    // 5. Add Online Expense for Company A
    // -------------------------------------------------------------
    let expense2 = null;
    await runTest('5. Add Online Expense for Company A & verify online balance deduction', async () => {
      const preBalances = await expenseService.getCompanyBalances();
      const preA = preBalances.find((b) => b.companyId === compA.id);
      const preB = preBalances.find((b) => b.companyId === compB.id);

      const amount = 3500;
      expense2 = await expenseService.createExpense({
        companyId: compA.id,
        categoryId: officeCategory.id,
        amount,
        paymentMethod: 'ONLINE',
        expenseDate: '2026-11-16',
        description: 'Showroom stationery and printer ink',
      });

      assert(expense2.id);
      const postBalances = await expenseService.getCompanyBalances();
      const postA = postBalances.find((b) => b.companyId === compA.id);
      const postB = postBalances.find((b) => b.companyId === compB.id);

      // Company A Online must decrease by 3500
      assert.strictEqual(
        postA.onlineBalance,
        Math.round((preA.onlineBalance - amount) * 100) / 100
      );
      // Company A Cash must remain unchanged
      assert.strictEqual(postA.cashBalance, preA.cashBalance);
      // Company B unchanged
      assert.strictEqual(postB.onlineBalance, preB.onlineBalance);
      assert.strictEqual(postB.cashBalance, preB.cashBalance);
    });

    // -------------------------------------------------------------
    // 6. Add Cash Expense for Company B
    // -------------------------------------------------------------
    let expense3 = null;
    await runTest('6. Add Cash Expense for Company B & verify Company A is unaffected', async () => {
      const preBalances = await expenseService.getCompanyBalances();
      const preA = preBalances.find((b) => b.companyId === compA.id);
      const preB = preBalances.find((b) => b.companyId === compB.id);

      const amount = 2500;
      expense3 = await expenseService.createExpense({
        companyId: compB.id,
        categoryId: officeCategory.id,
        amount,
        paymentMethod: 'CASH',
        expenseDate: '2026-11-16',
        description: 'Store maintenance supplies',
      });

      assert(expense3.id);
      const postBalances = await expenseService.getCompanyBalances();
      const postA = postBalances.find((b) => b.companyId === compA.id);
      const postB = postBalances.find((b) => b.companyId === compB.id);

      // Company B Cash decreased
      assert.strictEqual(
        postB.cashBalance,
        Math.round((preB.cashBalance - amount) * 100) / 100
      );
      // Company B Online unchanged
      assert.strictEqual(postB.onlineBalance, preB.onlineBalance);
      // Company A completely unaffected
      assert.strictEqual(postA.cashBalance, preA.cashBalance);
      assert.strictEqual(postA.onlineBalance, preA.onlineBalance);
    });

    // -------------------------------------------------------------
    // 7. Add Online Salary Expense for Company B using Billing User
    // -------------------------------------------------------------
    let sharedEmployee = null;
    let expense4Salary = null;

    await runTest('7. Add Online Salary Expense for Company B using Billing User as employee', async () => {
      // Find billing users who serve as employees for both companies
      const billingUsers = await expenseService.listEmployees();
      assert(billingUsers.length > 0, 'Must have registered billing users');
      sharedEmployee = billingUsers[0];

      const preBalances = await expenseService.getCompanyBalances();
      const preB = preBalances.find((b) => b.companyId === compB.id);

      const salaryAmount = 18000;
      expense4Salary = await expenseService.createExpense({
        companyId: compB.id,
        categoryId: salaryCategory.id,
        employeeId: sharedEmployee.id,
        amount: salaryAmount,
        paymentMethod: 'ONLINE',
        expenseDate: '2026-11-16',
        description: `November Monthly Salary for ${sharedEmployee.name}`,
      });

      assert(expense4Salary.id);
      assert.strictEqual(expense4Salary.employeeId, sharedEmployee.id);
      assert.strictEqual(expense4Salary.employeeName, sharedEmployee.name);

      const postBalances = await expenseService.getCompanyBalances();
      const postB = postBalances.find((b) => b.companyId === compB.id);

      // Company B Online decreased by 18,000
      assert.strictEqual(
        postB.onlineBalance,
        Math.round((preB.onlineBalance - salaryAmount) * 100) / 100
      );
    });

    // -------------------------------------------------------------
    // 8. Shared Employees: Same billing user can receive salary from Company A
    // -------------------------------------------------------------
    await runTest('8. Shared Billing Users: Same employee can receive salary in both Company A and B', async () => {
      assert(sharedEmployee, 'sharedEmployee must be defined');

      const preBalances = await expenseService.getCompanyBalances();
      const preA = preBalances.find((b) => b.companyId === compA.id);

      const salaryAmountA = 12000;
      const salaryExpenseA = await expenseService.createExpense({
        companyId: compA.id,
        categoryId: salaryCategory.id,
        employeeId: sharedEmployee.id,
        amount: salaryAmountA,
        paymentMethod: 'CASH',
        expenseDate: '2026-11-16',
        description: `Company A Salary payout for ${sharedEmployee.name}`,
      });

      assert(salaryExpenseA.id);
      assert.strictEqual(salaryExpenseA.companyId, compA.id);
      assert.strictEqual(salaryExpenseA.employeeId, sharedEmployee.id);
      assert.strictEqual(salaryExpenseA.employeeName, sharedEmployee.name);

      const postBalances = await expenseService.getCompanyBalances();
      const postA = postBalances.find((b) => b.companyId === compA.id);

      // Company A Cash decreased by 12,000
      assert.strictEqual(
        postA.cashBalance,
        Math.round((preA.cashBalance - salaryAmountA) * 100) / 100
      );

      // Non-existent employee ID check
      let invalidErrorThrown = false;
      try {
        await expenseService.createExpense({
          companyId: compA.id,
          categoryId: salaryCategory.id,
          employeeId: 'invalid-non-existent-user-id',
          amount: 1000,
          paymentMethod: 'CASH',
          expenseDate: '2026-11-16',
        });
      } catch (err) {
        invalidErrorThrown = true;
        assert(err.message.includes('not found'));
      }
      assert(invalidErrorThrown, 'Invalid billing user ID must throw error');
    });

    // -------------------------------------------------------------
    // 9. Insufficient Balance Protection (No Overdraft)
    // -------------------------------------------------------------
    await runTest('9. Insufficient balance: blocks expense exceeding available funds', async () => {
      const balances = await expenseService.getCompanyBalances();
      const balA = balances.find((b) => b.companyId === compA.id);
      const excessiveAmount = balA.cashBalance + 9999999;

      let errorThrown = false;
      try {
        await expenseService.createExpense({
          companyId: compA.id,
          categoryId: officeCategory.id,
          amount: excessiveAmount,
          paymentMethod: 'CASH',
          expenseDate: '2026-11-16',
          description: 'Excessive expense attempt',
        });
      } catch (err) {
        errorThrown = true;
        assert(
          err.message.includes('Insufficient') && err.message.includes('Available'),
          'Error must state Insufficient balance with available amount'
        );
      }
      assert(errorThrown, 'Overdraft must be blocked');
    });

    // -------------------------------------------------------------
    // 10. Edit Expense & Verify Atomic Balance Adjustment
    // -------------------------------------------------------------
    await runTest('10. Edit Expense: updates amount and adjusts balance atomically', async () => {
      // Modify expense1 (originally ₹5,000 cash for Company A) -> change to ₹7,000 cash
      const preBalances = await expenseService.getCompanyBalances();
      const preA = preBalances.find((b) => b.companyId === compA.id);

      const updatedExpense = await expenseService.updateExpense({
        id: expense1.id,
        companyId: compA.id,
        categoryId: electricityCategory.id,
        amount: 7000,
        paymentMethod: 'CASH',
        expenseDate: '2026-11-16',
        description: 'Electricity bill updated to ₹7,000 with surcharge',
      });

      assert.strictEqual(updatedExpense.amount, 7000);

      const postBalances = await expenseService.getCompanyBalances();
      const postA = postBalances.find((b) => b.companyId === compA.id);

      // The additional ₹2,000 must be deducted
      assert.strictEqual(
        postA.cashBalance,
        Math.round((preA.cashBalance - 2000) * 100) / 100,
        'Net cash balance should decrease by 2,000 after increasing expense by 2,000'
      );
    });

    // -------------------------------------------------------------
    // 11. Delete Expense & Full Financial Balance Restoration
    // -------------------------------------------------------------
    await runTest('11. Delete Expense: completely restores funds to company balance', async () => {
      const preBalances = await expenseService.getCompanyBalances();
      const preA = preBalances.find((b) => b.companyId === compA.id);

      // Delete expense2 (which was ₹3,500 ONLINE for Company A)
      const deleteResult = await expenseService.deleteExpense(expense2.id);
      assert(deleteResult.success);

      const postBalances = await expenseService.getCompanyBalances();
      const postA = postBalances.find((b) => b.companyId === compA.id);

      // ₹3,500 must be restored to Company A online balance
      assert.strictEqual(
        postA.onlineBalance,
        Math.round((preA.onlineBalance + 3500) * 100) / 100,
        'Company A online balance must be restored by 3,500'
      );

      // Confirm record is deleted
      const checkDeleted = await prisma.expense.findUnique({ where: { id: expense2.id } });
      assert.strictEqual(checkDeleted, null, 'Expense record must no longer exist in DB');
    });

    // -------------------------------------------------------------
    // 12. Audit Trail & Financial Reports Verification
    // -------------------------------------------------------------
    await runTest('12. Auditable Financial History: check financial_transactions and report aggregations', async () => {
      // 1. Audit trail records
      const txLogs = await prisma.financialTransaction.findMany({
        where: {
          companyId: compA.id,
        },
        orderBy: { createdAt: 'desc' },
      });

      assert(txLogs.length > 0, 'Auditable financial transactions must be recorded');
      const deductionLog = txLogs.find((t) => t.type === 'EXPENSE_DEDUCTION');
      assert(deductionLog, 'Must have recorded EXPENSE_DEDUCTION audit log');
      assert(typeof deductionLog.balanceBefore === 'number');
      assert(typeof deductionLog.balanceAfter === 'number');

      // 2. Summary & Reports
      const summary = await expenseService.getExpenseSummary();
      assert(summary.totalExpenses > 0, 'Summary total expenses must be greater than 0');
      assert(summary.categoryBreakdown.length > 0, 'Category breakdown must have entries');
      assert(summary.companyBreakdown.length > 0, 'Company breakdown must have entries');
      assert(summary.dateBreakdown.length > 0, 'Date breakdown must have entries');

      console.log(`\n    [Audit Summary] Total Expenses: ₹${summary.totalExpenses}, Cash: ₹${summary.totalCashExpenses}, Online: ₹${summary.totalOnlineExpenses}, Salary: ₹${summary.totalSalaryExpenses}`);
    });

    console.log('\n======================================================');
    console.log(`TEST RESULTS: ${testsPassed} PASSED, ${testsFailed} FAILED`);
    console.log('======================================================\n');

    if (testsFailed > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  } catch (err) {
    console.error('\nCRITICAL TEST SUITE ERROR:', err);
    process.exit(1);
  }
});
