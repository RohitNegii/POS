/**
 * Comprehensive Verification Test Suite for Actual Purchase Price Code Generation
 * Mapping: COMPLISENT (1=C 2=O 3=M 4=P 5=L 6=I 7=S 8=E 9=N 0=T)
 */

const { app } = require('electron');
const assert = require('assert');

app.whenReady().then(async () => {
  console.log('\n================================================================');
  console.log('STARTING ACTUAL PURCHASE PRICE CODE VERIFICATION TEST SUITE');
  console.log('================================================================\n');

  try {
    const { initializeDatabase, getPrismaClient } = require('../dist-electron/main/database/prisma');
    const { authService } = require('../dist-electron/main/services/authService');
    const { categoryService } = require('../dist-electron/main/services/categoryService');
    const { productService } = require('../dist-electron/main/services/productService');
    const { generateActualPurchasePriceCode, COMPLISENT_MAP } = require('../dist-electron/shared/utils/purchaseCode');

    await initializeDatabase();
    const prisma = getPrismaClient();

    // -------------------------------------------------------------------------
    // TEST 1: Unit Test COMPLISENT Mapping & Examples
    // -------------------------------------------------------------------------
    console.log('[TEST 1] Verifying COMPLISENT letter-to-digit mapping...');
    assert.strictEqual(COMPLISENT_MAP['1'], 'C', '1 must map to C');
    assert.strictEqual(COMPLISENT_MAP['2'], 'O', '2 must map to O');
    assert.strictEqual(COMPLISENT_MAP['3'], 'M', '3 must map to M');
    assert.strictEqual(COMPLISENT_MAP['4'], 'P', '4 must map to P');
    assert.strictEqual(COMPLISENT_MAP['5'], 'L', '5 must map to L');
    assert.strictEqual(COMPLISENT_MAP['6'], 'I', '6 must map to I');
    assert.strictEqual(COMPLISENT_MAP['7'], 'S', '7 must map to S');
    assert.strictEqual(COMPLISENT_MAP['8'], 'E', '8 must map to E');
    assert.strictEqual(COMPLISENT_MAP['9'], 'N', '9 must map to N');
    assert.strictEqual(COMPLISENT_MAP['0'], 'T', '0 must map to T');
    console.log('  ✓ COMPLISENT mapping dictionary verified successfully.');

    console.log('\n[TEST 2] Verifying Client Examples for generateActualPurchasePriceCode...');
    
    // Example 1: 100 -> 000100 -> TTTCTT
    const code100 = generateActualPurchasePriceCode(100);
    console.log(`  Example 1: Price 100 -> Code: "${code100}" (Expected: TTTCTT)`);
    assert.strictEqual(code100, 'TTTCTT', 'Example 1: 100 must produce TTTCTT');

    // Example 2: 110 -> 000110 -> TTTCCT
    const code110 = generateActualPurchasePriceCode(110);
    console.log(`  Example 2: Price 110 -> Code: "${code110}" (Expected: TTTCCT)`);
    assert.strictEqual(code110, 'TTTCCT', 'Example 2: 110 must produce TTTCCT');

    // Example 3: 123456 -> 123456 -> COMPLI
    const code123456 = generateActualPurchasePriceCode(123456);
    console.log(`  Example 3: Price 123456 -> Code: "${code123456}" (Expected: COMPLI)`);
    assert.strictEqual(code123456, 'COMPLI', 'Example 3: 123456 must produce COMPLI');

    // Example 4: 25 -> 000025 -> TTTTOL
    const code25 = generateActualPurchasePriceCode(25);
    console.log(`  Example 4: Price 25 -> Code: "${code25}" (Expected: TTTTOL)`);
    assert.strictEqual(code25, 'TTTTOL', 'Example 4: 25 must produce TTTTOL');

    // Edge Cases
    assert.strictEqual(generateActualPurchasePriceCode(0), 'TTTTTT', '0 must produce TTTTTT');
    assert.strictEqual(generateActualPurchasePriceCode(1), 'TTTTTC', '1 must produce TTTTTC');
    assert.strictEqual(generateActualPurchasePriceCode(999999), 'NNNNNN', '999999 must produce NNNNNN');
    assert.strictEqual(generateActualPurchasePriceCode(null), null, 'null must produce null');
    assert.strictEqual(generateActualPurchasePriceCode(''), null, 'empty string must produce null');
    assert.strictEqual(generateActualPurchasePriceCode(-10), null, 'negative price must produce null');
    console.log('  ✓ All client examples and edge cases verified successfully.');

    // -------------------------------------------------------------------------
    // TEST 3: End-to-End Integration in Product Creation Flow
    // -------------------------------------------------------------------------
    console.log('\n[TEST 3] Testing Product Creation with Purchase Pricing and Automatic Code Generation...');
    
    // Login as Company A Admin
    const sessionA = await authService.login({
      email: 'admina@example.com',
      password: 'Admin@123',
    });
    console.log(`  [AUTH] Authenticated as ${sessionA.adminName} (${sessionA.companyName})`);

    // Create or retrieve Category
    let testCat = await prisma.category.findFirst({
      where: { name: 'Code Test Category', companyId: sessionA.companyId },
    });
    if (!testCat) {
      testCat = await categoryService.createCategory({
        name: 'Code Test Category',
        description: 'Category for testing COMPLISENT code',
      });
    }

    // Clean up prior test products
    const testNames = [
      'Gold Ring Test (100 @ 10%)',
      'Silver Pendant Test (25 @ 0%)',
      'Diamond Necklace Test (123456 @ 0%)',
    ];
    const existing = await prisma.product.findMany({
      where: { name: { in: testNames }, companyId: sessionA.companyId },
      select: { id: true },
    });
    if (existing.length > 0) {
      const ids = existing.map((p) => p.id);
      await prisma.productFieldValue.deleteMany({ where: { productId: { in: ids } } });
      await prisma.product.deleteMany({ where: { id: { in: ids } } });
    }

    // Create Product 1: Purchase Price = 100, Additional Charges = 10% -> Actual = 110 -> Code: TTTCCT
    const createdP1 = await productService.createProduct({
      categoryId: testCat.id,
      name: 'Gold Ring Test (100 @ 10%)',
      stockQuantity: 5,
      fieldValues: [],
      purchasePrice: 100,
      additionalChargesPercentage: 10,
    });

    console.log(`  Created Product 1: ID=${createdP1.id}, Barcode=${createdP1.barcode}`);
    console.log(`    purchasePrice: ${createdP1.purchasePrice}`);
    console.log(`    additionalChargesPercentage: ${createdP1.additionalChargesPercentage}%`);
    console.log(`    actualPurchasePrice: ${createdP1.actualPurchasePrice}`);
    console.log(`    actualPurchasePriceCode: "${createdP1.actualPurchasePriceCode}"`);

    assert.strictEqual(createdP1.purchasePrice, 100, 'Purchase price should be 100');
    assert.strictEqual(createdP1.additionalChargesPercentage, 10, 'Additional charges should be 10%');
    assert.strictEqual(createdP1.actualPurchasePrice, 110, 'Actual purchase price should be 110');
    assert.strictEqual(createdP1.actualPurchasePriceCode, 'TTTCCT', 'Actual purchase price code should be TTTCCT');

    // Verify stored in ProductFieldValue table
    const storedCodeFv = await prisma.productFieldValue.findFirst({
      where: {
        productId: createdP1.id,
        categoryField: { fieldKey: 'actualPurchasePriceCode' },
      },
      include: { categoryField: true },
    });
    assert.ok(storedCodeFv, 'ProductFieldValue for actualPurchasePriceCode must exist in DB');
    assert.strictEqual(storedCodeFv.valueText, 'TTTCCT', 'ProductFieldValue valueText must equal TTTCCT');
    console.log(`  ✓ ProductFieldValue in DB confirmed: valueText="${storedCodeFv.valueText}"`);

    // -------------------------------------------------------------------------
    // TEST 4: Automatic Code Recomputation on Product Update
    // -------------------------------------------------------------------------
    console.log('\n[TEST 4] Testing Automatic Code Update when Actual Purchase Price Changes...');
    
    // Update Product 1 to purchasePrice = 25, charges = 0% -> Actual = 25 -> Code: TTTTOL
    const updatedP1 = await productService.updateProduct({
      id: createdP1.id,
      name: 'Gold Ring Test (25 @ 0%)',
      stockQuantity: 4,
      fieldValues: [],
      purchasePrice: 25,
      additionalChargesPercentage: 0,
    });

    console.log(`  Updated Product 1:`);
    console.log(`    purchasePrice: ${updatedP1.purchasePrice}`);
    console.log(`    actualPurchasePrice: ${updatedP1.actualPurchasePrice}`);
    console.log(`    actualPurchasePriceCode: "${updatedP1.actualPurchasePriceCode}"`);

    assert.strictEqual(updatedP1.purchasePrice, 25);
    assert.strictEqual(updatedP1.actualPurchasePrice, 25);
    assert.strictEqual(updatedP1.actualPurchasePriceCode, 'TTTTOL', 'Code must automatically update to TTTTOL for price 25');

    // Verify DB update
    const updatedDbFv = await prisma.productFieldValue.findFirst({
      where: {
        productId: createdP1.id,
        categoryField: { fieldKey: 'actualPurchasePriceCode' },
      },
    });
    assert.strictEqual(updatedDbFv.valueText, 'TTTTOL', 'Database valueText must be updated to TTTTOL');
    console.log(`  ✓ Database updated automatically: valueText="${updatedDbFv.valueText}"`);

    // -------------------------------------------------------------------------
    // TEST 5: Verify getProductById & listProducts Include actualPurchasePriceCode
    // -------------------------------------------------------------------------
    console.log('\n[TEST 5] Testing getProductById and listProducts retrieval...');
    
    const retrieved = await productService.getProductById(createdP1.id);
    assert.strictEqual(retrieved.actualPurchasePriceCode, 'TTTTOL', 'getProductById must return actualPurchasePriceCode');

    const list = await productService.listProducts({ categoryId: testCat.id });
    const found = list.find((p) => p.id === createdP1.id);
    assert.ok(found, 'Product must be found in listProducts');
    assert.strictEqual(found.actualPurchasePriceCode, 'TTTTOL', 'listProducts must return actualPurchasePriceCode');
    console.log('  ✓ getProductById and listProducts correctly return actualPurchasePriceCode.');

    // -------------------------------------------------------------------------
    // TEST 6: Example 3 (123456 -> COMPLI) & Example 1 (100 -> TTTCTT)
    // -------------------------------------------------------------------------
    console.log('\n[TEST 6] Testing Example 3 (123456 -> COMPLI) & Example 1 (100 -> TTTCTT)...');
    
    const p3 = await productService.createProduct({
      categoryId: testCat.id,
      name: 'Diamond Necklace Test (123456 @ 0%)',
      stockQuantity: 1,
      fieldValues: [],
      purchasePrice: 123456,
      additionalChargesPercentage: 0,
    });
    assert.strictEqual(p3.actualPurchasePrice, 123456);
    assert.strictEqual(p3.actualPurchasePriceCode, 'COMPLI', '123456 must produce COMPLI');
    console.log(`  Created Product 3: Actual=123456 -> Code="${p3.actualPurchasePriceCode}" (COMPLI) ✓`);

    const p1Again = await productService.createProduct({
      categoryId: testCat.id,
      name: 'Silver Pendant Test (100 @ 0%)',
      stockQuantity: 10,
      fieldValues: [],
      purchasePrice: 100,
      additionalChargesPercentage: 0,
    });
    assert.strictEqual(p1Again.actualPurchasePrice, 100);
    assert.strictEqual(p1Again.actualPurchasePriceCode, 'TTTCTT', '100 must produce TTTCTT');
    console.log(`  Created Product 1 again: Actual=100 -> Code="${p1Again.actualPurchasePriceCode}" (TTTCTT) ✓`);

    // Clean up created test products
    await prisma.productFieldValue.deleteMany({ where: { productId: { in: [createdP1.id, p3.id, p1Again.id] } } });
    await prisma.product.deleteMany({ where: { id: { in: [createdP1.id, p3.id, p1Again.id] } } });
    console.log('  ✓ Cleaned up test products.');

    console.log('\n================================================================');
    console.log('🎉 ALL ACTUAL PURCHASE PRICE CODE VERIFICATION TESTS PASSED 🎉');
    console.log('================================================================\n');

    process.exit(0);
  } catch (err) {
    console.error('\n❌ TEST FAILED WITH ERROR:', err);
    process.exit(1);
  }
});
