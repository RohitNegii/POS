import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../auth/password';

export interface FixedCompanyDefinition {
  code: string;
  name: string;
}

export const FIXED_COMPANIES: readonly FixedCompanyDefinition[] = Object.freeze([
  {
    code: 'COMPANY_A',
    name: 'Company A',
  },
  {
    code: 'COMPANY_B',
    name: 'Company B',
  },
]);

export interface FixedAdminDefinition {
  companyCode: string;
  name: string;
  email: string;
  passwordPlain: string;
  role: string;
}

export const FIXED_ADMINS: readonly FixedAdminDefinition[] = Object.freeze([
  {
    companyCode: 'COMPANY_A',
    name: 'Company A Admin',
    email: 'adminA@example.com',
    passwordPlain: 'Admin@123',
    role: 'COMPANY_ADMIN',
  },
  {
    companyCode: 'COMPANY_B',
    name: 'Company B Admin',
    email: 'adminB@example.com',
    passwordPlain: 'Admin@123',
    role: 'COMPANY_ADMIN',
  },
  {
    companyCode: 'COMPANY_A',
    name: 'Billing Cashier',
    email: 'billing@example.com',
    passwordPlain: 'Billing@123',
    role: 'BILLING_USER',
  },
]);

export interface SeededCompanyResult {
  id: string;
  name: string;
  code: string;
  createdAt: Date;
  updatedAt: Date;
  isNewlyCreated: boolean;
}

export interface SeededAdminResult {
  id: string;
  companyId: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  isNewlyCreated: boolean;
}

/**
 * Idempotently seeds the fixed system companies.
 * - Preserves existing companies, IDs, and timestamps completely intact.
 * - Guarantees exactly two companies exist in SQLite.
 */
export async function seedFixedCompanies(
  prisma: PrismaClient
): Promise<SeededCompanyResult[]> {
  const results: SeededCompanyResult[] = [];

  for (const compData of FIXED_COMPANIES) {
    const existing = await prisma.company.findUnique({
      where: { code: compData.code },
    });

    if (existing) {
      results.push({
        ...existing,
        isNewlyCreated: false,
      });
    } else {
      const created = await prisma.company.create({
        data: {
          code: compData.code,
          name: compData.name,
        },
      });
      results.push({
        ...created,
        isNewlyCreated: true,
      });
    }
  }

  const count = await prisma.company.count();
  if (count !== 2) {
    throw new Error(
      `[SEED INTEGRITY VIOLATION] Expected exactly 2 companies in database, found ${count}.`
    );
  }

  return results;
}

/**
 * Idempotently seeds development admin accounts for Company A and Company B.
 * - Passwords are securely hashed with scrypt before storing.
 * - Preserves existing admin accounts and permanent IDs completely intact.
 * - Does NOT recreate or duplicate accounts on repeated runs.
 */
export async function seedDevelopmentAdmins(
  prisma: PrismaClient
): Promise<SeededAdminResult[]> {
  const results: SeededAdminResult[] = [];

  for (const adminDef of FIXED_ADMINS) {
    const company = await prisma.company.findUnique({
      where: { code: adminDef.companyCode },
    });

    if (!company) {
      throw new Error(
        `[SEED ERROR] Cannot seed admin: Company with code "${adminDef.companyCode}" does not exist.`
      );
    }

    const existingAdmin = await prisma.adminUser.findFirst({
      where: {
        companyId: company.id,
        email: adminDef.email.toLowerCase().trim(),
      },
    });

    if (existingAdmin) {
      results.push({
        ...existingAdmin,
        isNewlyCreated: false,
      });
    } else {
      const passwordHash = hashPassword(adminDef.passwordPlain);
      const createdAdmin = await prisma.adminUser.create({
        data: {
          companyId: company.id,
          name: adminDef.name,
          email: adminDef.email.toLowerCase().trim(),
          passwordHash,
          role: adminDef.role,
          isActive: true,
        },
      });

      results.push({
        ...createdAdmin,
        isNewlyCreated: true,
      });
    }
  }

  const adminCount = await prisma.adminUser.count();
  if (adminCount < FIXED_ADMINS.length) {
    throw new Error(
      `[SEED INTEGRITY VIOLATION] Expected at least ${FIXED_ADMINS.length} users in database, found ${adminCount}.`
    );
  }

  return results;
}

export interface ClientCategoryDefinition {
  name: string;
  description: string;
  fields: Array<{
    name: string;
    fieldKey: string;
    fieldType: 'text' | 'number' | 'select' | 'boolean';
    required: boolean;
    displayOrder: number;
    options?: string[];
  }>;
}

export const CLIENT_CATEGORY_MODELS: readonly ClientCategoryDefinition[] = Object.freeze([
  {
    name: 'Gold / Silver Jewellery',
    description: 'Gold and silver ornaments tracked by purity, weight, and making charges.',
    fields: [
      {
        name: 'Purity',
        fieldKey: 'purity',
        fieldType: 'select',
        required: true,
        displayOrder: 1,
        options: ['24K (999)', '22K (916)', '18K (750)', '14K (585)', '925 Silver', 'Fine Silver'],
      },
      {
        name: 'Weight',
        fieldKey: 'weight',
        fieldType: 'number',
        required: true,
        displayOrder: 2,
      },
      {
        name: 'Making Charges per Gram',
        fieldKey: 'makingChargesPerGram',
        fieldType: 'number',
        required: true,
        displayOrder: 3,
      },
    ],
  },
  {
    name: 'Artificial / Imitation Jewellery',
    description: 'Fashion and imitation jewellery with design, colour variants, and fixed pricing.',
    fields: [
      {
        name: 'Design Weight',
        fieldKey: 'designWeight',
        fieldType: 'number',
        required: false,
        displayOrder: 1,
      },
      {
        name: 'Colour',
        fieldKey: 'colour',
        fieldType: 'select',
        required: true,
        displayOrder: 2,
        options: ['Gold', 'Silver', 'Rose Gold', 'Antique Black', 'Multicolor'],
      },
      {
        name: 'Size',
        fieldKey: 'size',
        fieldType: 'select',
        required: false,
        displayOrder: 3,
        options: ['Small', 'Medium', 'Large', 'Free Size'],
      },
    ],
  },
  {
    name: 'German Silver / German Metal',
    description: 'German silver and metal items with colour and size variations.',
    fields: [
      {
        name: 'Design Weight',
        fieldKey: 'designWeight',
        fieldType: 'number',
        required: false,
        displayOrder: 1,
      },
      {
        name: 'Colour',
        fieldKey: 'colour',
        fieldType: 'select',
        required: true,
        displayOrder: 2,
        options: ['Silver', 'Oxidized Silver', 'Antique Gold', 'Copper Tone'],
      },
      {
        name: 'Size',
        fieldKey: 'size',
        fieldType: 'select',
        required: false,
        displayOrder: 3,
        options: ['Small', 'Medium', 'Large', 'Standard'],
      },
    ],
  },
  {
    name: 'Home Décor — Piece / Unit Based',
    description: 'Home décor pieces sold per unit with design, material, and colour attributes.',
    fields: [
      {
        name: 'Size',
        fieldKey: 'size',
        fieldType: 'text',
        required: false,
        displayOrder: 1,
      },
      {
        name: 'Weight',
        fieldKey: 'weight',
        fieldType: 'number',
        required: false,
        displayOrder: 2,
      },
      {
        name: 'Colour',
        fieldKey: 'colour',
        fieldType: 'text',
        required: false,
        displayOrder: 3,
      },
      {
        name: 'Design',
        fieldKey: 'design',
        fieldType: 'text',
        required: true,
        displayOrder: 4,
      },
      {
        name: 'Material',
        fieldKey: 'material',
        fieldType: 'text',
        required: true,
        displayOrder: 5,
      },
    ],
  },
  {
    name: 'Home Décor — Meter Based',
    description: 'Fabrics and meter-based home décor items sold by linear length.',
    fields: [
      {
        name: 'Material',
        fieldKey: 'material',
        fieldType: 'text',
        required: true,
        displayOrder: 1,
      },
      {
        name: 'Colour',
        fieldKey: 'colour',
        fieldType: 'text',
        required: false,
        displayOrder: 2,
      },
      {
        name: 'Design',
        fieldKey: 'design',
        fieldType: 'text',
        required: true,
        displayOrder: 3,
      },
      {
        name: 'Width / Size',
        fieldKey: 'widthOrSize',
        fieldType: 'text',
        required: true,
        displayOrder: 4,
      },
      {
        name: 'Weight',
        fieldKey: 'weight',
        fieldType: 'number',
        required: false,
        displayOrder: 5,
      },
      {
        name: 'Rate per Meter',
        fieldKey: 'ratePerMeter',
        fieldType: 'number',
        required: true,
        displayOrder: 6,
      },
      {
        name: 'Selling Price per Meter',
        fieldKey: 'sellingPricePerMeter',
        fieldType: 'number',
        required: true,
        displayOrder: 7,
      },
    ],
  },
]);

/**
 * Idempotently seeds the 5 client product category models and their dynamic fields.
 * Strictly adheres to client requirements:
 * - Stock Quantity is NOT created as a CategoryField (it is a core Product field).
 * - Barcode is NOT created as a CategoryField (it is a core Product field).
 * - Gold / Silver Jewellery has NO manual Selling Price field.
 * - German Silver has NO Finish/Polish field.
 * - Width / Size is not hardcoded to inches.
 */
export async function seedClientCategoryModels(prisma: PrismaClient): Promise<void> {
  const initKey = 'client_categories_initialized';
  const existingInit = await prisma.appMetadata.findUnique({
    where: { key: initKey },
  });

  if (existingInit) {
    return;
  }

  const companies = await prisma.company.findMany();

  for (const company of companies) {
    for (const model of CLIENT_CATEGORY_MODELS) {
      // Find or create category for this company
      let category = await prisma.category.findFirst({
        where: {
          companyId: company.id,
          name: model.name,
        },
      });

      if (!category) {
        category = await prisma.category.create({
          data: {
            companyId: company.id,
            name: model.name,
            description: model.description,
          },
        });
      }

      // Cleanup any legacy CategoryFields:
      // Remove any field with 'stock' in key/name (since stock is on Product)
      await prisma.categoryField.deleteMany({
        where: {
          categoryId: category.id,
          OR: [
            { fieldKey: { contains: 'stock' } },
            { name: { contains: 'Stock' } },
            // If Gold/Silver, remove fixed selling price AND currentMetalRate (which is now in daily metal rates table)
            ...(model.name.includes('Gold') ? [
              { fieldKey: 'sellingPrice' },
              { name: 'Selling Price' },
              { fieldKey: 'currentMetalRate' },
              { name: 'Current Gold/Silver Rate' },
            ] : []),
            // If German Silver, remove finish/polish
            ...(model.name.includes('German') ? [{ fieldKey: { contains: 'finish' } }, { name: { contains: 'Finish' } }] : []),
          ],
        },
      });

      // Ensure sellingPrice is never marked required as a category attribute
      await prisma.categoryField.updateMany({
        where: {
          categoryId: category.id,
          fieldKey: 'sellingPrice',
        },
        data: {
          required: false,
        },
      });

      // Upsert the defined dynamic fields
      for (const fDef of model.fields) {
        const existingField = await prisma.categoryField.findUnique({
          where: {
            categoryId_fieldKey: {
              categoryId: category.id,
              fieldKey: fDef.fieldKey,
            },
          },
        });

        const serializedOptions = fDef.options ? JSON.stringify(fDef.options) : null;

        if (existingField) {
          await prisma.categoryField.update({
            where: { id: existingField.id },
            data: {
              name: fDef.name,
              fieldType: fDef.fieldType,
              required: fDef.required,
              displayOrder: fDef.displayOrder,
              options: serializedOptions,
            },
          });
        } else {
          await prisma.categoryField.create({
            data: {
              categoryId: category.id,
              name: fDef.name,
              fieldKey: fDef.fieldKey,
              fieldType: fDef.fieldType,
              required: fDef.required,
              displayOrder: fDef.displayOrder,
              options: serializedOptions,
            },
          });
        }
      }
    }
  }

  await prisma.appMetadata.upsert({
    where: { key: initKey },
    create: { key: initKey, value: new Date().toISOString() },
    update: { value: new Date().toISOString() },
  });
}

/**
 * Seeds initial baseline daily metal rates for both companies if none exist.
 */
export async function seedInitialMetalRates(prisma: PrismaClient): Promise<void> {
  const initKey = 'initial_metal_rates_initialized';
  const existingInit = await prisma.appMetadata.findUnique({
    where: { key: initKey },
  });
  if (existingInit) {
    return;
  }

  const companies = await prisma.company.findMany();
  const todayStr = new Date().toISOString().split('T')[0]; // 'YYYY-MM-DD'

  for (const company of companies) {
    const existingGold = await prisma.metalRate.findFirst({
      where: { companyId: company.id, metalType: 'GOLD' },
    });
    if (!existingGold) {
      await prisma.metalRate.create({
        data: {
          companyId: company.id,
          metalType: 'GOLD',
          ratePerGram: 7250,
          effectiveDate: todayStr,
        },
      });
    }

    const existingSilver = await prisma.metalRate.findFirst({
      where: { companyId: company.id, metalType: 'SILVER' },
    });
    if (!existingSilver) {
      await prisma.metalRate.create({
        data: {
          companyId: company.id,
          metalType: 'SILVER',
          ratePerGram: 95,
          effectiveDate: todayStr,
        },
      });
    }
  }

  await prisma.appMetadata.upsert({
    where: { key: initKey },
    create: { key: initKey, value: new Date().toISOString() },
    update: { value: new Date().toISOString() },
  });
}

/**
 * Seeds initial demo products for Company A and Company B if none exist,
 * allowing instant end-to-end scanning and unified multi-company billing tests.
 */
export async function seedSampleProducts(prisma: PrismaClient): Promise<void> {
  const initKey = 'sample_products_initialized';
  const existingInit = await prisma.appMetadata.findUnique({
    where: { key: initKey },
  });
  if (existingInit) {
    return;
  }

  const prodCount = await prisma.product.count();
  if (prodCount > 0) {
    await prisma.appMetadata.upsert({
      where: { key: initKey },
      create: { key: initKey, value: new Date().toISOString() },
      update: { value: new Date().toISOString() },
    });
    return;
  }

  const compA = await prisma.company.findUnique({ where: { code: 'COMPANY_A' } });
  const compB = await prisma.company.findUnique({ where: { code: 'COMPANY_B' } });
  if (!compA || !compB) return;

  // 1. Company A: Gold Ring
  const catGoldA = await prisma.category.findFirst({
    where: { companyId: compA.id, name: 'Gold / Silver Jewellery' },
    include: { fields: true },
  });
  if (catGoldA) {
    const ring = await prisma.product.create({
      data: {
        companyId: compA.id,
        categoryId: catGoldA.id,
        name: '22K Gold Bridal Ring',
        barcode: 'AGJ000001',
        stockQuantity: 15,
      },
    });
    for (const f of catGoldA.fields) {
      if (f.fieldKey === 'purity') {
        await prisma.productFieldValue.create({
          data: { productId: ring.id, categoryFieldId: f.id, valueText: '22K (916)' },
        });
      } else if (f.fieldKey === 'weight') {
        await prisma.productFieldValue.create({
          data: { productId: ring.id, categoryFieldId: f.id, valueNumber: 4.5 },
        });
      } else if (f.fieldKey === 'makingChargesPerGram') {
        await prisma.productFieldValue.create({
          data: { productId: ring.id, categoryFieldId: f.id, valueNumber: 500 },
        });
      }
    }
  }

  // 2. Company A: German Silver Bowl
  const catGSA = await prisma.category.findFirst({
    where: { companyId: compA.id, name: 'German Silver / German Metal' },
    include: { fields: true },
  });
  if (catGSA) {
    const bowl = await prisma.product.create({
      data: {
        companyId: compA.id,
        categoryId: catGSA.id,
        name: 'German Silver Antique Bowl',
        barcode: 'AGS000002',
        stockQuantity: 30,
      },
    });
    for (const f of catGSA.fields) {
      if (f.fieldKey === 'sellingPrice') {
        await prisma.productFieldValue.create({
          data: { productId: bowl.id, categoryFieldId: f.id, valueNumber: 1450 },
        });
      } else if (f.fieldKey === 'colour') {
        await prisma.productFieldValue.create({
          data: { productId: bowl.id, categoryFieldId: f.id, valueText: 'Antique Gold' },
        });
      }
    }
  }

  // 3. Company B: Pure Silk Fabric
  const catFabB = await prisma.category.findFirst({
    where: { companyId: compB.id, name: 'Home Décor — Meter Based' },
    include: { fields: true },
  });
  if (catFabB) {
    const silk = await prisma.product.create({
      data: {
        companyId: compB.id,
        categoryId: catFabB.id,
        name: 'Royal Silk Brocade Fabric',
        barcode: 'BHD000001',
        stockQuantity: 50,
      },
    });
    for (const f of catFabB.fields) {
      if (f.fieldKey === 'sellingPricePerMeter') {
        await prisma.productFieldValue.create({
          data: { productId: silk.id, categoryFieldId: f.id, valueNumber: 850 },
        });
      } else if (f.fieldKey === 'ratePerMeter') {
        await prisma.productFieldValue.create({
          data: { productId: silk.id, categoryFieldId: f.id, valueNumber: 750 },
        });
      } else if (f.fieldKey === 'material') {
        await prisma.productFieldValue.create({
          data: { productId: silk.id, categoryFieldId: f.id, valueText: 'Pure Silk' },
        });
      }
    }
  }

  // 4. Company B: Kundan Choker Necklace
  const catNeckB = await prisma.category.findFirst({
    where: { companyId: compB.id, name: 'Artificial / Imitation Jewellery' },
    include: { fields: true },
  });
  if (catNeckB) {
    const neck = await prisma.product.create({
      data: {
        companyId: compB.id,
        categoryId: catNeckB.id,
        name: 'Kundan Choker Necklace',
        barcode: 'BAI000002',
        stockQuantity: 20,
      },
    });
    for (const f of catNeckB.fields) {
      if (f.fieldKey === 'sellingPrice') {
        await prisma.productFieldValue.create({
          data: { productId: neck.id, categoryFieldId: f.id, valueNumber: 2600 },
        });
      } else if (f.fieldKey === 'colour') {
        await prisma.productFieldValue.create({
          data: { productId: neck.id, categoryFieldId: f.id, valueText: 'Gold' },
        });
      }
    }
  }

  // 5. Company A: ₹50 Demo Item (German Silver Coin)
  const existingCoin = await prisma.product.findUnique({ where: { barcode: 'AGS000050' } });
  if (!existingCoin && catGSA) {
    const coin = await prisma.product.create({
      data: {
        companyId: compA.id,
        categoryId: catGSA.id,
        name: 'German Silver Coin (₹50 Test Item)',
        barcode: 'AGS000050',
        stockQuantity: 100,
      },
    });
    for (const f of catGSA.fields) {
      if (f.fieldKey === 'sellingPrice') {
        await prisma.productFieldValue.create({
          data: { productId: coin.id, categoryFieldId: f.id, valueNumber: 50 },
        });
      } else if (f.fieldKey === 'colour') {
        await prisma.productFieldValue.create({
          data: { productId: coin.id, categoryFieldId: f.id, valueText: 'Silver' },
        });
      }
    }
  }

  // 6. Company B: ₹50 Demo Item (Imitation Brooch Pin)
  const existingBrooch = await prisma.product.findUnique({ where: { barcode: 'BAI000050' } });
  if (!existingBrooch && catNeckB) {
    const brooch = await prisma.product.create({
      data: {
        companyId: compB.id,
        categoryId: catNeckB.id,
        name: 'Floral Brooch Pin (₹50 Test Item)',
        barcode: 'BAI000050',
        stockQuantity: 100,
      },
    });
    for (const f of catNeckB.fields) {
      if (f.fieldKey === 'sellingPrice') {
        await prisma.productFieldValue.create({
          data: { productId: brooch.id, categoryFieldId: f.id, valueNumber: 50 },
        });
      } else if (f.fieldKey === 'colour') {
        await prisma.productFieldValue.create({
          data: { productId: brooch.id, categoryFieldId: f.id, valueText: 'Gold' },
        });
      }
    }
  }
}

/**
 * Idempotently seeds sample vendors for Company A & Company B if table is empty.
 */
export async function seedSampleVendors(prisma: PrismaClient): Promise<void> {
  const initKey = 'sample_vendors_initialized';
  const existingInit = await prisma.appMetadata.findUnique({
    where: { key: initKey },
  });
  if (existingInit) {
    return;
  }

  const vendorCount = await prisma.vendor.count();
  if (vendorCount > 0) {
    await prisma.appMetadata.upsert({
      where: { key: initKey },
      create: { key: initKey, value: new Date().toISOString() },
      update: { value: new Date().toISOString() },
    });
    return;
  }

  const compA = await prisma.company.findUnique({ where: { code: 'COMPANY_A' } });
  const compB = await prisma.company.findUnique({ where: { code: 'COMPANY_B' } });
  if (compA) {
    await prisma.vendor.create({
      data: {
        companyId: compA.id,
        name: 'Surat Bullion & Gems Traders',
        phoneNumber: '+91 98251 44520',
      },
    });
    await prisma.vendor.create({
      data: {
        companyId: compA.id,
        name: 'Zaveri Jewellers Wholesale',
        phoneNumber: '+91 98200 12345',
      },
    });
  }
  if (compB) {
    await prisma.vendor.create({
      data: {
        companyId: compB.id,
        name: 'Jaipur Heritage Crafts & Brocade',
        phoneNumber: '+91 94140 88710',
      },
    });
  }

  await prisma.appMetadata.upsert({
    where: { key: initKey },
    create: { key: initKey, value: new Date().toISOString() },
    update: { value: new Date().toISOString() },
  });
}

/**
 * Runs full idempotent seed for Companies, Admin Users, Client Category Models, Baseline Metal Rates, and Sample Products.
 */
export async function seedAll(prisma: PrismaClient): Promise<{
  companies: SeededCompanyResult[];
  admins: SeededAdminResult[];
}> {
  const companies = await seedFixedCompanies(prisma);
  const admins = await seedDevelopmentAdmins(prisma);
  await seedClientCategoryModels(prisma);
  await seedInitialMetalRates(prisma);
  await seedSampleProducts(prisma);
  await seedSampleVendors(prisma);
  return { companies, admins };
}


