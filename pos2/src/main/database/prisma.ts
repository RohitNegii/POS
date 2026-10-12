import { PrismaClient } from '@prisma/client';
import { resolveDatabasePaths } from './paths';
import { seedAll } from './seed';

let prismaInstance: PrismaClient | null = null;

export async function initializeDatabase(): Promise<PrismaClient> {
  if (prismaInstance) {
    return prismaInstance;
  }

  const paths = resolveDatabasePaths();
  process.env.DATABASE_URL = paths.databaseUrl;

  const client = new PrismaClient({
    datasourceUrl: paths.databaseUrl,
    log: ['error', 'warn'],
  });

  await client.$connect();

  // Configure SQLite pragmas for optimal desktop performance and integrity
  await client.$queryRawUnsafe('PRAGMA journal_mode = WAL;');
  await client.$executeRawUnsafe('PRAGMA foreign_keys = ON;');
  await client.$executeRawUnsafe('PRAGMA synchronous = NORMAL;');

  // Idempotently create tables
  await client.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "app_metadata" (
      "key" TEXT NOT NULL PRIMARY KEY,
      "value" TEXT NOT NULL,
      "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

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

  await client.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "buyers" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "company_id" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "phone_number" TEXT,
      "email" TEXT,
      "address" TEXT,
      "notes" TEXT,
      "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "buyers_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
  `);
  await client.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "buyers_company_id_name_key" ON "buyers"("company_id", "name");
  `);
  await client.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "buyers_company_id_idx" ON "buyers"("company_id");
  `);

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

  prismaInstance = client;

  // Run seed idempotently
  await seedAll(client);

  return client;
}

export function getPrismaClient(): PrismaClient {
  if (!prismaInstance) {
    throw new Error('Database has not been initialized yet. Call initializeDatabase() first.');
  }
  return prismaInstance;
}

export async function disconnectDatabase(): Promise<void> {
  if (prismaInstance) {
    await prismaInstance.$disconnect();
    prismaInstance = null;
  }
}
