/**
 * Dev CLI wrapper around the shared reference-data seed.
 *
 * The actual seeding lives in src/services/seed.ts because the packaged
 * Electron app runs the exact same code at startup — see electron/main.ts.
 * NO business data (families/beneficiaries/donations) is seeded here or
 * there; the only real records the system ships with are the 330 families in
 * resources/seed/families-330.xlsx, imported explicitly via the wizard.
 *
 * Run: npm run prisma:seed
 */
// Generated client lives outside node_modules — see schema.prisma's `output`.
import { PrismaClient } from '../generated/prisma';
import { seedCoreData } from '../src/services/seed';

const prisma = new PrismaClient();

seedCoreData(prisma)
  .then((summary) => {
    console.log(
      `Seeded ${summary.roles} roles, ${summary.permissions} permissions, ` +
        `${summary.lookups} lookup values, ${summary.assistanceTypes} assistance types, ` +
        `${summary.expenseCategories} expense categories.`,
    );
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
