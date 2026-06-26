import { Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CouponGeneratorService {
  constructor(private readonly prisma: PrismaService) {}

  /** Returns an existing unused 50%-off trial-ending coupon for the user,
   *  or creates a new one. Safe to call multiple times — idempotent. */
  async getOrCreateTrialEndingCoupon(userId: string) {
    const prefix = this.userPrefix(userId);
    const existing = await this.prisma.coupon.findFirst({
      where: {
        code: { startsWith: `TRIAL50-${prefix}` },
        isActive: true,
        usedCount: 0,
        deletedAt: null,
      },
    });
    if (existing) return existing;

    return this.prisma.coupon.create({
      data: {
        code: `TRIAL50-${prefix}-${this.randomSuffix()}`,
        discountPercent: 50,
        maxUses: 1,
        isActive: true,
      },
    });
  }

  /** Returns an existing unused 30%-off loyalty coupon for the user,
   *  or creates a new one. Safe to call multiple times — idempotent. */
  async getOrCreateLoyaltyCoupon(userId: string) {
    const prefix = this.userPrefix(userId);
    const existing = await this.prisma.coupon.findFirst({
      where: {
        code: { startsWith: `LOYAL30-${prefix}` },
        isActive: true,
        usedCount: 0,
        deletedAt: null,
      },
    });
    if (existing) return existing;

    return this.prisma.coupon.create({
      data: {
        code: `LOYAL30-${prefix}-${this.randomSuffix()}`,
        discountPercent: 30,
        maxUses: 1,
        isActive: true,
      },
    });
  }

  private userPrefix(userId: string) {
    return userId.replace(/-/g, '').slice(0, 8).toUpperCase();
  }

  private randomSuffix() {
    return randomBytes(3).toString('hex').toUpperCase();
  }
}
