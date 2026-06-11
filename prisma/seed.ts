import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  await prisma.subscriptionPlan.upsert({
    where: { code: 'PREMIUM_MONTHLY' },
    create: {
      code: 'PREMIUM_MONTHLY',
      name: 'Premium Monthly',
      priceUsd: '10.00',
      durationDays: 30,
      isActive: true,
    },
    update: {
      name: 'Premium Monthly',
      priceUsd: '10.00',
      durationDays: 30,
      isActive: true,
      deletedAt: null,
    },
  });

  await prisma.subscriptionPlan.upsert({
    where: { code: 'PREMIUM_YEARLY' },
    create: {
      code: 'PREMIUM_YEARLY',
      name: 'Premium Yearly',
      priceUsd: '99.00',
      durationDays: 365,
      isActive: true,
    },
    update: {
      name: 'Premium Yearly',
      priceUsd: '99.00',
      durationDays: 365,
      isActive: true,
      deletedAt: null,
    },
  });
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
