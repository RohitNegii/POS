import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import { DatabasePathResolution, resolveDatabasePaths } from './paths';
import { seedAll } from './seed';

let prismaInstance: PrismaClient | null = null;
let resolvedPaths: DatabasePathResolution | null = null;
let currentJournalMode = 'wal';

export const METADATA_KEYS = {
  FIRST_INITIALIZED_AT: 'first_initialized_at',
  LAUNCH_COUNT: 'launch_count',
  LAST_LAUNCHED_AT: 'last_launched_at',
  SCHEMA_PHASE: 'schema_phase',
} as const;

/**
 * Initializes the SQLite database connection via Prisma in Electron's userData/app-data directory.
 * Strictly non-destructive: never resets, drops, or recreates existing database files or tables.
 */
export async function initializeDatabase(): Promise<void> {
  if (prismaInstance) {
    return;
  }

  const paths = resolveDatabasePaths();
  resolvedPaths = paths;
  process.env.DATABASE_URL = paths.databaseUrl;

  // In packaged production Electron, ensure Prisma points to the unpacked query engine DLL
  if (app.isPackaged && process.resourcesPath) {
    const possibleNames = [
      'query_engine-windows.dll.node',
      'libquery_engine-windows.dll.node',
      'query-engine-windows.dll.node',
      'libquery_engine-darwin-arm64.dylib.node',
      'libquery_engine-darwin.dylib.node',
    ];
    const candidateDirs = [
      path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', '.prisma', 'client'),
      path.join(process.resourcesPath, 'node_modules', '.prisma', 'client'),
      path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', '@prisma', 'client'),
      path.join(process.resourcesPath, 'node_modules', '@prisma', 'client'),
    ];
    for (const dir of candidateDirs) {
      for (const name of possibleNames) {
        const candidate = path.join(dir, name);
        if (fs.existsSync(candidate)) {
          process.env.PRISMA_QUERY_ENGINE_LIBRARY = candidate;
          break;
        }
      }
      if (process.env.PRISMA_QUERY_ENGINE_LIBRARY) break;
    }
  }

  const client = new PrismaClient({
    datasources: {
      db: {
        url: paths.databaseUrl,
      },
    },
    log: ['error', 'warn'],
  });

  await client.$connect();

  // Configure SQLite pragmas for desktop reliability and concurrency
  const journalResult = await client.$queryRawUnsafe<Array<{ journal_mode: string }>>(
    'PRAGMA journal_mode = WAL;'
  );
  if (journalResult && journalResult.length > 0 && journalResult[0].journal_mode) {
    currentJournalMode = journalResult[0].journal_mode;
  }
  await client.$executeRawUnsafe('PRAGMA foreign_keys = ON;');
  await client.$executeRawUnsafe('PRAGMA synchronous = NORMAL;');

  // Idempotent, non-destructive bootstrap for the system metadata table
  await client.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "app_metadata" (
      "key" TEXT NOT NULL PRIMARY KEY,
      "value" TEXT NOT NULL,
      "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Idempotent, non-destructive bootstrap for Phase 1 companies table
  await client.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "companies" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT NOT NULL,
      "code" TEXT NOT NULL,
      "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await client.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "companies_code_key" ON "companies"("code");
  `);

  // Idempotent, non-destructive bootstrap for Phase 2 admin_users table
  await client.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "admin_users" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "company_id" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "email" TEXT NOT NULL,
      "password_hash" TEXT NOT NULL,
      "role" TEXT NOT NULL DEFAULT 'COMPANY_ADMIN',
      "is_active" BOOLEAN NOT NULL DEFAULT 1,
      "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "admin_users_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
  `);
  await client.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "admin_users_company_id_email_key" ON "admin_users"("company_id", "email");
  `);
  await client.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "admin_users_email_idx" ON "admin_users"("email");
  `);

  // Idempotent, non-destructive bootstrap for Phase 3 categories table
  await client.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "categories" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "company_id" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "description" TEXT,
      "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "categories_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
  `);
  await client.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "categories_company_id_name_key" ON "categories"("company_id", "name");
  `);
  await client.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "categories_company_id_idx" ON "categories"("company_id");
  `);

  // Idempotent, non-destructive bootstrap for Phase 4 category_fields table
  await client.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "category_fields" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "category_id" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "field_key" TEXT NOT NULL,
      "field_type" TEXT NOT NULL,
      "required" BOOLEAN NOT NULL DEFAULT 0,
      "display_order" INTEGER NOT NULL DEFAULT 0,
      "options" TEXT,
      "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "category_fields_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
  `);
  await client.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "category_fields_category_id_field_key_key" ON "category_fields"("category_id", "field_key");
  `);
  await client.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "category_fields_category_id_idx" ON "category_fields"("category_id");
  `);

  // Idempotent, non-destructive bootstrap for Phase 5 products and product_field_values tables
  await client.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "products" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "company_id" TEXT NOT NULL,
      "category_id" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "barcode" TEXT NOT NULL,
      "stock_quantity" REAL NOT NULL DEFAULT 0,
      "is_archived" BOOLEAN NOT NULL DEFAULT 0,
      "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "products_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
  `);
  // Ensure stock_quantity column exists if table was created in an earlier migration
  try {
    const cols = await client.$queryRawUnsafe<Array<{ name: string }>>(
      'PRAGMA table_info("products");'
    );
    const hasStockQty = Array.isArray(cols) && cols.some((c) => c.name === 'stock_quantity');
    if (!hasStockQty) {
      await client.$executeRawUnsafe(
        'ALTER TABLE "products" ADD COLUMN "stock_quantity" REAL NOT NULL DEFAULT 0;'
      );
    }
    const hasVendorId = Array.isArray(cols) && cols.some((c) => c.name === 'vendor_id');
    if (!hasVendorId) {
      await client.$executeRawUnsafe(
        'ALTER TABLE "products" ADD COLUMN "vendor_id" TEXT;'
      );
    }
    const hasPurchaseDate = Array.isArray(cols) && cols.some((c) => c.name === 'purchase_date');
    if (!hasPurchaseDate) {
      await client.$executeRawUnsafe(
        'ALTER TABLE "products" ADD COLUMN "purchase_date" TEXT;'
      );
    }
  } catch (err) {
    console.warn('[DB] Notice during products columns verification:', err);
  }
  await client.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "products_barcode_key" ON "products"("barcode");
  `);
  await client.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "products_company_id_idx" ON "products"("company_id");
  `);
  await client.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "products_category_id_idx" ON "products"("category_id");
  `);
  await client.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "products_is_archived_idx" ON "products"("is_archived");
  `);

  await client.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "product_field_values" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "product_id" TEXT NOT NULL,
      "category_field_id" TEXT NOT NULL,
      "value_text" TEXT,
      "value_number" REAL,
      "value_boolean" BOOLEAN,
      "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "product_field_values_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "product_field_values_category_field_id_fkey" FOREIGN KEY ("category_field_id") REFERENCES "category_fields" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
  `);
  await client.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "product_field_values_product_id_idx" ON "product_field_values"("product_id");
  `);
  await client.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "product_field_values_category_field_id_idx" ON "product_field_values"("category_field_id");
  `);
  await client.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "product_field_values_product_id_category_field_id_key" ON "product_field_values"("product_id", "category_field_id");
  `);

  // Idempotent bootstrap for metal_rates table (Daily Gold / Silver market rates)
  await client.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "metal_rates" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "company_id" TEXT NOT NULL,
      "metal_type" TEXT NOT NULL,
      "rate_per_gram" REAL NOT NULL,
      "effective_date" TEXT NOT NULL,
      "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "metal_rates_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
  `);
  await client.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "metal_rates_company_id_metal_type_effective_date_key" ON "metal_rates"("company_id", "metal_type", "effective_date");
  `);
  await client.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "metal_rates_company_id_idx" ON "metal_rates"("company_id");
  `);
  await client.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "metal_rates_effective_date_idx" ON "metal_rates"("effective_date");
  `);

  // Idempotent bootstrap for bills and bill_items tables (Unified Cross-Company Single Billing)
  await client.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "bills" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "invoice_number" TEXT NOT NULL,
      "billing_user_id" TEXT,
      "billing_user_name" TEXT NOT NULL,
      "customer_name" TEXT,
      "customer_phone" TEXT,
      "subtotal" REAL NOT NULL DEFAULT 0,
      "discount_percentage" REAL NOT NULL DEFAULT 0,
      "discount" REAL NOT NULL DEFAULT 0,
      "tax_percentage" REAL NOT NULL DEFAULT 0,
      "tax" REAL NOT NULL DEFAULT 0,
      "total_amount" REAL NOT NULL DEFAULT 0,
      "payment_method" TEXT NOT NULL DEFAULT 'CASH',
      "status" TEXT NOT NULL DEFAULT 'COMPLETED',
      "notes" TEXT,
      "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await client.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "bills_invoice_number_key" ON "bills"("invoice_number");
  `);

  // Ensure discount_percentage and tax_percentage exist if bills table was created earlier
  try {
    const billCols = await client.$queryRawUnsafe<Array<{ name: string }>>('PRAGMA table_info("bills");');
    if (Array.isArray(billCols)) {
      if (!billCols.some((c) => c.name === 'discount_percentage')) {
        await client.$executeRawUnsafe('ALTER TABLE "bills" ADD COLUMN "discount_percentage" REAL NOT NULL DEFAULT 0;');
      }
      if (!billCols.some((c) => c.name === 'tax_percentage')) {
        await client.$executeRawUnsafe('ALTER TABLE "bills" ADD COLUMN "tax_percentage" REAL NOT NULL DEFAULT 0;');
      }
    }
  } catch (err) {
    console.warn('[DB] Notice during bills discount_percentage/tax_percentage check:', err);
  }

  await client.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "bill_items" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "bill_id" TEXT NOT NULL,
      "product_id" TEXT,
      "company_id" TEXT NOT NULL,
      "company_name" TEXT NOT NULL,
      "barcode" TEXT NOT NULL,
      "product_name" TEXT NOT NULL,
      "category_name" TEXT,
      "unit_price" REAL NOT NULL DEFAULT 0,
      "discount_percentage" REAL NOT NULL DEFAULT 0,
      "discount_amount" REAL NOT NULL DEFAULT 0,
      "net_unit_price" REAL NOT NULL DEFAULT 0,
      "quantity" REAL NOT NULL DEFAULT 1,
      "total_price" REAL NOT NULL DEFAULT 0,
      "details_json" TEXT,
      "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "bill_items_bill_id_fkey" FOREIGN KEY ("bill_id") REFERENCES "bills" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
  `);

  // Ensure item discount columns exist if bill_items table was created earlier
  try {
    const itemCols = await client.$queryRawUnsafe<Array<{ name: string }>>('PRAGMA table_info("bill_items");');
    if (Array.isArray(itemCols)) {
      if (!itemCols.some((c) => c.name === 'discount_percentage')) {
        await client.$executeRawUnsafe('ALTER TABLE "bill_items" ADD COLUMN "discount_percentage" REAL NOT NULL DEFAULT 0;');
      }
      if (!itemCols.some((c) => c.name === 'discount_amount')) {
        await client.$executeRawUnsafe('ALTER TABLE "bill_items" ADD COLUMN "discount_amount" REAL NOT NULL DEFAULT 0;');
      }
      if (!itemCols.some((c) => c.name === 'net_unit_price')) {
        await client.$executeRawUnsafe('ALTER TABLE "bill_items" ADD COLUMN "net_unit_price" REAL NOT NULL DEFAULT 0;');
      }
    }
  } catch (err) {
    console.warn('[DB] Notice during bill_items discount columns check:', err);
  }

  await client.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "bill_items_bill_id_idx" ON "bill_items"("bill_id");
  `);
  await client.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "bill_items_company_id_idx" ON "bill_items"("company_id");
  `);
  await client.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "bill_items_barcode_idx" ON "bill_items"("barcode");
  `);

  // Idempotent bootstrap for vendors table
  await client.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "vendors" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "company_id" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "phone_number" TEXT,
      "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "vendors_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
  `);
  await client.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "vendors_company_id_name_key" ON "vendors"("company_id", "name");
  `);
  await client.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "vendors_company_id_idx" ON "vendors"("company_id");
  `);

  // Migrate any existing vendors table columns
  try {
    const vCols = await client.$queryRawUnsafe<Array<{ name: string }>>('PRAGMA table_info("vendors");');
    if (Array.isArray(vCols)) {
      if (!vCols.some((c) => c.name === 'address')) {
        await client.$executeRawUnsafe('ALTER TABLE "vendors" ADD COLUMN "address" TEXT;');
      }
      if (!vCols.some((c) => c.name === 'gst_number')) {
        await client.$executeRawUnsafe('ALTER TABLE "vendors" ADD COLUMN "gst_number" TEXT;');
      }
      if (!vCols.some((c) => c.name === 'bank_name')) {
        await client.$executeRawUnsafe('ALTER TABLE "vendors" ADD COLUMN "bank_name" TEXT;');
      }
      if (!vCols.some((c) => c.name === 'account_number')) {
        await client.$executeRawUnsafe('ALTER TABLE "vendors" ADD COLUMN "account_number" TEXT;');
      }
      if (!vCols.some((c) => c.name === 'ifsc_code')) {
        await client.$executeRawUnsafe('ALTER TABLE "vendors" ADD COLUMN "ifsc_code" TEXT;');
      }
    }
  } catch (err) {
    console.warn('[DB] Notice during vendors column migration:', err);
  }

  // Idempotent bootstrap for purchases table (Bill-Wise Purchase Module)
  await client.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "purchases" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "purchase_number" TEXT NOT NULL DEFAULT '',
      "company_id" TEXT NOT NULL,
      "vendor_id" TEXT NOT NULL,
      "invoice_number" TEXT NOT NULL DEFAULT '',
      "purchase_date" TEXT NOT NULL,
      "eway_bill_number" TEXT,
      "transporter_name" TEXT,
      "vehicle_number" TEXT,
      "subtotal" REAL NOT NULL DEFAULT 0,
      "cgst_rate" REAL NOT NULL DEFAULT 0,
      "cgst_amount" REAL NOT NULL DEFAULT 0,
      "sgst_rate" REAL NOT NULL DEFAULT 0,
      "sgst_amount" REAL NOT NULL DEFAULT 0,
      "igst_rate" REAL NOT NULL DEFAULT 0,
      "igst_amount" REAL NOT NULL DEFAULT 0,
      "tax_amount" REAL NOT NULL DEFAULT 0,
      "total_amount" REAL NOT NULL DEFAULT 0,
      "paid_amount" REAL NOT NULL DEFAULT 0,
      "balance_amount" REAL NOT NULL DEFAULT 0,
      "payment_method" TEXT NOT NULL DEFAULT 'CASH',
      "payment_status" TEXT NOT NULL DEFAULT 'PAID',
      "payment_date" TEXT,
      "utr" TEXT,
      "description" TEXT,
      "notes" TEXT,
      "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "purchases_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "purchases_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
  `);

  // Migrate any existing purchases table columns and constraints
  try {
    const pCols = await client.$queryRawUnsafe<Array<{ name: string }>>('PRAGMA table_info("purchases");');
    if (Array.isArray(pCols)) {
      if (!pCols.some((c) => c.name === 'purchase_number')) {
        await client.$executeRawUnsafe('ALTER TABLE "purchases" ADD COLUMN "purchase_number" TEXT NOT NULL DEFAULT "";');
      }
      if (!pCols.some((c) => c.name === 'invoice_number')) {
        await client.$executeRawUnsafe('ALTER TABLE "purchases" ADD COLUMN "invoice_number" TEXT NOT NULL DEFAULT "";');
      }
      if (!pCols.some((c) => c.name === 'eway_bill_number')) {
        await client.$executeRawUnsafe('ALTER TABLE "purchases" ADD COLUMN "eway_bill_number" TEXT;');
      }
      if (!pCols.some((c) => c.name === 'transporter_name')) {
        await client.$executeRawUnsafe('ALTER TABLE "purchases" ADD COLUMN "transporter_name" TEXT;');
      }
      if (!pCols.some((c) => c.name === 'vehicle_number')) {
        await client.$executeRawUnsafe('ALTER TABLE "purchases" ADD COLUMN "vehicle_number" TEXT;');
      }
      if (!pCols.some((c) => c.name === 'subtotal')) {
        await client.$executeRawUnsafe('ALTER TABLE "purchases" ADD COLUMN "subtotal" REAL NOT NULL DEFAULT 0;');
      }
      if (!pCols.some((c) => c.name === 'cgst_rate')) {
        await client.$executeRawUnsafe('ALTER TABLE "purchases" ADD COLUMN "cgst_rate" REAL NOT NULL DEFAULT 0;');
      }
      if (!pCols.some((c) => c.name === 'cgst_amount')) {
        await client.$executeRawUnsafe('ALTER TABLE "purchases" ADD COLUMN "cgst_amount" REAL NOT NULL DEFAULT 0;');
      }
      if (!pCols.some((c) => c.name === 'sgst_rate')) {
        await client.$executeRawUnsafe('ALTER TABLE "purchases" ADD COLUMN "sgst_rate" REAL NOT NULL DEFAULT 0;');
      }
      if (!pCols.some((c) => c.name === 'sgst_amount')) {
        await client.$executeRawUnsafe('ALTER TABLE "purchases" ADD COLUMN "sgst_amount" REAL NOT NULL DEFAULT 0;');
      }
      if (!pCols.some((c) => c.name === 'igst_rate')) {
        await client.$executeRawUnsafe('ALTER TABLE "purchases" ADD COLUMN "igst_rate" REAL NOT NULL DEFAULT 0;');
      }
      if (!pCols.some((c) => c.name === 'igst_amount')) {
        await client.$executeRawUnsafe('ALTER TABLE "purchases" ADD COLUMN "igst_amount" REAL NOT NULL DEFAULT 0;');
      }
      if (!pCols.some((c) => c.name === 'tax_amount')) {
        await client.$executeRawUnsafe('ALTER TABLE "purchases" ADD COLUMN "tax_amount" REAL NOT NULL DEFAULT 0;');
      }
      if (!pCols.some((c) => c.name === 'paid_amount')) {
        await client.$executeRawUnsafe('ALTER TABLE "purchases" ADD COLUMN "paid_amount" REAL NOT NULL DEFAULT 0;');
      }
      if (!pCols.some((c) => c.name === 'balance_amount')) {
        await client.$executeRawUnsafe('ALTER TABLE "purchases" ADD COLUMN "balance_amount" REAL NOT NULL DEFAULT 0;');
      }
      if (!pCols.some((c) => c.name === 'payment_method')) {
        await client.$executeRawUnsafe('ALTER TABLE "purchases" ADD COLUMN "payment_method" TEXT NOT NULL DEFAULT "CASH";');
      }
      if (!pCols.some((c) => c.name === 'payment_status')) {
        await client.$executeRawUnsafe('ALTER TABLE "purchases" ADD COLUMN "payment_status" TEXT NOT NULL DEFAULT "PAID";');
      }
      if (!pCols.some((c) => c.name === 'payment_date')) {
        await client.$executeRawUnsafe('ALTER TABLE "purchases" ADD COLUMN "payment_date" TEXT;');
      }
      if (!pCols.some((c) => c.name === 'utr')) {
        await client.$executeRawUnsafe('ALTER TABLE "purchases" ADD COLUMN "utr" TEXT;');
      }
      if (!pCols.some((c) => c.name === 'description')) {
        await client.$executeRawUnsafe('ALTER TABLE "purchases" ADD COLUMN "description" TEXT;');
      }
    }

    // Drop old uniqueness constraint on (companyId, vendorId, purchaseDate) to support multiple bills
    await client.$executeRawUnsafe('DROP INDEX IF EXISTS "purchases_company_id_vendor_id_purchase_date_key";');

    // Backfill any empty purchase_number
    await client.$executeRawUnsafe(`
      UPDATE "purchases"
      SET "purchase_number" = 'PUR-' || replace(purchase_date, '-', '') || '-' || substr(id, 1, 6)
      WHERE "purchase_number" IS NULL OR "purchase_number" = '';
    `);

    // Backfill any empty invoice_number
    await client.$executeRawUnsafe(`
      UPDATE "purchases"
      SET "invoice_number" = 'INV-' || substr(id, 1, 6)
      WHERE "invoice_number" IS NULL OR "invoice_number" = '';
    `);

    // Backfill payment_date for historical purchases where payment was done
    await client.$executeRawUnsafe(`
      UPDATE "purchases"
      SET "payment_date" = "purchase_date"
      WHERE ("payment_date" IS NULL OR "payment_date" = '')
        AND ("payment_status" = 'PAID' OR "paid_amount" > 0)
        AND "payment_method" NOT IN ('NO_PAYMENT', 'CREDIT');
    `);
  } catch (err) {
    console.warn('[DB] Notice during purchases column migration:', err);
  }

  await client.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "purchases_purchase_number_key" ON "purchases"("purchase_number");
  `);
  await client.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "purchases_company_id_idx" ON "purchases"("company_id");
  `);
  await client.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "purchases_vendor_id_idx" ON "purchases"("vendor_id");
  `);
  await client.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "purchases_purchase_date_idx" ON "purchases"("purchase_date");
  `);
  await client.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "purchases_invoice_number_idx" ON "purchases"("invoice_number");
  `);

  // Idempotent bootstrap for purchase_items table (Itemized products in purchase)
  await client.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "purchase_items" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "purchase_id" TEXT NOT NULL,
      "product_id" TEXT,
      "product_name" TEXT NOT NULL,
      "item_description" TEXT,
      "barcode" TEXT NOT NULL,
      "category_name" TEXT,
      "hsn_code" TEXT,
      "quantity_bought" REAL NOT NULL DEFAULT 0,
      "unit_cost" REAL NOT NULL DEFAULT 0,
      "discount" REAL NOT NULL DEFAULT 0,
      "taxable_amount" REAL NOT NULL DEFAULT 0,
      "tax_rate" REAL NOT NULL DEFAULT 0,
      "tax_amount" REAL NOT NULL DEFAULT 0,
      "cgst_rate" REAL NOT NULL DEFAULT 0,
      "cgst_amount" REAL NOT NULL DEFAULT 0,
      "sgst_rate" REAL NOT NULL DEFAULT 0,
      "sgst_amount" REAL NOT NULL DEFAULT 0,
      "igst_rate" REAL NOT NULL DEFAULT 0,
      "igst_amount" REAL NOT NULL DEFAULT 0,
      "total_amount" REAL NOT NULL DEFAULT 0,
      "details_json" TEXT,
      "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "purchase_items_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchases" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "purchase_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products" ("id") ON DELETE SET NULL ON UPDATE CASCADE
    );
  `);

  // Migrate any existing purchase_items columns
  try {
    const itemCols = await client.$queryRawUnsafe<Array<{ name: string }>>('PRAGMA table_info("purchase_items");');
    if (Array.isArray(itemCols)) {
      if (!itemCols.some((c) => c.name === 'item_description')) {
        await client.$executeRawUnsafe('ALTER TABLE "purchase_items" ADD COLUMN "item_description" TEXT;');
      }
      if (!itemCols.some((c) => c.name === 'hsn_code')) {
        await client.$executeRawUnsafe('ALTER TABLE "purchase_items" ADD COLUMN "hsn_code" TEXT;');
      }
      if (!itemCols.some((c) => c.name === 'discount')) {
        await client.$executeRawUnsafe('ALTER TABLE "purchase_items" ADD COLUMN "discount" REAL NOT NULL DEFAULT 0;');
      }
      if (!itemCols.some((c) => c.name === 'taxable_amount')) {
        await client.$executeRawUnsafe('ALTER TABLE "purchase_items" ADD COLUMN "taxable_amount" REAL NOT NULL DEFAULT 0;');
      }
      if (!itemCols.some((c) => c.name === 'tax_rate')) {
        await client.$executeRawUnsafe('ALTER TABLE "purchase_items" ADD COLUMN "tax_rate" REAL NOT NULL DEFAULT 0;');
      }
      if (!itemCols.some((c) => c.name === 'tax_amount')) {
        await client.$executeRawUnsafe('ALTER TABLE "purchase_items" ADD COLUMN "tax_amount" REAL NOT NULL DEFAULT 0;');
      }
      if (!itemCols.some((c) => c.name === 'cgst_rate')) {
        await client.$executeRawUnsafe('ALTER TABLE "purchase_items" ADD COLUMN "cgst_rate" REAL NOT NULL DEFAULT 0;');
      }
      if (!itemCols.some((c) => c.name === 'cgst_amount')) {
        await client.$executeRawUnsafe('ALTER TABLE "purchase_items" ADD COLUMN "cgst_amount" REAL NOT NULL DEFAULT 0;');
      }
      if (!itemCols.some((c) => c.name === 'sgst_rate')) {
        await client.$executeRawUnsafe('ALTER TABLE "purchase_items" ADD COLUMN "sgst_rate" REAL NOT NULL DEFAULT 0;');
      }
      if (!itemCols.some((c) => c.name === 'sgst_amount')) {
        await client.$executeRawUnsafe('ALTER TABLE "purchase_items" ADD COLUMN "sgst_amount" REAL NOT NULL DEFAULT 0;');
      }
      if (!itemCols.some((c) => c.name === 'igst_rate')) {
        await client.$executeRawUnsafe('ALTER TABLE "purchase_items" ADD COLUMN "igst_rate" REAL NOT NULL DEFAULT 0;');
      }
      if (!itemCols.some((c) => c.name === 'igst_amount')) {
        await client.$executeRawUnsafe('ALTER TABLE "purchase_items" ADD COLUMN "igst_amount" REAL NOT NULL DEFAULT 0;');
      }
      if (!itemCols.some((c) => c.name === 'details_json')) {
        await client.$executeRawUnsafe('ALTER TABLE "purchase_items" ADD COLUMN "details_json" TEXT;');
      }
    }
  } catch (err) {
    console.warn('[DB] Notice during purchase_items column migration:', err);
  }

  await client.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "purchase_items_purchase_id_idx" ON "purchase_items"("purchase_id");
  `);
  await client.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "purchase_items_product_id_idx" ON "purchase_items"("product_id");
  `);
  await client.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "purchase_items_barcode_idx" ON "purchase_items"("barcode");
  `);

  // Idempotent bootstrap for purchase_returns table
  await client.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "purchase_returns" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "return_number" TEXT NOT NULL,
      "purchase_id" TEXT NOT NULL,
      "company_id" TEXT NOT NULL,
      "vendor_id" TEXT NOT NULL,
      "return_date" TEXT NOT NULL,
      "total_amount" REAL NOT NULL DEFAULT 0,
      "refund_type" TEXT NOT NULL DEFAULT 'CASH',
      "refund_amount" REAL NOT NULL DEFAULT 0,
      "reason" TEXT,
      "notes" TEXT,
      "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "purchase_returns_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchases" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "purchase_returns_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "purchase_returns_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
  `);
  await client.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "purchase_returns_return_number_key" ON "purchase_returns"("return_number");
  `);
  await client.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "purchase_returns_company_id_idx" ON "purchase_returns"("company_id");
  `);
  await client.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "purchase_returns_vendor_id_idx" ON "purchase_returns"("vendor_id");
  `);
  await client.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "purchase_returns_purchase_id_idx" ON "purchase_returns"("purchase_id");
  `);
  await client.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "purchase_returns_return_date_idx" ON "purchase_returns"("return_date");
  `);

  // Idempotent bootstrap for purchase_return_items table
  await client.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "purchase_return_items" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "purchase_return_id" TEXT NOT NULL,
      "purchase_item_id" TEXT NOT NULL,
      "product_id" TEXT,
      "product_name" TEXT NOT NULL,
      "barcode" TEXT NOT NULL,
      "quantity_returned" REAL NOT NULL DEFAULT 0,
      "unit_cost" REAL NOT NULL DEFAULT 0,
      "total_cost" REAL NOT NULL DEFAULT 0,
      "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "purchase_return_items_purchase_return_id_fkey" FOREIGN KEY ("purchase_return_id") REFERENCES "purchase_returns" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "purchase_return_items_purchase_item_id_fkey" FOREIGN KEY ("purchase_item_id") REFERENCES "purchase_items" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
  `);
  await client.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "purchase_return_items_purchase_return_id_idx" ON "purchase_return_items"("purchase_return_id");
  `);
  await client.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "purchase_return_items_purchase_item_id_idx" ON "purchase_return_items"("purchase_item_id");
  `);
  await client.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "purchase_return_items_product_id_idx" ON "purchase_return_items"("product_id");
  `);

  // Idempotent bootstrap for billing_users table (Registered Billing Users managed by Super Admin)
  await client.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "billing_users" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT NOT NULL,
      "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await client.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "billing_users_name_key" ON "billing_users"("name");
  `);

  // Idempotent bootstrap for expense_categories table
  await client.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "expense_categories" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT NOT NULL,
      "description" TEXT,
      "is_default" BOOLEAN NOT NULL DEFAULT 0,
      "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await client.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "expense_categories_name_key" ON "expense_categories"("name");
  `);

  // Migrate expenses table foreign key if it previously referenced the old employees table
  try {
    const tableSql = await client.$queryRawUnsafe<Array<{ sql: string }>>(
      `SELECT sql FROM sqlite_master WHERE type='table' AND name='expenses';`
    );
    if (tableSql && tableSql[0] && tableSql[0].sql && tableSql[0].sql.includes('REFERENCES "employees"')) {
      await client.$executeRawUnsafe('PRAGMA foreign_keys = OFF;');
      await client.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "expenses_new" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "company_id" TEXT NOT NULL,
          "category_id" TEXT NOT NULL,
          "employee_id" TEXT,
          "employee_name" TEXT,
          "amount" REAL NOT NULL DEFAULT 0,
          "payment_method" TEXT NOT NULL DEFAULT 'CASH',
          "expense_date" TEXT NOT NULL,
          "description" TEXT,
          "receipt_path" TEXT,
          "created_by" TEXT NOT NULL,
          "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "expenses_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
          CONSTRAINT "expenses_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "expense_categories" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
          CONSTRAINT "expenses_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "billing_users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
        );
      `);
      await client.$executeRawUnsafe(`
        INSERT INTO "expenses_new" ("id", "company_id", "category_id", "employee_id", "employee_name", "amount", "payment_method", "expense_date", "description", "receipt_path", "created_by", "created_at", "updated_at")
        SELECT "id", "company_id", "category_id", NULL, "employee_name", "amount", "payment_method", "expense_date", "description", "receipt_path", "created_by", "created_at", "updated_at"
        FROM "expenses";
      `);
      await client.$executeRawUnsafe('DROP TABLE "expenses";');
      await client.$executeRawUnsafe('ALTER TABLE "expenses_new" RENAME TO "expenses";');
      await client.$executeRawUnsafe('PRAGMA foreign_keys = ON;');
    }
  } catch (err) {
    console.warn('[DB] Notice during expenses foreign key migration:', err);
  }

  // Drop redundant employees table if exists, as billing_users represent the staff/employees
  await client.$executeRawUnsafe(`
    DROP TABLE IF EXISTS "employees";
  `);

  // Idempotent bootstrap for expenses table
  await client.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "expenses" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "company_id" TEXT NOT NULL,
      "category_id" TEXT NOT NULL,
      "employee_id" TEXT,
      "employee_name" TEXT,
      "amount" REAL NOT NULL DEFAULT 0,
      "payment_method" TEXT NOT NULL DEFAULT 'CASH',
      "expense_date" TEXT NOT NULL,
      "description" TEXT,
      "receipt_path" TEXT,
      "created_by" TEXT NOT NULL,
      "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "expenses_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "expenses_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "expense_categories" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "expenses_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "billing_users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
    );
  `);
  await client.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "expenses_company_id_idx" ON "expenses"("company_id");
  `);
  await client.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "expenses_category_id_idx" ON "expenses"("category_id");
  `);
  await client.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "expenses_employee_id_idx" ON "expenses"("employee_id");
  `);
  await client.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "expenses_expense_date_idx" ON "expenses"("expense_date");
  `);
  await client.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "expenses_payment_method_idx" ON "expenses"("payment_method");
  `);

  // Idempotent bootstrap for financial_transactions table
  await client.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "financial_transactions" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "company_id" TEXT NOT NULL,
      "type" TEXT NOT NULL,
      "expense_id" TEXT,
      "payment_method" TEXT NOT NULL DEFAULT 'CASH',
      "amount" REAL NOT NULL DEFAULT 0,
      "balance_before" REAL NOT NULL DEFAULT 0,
      "balance_after" REAL NOT NULL DEFAULT 0,
      "description" TEXT,
      "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "financial_transactions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "financial_transactions_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "expenses" ("id") ON DELETE SET NULL ON UPDATE CASCADE
    );
  `);
  await client.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "financial_transactions_company_id_idx" ON "financial_transactions"("company_id");
  `);
  await client.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "financial_transactions_expense_id_idx" ON "financial_transactions"("expense_id");
  `);
  await client.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "financial_transactions_payment_method_idx" ON "financial_transactions"("payment_method");
  `);
  await client.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "financial_transactions_type_idx" ON "financial_transactions"("type");
  `);

  // Idempotent bootstrap for backup_histories table
  await client.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "backup_histories" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "filename" TEXT NOT NULL,
      "drive_file_id" TEXT,
      "size_bytes" INTEGER NOT NULL DEFAULT 0,
      "backup_type" TEXT NOT NULL,
      "status" TEXT NOT NULL,
      "error_message" TEXT,
      "checksum" TEXT,
      "metadata_json" TEXT,
      "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "completed_at" DATETIME
    );
  `);
  await client.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "backup_histories_status_idx" ON "backup_histories"("status");
  `);
  await client.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "backup_histories_created_at_idx" ON "backup_histories"("created_at");
  `);

  // Ensure fixed system companies and development admin users exist idempotently
  await seedAll(client);

  const nowIso = new Date().toISOString();

  // Preserve first_initialized_at across all future restarts
  const existingInit = await client.appMetadata.findUnique({
    where: { key: METADATA_KEYS.FIRST_INITIALIZED_AT },
  });

  if (!existingInit) {
    await client.appMetadata.create({
      data: {
        key: METADATA_KEYS.FIRST_INITIALIZED_AT,
        value: nowIso,
      },
    });
  }

  // Increment persistent launch count to verify database survives application restarts
  const existingLaunchCount = await client.appMetadata.findUnique({
    where: { key: METADATA_KEYS.LAUNCH_COUNT },
  });

  const previousCount = existingLaunchCount ? parseInt(existingLaunchCount.value, 10) || 0 : 0;
  const nextCount = previousCount + 1;

  await client.appMetadata.upsert({
    where: { key: METADATA_KEYS.LAUNCH_COUNT },
    update: { value: String(nextCount) },
    create: {
      key: METADATA_KEYS.LAUNCH_COUNT,
      value: String(nextCount),
    },
  });

  await client.appMetadata.upsert({
    where: { key: METADATA_KEYS.LAST_LAUNCHED_AT },
    update: { value: nowIso },
    create: {
      key: METADATA_KEYS.LAST_LAUNCHED_AT,
      value: nowIso,
    },
  });

  await client.appMetadata.upsert({
    where: { key: METADATA_KEYS.SCHEMA_PHASE },
    update: { value: 'PHASE_4_DYNAMIC_CATEGORY_FIELDS' },
    create: {
      key: METADATA_KEYS.SCHEMA_PHASE,
      value: 'PHASE_4_DYNAMIC_CATEGORY_FIELDS',
    },
  });

  prismaInstance = client;
}

export function getPrismaClient(): PrismaClient {
  if (!prismaInstance) {
    throw new Error('PrismaClient has not been initialized. Call initializeDatabase() first.');
  }
  return prismaInstance;
}

export function getDatabasePaths(): DatabasePathResolution {
  if (!resolvedPaths) {
    resolvedPaths = resolveDatabasePaths();
  }
  return resolvedPaths;
}

export function getJournalMode(): string {
  return currentJournalMode;
}

export async function disconnectDatabase(): Promise<void> {
  if (prismaInstance) {
    await prismaInstance.$disconnect();
    prismaInstance = null;
  }
}
