import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { AIFeature } from '@prisma/client';
import { PremiumAccessService } from '../premium/premium-access.service';
import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_LIMITS: Record<AIFeature, number> = {
  GOAL_REVIEW: 10,
  GOAL_BREAKDOWN: 10,
  ROUTINE_RECOMMENDATION: 10,
  ACCOUNTABILITY_COACH: 20,
  WEEKLY_COACH: 4,
  MONTHLY_COACH: 4,
  ROUTINE_OPTIMIZATION: 1,
  PROGRESS_INSIGHT: 10,
};

@Injectable()
export class AiFeatureGateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly premiumAccessService: PremiumAccessService,
  ) {}

  async isPremium(userId: string): Promise<boolean> {
    return this.premiumAccessService.hasActivePremium(userId);
  }

  async ensurePremium(userId: string) {
    const hasPremium = await this.premiumAccessService.hasActivePremium(userId);
    if (!hasPremium) {
      throw new ForbiddenException('This AI feature requires Premium access');
    }
  }

  async assertCanUse(userId: string, feature: AIFeature) {
    await this.ensurePremium(userId);

    if (feature === AIFeature.ROUTINE_OPTIMIZATION) {
      const latest = await this.prisma.aIRoutineOptimization.findFirst({
        where: { userId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
      });

      if (
        latest &&
        Date.now() - latest.createdAt.getTime() < 28 * 24 * 60 * 60 * 1000
      ) {
        throw new HttpException(
          'Routine optimization is available once every 4 weeks',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    const counter = await this.getOrCreateCounter(userId, feature);
    if (counter.usedCount >= counter.limit) {
      throw new HttpException(
        'Monthly AI usage limit reached',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return counter;
  }

  async incrementUsage(userId: string, feature: AIFeature) {
    const counter = await this.getOrCreateCounter(userId, feature);
    return this.prisma.aIUsageCounter.update({
      where: { id: counter.id },
      data: { usedCount: { increment: 1 } },
    });
  }

  private async getOrCreateCounter(userId: string, feature: AIFeature) {
    const monthKey = this.monthKey(new Date());
    const limit = DEFAULT_LIMITS[feature];

    return this.prisma.aIUsageCounter.upsert({
      where: { userId_feature_monthKey: { userId, feature, monthKey } },
      create: { userId, feature, monthKey, limit },
      update: { limit, deletedAt: null },
    });
  }

  private monthKey(date: Date) {
    const month = `${date.getUTCMonth() + 1}`.padStart(2, '0');
    return `${date.getUTCFullYear()}-${month}`;
  }
}
