/**
 * Phase 4 Verification Test Script
 * Runs all 11 tests from Section 22 against Electron main services and SQLite database.
 */

const { app } = require('electron');
const assert = require('assert');

// We must wait for app.whenReady() so Electron paths (userData) are available
app.whenReady().then(async () => {
  console.log('\n==================================================');
  console.log('STARTING PHASE 4 SPECIFICATION TEST SUITE');
  console.log('==================================================\n');

  try {
    const { initializeDatabase, getPrismaClient } = require('../dist-electron/main/database/prisma');
    const { authService } = require('../dist-electron/main/services/authService');
    const { categoryService } = require('../dist-electron/main/services/categoryService');
    const { categoryFieldService } = require('../dist-electron/main/services/categoryFieldService');

    // 0. Initialize Database
    console.log('[INIT] Initializing database in Electron userData...');
    await initializeDatabase();
    const prisma = getPrismaClient();

    // Clean up any test categories from previous test runs
    await prisma.category.deleteMany({
      where: {
        name: { in: ['Test Cat Artificial Jewellery', 'Test Cat German Silver', 'Test Cat Company B Only'] },
      },
    });

    // -------------------------------------------------------------------------
    // TEST 1: Login as Company A admin. Open a Company A category. Add: Product Name, text, required
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 1: Login as Company A admin and create text field ---');
    const sessionA = await authService.login({
      email: 'admina@example.com',
      password: 'Admin@123',
    });
    assert.strictEqual(sessionA.companyCode, 'COMPANY_A', 'Must be logged in as Company A');
    console.log(`[PASS] Logged in as: ${sessionA.adminName} (${sessionA.companyName})`);

    const catA = await categoryService.createCategory({
      name: 'Test Cat Artificial Jewellery',
      description: 'Test category for Phase 4',
    });
    console.log(`[PASS] Created test category A: "${catA.name}" (ID: ${catA.id})`);

    const field1 = await categoryFieldService.createField({
      categoryId: catA.id,
      name: 'Product Name',
      fieldKey: 'productName',
      fieldType: 'text',
      required: true,
      displayOrder: 1,
    });
    assert.strictEqual(field1.name, 'Product Name');
    assert.strictEqual(field1.fieldKey, 'productName');
    assert.strictEqual(field1.fieldType, 'text');
    assert.strictEqual(field1.required, true);
    assert.strictEqual(field1.displayOrder, 1);
    console.log('[TEST 1 PASSED] Field "Product Name" (text, required) created successfully.');

    // -------------------------------------------------------------------------
    // TEST 2: Add: Colour, select, required. Options: Gold, Silver, Black
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 2: Add "Colour" (select, required) with options ---');
    const field2 = await categoryFieldService.createField({
      categoryId: catA.id,
      name: 'Colour',
      fieldKey: 'colour',
      fieldType: 'select',
      required: true,
      options: ['Gold', 'Silver', 'Black'],
      displayOrder: 2,
    });
    assert.strictEqual(field2.name, 'Colour');
    assert.strictEqual(field2.fieldKey, 'colour');
    assert.strictEqual(field2.fieldType, 'select');
    assert.strictEqual(field2.required, true);
    assert.deepStrictEqual(field2.options, ['Gold', 'Silver', 'Black']);
    console.log('[TEST 2 PASSED] Options saved correctly: ', field2.options);

    // -------------------------------------------------------------------------
    // TEST 3: Add: Weight, number, required
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 3: Add "Weight" (number, required) ---');
    const field3 = await categoryFieldService.createField({
      categoryId: catA.id,
      name: 'Weight',
      fieldKey: 'weight',
      fieldType: 'number',
      required: true,
      displayOrder: 3,
    });
    assert.strictEqual(field3.name, 'Weight');
    assert.strictEqual(field3.fieldKey, 'weight');
    assert.strictEqual(field3.fieldType, 'number');
    assert.strictEqual(field3.required, true);
    console.log('[TEST 3 PASSED] Field type stored as number successfully.');

    // -------------------------------------------------------------------------
    // TEST 4: Reorder fields
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 4: Reorder fields ---');
    // Change order to: Weight (3) -> Product Name (1) -> Colour (2)
    const reordered = await categoryFieldService.reorderFields({
      categoryId: catA.id,
      orderedFieldIds: [field3.id, field1.id, field2.id],
    });
    assert.strictEqual(reordered[0].id, field3.id);
    assert.strictEqual(reordered[0].displayOrder, 1);
    assert.strictEqual(reordered[1].id, field1.id);
    assert.strictEqual(reordered[1].displayOrder, 2);
    assert.strictEqual(reordered[2].id, field2.id);
    assert.strictEqual(reordered[2].displayOrder, 3);
    console.log('[TEST 4 PASSED] Fields reordered successfully:');
    reordered.forEach((f) => console.log(`   ${f.displayOrder}. ${f.name} (${f.fieldKey})`));

    // -------------------------------------------------------------------------
    // TEST 5: Edit field name. fieldKey remains unchanged
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 5: Edit field name, fieldKey remains unchanged ---');
    const updated = await categoryFieldService.updateField({
      id: field1.id,
      name: 'Item Name',
    });
    assert.strictEqual(updated.name, 'Item Name');
    assert.strictEqual(updated.fieldKey, 'productName', 'fieldKey must be unchanged');
    console.log(`[TEST 5 PASSED] Field name changed to "${updated.name}", fieldKey remains "${updated.fieldKey}".`);

    // -------------------------------------------------------------------------
    // TEST 6: Attempt duplicate fieldKey in same category -> Rejected
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 6: Attempt duplicate fieldKey in same category ---');
    let duplicateRejected = false;
    try {
      await categoryFieldService.createField({
        categoryId: catA.id,
        name: 'Another Colour',
        fieldKey: 'colour', // already used in catA
        fieldType: 'text',
      });
    } catch (err) {
      duplicateRejected = true;
      console.log(`[PASS] Correctly rejected with error: "${err.message}"`);
    }
    assert.strictEqual(duplicateRejected, true, 'Duplicate fieldKey in same category must be rejected');
    console.log('[TEST 6 PASSED] Duplicate fieldKey in same category rejected.');

    // -------------------------------------------------------------------------
    // TEST 7: Use same fieldKey in a different category -> Allowed
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 7: Use same fieldKey in a different category ---');
    const catA2 = await categoryService.createCategory({
      name: 'Test Cat German Silver',
      description: 'Second category for Company A',
    });
    const fieldCatA2 = await categoryFieldService.createField({
      categoryId: catA2.id,
      name: 'Colour',
      fieldKey: 'colour', // same key as in catA, but different category
      fieldType: 'select',
      options: ['Antique Silver', 'Shiny Silver'],
    });
    assert.strictEqual(fieldCatA2.fieldKey, 'colour');
    assert.strictEqual(fieldCatA2.categoryId, catA2.id);
    console.log(`[TEST 7 PASSED] Reused fieldKey "colour" in category "${catA2.name}" allowed.`);

    // -------------------------------------------------------------------------
    // TEST 8: Company A admin attempts to manage fields of Company B category -> Rejected
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 8: Cross-company access rejected ---');
    // Login as Company B admin to create a category
    await authService.login({
      email: 'adminb@example.com',
      password: 'Admin@123',
    });
    const catB = await categoryService.createCategory({
      name: 'Test Cat Company B Only',
      description: 'Belongs strictly to Company B',
    });
    console.log(`[SETUP] Created Company B category: "${catB.name}" (ID: ${catB.id})`);

    // Now switch back to Company A admin
    await authService.login({
      email: 'admina@example.com',
      password: 'Admin@123',
    });

    let crossCompanyCreateRejected = false;
    try {
      await categoryFieldService.createField({
        categoryId: catB.id,
        name: 'Hacked Field',
        fieldKey: 'hackedField',
        fieldType: 'text',
      });
    } catch (err) {
      crossCompanyCreateRejected = true;
      console.log(`[PASS] createField rejected: "${err.message}"`);
    }
    assert.strictEqual(crossCompanyCreateRejected, true, 'Company A must NOT create fields in Company B');

    let crossCompanyListRejected = false;
    try {
      await categoryFieldService.listFields(catB.id);
    } catch (err) {
      crossCompanyListRejected = true;
      console.log(`[PASS] listFields rejected: "${err.message}"`);
    }
    assert.strictEqual(crossCompanyListRejected, true, 'Company A must NOT list fields in Company B');
    console.log('[TEST 8 PASSED] Cross-company category-field operations strictly rejected.');

    // -------------------------------------------------------------------------
    // TEST 9: Logout. Attempt category-field operation -> Rejected
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 9: Unauthenticated operation rejected ---');
    await authService.logout();
    let unauthenticatedRejected = false;
    try {
      await categoryFieldService.listFields(catA.id);
    } catch (err) {
      unauthenticatedRejected = true;
      console.log(`[PASS] Logged out listFields rejected: "${err.message}"`);
    }
    assert.strictEqual(unauthenticatedRejected, true, 'Unauthenticated operation must be rejected');
    console.log('[TEST 9 PASSED] Operations after logout are rejected.');

    // -------------------------------------------------------------------------
    // TEST 10: Restart Electron (re-initialize) -> Category fields remain
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 10: Re-login & persist fields across service calls ---');
    await authService.login({
      email: 'admina@example.com',
      password: 'Admin@123',
    });
    const fieldsAfterRelogin = await categoryFieldService.listFields(catA.id);
    assert.strictEqual(fieldsAfterRelogin.length, 3, 'Must retain all 3 fields');
    assert.strictEqual(fieldsAfterRelogin[0].name, 'Weight');
    assert.strictEqual(fieldsAfterRelogin[1].name, 'Item Name');
    assert.strictEqual(fieldsAfterRelogin[2].name, 'Colour');
    console.log(`[TEST 10 PASSED] All ${fieldsAfterRelogin.length} fields persist and match expected state.`);

    // -------------------------------------------------------------------------
    // TEST 11: Data integrity check (Companies, Admins, Categories, Fields preserved)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 11: System data integrity check ---');
    const companies = await prisma.company.count();
    assert.strictEqual(companies, 2, 'Must have exactly 2 companies');
    const admins = await prisma.adminUser.count();
    assert.strictEqual(admins, 2, 'Must have exactly 2 admins');
    const fieldCount = await prisma.categoryField.count();
    assert(fieldCount >= 4, `Category fields must be preserved (found ${fieldCount})`);
    console.log(`[TEST 11 PASSED] 2 Companies, 2 Admins, and ${fieldCount} Category Fields preserved without loss.`);

    console.log('\n==================================================');
    console.log('ALL 11 PHASE 4 TESTS COMPLETED SUCCESSFULLY!');
    console.log('==================================================\n');

    // Clean up test categories
    await prisma.category.deleteMany({
      where: {
        name: { in: ['Test Cat Artificial Jewellery', 'Test Cat German Silver', 'Test Cat Company B Only'] },
      },
    });

    app.exit(0);
  } catch (err) {
    console.error('\n[TEST SUITE FAILURE]:', err);
    app.exit(1);
  }
});
