-- CreateTable
CREATE TABLE "metal_rates" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "company_id" TEXT NOT NULL,
    "metal_type" TEXT NOT NULL,
    "rate_per_gram" REAL NOT NULL,
    "effective_date" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "metal_rates_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "metal_rates_company_id_idx" ON "metal_rates"("company_id");

-- CreateIndex
CREATE INDEX "metal_rates_effective_date_idx" ON "metal_rates"("effective_date");

-- CreateIndex
CREATE UNIQUE INDEX "metal_rates_company_id_metal_type_effective_date_key" ON "metal_rates"("company_id", "metal_type", "effective_date");
