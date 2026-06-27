import { Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CouponGeneratorService {
  constructor(private readonly prisma: PrismaService) {}

  /** Returns an existing unused 50%-off trial-ending coupon for the user,
   *  or creates a new one. Safe to call multiple times — idempotent.
   *  Uses catch-on-conflict to handle concurrent creation attempts. */
  async getOrCreateTrialEndingCoupon(userId: string) {
    return this.getOrCreate(userId, 'TRIAL50', 50);
  }

  /** Returns an existing unused 30%-off loyalty coupon for the user,
   *  or creates a new one. Safe to call multiple times — idempotent.
   *  Uses catch-on-conflict to handle concurrent creation attempts. */
  async getOrCreateLoyaltyCoupon(userId: string) {
    return this.getOrCreate(userId, 'LOYAL30', 30);
  }

  private async getOrCreate(userId: string, prefix: string, discountPercent: number) {
    const userPrefix = this.userPrefix(userId);
    const find = () =>
      this.prisma.coupon.findFirst({
        where: {
          code: { startsWith: `${prefix}-${userPrefix}` },
          isActive: true,
          usedCount: 0,
          deletedAt: null,
        },
      });

    const existing = await find();
    if (existing) return existing;

    try {
      return await this.prisma.coupon.create({
        data: {
          code: `${prefix}-${userPrefix}-${this.randomSuffix()}`,
          discountPercent,
          maxUses: 1,
          isActive: true,
        },
      });
    } catch (e) {
      // P2002 = unique constraint violation — concurrent request created it first
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const retried = await find();
        if (retried) return retried;
      }
      throw e;
    }
  }

  private userPrefix(userId: string) {
    return userId.replace(/-/g, '').slice(0, 8).toUpperCase();
  }

  private randomSuffix() {
    return randomBytes(3).toString('hex').toUpperCase();
  }
}
