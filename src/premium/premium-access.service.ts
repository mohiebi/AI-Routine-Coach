import { Injectable, NotFoundException } from '@nestjs/common';
import { PremiumEntitlementStatus, PremiumSource } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { addDays } from '../payments/decimal-money';

@Injectable()
export class PremiumAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async hasActivePremium(userId: string): Promise<boolean> {
    const entitlement = await this.getActiveEntitlement(userId);
    return Boolean(entitlement);
  }

  getActiveEntitlement(userId: string) {
    const now = new Date();
    return this.prisma.premiumEntitlement.findFirst({
      where: {
        userId,
        status: PremiumEntitlementStatus.ACTIVE,
        startsAt: { lte: now },
        expiresAt: { gt: now },
        deletedAt: null,
      },
      orderBy: { expiresAt: 'desc' },
    });
  }

  async activateFromCheckout(checkoutSessionId: string, source: PremiumSource) {
    const checkout = await this.prisma.checkoutSession.findUnique({
      where: { id: checkoutSessionId },
      include: { plan: true },
    });
    if (!checkout || checkout.deletedAt) {
      throw new NotFoundException('Checkout session not found');
    }

    const now = new Date();
    const active = await this.getActiveEntitlement(checkout.userId);
    const startsAt = active?.startsAt ?? now;
    const base = active && active.expiresAt > now ? active.expiresAt : now;
    const expiresAt = addDays(base, checkout.plan.durationDays);

    if (active) {
      return this.prisma.premiumEntitlement.update({
        where: { id: active.id },
        data: {
          checkoutSessionId,
          source,
          sourceId: checkoutSessionId,
          startsAt,
          expiresAt,
        },
      });
    }

    return this.prisma.premiumEntitlement.create({
      data: {
        userId: checkout.userId,
        checkoutSessionId,
        source,
        sourceId: checkoutSessionId,
        startsAt,
        expiresAt,
        status: PremiumEntitlementStatus.ACTIVE,
      },
    });
  }

  async expireOldEntitlements() {
    return this.prisma.premiumEntitlement.updateMany({
      where: {
        status: PremiumEntitlementStatus.ACTIVE,
        expiresAt: { lte: new Date() },
      },
      data: { status: PremiumEntitlementStatus.EXPIRED },
    });
  }
}
