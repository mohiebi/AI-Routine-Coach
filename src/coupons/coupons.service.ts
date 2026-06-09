import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { SubscriptionPlan, SubscriptionStatus } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { AiFeatureGateService } from '../ai/ai-feature-gate.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CouponsService implements OnModuleInit {
  private readonly logger = new Logger(CouponsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly featureGate: AiFeatureGateService,
  ) {}

  /**
   * On startup, ensure the free coupon from COUPON_CODE_FREE env var exists.
   * Set COUPON_CODE_FREE=YOURCODE in .env to create an unlimited 100% coupon.
   */
  async onModuleInit() {
    const code = this.configService.get<string>('COUPON_CODE_FREE');
    if (!code) return;

    const normalized = code.trim().toUpperCase();
    await this.prisma.coupon.upsert({
      where: { code: normalized },
      create: { code: normalized, discountPercent: 100, maxUses: 9999 },
      update: { isActive: true, maxUses: 9999 },
    });
    this.logger.log(`Free-tier coupon ready: ${normalized}`);
  }

  /**
   * Redeem a coupon code for a user. Activates Premium on success.
   */
  async redeemCoupon(userId: string, rawCode: string): Promise<void> {
    const code = rawCode.trim().toUpperCase();

    const coupon = await this.prisma.coupon.findUnique({ where: { code } });

    if (!coupon || !coupon.isActive) {
      throw new BadRequestException('Invalid coupon code.');
    }
    if (coupon.expiresAt && coupon.expiresAt < new Date()) {
      throw new BadRequestException('This coupon has expired.');
    }
    if (coupon.usedCount >= coupon.maxUses) {
      throw new BadRequestException('This coupon has been fully redeemed.');
    }

    const existing = await this.prisma.couponRedemption.findUnique({
      where: { couponId_userId: { couponId: coupon.id, userId } },
    });
    if (existing) {
      throw new BadRequestException('You have already used this coupon.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.couponRedemption.create({
        data: { couponId: coupon.id, userId },
      });
      await tx.coupon.update({
        where: { id: coupon.id },
        data: { usedCount: { increment: 1 } },
      });
    });

    await this.featureGate.setSubscription(
      userId,
      SubscriptionPlan.PREMIUM,
      SubscriptionStatus.ACTIVE,
    );
  }
}
