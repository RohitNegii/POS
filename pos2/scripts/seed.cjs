const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');
const path = require('path');

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
 * Passwords are encrypted using scrypt.
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
 * 5 pre-built category blueprints and dynamic attributes.
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

const SAMPLE_BUYERS = [
  {
    companyCode: 'COMPANY_A',
    name: 'Surat Bullion & Gems Traders',
    phoneNumber: '+91 98251 44520',
    email: 'surat.bullion@example.com',
    address: 'Ring Road, Surat, Gujarat',
    notes: 'Premium gold & diamond jewellery buyer',
  },
  {
    companyCode: 'COMPANY_A',
    name: 'Zaveri Jewellers Wholesale',
    phoneNumber: '+91 98200 12345',
    email: 'zaveri.wholesale@example.com',
    address: 'Zaveri Bazaar, Mumbai, Maharashtra',
    notes: 'Silver & ornament wholesale buyer',
  },
  {
    companyCode: 'COMPANY_B',
    name: 'Jaipur Heritage Crafts & Brocade',
    phoneNumber: '+91 94140 88710',
    email: 'jaipur.heritage@example.com',
    address: 'Johari Bazaar, Jaipur, Rajasthan',
    notes: 'Handicraft & imitation ornament buyer',
  },
  {
    companyCode: 'COMPANY_B',
    name: 'Delhi Décor Emporium',
    phoneNumber: '+91 98110 54321',
    email: 'delhi.decor@example.com',
    address: 'Connaught Place, New Delhi',
    notes: 'Home décor fabrics & unit items buyer',
  },
];

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, 64);
  return `scrypt:${salt}:${derivedKey.toString('hex')}`;
}

async function seed(prismaClient) {
  let prisma = prismaClient;
  let shouldDisconnect = false;

  if (!prisma) {
    let datasourceUrl = process.env.DATABASE_URL;

    if (process.argv.includes('--user-data')) {
      const appData = process.env.APPDATA || (process.platform === 'darwin' ? path.join(process.env.HOME, 'Library', 'Application Support') : path.join(process.env.HOME, '.config'));
      const dbPath = path.join(appData, 'pos2-retail-desktop', 'app-data', 'pos2-system.sqlite');
      datasourceUrl = `file:${dbPath.replace(/\\/g, '/')}`;
      console.log(`[SEED] Targeting Electron userData database: ${datasourceUrl}`);
    }

    prisma = new PrismaClient(
      datasourceUrl ? { datasourceUrl } : undefined
    );
    shouldDisconnect = true;
  }

  try {
    console.log('[SEED] Starting POS 2 database seed...');

    // 1. Seed Companies
    for (const compData of FIXED_COMPANIES) {
      const existing = await prisma.company.findUnique({
        where: { code: compData.code },
      });

      if (!existing) {
        await prisma.company.create({
          data: {
            code: compData.code,
            name: compData.name,
          },
        });
        console.log(`[SEED] Created Company: ${compData.name} (${compData.code})`);
      }
    }

    // 2. Seed Admin Users & Cashier
    for (const adminDef of FIXED_ADMINS) {
      const company = await prisma.company.findUnique({
        where: { code: adminDef.companyCode },
      });

      if (!company) {
        throw new Error(`Company ${adminDef.companyCode} not found for admin seed.`);
      }

      const normalizedEmail = adminDef.email.toLowerCase().trim();
      const existingAdmin = await prisma.adminUser.findFirst({
        where: {
          companyId: company.id,
          email: normalizedEmail,
        },
      });

      if (!existingAdmin) {
        const passwordHash = hashPassword(adminDef.passwordPlain);
        await prisma.adminUser.create({
          data: {
            companyId: company.id,
            name: adminDef.name,
            email: normalizedEmail,
            passwordHash,
            role: adminDef.role,
            isActive: true,
          },
        });
        console.log(`[SEED] Created User: ${adminDef.name} (${normalizedEmail}) [${adminDef.role}]`);
      }
    }

    // 3. Seed 5 Category Models with Dynamic Fields
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
          console.log(`[SEED] Created Category for ${company.name}: ${model.name}`);
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

          if (!existingField) {
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

    // 4. Seed Sample Buyers
    for (const buyerDef of SAMPLE_BUYERS) {
      const company = await prisma.company.findUnique({
        where: { code: buyerDef.companyCode },
      });

      if (company) {
        const existingBuyer = await prisma.buyer.findFirst({
          where: {
            companyId: company.id,
            name: buyerDef.name,
          },
        });

        if (!existingBuyer) {
          await prisma.buyer.create({
            data: {
              companyId: company.id,
              name: buyerDef.name,
              phoneNumber: buyerDef.phoneNumber,
              email: buyerDef.email,
              address: buyerDef.address,
              notes: buyerDef.notes,
            },
          });
          console.log(`[SEED] Created Buyer for ${company.name}: ${buyerDef.name}`);
        }
      }
    }

    // 5. Seed Daily Metal Rates (Gold & Silver)
    const todayStr = new Date().toISOString().split('T')[0];
    for (const company of allCompanies) {
      const existingGold = await prisma.metalRate.findFirst({
        where: { companyId: company.id, metalType: 'GOLD', effectiveDate: todayStr },
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
        console.log(`[SEED] Seeded Gold rate for ${company.name}: ₹7250/g`);
      }

      const existingSilver = await prisma.metalRate.findFirst({
        where: { companyId: company.id, metalType: 'SILVER', effectiveDate: todayStr },
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
        console.log(`[SEED] Seeded Silver rate for ${company.name}: ₹95/g`);
      }
    }

    console.log('[SEED] Database seed completed successfully!');
    return { success: true };
  } finally {
    if (shouldDisconnect) {
      await prisma.$disconnect();
    }
  }
}

if (require.main === module) {
  seed()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[SEED ERROR]:', err);
      process.exit(1);
    });
}

module.exports = { seed, FIXED_COMPANIES, FIXED_ADMINS, CLIENT_CATEGORY_MODELS, SAMPLE_BUYERS };
