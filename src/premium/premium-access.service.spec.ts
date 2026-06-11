import { PremiumEntitlementStatus, PremiumSource } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PremiumAccessService } from './premium-access.service';

describe('PremiumAccessService', () => {
  it('detects active premium from entitlements', async () => {
    const prisma = {
      premiumEntitlement: {
        findFirst: jest.fn(async () => ({ id: 'entitlement-1' })),
      },
    } as unknown as PrismaService;
    const service = new PremiumAccessService(prisma);

    await expect(service.hasActivePremium('user-1')).resolves.toBe(true);
  });

  it('extends existing active premium instead of creating overlap', async () => {
    const active = {
      id: 'entitlement-1',
      startsAt: new Date('2026-06-01T00:00:00.000Z'),
      expiresAt: new Date('2026-07-01T00:00:00.000Z'),
    };
    const prisma = {
      checkoutSession: {
        findUnique: jest.fn(async () => ({
          id: 'checkout-1',
          userId: 'user-1',
          deletedAt: null,
          plan: { durationDays: 30 },
        })),
      },
      premiumEntitlement: {
        findFirst: jest.fn(async () => active),
        update: jest.fn(async ({ data }) => ({
          ...active,
          ...data,
          status: PremiumEntitlementStatus.ACTIVE,
        })),
        create: jest.fn(),
      },
    } as unknown as PrismaService;
    const service = new PremiumAccessService(prisma);

    const entitlement = await service.activateFromCheckout(
      'checkout-1',
      PremiumSource.CRYPTO_PAYMENT,
    );

    expect((prisma as any).premiumEntitlement.update).toHaveBeenCalled();
    expect((prisma as any).premiumEntitlement.create).not.toHaveBeenCalled();
    expect(entitlement.expiresAt.getTime()).toBeGreaterThan(
      active.expiresAt.getTime(),
    );
  });
});
