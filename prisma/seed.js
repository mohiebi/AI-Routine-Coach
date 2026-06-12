const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

function planPrice(envName, fallback) {
  const raw = process.env[envName]?.trim() || fallback;
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) {
    throw new Error(`${envName} must be a positive USD amount with up to 2 decimals`);
  }

  return Number(raw).toFixed(2);
}

async function main() {
  const monthlyPriceUsd = planPrice('PREMIUM_MONTHLY_PRICE_USD', '10.00');
  const yearlyPriceUsd = planPrice('PREMIUM_YEARLY_PRICE_USD', '99.00');

  await prisma.subscriptionPlan.upsert({
    where: { code: 'PREMIUM_MONTHLY' },
    create: {
      code: 'PREMIUM_MONTHLY',
      name: 'Premium Monthly',
      priceUsd: monthlyPriceUsd,
      durationDays: 30,
      isActive: true,
    },
    update: {
      name: 'Premium Monthly',
      priceUsd: monthlyPriceUsd,
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
      priceUsd: yearlyPriceUsd,
      durationDays: 365,
      isActive: true,
    },
    update: {
      name: 'Premium Yearly',
      priceUsd: yearlyPriceUsd,
      durationDays: 365,
      isActive: true,
      deletedAt: null,
    },
  });

  const freeCouponCode = process.env.COUPON_CODE_FREE?.trim();
  if (freeCouponCode) {
    await prisma.coupon.upsert({
      where: { code: freeCouponCode.toUpperCase() },
      create: {
        code: freeCouponCode.toUpperCase(),
        discountPercent: '100.00',
        maxUses: 100,
        isActive: true,
      },
      update: {
        discountPercent: '100.00',
        maxUses: 100,
        isActive: true,
        deletedAt: null,
      },
    });
  }
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
