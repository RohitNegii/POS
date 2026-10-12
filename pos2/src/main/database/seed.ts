import { PrismaClient } from '@prisma/client';
import * as path from 'path';

export async function seedAll(prisma: PrismaClient): Promise<void> {
  try {
    const seedScriptPath = path.join(__dirname, '../../../scripts/seed.cjs');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { seed } = require(seedScriptPath);
    await seed(prisma);
  } catch (err) {
    console.error('[SEED] Failed to execute database seed:', err);
    throw err;
  }
}
