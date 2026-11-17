const path = require('path');
const fs = require('fs');
const os = require('os');
const { PrismaClient } = require('@prisma/client');
const { seed } = require('./seed.cjs');

function getCandidateDatabases() {
  const home = os.homedir();
  const candidates = [];

  // macOS paths
  if (process.platform === 'darwin') {
    candidates.push(
      path.join(home, 'Library', 'Application Support', 'pos-retail-desktop', 'app-data', 'pos-system.sqlite'),
      path.join(home, 'Library', 'Application Support', 'Electron', 'app-data', 'pos-system.sqlite')
    );
  }

  // Windows paths
  if (process.env.APPDATA) {
    candidates.push(
      path.join(process.env.APPDATA, 'pos-retail-desktop', 'app-data', 'pos-system.sqlite'),
      path.join(process.env.APPDATA, 'Electron', 'app-data', 'pos-system.sqlite')
    );
  }

  // Linux paths
  candidates.push(
    path.join(home, '.config', 'pos-retail-desktop', 'app-data', 'pos-system.sqlite'),
    path.join(home, '.config', 'Electron', 'app-data', 'pos-system.sqlite')
  );

  // Local repository dev databases
  candidates.push(
    path.join(__dirname, '..', 'prisma', 'dev.db'),
    path.join(__dirname, '..', 'prisma', 'prisma', 'dev.db')
  );

  // Return unique, existing paths
  const uniquePaths = Array.from(new Set(candidates));
  return uniquePaths.filter((p) => fs.existsSync(p));
}

async function wipeAndSeedDatabase(dbPath) {
  console.log(`\n======================================================`);
  console.log(`[TARGET DATABASE] ${dbPath}`);
  console.log(`======================================================`);

  const normalizedUrl = `file:${dbPath.replace(/\\/g, '/')}`;
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: normalizedUrl,
      },
    },
  });

  try {
    await prisma.$connect();

    // 1. Inspect existing tables
    const tablesRaw = await prisma.$queryRawUnsafe(`
      SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';
    `);
    const tables = new Set(tablesRaw.map((t) => t.name));
    console.log('[INFO] Detected tables:', Array.from(tables).join(', '));

    // 2. Count before wipe
    console.log('\n--- PRE-WIPE COUNTS ---');
    const getCount = async (tbl, modelFn) => {
      if (tables.has(tbl) && modelFn) {
        try {
          return await modelFn.count();
        } catch {
          return 'N/A';
        }
      }
      return 0;
    };

    console.log(`- Bills: ${await getCount('bills', prisma.bill)}`);
    console.log(`- Bill Items: ${await getCount('bill_items', prisma.billItem)}`);
    console.log(`- Purchases: ${await getCount('purchases', prisma.purchase)}`);
    console.log(`- Purchase Items: ${await getCount('purchase_items', prisma.purchaseItem)}`);
    console.log(`- Purchase Returns: ${await getCount('purchase_returns', prisma.purchaseReturn)}`);
    console.log(`- Products: ${await getCount('products', prisma.product)}`);
    console.log(`- Product Field Values: ${await getCount('product_field_values', prisma.productFieldValue)}`);
    console.log(`- Vendors: ${await getCount('vendors', prisma.vendor)}`);
    console.log(`- Metal Rates: ${await getCount('metal_rates', prisma.metalRate)}`);
    console.log(`- Categories: ${await getCount('categories', prisma.category)}`);
    console.log(`- Category Fields: ${await getCount('category_fields', prisma.categoryField)}`);
    console.log(`- Billing Users: ${await getCount('billing_users', prisma.billingUser)}`);
    console.log(`- Admin Users: ${await getCount('admin_users', prisma.adminUser)}`);
    console.log(`- Companies: ${await getCount('companies', prisma.company)}`);

    // 3. Complete wipe
    console.log('\n[WIPING] Removing complete old data...');
    await prisma.$executeRawUnsafe('PRAGMA foreign_keys = OFF;');

    const wipeOrder = [
      'bill_items',
      'bills',
      'purchase_return_items',
      'purchase_returns',
      'purchase_items',
      'purchases',
      'product_field_values',
      'products',
      'vendors',
      'metal_rates',
      'category_fields',
      'categories',
      'billing_users',
      'admin_users',
      'companies',
      'app_metadata',
    ];

    for (const table of wipeOrder) {
      if (tables.has(table)) {
        await prisma.$executeRawUnsafe(`DELETE FROM "${table}";`);
      }
    }

    await prisma.$executeRawUnsafe('PRAGMA foreign_keys = ON;');

    // Truncate WAL & vacuum database
    try {
      await prisma.$queryRawUnsafe('PRAGMA wal_checkpoint(TRUNCATE);');
      await prisma.$executeRawUnsafe('VACUUM;');
    } catch (vErr) {
      console.warn('[NOTICE] WAL checkpoint/VACUUM:', vErr.message);
    }

    console.log('[SUCCESS] All old data completely removed.');

    // 4. Run Seed
    console.log('\n[SEEDING] Running fresh system seed...');
    await seed(prisma);

    // 5. Post-seed Verification
    console.log('\n--- POST-SEED FRESH COUNTS ---');
    console.log(`- Companies: ${await getCount('companies', prisma.company)} (Company A, Company B)`);
    console.log(`- Admin Users: ${await getCount('admin_users', prisma.adminUser)} (adminA, adminB, billing, superadmin)`);
    console.log(`- Billing Users: ${await getCount('billing_users', prisma.billingUser)} (Billing Cashier, Counter Staff 1)`);
    console.log(`- Categories: ${await getCount('categories', prisma.category)} (5 per company = 10 total)`);
    console.log(`- Category Fields: ${await getCount('category_fields', prisma.categoryField)} (Full dynamic schemas)`);
    console.log(`- Demo Products: ${await getCount('products', prisma.product)} (Ready for barcode scanning)`);
    console.log(`- Product Field Values: ${await getCount('product_field_values', prisma.productFieldValue)}`);
    console.log(`- Vendors: ${await getCount('vendors', prisma.vendor)} (Surat Bullion, Zaveri, Jaipur Heritage)`);
    console.log(`- Metal Rates: ${await getCount('metal_rates', prisma.metalRate)} (Gold: ₹7,250/g, Silver: ₹85/g)`);
    console.log(`- Bills: ${await getCount('bills', prisma.bill)} (Clean 0)`);
    console.log(`- Purchases: ${await getCount('purchases', prisma.purchase)} (Clean 0)`);
    console.log(`- Purchase Returns: ${await getCount('purchase_returns', prisma.purchaseReturn)} (Clean 0)`);

    console.log(`\n[COMPLETE] Database ${dbPath} is freshly seeded and 100% clean!\n`);
  } catch (err) {
    console.error(`[ERROR] Failed to wipe and seed ${dbPath}:`, err);
    throw err;
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const dbs = getCandidateDatabases();
  if (dbs.length === 0) {
    console.warn('[WARN] No SQLite database files found.');
    return;
  }

  console.log(`Found ${dbs.length} database(s) to reset and seed:`);
  for (const d of dbs) {
    console.log(`  - ${d}`);
  }

  for (const dbPath of dbs) {
    await wipeAndSeedDatabase(dbPath);
  }

  console.log('======================================================');
  console.log('ALL DATABASES SUCCESSFULLY WIPED AND RE-SEEDED!');
  console.log('======================================================');
}

main().catch((err) => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
