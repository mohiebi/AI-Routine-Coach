import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CheckoutStatus, PremiumSource, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { money } from '../payments/decimal-money';
import { PremiumAccessService } from '../premium/premium-access.service';

@Injectable()
export class CheckoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly premiumAccessService: PremiumAccessService,
  ) {}

  async listPlans() {
    const plans = await this.prisma.subscriptionPlan.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: { priceUsd: 'asc' },
    });

    return plans
      .map((plan) => ({
        ...plan,
        priceUsd: this.resolvePlanPriceUsd(plan.code, plan.priceUsd),
      }))
      .sort((a, b) => a.priceUsd.comparedTo(b.priceUsd));
  }

  async createCheckout(userId: string, planCode: string) {
    const plan = await this.prisma.subscriptionPlan.findFirst({
      where: { code: planCode, isActive: true, deletedAt: null },
    });
    if (!plan) {
      throw new NotFoundException('Subscription plan not found');
    }
    const priceUsd = this.resolvePlanPriceUsd(plan.code, plan.priceUsd);

    const minutes = this.configService.get<number>(
      'PAYMENT_CHECKOUT_EXPIRES_MINUTES',
      30,
    );
    const expiresAt = new Date(Date.now() + minutes * 60 * 1000);

    return this.prisma.checkoutSession.create({
      data: {
        userId,
        planId: plan.id,
        originalAmountUsd: priceUsd,
        finalAmountUsd: priceUsd,
        expiresAt,
      },
      include: { plan: true, coupon: true },
    });
  }

  async applyCoupon(checkoutId: string, couponCode: string, userId?: string) {
    const code = couponCode.trim().toUpperCase();
    const checkout = await this.getUsableCheckout(checkoutId, userId);
    if (checkout.couponId) {
      throw new BadRequestException('A coupon is already applied to this checkout');
    }

    const coupon = await this.prisma.coupon.findUnique({ where: { code } });
    if (!coupon || coupon.deletedAt || !coupon.isActive) {
      throw new BadRequestException('Invalid coupon code');
    }
    if (coupon.expiresAt && coupon.expiresAt <= new Date()) {
      throw new BadRequestException('This coupon has expired');
    }
    if (coupon.discountPercent.lessThan(0) || coupon.discountPercent.greaterThan(100)) {
      throw new BadRequestException('Coupon discount is invalid');
    }
    if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
      throw new BadRequestException('This coupon has been fully used');
    }

    const alreadyRedeemed = await this.prisma.checkoutSession.findFirst({
      where: {
        userId: checkout.userId,
        couponId: coupon.id,
        status: CheckoutStatus.COMPLETED,
        deletedAt: null,
      },
    });
    if (alreadyRedeemed) {
      throw new BadRequestException('You have already redeemed this coupon');
    }

    const discountAmount = money(
      checkout.originalAmountUsd.mul(coupon.discountPercent).div(100),
    );
    const finalAmount = money(Prisma.Decimal.max(0, checkout.originalAmountUsd.sub(discountAmount)));
    const status =
      finalAmount.equals(0) ? CheckoutStatus.COMPLETED : checkout.status;

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.coupon.update({
        where: { id: coupon.id },
        data: { usedCount: { increment: 1 } },
      });

      return tx.checkoutSession.update({
        where: { id: checkout.id },
        data: {
          couponId: coupon.id,
          discountAmountUsd: discountAmount,
          finalAmountUsd: finalAmount,
          status,
          completedAt: status === CheckoutStatus.COMPLETED ? new Date() : null,
        },
        include: { plan: true, coupon: true },
      });
    });

    if (updated.status === CheckoutStatus.COMPLETED) {
      await this.premiumAccessService.activateFromCheckout(
        updated.id,
        PremiumSource.COUPON_100,
      );
    }

    return updated;
  }

  async removeCoupon(checkoutId: string, userId?: string) {
    const checkout = await this.getUsableCheckout(checkoutId, userId);
    if (!checkout.couponId) {
      return checkout;
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.coupon.update({
        where: { id: checkout.couponId! },
        data: { usedCount: { decrement: 1 } },
      });

      return tx.checkoutSession.update({
        where: { id: checkout.id },
        data: {
          couponId: null,
          discountAmountUsd: 0,
          finalAmountUsd: checkout.originalAmountUsd,
        },
        include: { plan: true, coupon: true },
      });
    });
  }

  async cancelCheckout(checkoutId: string, userId?: string) {
    const checkout = await this.getUsableCheckout(checkoutId, userId);
    return this.prisma.checkoutSession.update({
      where: { id: checkout.id },
      data: { status: CheckoutStatus.CANCELLED },
      include: { plan: true, coupon: true },
    });
  }

  getCheckoutSummary(checkoutId: string, userId?: string) {
    return this.prisma.checkoutSession.findUnique({
      where: { id: checkoutId },
      include: { plan: true, coupon: true, cryptoPayments: true },
    }).then((checkout) => {
      if (checkout && userId && checkout.userId !== userId) {
        throw new NotFoundException('Checkout session not found');
      }
      return checkout;
    });
  }

  async getUsableCheckout(checkoutId: string, userId?: string) {
    const checkout = await this.prisma.checkoutSession.findUnique({
      where: { id: checkoutId },
      include: { plan: true, coupon: true },
    });
    if (!checkout || checkout.deletedAt || (userId && checkout.userId !== userId)) {
      throw new NotFoundException('Checkout session not found');
    }
    if (checkout.status === CheckoutStatus.CANCELLED) {
      throw new BadRequestException('Checkout has been cancelled');
    }
    if (checkout.status === CheckoutStatus.COMPLETED) {
      throw new BadRequestException('Checkout is already completed');
    }
    if (checkout.expiresAt <= new Date()) {
      await this.prisma.checkoutSession.update({
        where: { id: checkout.id },
        data: { status: CheckoutStatus.EXPIRED },
      });
      throw new BadRequestException('Checkout has expired');
    }
    return checkout;
  }

  private resolvePlanPriceUsd(planCode: string, fallback: Prisma.Decimal) {
    const envNameByPlan: Record<string, string> = {
      PREMIUM_MONTHLY: 'PREMIUM_MONTHLY_PRICE_USD',
      PREMIUM_YEARLY: 'PREMIUM_YEARLY_PRICE_USD',
    };
    const envName = envNameByPlan[planCode];
    if (!envName) {
      return fallback;
    }

    const raw = this.configService.get<string | number>(envName);
    if (raw === undefined || raw === null || raw === '') {
      return fallback;
    }

    return money(raw);
  }
}
