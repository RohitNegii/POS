const { PrismaClient } = require('@prisma/client');
const path = require('path');
const fs = require('fs');

async function inspectAndClean(dbPath) {
  if (!fs.existsSync(dbPath)) {
    console.log(`[SKIP] Database file does not exist: ${dbPath}`);
    return;
  }

  console.log(`\n==================================================`);
  console.log(`DATABASE: ${dbPath}`);
  console.log(`==================================================`);

  const normalizedPath = dbPath.replace(/\\/g, '/');
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: `file:${normalizedPath}`,
      },
    },
  });

  try {
    await prisma.$connect();

    const productFieldValueCount = await prisma.productFieldValue.count();
    const productCount = await prisma.product.count();
    const categoryFieldCount = await prisma.categoryField.count();
    const categoryCount = await prisma.category.count();
    const companyCount = await prisma.company.count();
    const adminCount = await prisma.adminUser.count();

    console.log(`BEFORE CLEANUP:`);
    console.log(`  - Products: ${productCount}`);
    console.log(`  - Product Field Values: ${productFieldValueCount}`);
    console.log(`  - Categories: ${categoryCount}`);
    console.log(`  - Category Fields: ${categoryFieldCount}`);
    console.log(`  - Companies (preserved): ${companyCount}`);
    console.log(`  - Admin Users (preserved): ${adminCount}`);

    // Clean up inside transaction
    await prisma.$transaction(async (tx) => {
      await tx.productFieldValue.deleteMany();
      await tx.product.deleteMany();
      await tx.categoryField.deleteMany();
      await tx.category.deleteMany();
    });

    const afterProducts = await prisma.product.count();
    const afterProductFieldValues = await prisma.productFieldValue.count();
    const afterCategories = await prisma.category.count();
    const afterCategoryFields = await prisma.categoryField.count();

    console.log(`AFTER CLEANUP:`);
    console.log(`  - Products: ${afterProducts}`);
    console.log(`  - Product Field Values: ${afterProductFieldValues}`);
    console.log(`  - Categories: ${afterCategories}`);
    console.log(`  - Category Fields: ${afterCategoryFields}`);
    console.log(`[SUCCESS] All category and product data wiped successfully!`);
  } catch (err) {
    console.error(`[ERROR] Failed to clean ${dbPath}:`, err);
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const appData = process.env.APPDATA;
  const paths = [
    path.join(appData, 'pos-retail-desktop', 'app-data', 'pos-system.sqlite'),
    path.join(appData, 'Electron', 'app-data', 'pos-system.sqlite'),
  ];

  for (const p of paths) {
    await inspectAndClean(p);
  }
}

main();
