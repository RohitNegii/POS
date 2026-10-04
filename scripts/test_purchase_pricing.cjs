/**
 * Verification test suite for Purchase Price, Additional Charges & Actual Purchase Price
 */

const { app } = require('electron');
const assert = require('assert');

app.whenReady().then(async () => {
  console.log('\n======================================================');
  console.log('STARTING PURCHASE PRICING VERIFICATION TEST SUITE');
  console.log('======================================================\n');

  try {
    const { initializeDatabase, getPrismaClient } = require('../dist-electron/main/database/prisma');
    const { authService } = require('../dist-electron/main/services/authService');
    const { categoryService } = require('../dist-electron/main/services/categoryService');
    const { productService } = require('../dist-electron/main/services/productService');

    await initializeDatabase();
    const prisma = getPrismaClient();

    // Login as Company A Admin
    const sessionA = await authService.login({
      email: 'admina@example.com',
      password: 'Admin@123',
    });
    console.log(`[AUTH] Logged in as: ${sessionA.adminName} (${sessionA.companyName})`);

    // Create dedicated test category
    let targetCat = await prisma.category.findFirst({
      where: { name: 'Purchase Test Category', companyId: sessionA.companyId },
    });
    if (!targetCat) {
      targetCat = await categoryService.createCategory({
        name: 'Purchase Test Category',
        description: 'Testing purchase pricing',
      });
    }

    // Clean up prior test products
    const testNames = [
      'Purchase Test Product 1 (100 @ 10%)',
      'Purchase Test Product 2 (500 @ 5%)',
      'Purchase Test Product 3 (1000 @ 15%)',
      'Purchase Test Product 4 (100 @ 0%)',
      'Purchase Test Decimal (123.45 @ 7.5%)',
    ];
    const existing = await prisma.product.findMany({
      where: { name: { in: testNames } },
      select: { id: true },
    });
    if (existing.length > 0) {
      const ids = existing.map((p) => p.id);
      await prisma.productFieldValue.deleteMany({ where: { productId: { in: ids } } });
      await prisma.product.deleteMany({ where: { id: { in: ids } } });
    }

    // -------------------------------------------------------------------------
    // TEST 1: Purchase Price = ₹100, Additional Charges = 10% -> Actual = ₹110
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 1: Purchase Price = ₹100, Additional Charges = 10% -> Actual = ₹110 ---');
    const prod1 = await productService.createProduct({
      categoryId: targetCat.id,
      name: 'Purchase Test Product 1 (100 @ 10%)',
      stockQuantity: 10,
      fieldValues: [],
      purchasePrice: 100,
      additionalChargesPercentage: 10,
    });

    assert.strictEqual(prod1.purchasePrice, 100, 'Purchase price must be 100');
    assert.strictEqual(prod1.additionalChargesPercentage, 10, 'Additional charges must be 10');
    assert.strictEqual(prod1.actualPurchasePrice, 110, 'Actual purchase price must be 110');

    // Verify stored inside fieldValues (ProductFieldValue)
    const p1Fv = prod1.fieldValues.find((fv) => fv.categoryField?.fieldKey === 'purchasePrice');
    const c1Fv = prod1.fieldValues.find((fv) => fv.categoryField?.fieldKey === 'additionalChargesPercentage');
    const a1Fv = prod1.fieldValues.find((fv) => fv.categoryField?.fieldKey === 'actualPurchasePrice');

    assert(p1Fv, 'ProductFieldValue for purchasePrice must exist');
    assert.strictEqual(p1Fv.valueNumber, 100, 'ProductFieldValue purchasePrice must be 100');
    assert(c1Fv, 'ProductFieldValue for additionalChargesPercentage must exist');
    assert.strictEqual(c1Fv.valueNumber, 10, 'ProductFieldValue additionalChargesPercentage must be 10');
    assert(a1Fv, 'ProductFieldValue for actualPurchasePrice must exist');
    assert.strictEqual(a1Fv.valueNumber, 110, 'ProductFieldValue actualPurchasePrice must be 110');
    console.log('[PASS] Test 1: Created product with ₹100 + 10% = ₹110. Stored in ProductFieldValue.');

    // -------------------------------------------------------------------------
    // TEST 2: Purchase Price = ₹500, Additional Charges = 5% -> Actual = ₹525
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 2: Purchase Price = ₹500, Additional Charges = 5% -> Actual = ₹525 ---');
    const prod2 = await productService.createProduct({
      categoryId: targetCat.id,
      name: 'Purchase Test Product 2 (500 @ 5%)',
      stockQuantity: 5,
      fieldValues: [],
      purchasePrice: 500,
      additionalChargesPercentage: 5,
    });
    assert.strictEqual(prod2.purchasePrice, 500);
    assert.strictEqual(prod2.additionalChargesPercentage, 5);
    assert.strictEqual(prod2.actualPurchasePrice, 525);
    console.log('[PASS] Test 2: Created product with ₹500 + 5% = ₹525.');

    // -------------------------------------------------------------------------
    // TEST 3: Purchase Price = ₹1,000, Additional Charges = 15% -> Actual = ₹1,150
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 3: Purchase Price = ₹1,000, Additional Charges = 15% -> Actual = ₹1,150 ---');
    const prod3 = await productService.createProduct({
      categoryId: targetCat.id,
      name: 'Purchase Test Product 3 (1000 @ 15%)',
      stockQuantity: 2,
      fieldValues: [],
      purchasePrice: 1000,
      additionalChargesPercentage: 15,
    });
    assert.strictEqual(prod3.purchasePrice, 1000);
    assert.strictEqual(prod3.additionalChargesPercentage, 15);
    assert.strictEqual(prod3.actualPurchasePrice, 1150);
    console.log('[PASS] Test 3: Created product with ₹1,000 + 15% = ₹1,150.');

    // -------------------------------------------------------------------------
    // TEST 4: Handle 0% additional charges correctly
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 4: Handle 0% additional charges correctly ---');
    const prod4 = await productService.createProduct({
      categoryId: targetCat.id,
      name: 'Purchase Test Product 4 (100 @ 0%)',
      stockQuantity: 1,
      fieldValues: [],
      purchasePrice: 100,
      additionalChargesPercentage: 0,
    });
    assert.strictEqual(prod4.purchasePrice, 100);
    assert.strictEqual(prod4.additionalChargesPercentage, 0);
    assert.strictEqual(prod4.actualPurchasePrice, 100);
    console.log('[PASS] Test 4: Created product with ₹100 + 0% = ₹100.');

    // -------------------------------------------------------------------------
    // TEST 5: Decimals support (123.45 @ 7.5% -> 132.71)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 5: Decimals support (₹123.45 @ 7.5% -> ₹132.71) ---');
    const prod5 = await productService.createProduct({
      categoryId: targetCat.id,
      name: 'Purchase Test Decimal (123.45 @ 7.5%)',
      stockQuantity: 1,
      fieldValues: [],
      purchasePrice: 123.45,
      additionalChargesPercentage: 7.5,
    });
    assert.strictEqual(prod5.purchasePrice, 123.45);
    assert.strictEqual(prod5.additionalChargesPercentage, 7.5);
    assert.strictEqual(prod5.actualPurchasePrice, 132.71);
    console.log('[PASS] Test 5: Decimal calculation: ₹123.45 + 7.5% = ₹132.71.');

    // -------------------------------------------------------------------------
    // TEST 6: Validation against negative values
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 6: Validation against negative values ---');
    let negPriceRejected = false;
    try {
      await productService.createProduct({
        categoryId: targetCat.id,
        name: 'Negative Price Invalid Product',
        fieldValues: [],
        purchasePrice: -50,
      });
    } catch (err) {
      negPriceRejected = true;
      console.log(`[PASS] Negative purchase price rejected: "${err.message}"`);
    }
    assert.strictEqual(negPriceRejected, true, 'Negative purchase price must be rejected');

    let negChargesRejected = false;
    try {
      await productService.createProduct({
        categoryId: targetCat.id,
        name: 'Negative Charges Invalid Product',
        fieldValues: [],
        purchasePrice: 100,
        additionalChargesPercentage: -5,
      });
    } catch (err) {
      negChargesRejected = true;
      console.log(`[PASS] Negative additional charges rejected: "${err.message}"`);
    }
    assert.strictEqual(negChargesRejected, true, 'Negative additional charges must be rejected');

    // -------------------------------------------------------------------------
    // TEST 7: Update Product Purchase Pricing & Persistence
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 7: Update Product Purchase Pricing & Persistence ---');
    const updatedProd1 = await productService.updateProduct({
      id: prod1.id,
      name: 'Purchase Test Product 1 (Updated to 200 @ 20%)',
      stockQuantity: 15,
      fieldValues: [],
      purchasePrice: 200,
      additionalChargesPercentage: 20,
    });

    assert.strictEqual(updatedProd1.purchasePrice, 200);
    assert.strictEqual(updatedProd1.additionalChargesPercentage, 20);
    assert.strictEqual(updatedProd1.actualPurchasePrice, 240);

    // Re-query from SQLite directly via getProductById
    const reloaded = await productService.getProductById(prod1.id);
    assert.strictEqual(reloaded.purchasePrice, 200);
    assert.strictEqual(reloaded.additionalChargesPercentage, 20);
    assert.strictEqual(reloaded.actualPurchasePrice, 240);

    const reloadedFv = reloaded.fieldValues.find((fv) => fv.categoryField?.fieldKey === 'actualPurchasePrice');
    assert.strictEqual(reloadedFv.valueNumber, 240);
    console.log('[PASS] Test 7: Updated to ₹200 + 20% = ₹240, persisted and verified in SQLite.');

    // -------------------------------------------------------------------------
    // TEST 8: Verify listProducts includes purchase pricing
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 8: Verify listProducts includes purchase pricing ---');
    const productList = await productService.listProducts();
    const listedProd1 = productList.find((p) => p.id === prod1.id);
    assert(listedProd1, 'Product 1 must be in product list');
    assert.strictEqual(listedProd1.purchasePrice, 200);
    assert.strictEqual(listedProd1.additionalChargesPercentage, 20);
    assert.strictEqual(listedProd1.actualPurchasePrice, 240);
    console.log('[PASS] Test 8: listProducts returns populated purchase pricing fields.');

    // Clean up
    console.log('\n[CLEANUP] Cleaning up test products and test category...');
    const allTestIds = [prod1.id, prod2.id, prod3.id, prod4.id, prod5.id];
    await prisma.productFieldValue.deleteMany({ where: { productId: { in: allTestIds } } });
    await prisma.product.deleteMany({ where: { id: { in: allTestIds } } });
    await prisma.categoryField.deleteMany({ where: { categoryId: targetCat.id } });
    await prisma.category.deleteMany({ where: { id: targetCat.id } });
    console.log('[PASS] Cleaned up test products and test category.');

    console.log('\n======================================================');
    console.log('ALL PURCHASE PRICING VERIFICATION TESTS PASSED!');
    console.log('======================================================\n');

    app.exit(0);
  } catch (err) {
    console.error('\n[PURCHASE PRICING TEST FAILED]:', err);
    app.exit(1);
  }
});
