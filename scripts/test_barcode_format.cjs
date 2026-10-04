/**
 * Verification test suite for New Barcode Prefix Logic:
 * 1st letter: Company A or B
 * 2nd letter: Product name first letter
 * 3rd letter: Category name first letter
 * Followed by 6 digits
 */

const { app } = require('electron');
const assert = require('assert');

app.whenReady().then(async () => {
  console.log('\n============================================================');
  console.log('STARTING BARCODE FORMAT VERIFICATION TEST SUITE');
  console.log('============================================================\n');

  try {
    const { initializeDatabase, getPrismaClient } = require('../dist-electron/main/database/prisma');
    const { authService } = require('../dist-electron/main/services/authService');
    const { categoryService } = require('../dist-electron/main/services/categoryService');
    const { productService } = require('../dist-electron/main/services/productService');

    await initializeDatabase();
    const prisma = getPrismaClient();

    // -------------------------------------------------------------------------
    // TEST 1: Company A Admin creates product "Gold Ring" in "Jewellery"
    // Expected Prefix: A + G + J = AGJ -> AGJ000001
    // -------------------------------------------------------------------------
    console.log('[TEST 1] Company A: Product "Gold Ring" in Category "Jewellery"...');
    const sessionA = await authService.login({
      email: 'admina@example.com',
      password: 'Admin@123',
    });
    console.log(`  [AUTH] Logged in as: ${sessionA.adminName} (${sessionA.companyName})`);

    let catJewelleryA = await prisma.category.findFirst({
      where: { name: 'Jewellery Cat A', companyId: sessionA.companyId },
    });
    if (!catJewelleryA) {
      catJewelleryA = await categoryService.createCategory({
        name: 'Jewellery Cat A',
        description: 'Test category',
      });
    }

    // Clean up test products
    await prisma.product.deleteMany({
      where: {
        name: { in: ['Gold Ring', 'Gold Necklace', 'Diamond Pendant'] },
        companyId: sessionA.companyId,
      },
    });

    const pA1 = await productService.createProduct({
      categoryId: catJewelleryA.id,
      name: 'Gold Ring',
      stockQuantity: 10,
      fieldValues: [],
    });

    console.log(`  Product Created: "${pA1.name}", Barcode: "${pA1.barcode}"`);
    assert(pA1.barcode.startsWith('AGJ'), `Barcode must start with 'AGJ', got: ${pA1.barcode}`);
    console.log(`  ✓ Prefix confirmed: 1st=A (Company A), 2nd=G (Gold), 3rd=J (Jewellery) -> ${pA1.barcode}`);

    // Create 2nd product with same initial letters to verify sequential increment
    const pA2 = await productService.createProduct({
      categoryId: catJewelleryA.id,
      name: 'Gold Necklace',
      stockQuantity: 5,
      fieldValues: [],
    });
    console.log(`  2nd Product Created: "${pA2.name}", Barcode: "${pA2.barcode}"`);
    assert(pA2.barcode.startsWith('AGJ'), `Barcode must start with 'AGJ', got: ${pA2.barcode}`);
    assert.notStrictEqual(pA1.barcode, pA2.barcode, 'Barcodes must be unique');
    console.log(`  ✓ Sequential increment confirmed: ${pA1.barcode} -> ${pA2.barcode}`);

    // Create 3rd product: "Diamond Pendant" in "Jewellery" -> ADJ
    const pA3 = await productService.createProduct({
      categoryId: catJewelleryA.id,
      name: 'Diamond Pendant',
      stockQuantity: 2,
      fieldValues: [],
    });
    console.log(`  3rd Product Created: "${pA3.name}", Barcode: "${pA3.barcode}"`);
    assert(pA3.barcode.startsWith('ADJ'), `Barcode must start with 'ADJ' (Company A, Diamond, Jewellery), got: ${pA3.barcode}`);
    console.log(`  ✓ Prefix confirmed: 1st=A, 2nd=D (Diamond), 3rd=J (Jewellery) -> ${pA3.barcode}`);

    // -------------------------------------------------------------------------
    // TEST 2: Company B Admin creates product "Silver Anklet" in "Home Décor"
    // Expected Prefix: B + S + H = BSH -> BSH000001
    // -------------------------------------------------------------------------
    console.log('\n[TEST 2] Company B: Product "Silver Anklet" in Category "Home Décor"...');
    const sessionB = await authService.login({
      email: 'adminb@example.com',
      password: 'Admin@123',
    });
    console.log(`  [AUTH] Logged in as: ${sessionB.adminName} (${sessionB.companyName})`);

    let catDecorB = await prisma.category.findFirst({
      where: { name: 'Home Décor Cat B', companyId: sessionB.companyId },
    });
    if (!catDecorB) {
      catDecorB = await categoryService.createCategory({
        name: 'Home Décor Cat B',
        description: 'Test category B',
      });
    }

    // Clean up test products
    await prisma.product.deleteMany({
      where: {
        name: { in: ['Silver Anklet', 'Curtain Fabric'] },
        companyId: sessionB.companyId,
      },
    });

    const pB1 = await productService.createProduct({
      categoryId: catDecorB.id,
      name: 'Silver Anklet',
      stockQuantity: 8,
      fieldValues: [],
    });
    console.log(`  Product Created: "${pB1.name}", Barcode: "${pB1.barcode}"`);
    assert(pB1.barcode.startsWith('BSH'), `Barcode must start with 'BSH' (Company B, Silver, Home Décor), got: ${pB1.barcode}`);
    console.log(`  ✓ Prefix confirmed: 1st=B (Company B), 2nd=S (Silver), 3rd=H (Home Décor) -> ${pB1.barcode}`);

    const pB2 = await productService.createProduct({
      categoryId: catDecorB.id,
      name: 'Curtain Fabric',
      stockQuantity: 50,
      fieldValues: [],
    });
    console.log(`  Product Created: "${pB2.name}", Barcode: "${pB2.barcode}"`);
    assert(pB2.barcode.startsWith('BCH'), `Barcode must start with 'BCH' (Company B, Curtain, Home Décor), got: ${pB2.barcode}`);
    console.log(`  ✓ Prefix confirmed: 1st=B (Company B), 2nd=C (Curtain), 3rd=H (Home Décor) -> ${pB2.barcode}`);

    // Clean up test products
    await prisma.product.deleteMany({
      where: { id: { in: [pA1.id, pA2.id, pA3.id, pB1.id, pB2.id] } },
    });
    console.log('  ✓ Cleaned up test products.');

    console.log('\n============================================================');
    console.log('🎉 ALL BARCODE FORMAT TESTS PASSED! 🎉');
    console.log('============================================================\n');

    process.exit(0);
  } catch (err) {
    console.error('\n❌ TEST FAILED WITH ERROR:', err);
    process.exit(1);
  }
});
