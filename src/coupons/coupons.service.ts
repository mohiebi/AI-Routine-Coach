import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CouponsService {
  constructor(private readonly prisma: PrismaService) {}

  async createCoupon(input: {
    code: string;
    discountPercent: Prisma.Decimal.Value;
    maxUses?: number | null;
    expiresAt?: Date | null;
  }) {
    const discountPercent = new Prisma.Decimal(input.discountPercent);
    if (discountPercent.lessThan(0) || discountPercent.greaterThan(100)) {
      throw new BadRequestException('Discount percent must be between 0 and 100');
    }

    return this.prisma.coupon.create({
      data: {
        code: input.code.trim().toUpperCase(),
        discountPercent,
        maxUses: input.maxUses,
        expiresAt: input.expiresAt,
      },
    });
  }
}
