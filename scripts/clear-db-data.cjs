const path = require('path');
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');

async function clearRetailPosDatabase(dbPath) {
  if (!fs.existsSync(dbPath)) {
    console.log(`[SKIP] File not found: ${dbPath}`);
    return;
  }

  console.log(`\n======================================================`);
  console.log(`[PROCESSING] Target database: ${dbPath}`);
  console.log(`======================================================`);

  const normalizedUrl = `file:${dbPath.replace(/\\/g, '/')}`;
  const prisma = new PrismaClient({
    datasourceUrl: normalizedUrl,
  });

  try {
    await prisma.$connect();

    // Check existing tables
    const tables = await prisma.$queryRawUnsafe(`
      SELECT name FROM sqlite_master WHERE type='table';
    `);
    const tableNames = new Set(tables.map((t) => t.name));

    console.log('[INFO] Tables found:', Array.from(tableNames).join(', '));

    // Disable foreign keys temporarily during batch truncate for clean removal
    await prisma.$executeRawUnsafe('PRAGMA foreign_keys = OFF;');

    const deletedCounts = {};

    if (tableNames.has('bill_items')) {
      const res = await prisma.billItem.deleteMany({});
      deletedCounts.bill_items = res.count;
    }
    if (tableNames.has('bills')) {
      const res = await prisma.bill.deleteMany({});
      deletedCounts.bills = res.count;
    }
    if (tableNames.has('purchase_items')) {
      const res = await prisma.purchaseItem.deleteMany({});
      deletedCounts.purchase_items = res.count;
    }
    if (tableNames.has('purchases')) {
      const res = await prisma.purchase.deleteMany({});
      deletedCounts.purchases = res.count;
    }
    if (tableNames.has('product_field_values')) {
      const res = await prisma.productFieldValue.deleteMany({});
      deletedCounts.product_field_values = res.count;
    }
    if (tableNames.has('products')) {
      const res = await prisma.product.deleteMany({});
      deletedCounts.products = res.count;
    }
    if (tableNames.has('vendors')) {
      const res = await prisma.vendor.deleteMany({});
      deletedCounts.vendors = res.count;
    }
    if (tableNames.has('metal_rates')) {
      const res = await prisma.metalRate.deleteMany({});
      deletedCounts.metal_rates = res.count;
    }

    // Check if buyers table exists (e.g. in pos2)
    if (tableNames.has('buyers')) {
      const res = await prisma.$executeRawUnsafe('DELETE FROM "buyers";');
      deletedCounts.buyers = res;
    }

    // Re-enable foreign keys
    await prisma.$executeRawUnsafe('PRAGMA foreign_keys = ON;');

    // Guard seed flags in app_metadata so dummy data is never automatically re-seeded
    if (tableNames.has('app_metadata')) {
      const now = new Date().toISOString();
      const keys = [
        'sample_products_initialized',
        'sample_vendors_initialized',
        'initial_metal_rates_initialized',
      ];
      for (const key of keys) {
        await prisma.appMetadata.upsert({
          where: { key },
          create: { key, value: now },
          update: { value: now },
        });
      }
    }

    // Checkpoint WAL and VACUUM
    try {
      await prisma.$queryRawUnsafe('PRAGMA wal_checkpoint(TRUNCATE);');
      await prisma.$executeRawUnsafe('VACUUM;');
    } catch (vErr) {
      console.warn('[WARN] VACUUM checkpoint notice:', vErr.message);
    }

    console.log('\n--- DELETION SUMMARY ---');
    for (const [table, count] of Object.entries(deletedCounts)) {
      console.log(`- ${table}: ${count} deleted`);
    }

    console.log('\n--- REMAINING PRESERVED DATA ---');
    if (tableNames.has('companies')) {
      const cCount = await prisma.company.count();
      console.log(`- Companies: ${cCount} preserved`);
    }
    if (tableNames.has('admin_users')) {
      const uCount = await prisma.adminUser.count();
      console.log(`- Admin Users: ${uCount} preserved`);
    }
    if (tableNames.has('categories')) {
      const catCount = await prisma.category.count();
      console.log(`- Categories: ${catCount} preserved`);
    }
    if (tableNames.has('category_fields')) {
      const fCount = await prisma.categoryField.count();
      console.log(`- Category Fields: ${fCount} preserved`);
    }

    console.log(`\n[SUCCESS] Cleared database at: ${dbPath}`);
  } catch (err) {
    console.error(`[ERROR] Failed to clear database ${dbPath}:`, err);
    throw err;
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const appData = process.env.APPDATA || '';

  const targetDatabases = [
    // Primary active database
    path.join(appData, 'pos-retail-desktop', 'app-data', 'pos-system.sqlite'),
    // Legacy / Electron default userData if present
    path.join(appData, 'Electron', 'app-data', 'pos-system.sqlite'),
    // Local dev db if present
    path.join(__dirname, '..', 'prisma', 'dev.db'),
  ];

  for (const dbPath of targetDatabases) {
    if (fs.existsSync(dbPath)) {
      await clearRetailPosDatabase(dbPath);
    }
  }

  // Also check pos2 database if exists
  const pos2Db = path.join(appData, 'pos2-retail-desktop', 'app-data', 'pos2-system.sqlite');
  if (fs.existsSync(pos2Db)) {
    console.log(`\n======================================================`);
    console.log(`[PROCESSING POS2] Target database: ${pos2Db}`);
    console.log(`======================================================`);
    try {
      const pos2PrismaPkg = path.join(__dirname, '..', 'pos2', 'node_modules', '@prisma', 'client');
      if (fs.existsSync(pos2PrismaPkg)) {
        const { PrismaClient: Pos2Client } = require(pos2PrismaPkg);
        const p2 = new Pos2Client({
          datasourceUrl: `file:${pos2Db.replace(/\\/g, '/')}`,
        });
        await p2.$connect();
        const bRes = await p2.buyer.deleteMany({});
        const mRes = await p2.metalRate.deleteMany({});
        console.log(`- POS2 Buyers deleted: ${bRes.count}`);
        console.log(`- POS2 MetalRates deleted: ${mRes.count}`);
        await p2.$queryRawUnsafe('PRAGMA wal_checkpoint(TRUNCATE);');
        await p2.$executeRawUnsafe('VACUUM;');
        await p2.$disconnect();
        console.log(`[SUCCESS] POS2 database cleared.`);
      }
    } catch (e) {
      console.warn(`[NOTICE POS2]:`, e.message);
    }
  }

  console.log('\n[ALL DONE] Database business data has been completely cleared!');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
