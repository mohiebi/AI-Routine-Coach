import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class CreateCheckoutDto {
  @ApiProperty({ enum: ['PREMIUM_MONTHLY', 'PREMIUM_YEARLY'] })
  @IsString()
  planCode!: string;
}

export class ApplyCouponDto {
  @ApiProperty()
  @IsString()
  couponCode!: string;
}
