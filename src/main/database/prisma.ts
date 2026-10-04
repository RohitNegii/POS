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
    const candidates = [
      path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', '.prisma', 'client', 'query_engine-windows.dll.node'),
      path.join(process.resourcesPath, 'node_modules', '.prisma', 'client', 'query_engine-windows.dll.node'),
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        process.env.PRISMA_QUERY_ENGINE_LIBRARY = candidate;
        break;
      }
    }
  }

  const client = new PrismaClient({
    datasourceUrl: paths.databaseUrl,
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
  } catch (err) {
    console.warn('[DB] Notice during stock_quantity verification:', err);
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
