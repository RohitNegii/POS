const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.startsWith('scrypt:')) return false;
  const parts = storedHash.split(':');
  if (parts.length !== 3) return false;
  const [, salt, hashHex] = parts;
  const derivedKey = crypto.scryptSync(password, salt, 64);
  const targetBuffer = Buffer.from(hashHex, 'hex');
  return crypto.timingSafeEqual(derivedKey, targetBuffer);
}

async function testPos2() {
  const prisma = new PrismaClient({
    datasourceUrl: process.env.DATABASE_URL || 'file:./prisma/dev.db',
  });

  try {
    console.log('--- 1. Testing Companies ---');
    const companies = await prisma.company.findMany({ orderBy: { code: 'asc' } });
    console.log(`Found ${companies.length} companies:`, companies.map((c) => `${c.name} (${c.code})`));
    if (companies.length !== 2) throw new Error('Expected 2 companies');

    console.log('\n--- 2. Testing Users & Authentication ---');
    const users = await prisma.adminUser.findMany({ include: { company: true } });
    console.log(`Found ${users.length} users:`);
    for (const u of users) {
      console.log(`- ${u.name} (${u.email}) [Role: ${u.role}, Company: ${u.company.name}]`);
      const pass = u.role === 'BILLING_USER' ? 'Billing@123' : 'Admin@123';
      const isValid = verifyPassword(pass, u.passwordHash);
      console.log(`  Password verification for "${pass}": ${isValid ? 'PASSED' : 'FAILED'}`);
      if (!isValid) throw new Error(`Password check failed for ${u.email}`);
    }

    console.log('\n--- 3. Testing 5 Pre-Built Categories ---');
    for (const comp of companies) {
      const cats = await prisma.category.findMany({
        where: { companyId: comp.id },
        include: { fields: true },
        orderBy: { name: 'asc' },
      });
      console.log(`${comp.name} has ${cats.length} categories:`);
      for (const cat of cats) {
        console.log(`  * ${cat.name} (${cat.fields.length} dynamic fields)`);
      }
      if (cats.length !== 5) throw new Error(`Expected 5 categories for ${comp.name}, got ${cats.length}`);
    }

    console.log('\n--- 4. Testing Seeded Buyers ---');
    const buyers = await prisma.buyer.findMany({ include: { company: true } });
    console.log(`Found ${buyers.length} buyers:`);
    for (const b of buyers) {
      console.log(`- ${b.name} (${b.phoneNumber}) [Company: ${b.company.name}]`);
    }
    if (buyers.length < 4) throw new Error('Expected at least 4 seeded buyers');

    console.log('\n--- 5. Testing Daily Metal Rates ---');
    const rates = await prisma.metalRate.findMany({ include: { company: true } });
    console.log(`Found ${rates.length} metal rate records:`);
    for (const r of rates) {
      console.log(`- [${r.company.code}] ${r.metalType} rate: ₹${r.ratePerGram}/g (Effective: ${r.effectiveDate})`);
    }
    if (rates.length < 4) throw new Error('Expected at least 4 metal rate records (Gold & Silver for both companies)');

    console.log('\n--- 6. Testing Buyer CRUD Operations ---');
    const testBuyer = await prisma.buyer.create({
      data: {
        companyId: companies[0].id,
        name: 'Test Buyer Corp',
        phoneNumber: '+91 99999 88888',
        email: 'test@corp.com',
        address: '123 Test Street',
        notes: 'Integration test record',
      },
    });
    console.log(`Created buyer: ${testBuyer.name} (ID: ${testBuyer.id})`);

    const updated = await prisma.buyer.update({
      where: { id: testBuyer.id },
      data: { name: 'Test Buyer Corp Updated' },
    });
    console.log(`Updated buyer: ${updated.name}`);

    await prisma.buyer.delete({ where: { id: testBuyer.id } });
    console.log(`Deleted buyer successfully!`);

    console.log('\n========================================');
    console.log('ALL POS 2 FOUNDATION TESTS PASSED 100%!');
    console.log('========================================');
  } finally {
    await prisma.$disconnect();
  }
}

testPos2().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
