import { Module } from '@nestjs/common';
import { CouponGeneratorService } from './coupon-generator.service';
import { CouponsService } from './coupons.service';

@Module({
  providers: [CouponsService, CouponGeneratorService],
  exports: [CouponsService, CouponGeneratorService],
})
export class CouponsModule {}
