/**
 * Verification test suite for Client's Gold / Silver Daily Metal Rate and Dynamic Pricing System.
 * Tests all 12 test cases from Section 18 against Electron main process and SQLite database.
 */

const { app } = require('electron');
const assert = require('assert');

app.whenReady().then(async () => {
  console.log('\n==================================================');
  console.log('STARTING GOLD / SILVER PRICING & DAILY RATES TEST SUITE');
  console.log('==================================================\n');

  try {
    const { initializeDatabase, getPrismaClient } = require('../dist-electron/main/database/prisma');
    const { authService } = require('../dist-electron/main/services/authService');
    const { categoryService } = require('../dist-electron/main/services/categoryService');
    const { categoryFieldService } = require('../dist-electron/main/services/categoryFieldService');
    const { productService } = require('../dist-electron/main/services/productService');
    const { metalRateService } = require('../dist-electron/main/services/metalRateService');
    const { pricingService } = require('../dist-electron/main/services/pricingService');

    // 0. Initialize DB
    await initializeDatabase();
    const prisma = getPrismaClient();

    // Clean up any test records from prior runs
    const testProducts = await prisma.product.findMany({
      where: { name: { in: ['Test 22K Gold Ring', 'Test 925 Silver Bracelet', 'Test Fixed Decor Diya'] } },
      select: { id: true },
    });
    if (testProducts.length > 0) {
      const ids = testProducts.map((p) => p.id);
      await prisma.productFieldValue.deleteMany({ where: { productId: { in: ids } } });
      await prisma.product.deleteMany({ where: { id: { in: ids } } });
    }

    // Login as Company A Admin
    const sessionA = await authService.login({
      email: 'admina@example.com',
      password: 'Admin@123',
    });
    console.log(`[AUTH] Logged in as: ${sessionA.adminName} (${sessionA.companyName})`);

    // -------------------------------------------------------------------------
    // TEST 3: Purity factor calculation
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 3: Purity factor calculation ---');
    const gold24k = pricingService.resolvePurity('24K');
    assert.strictEqual(gold24k.purityFactor, 1.0, '24K factor must be 1.0');
    assert.strictEqual(gold24k.metalType, 'GOLD');

    const gold22k = pricingService.resolvePurity('22K');
    assert.strictEqual(gold22k.purityFactor, 0.916, '22K factor must be 0.916');
    assert.strictEqual(gold22k.metalType, 'GOLD');

    const gold18k = pricingService.resolvePurity('18K');
    assert.strictEqual(gold18k.purityFactor, 0.75, '18K factor must be 0.75');

    const silver925 = pricingService.resolvePurity('925 Silver');
    assert.strictEqual(silver925.purityFactor, 0.925, '925 Silver factor must be 0.925');
    assert.strictEqual(silver925.metalType, 'SILVER');

    const silverFine = pricingService.resolvePurity('Fine Silver');
    assert.strictEqual(silverFine.purityFactor, 0.999, 'Fine Silver factor must be 0.999');
    assert.strictEqual(silverFine.metalType, 'SILVER');
    console.log('[TEST 3 PASSED] Purity factors resolved correctly: 24K=1.0, 22K=0.916, 18K=0.75, 925=0.925, Fine=0.999');

    // -------------------------------------------------------------------------
    // TEST 1 & 4: Gold price calculation & Making charge calculation
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 1 & 4: Gold price calculation & Making charge calculation ---');
    // Using the exact client example:
    // Gold Rate = ₹7,250/g, Purity = 22K (0.916), Weight = 10g, Making = ₹500/g
    // Metal Value = 7250 * 0.916 * 10 = 66,410
    // Making Charges = 500 * 10 = 5,000
    // Final Price = 66,410 + 5,000 = 71,410
    const goldCalc = pricingService.calculateJewelleryPrice({
      metalType: 'GOLD',
      purity: '22K',
      purityFactor: 0.916,
      weightGrams: 10,
      ratePerGram: 7250,
      rateEffectiveDate: '2026-09-27',
      makingChargePerGram: 500,
    });
    assert.strictEqual(goldCalc.metalValue, 66410, 'Metal value must be 66410');
    assert.strictEqual(goldCalc.totalMakingCharges, 5000, 'Making charges must be 5000');
    assert.strictEqual(goldCalc.finalPrice, 71410, 'Final price must be 71410');
    console.log('[TEST 1 & 4 PASSED] Client example matches: ₹7,250 × 0.916 × 10g = ₹66,410 + ₹5,000 MC = ₹71,410');

    // -------------------------------------------------------------------------
    // TEST 2: Silver price calculation
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 2: Silver price calculation ---');
    // Silver Rate = ₹95/g, Purity = 925 Silver (0.925), Weight = 50g, Making = ₹30/g
    // Metal Value = 95 * 0.925 * 50 = 4,393.75
    // Making Charges = 30 * 50 = 1,500
    // Final Price = Math.round(4393.75 + 1500) = 5,894
    const silverCalc = pricingService.calculateJewelleryPrice({
      metalType: 'SILVER',
      purity: '925 Silver',
      purityFactor: 0.925,
      weightGrams: 50,
      ratePerGram: 95,
      rateEffectiveDate: '2026-09-27',
      makingChargePerGram: 30,
    });
    assert.strictEqual(silverCalc.metalValue, 4393.75);
    assert.strictEqual(silverCalc.totalMakingCharges, 1500);
    assert.strictEqual(silverCalc.finalPrice, 5894);
    console.log('[TEST 2 PASSED] Silver calculation: ₹95 × 0.925 × 50g = ₹4,393.75 + ₹1,500 MC = ₹5,894');

    // -------------------------------------------------------------------------
    // TEST 9: Historical rates remain stored & Rate Save
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 9: Historical rates remain stored across dates ---');
    // Set yesterday's rate (2026-09-26)
    await metalRateService.saveDailyRates({
      effectiveDate: '2026-09-26',
      goldRatePerGram: 7200,
      silverRatePerGram: 94,
    });

    // Set today's rate (2026-09-27)
    await metalRateService.saveDailyRates({
      effectiveDate: '2026-09-27',
      goldRatePerGram: 7250,
      silverRatePerGram: 95,
    });

    const history = await metalRateService.getRateHistory();
    const dates = history.map((h) => h.effectiveDate);
    assert(dates.includes('2026-09-26'), 'History must contain 2026-09-26');
    assert(dates.includes('2026-09-27'), 'History must contain 2026-09-27');
    console.log(`[TEST 9 PASSED] Historical rates preserved. History has ${history.length} dates.`);

    // -------------------------------------------------------------------------
    // TEST 5, 7 & 11: Changing daily Gold rate changes calculated Gold price, product not edited, barcode unchanged
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 5, 7 & 11: Dynamic price change without product edit; barcode unchanged ---');
    const categories = await categoryService.listCategories();
    const goldCategory = categories.find((c) => c.name === 'Gold / Silver Jewellery');
    assert(goldCategory, 'Gold / Silver category must exist');

    const fields = await categoryFieldService.listFields(goldCategory.id);
    const purityField = fields.find((f) => f.fieldKey === 'purity');
    const weightField = fields.find((f) => f.fieldKey === 'weight');
    const makingField = fields.find((f) => f.fieldKey === 'makingChargesPerGram');

    // Create a Gold product with 10g weight, 22K purity, ₹500/g making
    const goldProduct = await productService.createProduct({
      categoryId: goldCategory.id,
      name: 'Test 22K Gold Ring',
      stockQuantity: 5,
      fieldValues: [
        { categoryFieldId: purityField.id, valueText: purityField.options && purityField.options.includes('22K') ? '22K' : '22K (916)' },
        { categoryFieldId: weightField.id, valueNumber: 10 },
        { categoryFieldId: makingField.id, valueNumber: 500 },
      ],
    });

    const initialBarcode = goldProduct.barcode;
    console.log(`[SETUP] Created product "${goldProduct.name}", Permanent Barcode: ${goldProduct.barcode}`);

    // Verify today's price calculated with rate = 7250 -> ₹71,410
    const prodToday = await productService.getProductById(goldProduct.id);
    assert.strictEqual(prodToday.calculatedJewelleryPrice.finalPrice, 71410, 'Price must be ₹71,410 with rate ₹7,250');
    console.log(`[CHECK] Today price at ₹7,250/g: ₹${prodToday.calculatedJewelleryPrice.finalPrice}`);

    // Now Admin updates today's Gold rate to ₹7,300/g
    // Metal Value = 7300 * 0.916 * 10 = 66,868
    // Making Charges = 500 * 10 = 5,000
    // New Final Price = 66,868 + 5,000 = 71,868
    await metalRateService.saveDailyRates({
      effectiveDate: '2026-09-27',
      goldRatePerGram: 7300,
    });

    // Product is NOT edited at all! Retrieve product:
    const prodAfterRateChange = await productService.getProductById(goldProduct.id);
    assert.strictEqual(prodAfterRateChange.calculatedJewelleryPrice.finalPrice, 71868, 'Price must update to ₹71,868');
    assert.strictEqual(prodAfterRateChange.barcode, initialBarcode, 'Barcode must remain identical');
    console.log(`[TEST 5, 7, 11 PASSED] When rate changed to ₹7,300/g, product price automatically became ₹${prodAfterRateChange.calculatedJewelleryPrice.finalPrice} without editing the product. Barcode "${prodAfterRateChange.barcode}" unchanged.`);

    // -------------------------------------------------------------------------
    // TEST 6: Changing daily Silver rate changes calculated Silver price
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 6: Changing daily Silver rate changes calculated Silver price ---');
    const silverProduct = await productService.createProduct({
      categoryId: goldCategory.id,
      name: 'Test 925 Silver Bracelet',
      stockQuantity: 8,
      fieldValues: [
        { categoryFieldId: purityField.id, valueText: '925 Silver' },
        { categoryFieldId: weightField.id, valueNumber: 50 },
        { categoryFieldId: makingField.id, valueNumber: 30 },
      ],
    });

    // Current silver rate is ₹95 -> price ₹5,894
    const silverToday = await productService.getProductById(silverProduct.id);
    assert.strictEqual(silverToday.calculatedJewelleryPrice.finalPrice, 5894);

    // Update silver rate to ₹100/g
    // Metal Value = 100 * 0.925 * 50 = 4,625
    // Making Charges = 30 * 50 = 1,500
    // Final Price = 4625 + 1500 = 6,125
    await metalRateService.saveDailyRates({
      effectiveDate: '2026-09-27',
      silverRatePerGram: 100,
    });

    const silverAfterRateChange = await productService.getProductById(silverProduct.id);
    assert.strictEqual(silverAfterRateChange.calculatedJewelleryPrice.finalPrice, 6125);
    console.log(`[TEST 6 PASSED] Silver product price updated from ₹5,894 to ₹${silverAfterRateChange.calculatedJewelleryPrice.finalPrice} automatically.`);

    // -------------------------------------------------------------------------
    // TEST 8: Company A cannot access Company B metal rates (Company Isolation)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 8: Company A cannot access Company B metal rates ---');
    // Login as Company B admin
    const sessionB = await authService.login({
      email: 'adminb@example.com',
      password: 'Admin@123',
    });
    console.log(`[AUTH] Switched session to: ${sessionB.adminName} (${sessionB.companyName})`);

    // Company B sets a distinctive rate: Gold ₹8,000, Silver ₹120
    await metalRateService.saveDailyRates({
      effectiveDate: '2026-09-27',
      goldRatePerGram: 8000,
      silverRatePerGram: 120,
    });
    const ratesB = await metalRateService.getCurrentRates();
    assert.strictEqual(ratesB.goldRate.ratePerGram, 8000, 'Company B gold rate must be 8000');
    assert.strictEqual(ratesB.silverRate.ratePerGram, 120, 'Company B silver rate must be 120');

    // Switch back to Company A
    await authService.login({
      email: 'admina@example.com',
      password: 'Admin@123',
    });
    const ratesA = await metalRateService.getCurrentRates();
    assert.strictEqual(ratesA.goldRate.ratePerGram, 7300, 'Company A gold rate must remain 7300');
    assert.strictEqual(ratesA.silverRate.ratePerGram, 100, 'Company A silver rate must remain 100');
    console.log('[TEST 8 PASSED] Company isolation confirmed: Company A rates (7300/100) and Company B rates (8000/120) are strictly separate.');

    // -------------------------------------------------------------------------
    // TEST 10: Missing current rate returns a proper business error
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 10: Missing current rate returns a proper error ---');
    // If a future rate or querying a date before any rate existed
    let missingErrorOccurred = false;
    try {
      await metalRateService.calculatePriceForJewellery({
        purity: '22K',
        weightGrams: 10,
        makingChargePerGram: 500,
        effectiveDate: '2020-01-01', // Date before any rate was entered
      });
    } catch (err) {
      missingErrorOccurred = true;
      console.log(`[PASS] Missing rate returned expected error: "${err.message}"`);
    }
    assert.strictEqual(missingErrorOccurred, true, 'Must produce a clear business error when rate is missing');
    console.log('[TEST 10 PASSED] Missing rate produces clear business error.');

    // -------------------------------------------------------------------------
    // TEST 12: Non-Gold/Silver products are not affected by metal-rate changes
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 12: Non-Gold/Silver products are not affected by metal-rate changes ---');
    const decorCat = categories.find((c) => c.name === 'Home Décor — Piece / Unit Based');
    const decorFields = await categoryFieldService.listFields(decorCat.id);

    const decorProd = await productService.createProduct({
      categoryId: decorCat.id,
      name: 'Test Fixed Decor Diya',
      stockQuantity: 15,
      fieldValues: [
        { categoryFieldId: decorFields.find((f) => f.fieldKey === 'size').id, valueText: '8 inch' },
        { categoryFieldId: decorFields.find((f) => f.fieldKey === 'design').id, valueText: 'Floral' },
        { categoryFieldId: decorFields.find((f) => f.fieldKey === 'material').id, valueText: 'Clay' },
        { categoryFieldId: decorFields.find((f) => f.fieldKey === 'sellingPrice').id, valueNumber: 350 },
      ],
    });

    const retrievedDecor = await productService.getProductById(decorProd.id);
    assert.strictEqual(retrievedDecor.calculatedJewelleryPrice, null, 'Non-jewellery must NOT have calculatedJewelleryPrice');
    const fixedPriceFv = retrievedDecor.fieldValues.find((f) => f.categoryField.fieldKey === 'sellingPrice');
    assert.strictEqual(fixedPriceFv.valueNumber, 350, 'Fixed selling price must remain 350');
    console.log('[TEST 12 PASSED] Non-Gold/Silver products keep fixed selling price and are unaffected by metal rates.');

    // Cleanup
    console.log('\n[CLEANUP] Cleaning up test products...');
    const cleanupIds = [goldProduct.id, silverProduct.id, decorProd.id];
    await prisma.productFieldValue.deleteMany({ where: { productId: { in: cleanupIds } } });
    await prisma.product.deleteMany({ where: { id: { in: cleanupIds } } });
    console.log('[PASS] Test products cleaned up.');

    console.log('\n==================================================');
    console.log('ALL 12 TEST CASES COMPLETED SUCCESSFULLY (100% PASS)!');
    console.log('==================================================\n');

    app.exit(0);
  } catch (err) {
    console.error('\n[TEST FAILURE]:', err);
    app.exit(1);
  }
});
