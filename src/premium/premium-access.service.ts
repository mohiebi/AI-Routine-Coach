import { Injectable, NotFoundException } from '@nestjs/common';
import { PremiumEntitlementStatus, PremiumSource } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { addDays } from '../payments/decimal-money';

export type LoyaltyStatus = 'active' | 'returning' | 'none';

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

  /** Creates a 30-day free trial. Returns null if the user already has any entitlement. */
  async activateTrial(userId: string) {
    const existing = await this.prisma.premiumEntitlement.findFirst({
      where: { userId, deletedAt: null },
    });
    if (existing) return null;

    const now = new Date();
    return this.prisma.premiumEntitlement.create({
      data: {
        userId,
        source: PremiumSource.TRIAL,
        startsAt: now,
        expiresAt: addDays(now, 30),
        status: PremiumEntitlementStatus.ACTIVE,
      },
    });
  }

  getTrialEntitlement(userId: string) {
    const now = new Date();
    return this.prisma.premiumEntitlement.findFirst({
      where: {
        userId,
        source: PremiumSource.TRIAL,
        status: PremiumEntitlementStatus.ACTIVE,
        expiresAt: { gt: now },
        deletedAt: null,
      },
    });
  }

  /** Returns the most recent paid (non-trial) entitlement, active or expired. */
  getMostRecentPaidEntitlement(userId: string) {
    return this.prisma.premiumEntitlement.findFirst({
      where: {
        userId,
        source: { not: PremiumSource.TRIAL },
        deletedAt: null,
      },
      orderBy: { expiresAt: 'desc' },
    });
  }

  /**
   * Returns loyalty status for determining renewal discounts:
   * - 'active'    → has a current paid membership (30% off renewal)
   * - 'returning' → paid membership expired < 7 days ago (30% off win-back)
   * - 'none'      → no paid history, or lapsed > 7 days
   */
  async getLoyaltyStatus(userId: string): Promise<LoyaltyStatus> {
    const paid = await this.getMostRecentPaidEntitlement(userId);
    if (!paid) return 'none';

    const now = new Date();
    if (paid.status === PremiumEntitlementStatus.ACTIVE && paid.expiresAt > now) {
      return 'active';
    }
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    if (paid.expiresAt >= sevenDaysAgo) return 'returning';
    return 'none';
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
