/**
 * Comprehensive verification of client product category models & core Product stockQuantity
 */

const { app } = require('electron');
const assert = require('assert');

app.whenReady().then(async () => {
  console.log('\n==================================================');
  console.log('STARTING CLIENT MODELS & STOCK QUANTITY VERIFICATION');
  console.log('==================================================\n');

  try {
    const { initializeDatabase, getPrismaClient } = require('../dist-electron/main/database/prisma');
    const { authService } = require('../dist-electron/main/services/authService');
    const { categoryService } = require('../dist-electron/main/services/categoryService');
    const { categoryFieldService } = require('../dist-electron/main/services/categoryFieldService');
    const { productService } = require('../dist-electron/main/services/productService');

    // 1. Initialize DB & run seeds
    console.log('[INIT] Bootstrapping DB and running client category model seed...');
    await initializeDatabase();
    const prisma = getPrismaClient();

    // Login as Company A admin
    const sessionA = await authService.login({
      email: 'admina@example.com',
      password: 'Admin@123',
    });
    console.log(`[AUTH] Logged in as: ${sessionA.adminName} (${sessionA.companyName})`);

    // Fetch categories for Company A
    const categories = await categoryService.listCategories();
    console.log(`[CATEGORIES] Found ${categories.length} categories for ${sessionA.companyName}`);

    // Verify 5 client models exist
    const expectedCatNames = [
      'Gold / Silver Jewellery',
      'Artificial / Imitation Jewellery',
      'German Silver / German Metal',
      'Home Décor — Piece / Unit Based',
      'Home Décor — Meter Based',
    ];

    for (const name of expectedCatNames) {
      const found = categories.find((c) => c.name === name);
      assert(found, `Category "${name}" must exist`);
      console.log(`[CHECK] Category exists: "${found.name}" (ID: ${found.id})`);
    }

    // --- CHECK 1: Gold / Silver Jewellery ---
    console.log('\n--- CHECK 1: Gold / Silver Jewellery ---');
    const goldCat = categories.find((c) => c.name === 'Gold / Silver Jewellery');
    const goldFields = await categoryFieldService.listFields(goldCat.id);
    const goldKeys = goldFields.map((f) => f.fieldKey);
    console.log('Gold/Silver fields:', goldFields.map((f) => `${f.name} (${f.fieldType})`));

    assert(goldKeys.includes('purity'), 'Must include purity');
    assert(goldKeys.includes('weight'), 'Must include weight');
    assert(goldKeys.includes('makingChargesPerGram'), 'Must include makingChargesPerGram');
    // Must NOT have currentMetalRate as dynamic field (managed in daily rates table)
    assert(!goldKeys.includes('currentMetalRate'), 'Gold / Silver must NOT have currentMetalRate dynamic field');
    // Must NOT have sellingPrice
    assert(!goldKeys.includes('sellingPrice'), 'Gold / Silver must NOT have sellingPrice category field');
    // Must NOT have stockQuantity or barcode
    assert(!goldKeys.includes('stockQuantity'), 'Must NOT have stockQuantity dynamic field');
    assert(!goldKeys.includes('barcode'), 'Must NOT have barcode dynamic field');
    console.log('[PASS] Gold / Silver Jewellery fields match strict requirements.');

    // --- CHECK 2: Artificial / Imitation Jewellery ---
    console.log('\n--- CHECK 2: Artificial / Imitation Jewellery ---');
    const artCat = categories.find((c) => c.name === 'Artificial / Imitation Jewellery');
    const artFields = await categoryFieldService.listFields(artCat.id);
    const artKeys = artFields.map((f) => f.fieldKey);
    console.log('Artificial Jewellery fields:', artFields.map((f) => `${f.name} (${f.fieldType})`));

    assert(artKeys.includes('designWeight'), 'Must include designWeight');
    assert(artKeys.includes('colour'), 'Must include colour');
    assert(artKeys.includes('size'), 'Must include size');
    assert(artKeys.includes('sellingPrice'), 'Must include sellingPrice');
    assert(!artKeys.includes('stockQuantity'), 'Must NOT have stockQuantity dynamic field');
    assert(!artKeys.includes('barcode'), 'Must NOT have barcode dynamic field');
    console.log('[PASS] Artificial Jewellery fields match strict requirements.');

    // --- CHECK 3: German Silver / German Metal ---
    console.log('\n--- CHECK 3: German Silver / German Metal ---');
    const germanCat = categories.find((c) => c.name === 'German Silver / German Metal');
    const germanFields = await categoryFieldService.listFields(germanCat.id);
    const germanKeys = germanFields.map((f) => f.fieldKey);
    console.log('German Silver fields:', germanFields.map((f) => `${f.name} (${f.fieldType})`));

    assert(germanKeys.includes('designWeight'), 'Must include designWeight');
    assert(germanKeys.includes('colour'), 'Must include colour');
    assert(germanKeys.includes('size'), 'Must include size');
    assert(germanKeys.includes('sellingPrice'), 'Must include sellingPrice');
    assert(!germanKeys.includes('finish'), 'Must NOT include finish unless requested');
    assert(!germanKeys.includes('polish'), 'Must NOT include polish unless requested');
    assert(!germanKeys.includes('stockQuantity'), 'Must NOT have stockQuantity dynamic field');
    assert(!germanKeys.includes('barcode'), 'Must NOT have barcode dynamic field');
    console.log('[PASS] German Silver / German Metal fields match strict requirements.');

    // --- CHECK 4: Home Décor — Piece / Unit Based ---
    console.log('\n--- CHECK 4: Home Décor — Piece / Unit Based ---');
    const decorPieceCat = categories.find((c) => c.name === 'Home Décor — Piece / Unit Based');
    const decorPieceFields = await categoryFieldService.listFields(decorPieceCat.id);
    const decorPieceKeys = decorPieceFields.map((f) => f.fieldKey);
    console.log('Home Décor Piece fields:', decorPieceFields.map((f) => `${f.name} (${f.fieldType})`));

    assert(decorPieceKeys.includes('size'), 'Must include size');
    assert(decorPieceKeys.includes('weight'), 'Must include weight');
    assert(decorPieceKeys.includes('colour'), 'Must include colour');
    assert(decorPieceKeys.includes('design'), 'Must include design');
    assert(decorPieceKeys.includes('material'), 'Must include material');
    assert(decorPieceKeys.includes('sellingPrice'), 'Must include sellingPrice');
    assert(!decorPieceKeys.includes('stockQuantity'), 'Must NOT have stockQuantity dynamic field');
    assert(!decorPieceKeys.includes('barcode'), 'Must NOT have barcode dynamic field');
    console.log('[PASS] Home Décor — Piece / Unit Based fields match strict requirements.');

    // --- CHECK 5: Home Décor — Meter Based ---
    console.log('\n--- CHECK 5: Home Décor — Meter Based ---');
    const decorMeterCat = categories.find((c) => c.name === 'Home Décor — Meter Based');
    const decorMeterFields = await categoryFieldService.listFields(decorMeterCat.id);
    const decorMeterKeys = decorMeterFields.map((f) => f.fieldKey);
    console.log('Home Décor Meter fields:', decorMeterFields.map((f) => `${f.name} (${f.fieldType})`));

    assert(decorMeterKeys.includes('material'), 'Must include material');
    assert(decorMeterKeys.includes('colour'), 'Must include colour');
    assert(decorMeterKeys.includes('design'), 'Must include design');
    assert(decorMeterKeys.includes('widthOrSize'), 'Must include widthOrSize');
    assert(decorMeterKeys.includes('weight'), 'Must include weight');
    assert(decorMeterKeys.includes('ratePerMeter'), 'Must include ratePerMeter');
    assert(decorMeterKeys.includes('sellingPricePerMeter'), 'Must include sellingPricePerMeter');
    assert(!decorMeterKeys.includes('stockQuantity'), 'Must NOT have stockQuantity dynamic field');
    assert(!decorMeterKeys.includes('stockInMeters'), 'Must NOT have stockInMeters dynamic field');
    assert(!decorMeterKeys.includes('barcode'), 'Must NOT have barcode dynamic field');
    console.log('[PASS] Home Décor — Meter Based fields match strict requirements.');

    // --- CHECK 6: Product Creation & Decimal Stock Support ---
    console.log('\n--- CHECK 6: Meter-Based Product Creation with Decimal Stock (50.5 meters) ---');
    const meterProd = await productService.createProduct({
      categoryId: decorMeterCat.id,
      name: 'Curtain Silk Fabric Floral 50m Roll',
      stockQuantity: 50.5,
      fieldValues: [
        {
          categoryFieldId: decorMeterFields.find((f) => f.fieldKey === 'material').id,
          valueText: 'Pure Silk',
        },
        {
          categoryFieldId: decorMeterFields.find((f) => f.fieldKey === 'design').id,
          valueText: 'Floral Damask',
        },
        {
          categoryFieldId: decorMeterFields.find((f) => f.fieldKey === 'widthOrSize').id,
          valueText: '54 inches',
        },
        {
          categoryFieldId: decorMeterFields.find((f) => f.fieldKey === 'ratePerMeter').id,
          valueNumber: 450,
        },
        {
          categoryFieldId: decorMeterFields.find((f) => f.fieldKey === 'sellingPricePerMeter').id,
          valueNumber: 650,
        },
      ],
    });

    console.log(`[PASS] Created product: "${meterProd.name}", Barcode: ${meterProd.barcode}, Stock: ${meterProd.stockQuantity}`);
    assert.strictEqual(meterProd.stockQuantity, 50.5, 'Product stockQuantity must support decimal (50.5)');
    assert(meterProd.barcode.length >= 8, 'Barcode must be valid Code 128 format');

    // Retrieve single product
    const retrieved = await productService.getProductById(meterProd.id);
    assert.strictEqual(retrieved.stockQuantity, 50.5, 'Retrieved stockQuantity must be 50.5');
    console.log('[PASS] getProductById returned exact decimal stockQuantity: 50.5');

    // Update stock to another decimal value (e.g. 46.5 after cut)
    console.log('\n--- CHECK 7: Update Decimal Stock (46.5 meters) ---');
    const updated = await productService.updateProduct({
      id: meterProd.id,
      name: 'Curtain Silk Fabric Floral 50m Roll (Updated)',
      stockQuantity: 46.5,
      fieldValues: [
        {
          categoryFieldId: decorMeterFields.find((f) => f.fieldKey === 'material').id,
          valueText: 'Pure Silk',
        },
        {
          categoryFieldId: decorMeterFields.find((f) => f.fieldKey === 'design').id,
          valueText: 'Floral Damask',
        },
        {
          categoryFieldId: decorMeterFields.find((f) => f.fieldKey === 'widthOrSize').id,
          valueText: '54 inches',
        },
        {
          categoryFieldId: decorMeterFields.find((f) => f.fieldKey === 'ratePerMeter').id,
          valueNumber: 450,
        },
        {
          categoryFieldId: decorMeterFields.find((f) => f.fieldKey === 'sellingPricePerMeter').id,
          valueNumber: 650,
        },
      ],
    });
    assert.strictEqual(updated.stockQuantity, 46.5, 'Updated stockQuantity must be 46.5');
    console.log('[PASS] updateProduct saved decimal stockQuantity: 46.5');

    // --- CHECK 8: Piece-based Product with integer stock ---
    console.log('\n--- CHECK 8: Piece-based Product with integer stock (10 units) ---');
    const pieceProd = await productService.createProduct({
      categoryId: decorPieceCat.id,
      name: 'Brass Antique Peacock Diya',
      stockQuantity: 10,
      fieldValues: [
        {
          categoryFieldId: decorPieceFields.find((f) => f.fieldKey === 'size').id,
          valueText: '12 inch',
        },
        {
          categoryFieldId: decorPieceFields.find((f) => f.fieldKey === 'design').id,
          valueText: 'Peacock Carving',
        },
        {
          categoryFieldId: decorPieceFields.find((f) => f.fieldKey === 'material').id,
          valueText: 'Solid Brass',
        },
        {
          categoryFieldId: decorPieceFields.find((f) => f.fieldKey === 'sellingPrice').id,
          valueNumber: 1250,
        },
      ],
    });
    assert.strictEqual(pieceProd.stockQuantity, 10, 'Piece product stock must be 10');
    console.log(`[PASS] Created piece product: "${pieceProd.name}", Barcode: ${pieceProd.barcode}, Stock: ${pieceProd.stockQuantity}`);

    // --- CHECK 9: Cross-Company Product Isolation ---
    console.log('\n--- CHECK 9: Strict Company Isolation on Products ---');
    await authService.login({
      email: 'adminb@example.com',
      password: 'Admin@123',
    });
    let companyBBlocked = false;
    try {
      await productService.getProductById(meterProd.id);
    } catch (err) {
      companyBBlocked = true;
      console.log(`[PASS] Company B admin blocked from Company A product: "${err.message}"`);
    }
    assert.strictEqual(companyBBlocked, true, 'Company B must not access Company A product');

    // Clean up created test products
    console.log('\n[CLEANUP] Cleaning up test products...');
    await prisma.productFieldValue.deleteMany({
      where: { productId: { in: [meterProd.id, pieceProd.id] } },
    });
    await prisma.product.deleteMany({
      where: { id: { in: [meterProd.id, pieceProd.id] } },
    });
    console.log('[PASS] Test products cleaned up.');

    console.log('\n==================================================');
    console.log('ALL CLIENT MODELS & STOCK QUANTITY CHECKS PASSED!');
    console.log('==================================================\n');

    app.exit(0);
  } catch (err) {
    console.error('\n[VERIFICATION FAILURE]:', err);
    app.exit(1);
  }
});
