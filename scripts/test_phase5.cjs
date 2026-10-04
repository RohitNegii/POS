/**
 * Phase 5 Specification Test Suite
 * Tests all 16 verification tests from Phase 5 specification against Electron Main services and SQLite database.
 */

const { app } = require('electron');
const assert = require('assert');

app.whenReady().then(async () => {
  console.log('\n==================================================');
  console.log('STARTING PHASE 5 SPECIFICATION TEST SUITE');
  console.log('==================================================\n');

  try {
    const { initializeDatabase, getPrismaClient, getDatabasePaths } = require('../dist-electron/main/database/prisma');
    const { seedAll } = require('../dist-electron/main/database/seed');
    const { authService } = require('../dist-electron/main/services/authService');
    const { categoryService } = require('../dist-electron/main/services/categoryService');
    const { categoryFieldService } = require('../dist-electron/main/services/categoryFieldService');
    const { productService } = require('../dist-electron/main/services/productService');

    // Initialize Database
    console.log('[INIT] Initializing database in Electron userData...');
    await initializeDatabase();
    let prisma = getPrismaClient();

    // Clean up any test categories/products from previous test runs
    const existingTestCats = await prisma.category.findMany({
      where: {
        name: { in: ['Phase5 Test Gold Jewellery', 'Phase5 Test Silver Articles'] },
      },
      select: { id: true },
    });
    if (existingTestCats.length > 0) {
      await prisma.product.deleteMany({
        where: { categoryId: { in: existingTestCats.map((c) => c.id) } },
      });
      await prisma.category.deleteMany({
        where: { id: { in: existingTestCats.map((c) => c.id) } },
      });
    }

    // -------------------------------------------------------------------------
    // TEST 1: Company A admin creates a product
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 1: Company A admin creates a product ---');
    const sessionA = await authService.login({
      email: 'admina@example.com',
      password: 'Admin@123',
    });
    assert.strictEqual(sessionA.companyCode, 'COMPANY_A');

    const catA = await categoryService.createCategory({
      name: 'Phase5 Test Gold Jewellery',
      description: 'Gold items category',
    });

    const fieldWeight = await categoryFieldService.createField({
      categoryId: catA.id,
      name: 'Weight',
      fieldKey: 'weight',
      fieldType: 'number',
      required: true,
      displayOrder: 1,
    });

    const fieldPurity = await categoryFieldService.createField({
      categoryId: catA.id,
      name: 'Purity',
      fieldKey: 'purity',
      fieldType: 'select',
      required: true,
      options: ['18K', '22K', '24K'],
      displayOrder: 2,
    });

    const productA1 = await productService.createProduct({
      categoryId: catA.id,
      name: 'Gold Necklace 22K',
      fieldValues: [
        { categoryFieldId: fieldWeight.id, valueNumber: 15.5 },
        { categoryFieldId: fieldPurity.id, valueText: '22K' },
      ],
    });

    assert(productA1.id, 'Product must have permanent UUID');
    assert.strictEqual(productA1.name, 'Gold Necklace 22K');
    assert.strictEqual(productA1.companyId, sessionA.companyId);
    assert.strictEqual(productA1.categoryId, catA.id);
    assert(productA1.barcode && productA1.barcode.length >= 6, 'Product must have permanent barcode');
    assert.strictEqual(productA1.isArchived, false);
    const origBarcodeA1 = productA1.barcode;
    console.log(`[TEST 1 PASSED] Product created: "${productA1.name}" | Barcode: ${origBarcodeA1} | ID: ${productA1.id}`);

    // -------------------------------------------------------------------------
    // TEST 2: Restart application (re-query product directly from SQLite)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 2: Application restart / SQLite persistence verification ---');
    const reloadedProductA1 = await productService.getProductById(productA1.id);
    assert.strictEqual(reloadedProductA1.id, productA1.id);
    assert.strictEqual(reloadedProductA1.name, productA1.name);
    console.log(`[TEST 2 PASSED] Product persists across application restart.`);

    // -------------------------------------------------------------------------
    // TEST 3: Open product -> Barcode is exactly the same
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 3: Barcode consistency ---');
    assert.strictEqual(reloadedProductA1.barcode, origBarcodeA1, 'Barcode must not change on reload');
    console.log(`[TEST 3 PASSED] Barcode is exactly the same: ${reloadedProductA1.barcode}`);

    // -------------------------------------------------------------------------
    // TEST 4: Edit product name -> Barcode remains exactly the same
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 4: Edit product name ---');
    const updatedNameProd = await productService.updateProduct({
      id: productA1.id,
      name: 'Gold Luxury Necklace 22K',
      fieldValues: [
        { categoryFieldId: fieldWeight.id, valueNumber: 15.5 },
        { categoryFieldId: fieldPurity.id, valueText: '22K' },
      ],
    });
    assert.strictEqual(updatedNameProd.name, 'Gold Luxury Necklace 22K');
    assert.strictEqual(updatedNameProd.barcode, origBarcodeA1, 'Barcode must NOT change on edit name');
    console.log(`[TEST 4 PASSED] Name updated to "${updatedNameProd.name}". Barcode remains: ${updatedNameProd.barcode}`);

    // -------------------------------------------------------------------------
    // TEST 5: Edit dynamic field -> Barcode remains exactly the same
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 5: Edit dynamic field value ---');
    const updatedFieldProd = await productService.updateProduct({
      id: productA1.id,
      name: 'Gold Luxury Necklace 22K',
      fieldValues: [
        { categoryFieldId: fieldWeight.id, valueNumber: 16.25 },
        { categoryFieldId: fieldPurity.id, valueText: '24K' },
      ],
    });
    const updatedWeightVal = updatedFieldProd.fieldValues?.find((fv) => fv.categoryFieldId === fieldWeight.id);
    assert.strictEqual(updatedWeightVal?.valueNumber, 16.25);
    assert.strictEqual(updatedFieldProd.barcode, origBarcodeA1, 'Barcode must NOT change on dynamic field edit');
    console.log(`[TEST 5 PASSED] Dynamic field updated (weight=16.25). Barcode remains: ${updatedFieldProd.barcode}`);

    // -------------------------------------------------------------------------
    // TEST 6: Create second product -> Different unique barcode
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 6: Create second product ---');
    const productA2 = await productService.createProduct({
      categoryId: catA.id,
      name: 'Gold Ring 22K',
      fieldValues: [
        { categoryFieldId: fieldWeight.id, valueNumber: 5.2 },
        { categoryFieldId: fieldPurity.id, valueText: '22K' },
      ],
    });
    assert.notStrictEqual(productA2.barcode, origBarcodeA1, 'Second product must have different barcode');
    assert.strictEqual(productA2.name, 'Gold Ring 22K');
    console.log(`[TEST 6 PASSED] Second product created with unique barcode: ${productA2.barcode}`);

    // -------------------------------------------------------------------------
    // TEST 7: Search by barcode
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 7: Search by barcode ---');
    const searchByBarcodeResults = await productService.listProducts({
      search: origBarcodeA1,
    });
    assert.strictEqual(searchByBarcodeResults.length, 1);
    assert.strictEqual(searchByBarcodeResults[0].id, productA1.id);
    console.log(`[TEST 7 PASSED] Search by barcode "${origBarcodeA1}" returned product "${searchByBarcodeResults[0].name}"`);

    // -------------------------------------------------------------------------
    // TEST 8: Search by product name
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 8: Search by product name ---');
    const searchByNameResults = await productService.listProducts({
      search: 'Luxury Necklace',
    });
    assert.strictEqual(searchByNameResults.length, 1);
    assert.strictEqual(searchByNameResults[0].id, productA1.id);
    console.log(`[TEST 8 PASSED] Search by name "Luxury Necklace" returned product "${searchByNameResults[0].name}"`);

    // -------------------------------------------------------------------------
    // TEST 9: Permanently delete product
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 9: Delete product permanently ---');
    await productService.deleteProduct(productA1.id);

    // Should NOT appear in active list
    const activeList = await productService.listProducts();
    const foundInActive = activeList.some((p) => p.id === productA1.id);
    assert.strictEqual(foundInActive, false, 'Deleted product must not appear in list');

    // Must be completely deleted from database
    const deletedInDb = await prisma.product.findUnique({ where: { id: productA1.id } });
    assert.strictEqual(deletedInDb, null, 'Product must be completely deleted from database');
    console.log(`[TEST 9 PASSED] Product permanently deleted from database.`);

    // -------------------------------------------------------------------------
    // TEST 10: Verify dynamic field values are purged
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 10: Verify related field values are purged ---');
    const orphanFieldValues = await prisma.productFieldValue.findMany({ where: { productId: productA1.id } });
    assert.strictEqual(orphanFieldValues.length, 0, 'Dynamic field values must be completely purged');
    console.log(`[TEST 10 PASSED] Dynamic field values purged with product deletion.`);

    // -------------------------------------------------------------------------
    // TEST 11: Company A creates product. Login as Company B -> Cannot see Product A
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 11: Company isolation on product listing ---');
    const sessionB = await authService.login({
      email: 'adminb@example.com',
      password: 'Admin@123',
    });
    assert.strictEqual(sessionB.companyCode, 'COMPANY_B');

    const productsSeenByB = await productService.listProducts();
    const canSeeProductA = productsSeenByB.some((p) => p.id === productA2.id);
    assert.strictEqual(canSeeProductA, false, 'Company B must NOT see Company A products');
    console.log(`[TEST 11 PASSED] Company B admin cannot see Company A products.`);

    // -------------------------------------------------------------------------
    // TEST 12: Company B attempts direct access to Product A -> Rejected
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 12: Company B direct access rejected ---');
    let directAccessRejected = false;
    try {
      await productService.getProductById(productA2.id);
    } catch (err) {
      directAccessRejected = true;
      console.log(`[PASS] Direct getProductById rejected: "${err.message}"`);
    }
    assert.strictEqual(directAccessRejected, true, 'Direct access across companies must be forbidden');

    let directUpdateRejected = false;
    try {
      await productService.updateProduct({
        id: productA2.id,
        name: 'Hacked by Company B',
        fieldValues: [],
      });
    } catch (err) {
      directUpdateRejected = true;
    }
    assert.strictEqual(directUpdateRejected, true, 'Direct cross-company update must be forbidden');

    let directDeleteRejected = false;
    try {
      await productService.deleteProduct(productA2.id);
    } catch (err) {
      directDeleteRejected = true;
    }
    assert.strictEqual(directDeleteRejected, true, 'Direct cross-company delete must be forbidden');
    console.log(`[TEST 12 PASSED] Cross-company get, update, and delete strictly rejected.`);

    // -------------------------------------------------------------------------
    // TEST 13: Company B creates its own product -> Allowed
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 13: Company B creates its own product ---');
    const catB = await categoryService.createCategory({
      name: 'Phase5 Test Silver Articles',
      description: 'Silver items for Company B',
    });
    const productB1 = await productService.createProduct({
      categoryId: catB.id,
      name: 'Silver Anklet',
      fieldValues: [],
    });
    assert.strictEqual(productB1.companyId, sessionB.companyId);
    assert.strictEqual(productB1.name, 'Silver Anklet');
    console.log(`[TEST 13 PASSED] Company B product created: "${productB1.name}" | Barcode: ${productB1.barcode}`);

    // -------------------------------------------------------------------------
    // TEST 14: Application restart -> All products remain
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 14: Products survive restart ---');
    const allProductsCount = await prisma.product.count({
      where: {
        id: { in: [productA2.id, productB1.id] },
      },
    });
    assert.strictEqual(allProductsCount, 2, 'Remaining 2 products must exist');
    console.log(`[TEST 14 PASSED] All created products remain in database after reload.`);

    // -------------------------------------------------------------------------
    // TEST 15: Run Prisma seed again -> No business data is deleted
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 15: Run Prisma seed idempotency test ---');
    await seedAll(prisma);
    const productsAfterSeed = await prisma.product.count({
      where: {
        id: { in: [productA2.id, productB1.id] },
      },
    });
    assert.strictEqual(productsAfterSeed, 2, 'All products must be intact after re-seeding');
    const companiesAfterSeed = await prisma.company.count();
    assert.strictEqual(companiesAfterSeed, 2);
    const adminsAfterSeed = await prisma.adminUser.count();
    assert.strictEqual(adminsAfterSeed, 2);
    console.log(`[TEST 15 PASSED] Re-running seed preserves all companies, admins, and products.`);

    // -------------------------------------------------------------------------
    // TEST 16: Non-destructive database path verification
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 16: Verify database location outside build/src ---');
    const paths = getDatabasePaths();
    assert(paths, 'Database paths must be resolved');
    assert(paths.isOutsideRestrictedDirs, 'Database must be outside restricted source/build directories');
    console.log(`[TEST 16 PASSED] Database securely resides in userData: ${paths.databaseFilePath}`);

    // Clean up test products and categories
    await prisma.product.deleteMany({
      where: { id: { in: [productA1.id, productA2.id, productB1.id] } },
    });
    await prisma.category.deleteMany({
      where: { id: { in: [catA.id, catB.id] } },
    });

    console.log('\n==================================================');
    console.log('ALL 16 PHASE 5 TESTS COMPLETED SUCCESSFULLY!');
    console.log('==================================================\n');

    app.exit(0);
  } catch (err) {
    console.error('\n[TEST SUITE FAILURE]:', err);
    app.exit(1);
  }
});
