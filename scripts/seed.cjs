const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

/**
 * Fixed system companies definition.
 */
const FIXED_COMPANIES = [
  {
    code: 'COMPANY_A',
    name: 'Company A',
  },
  {
    code: 'COMPANY_B',
    name: 'Company B',
  },
];

/**
 * Fixed development admin accounts.
 * Passwords must be hashed using scrypt before storing.
 */
const FIXED_ADMINS = [
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
];

/**
 * Client 5 pre-built category blueprints and dynamic attributes.
 */
const CLIENT_CATEGORY_MODELS = [
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
      {
        name: 'Selling Price',
        fieldKey: 'sellingPrice',
        fieldType: 'number',
        required: true,
        displayOrder: 4,
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
      {
        name: 'Selling Price',
        fieldKey: 'sellingPrice',
        fieldType: 'number',
        required: true,
        displayOrder: 4,
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
      {
        name: 'Selling Price',
        fieldKey: 'sellingPrice',
        fieldType: 'number',
        required: true,
        displayOrder: 6,
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
];

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, 64);


  return `scrypt:${salt}:${derivedKey.toString('hex')}`;
}

/**
 * Idempotently seeds the fixed system companies, admin accounts, and 5 prebuilt categories with fields.
 *
 * @param {PrismaClient} [prismaClient]
 */
async function seed(prismaClient) {
  let prisma = prismaClient;
  let shouldDisconnect = false;

  if (!prisma) {
    let datasourceUrl = process.env.DATABASE_URL;

    // Optional CLI flag --user-data to target Electron's userData SQLite database
    if (process.argv.includes('--user-data')) {
      const appData = process.env.APPDATA || (process.platform === 'darwin' ? path.join(process.env.HOME, 'Library', 'Application Support') : path.join(process.env.HOME, '.config'));
      const dbPath = path.join(appData, 'pos-retail-desktop', 'app-data', 'pos-system.sqlite');
      datasourceUrl = `file:${dbPath.replace(/\\/g, '/')}`;
      console.log(`[SEED] Targeting Electron userData database: ${datasourceUrl}`);
    }

    prisma = new PrismaClient(
      datasourceUrl ? { datasourceUrl } : undefined
    );
    shouldDisconnect = true;
  }

  const companyResults = [];
  const adminResults = [];

  try {
    // 1. Seed Fixed Companies (Idempotent)
    for (const compData of FIXED_COMPANIES) {
      const existing = await prisma.company.findUnique({
        where: { code: compData.code },
      });

      if (existing) {
        companyResults.push({
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
        companyResults.push({
          ...created,
          isNewlyCreated: true,
        });
      }
    }

    const companyCount = await prisma.company.count();
    if (companyCount !== 2) {
      throw new Error(`[SEED INVARIANT FAILED] Expected exactly 2 companies, found ${companyCount}`);
    }

    // 2. Seed Development Admin Accounts (Idempotent with hashed passwords)
    for (const adminDef of FIXED_ADMINS) {
      const company = await prisma.company.findUnique({
        where: { code: adminDef.companyCode },
      });

      if (!company) {
        throw new Error(`[SEED ERROR] Company ${adminDef.companyCode} not found for admin seed.`);
      }

      const normalizedEmail = adminDef.email.toLowerCase().trim();
      const existingAdmin = await prisma.adminUser.findFirst({
        where: {
          companyId: company.id,
          email: normalizedEmail,
        },
      });

      if (existingAdmin) {
        adminResults.push({
          ...existingAdmin,
          companyCode: adminDef.companyCode,
          isNewlyCreated: false,
        });
      } else {
        const passwordHash = hashPassword(adminDef.passwordPlain);
        const createdAdmin = await prisma.adminUser.create({
          data: {
            companyId: company.id,
            name: adminDef.name,
            email: normalizedEmail,
            passwordHash,
            role: adminDef.role,
            isActive: true,
          },
        });
        adminResults.push({
          ...createdAdmin,
          companyCode: adminDef.companyCode,
          isNewlyCreated: true,
        });
      }
    }

    // 3. Seed 5 Client Category Models and Dynamic Fields
    const allCompanies = await prisma.company.findMany();
    for (const company of allCompanies) {
      for (const model of CLIENT_CATEGORY_MODELS) {
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

    // 4. Seed Daily Metal Rates (Gold & Silver)
    const todayStr = new Date().toISOString().split('T')[0];
    for (const company of allCompanies) {
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

    // 5. Seed Sample Products if none exist
    const prodCount = await prisma.product.count();
    if (prodCount === 0) {
      const compA = await prisma.company.findUnique({ where: { code: 'COMPANY_A' } });
      const compB = await prisma.company.findUnique({ where: { code: 'COMPANY_B' } });
      if (compA && compB) {
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
    }

    // 6. Seed Sample Vendors if none exist
    const vendorCount = await prisma.vendor.count();
    if (vendorCount === 0) {
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
    }

    console.log(`\n==================================================`);
    console.log(`PRISMA SEED: COMPLETE (Companies, Admins, Billing User, Categories, Metal Rates, Demo Products)`);
    console.log(`==================================================`);
    console.log(`Companies in database (${companyCount}):`);
    for (const c of companyResults) {
      const status = c.isNewlyCreated ? '[CREATED NEW]' : '[PRESERVED EXISTING]';
      console.log(`  ${status} [${c.code}] "${c.name}" | ID: ${c.id}`);
    }
    console.log(`\nAdmin Users in database (${adminResults.length}):`);
    for (const a of adminResults) {
      const status = a.isNewlyCreated ? '[CREATED NEW]' : '[PRESERVED EXISTING]';
      console.log(`  ${status} [${a.companyCode}] ${a.name} (${a.email}) | Role: ${a.role}`);
    }
    console.log(`\nPre-built Categories seeded for both companies.`);
    console.log(`==================================================\n`);

    return { companies: companyResults, admins: adminResults };
  } finally {
    if (shouldDisconnect) {
      await prisma.$disconnect();
    }
  }
}

if (require.main === module) {
  seed()
    .then(() => {
      process.exit(0);
    })
    .catch((err) => {
      console.error('[PRISMA SEED ERROR]:', err);
      process.exit(1);
    });
}

module.exports = { seed, FIXED_COMPANIES, FIXED_ADMINS, CLIENT_CATEGORY_MODELS };
