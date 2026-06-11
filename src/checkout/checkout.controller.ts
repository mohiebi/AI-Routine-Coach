import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ApplyCouponDto, CreateCheckoutDto } from './dto/checkout.dto';
import { CheckoutService } from './checkout.service';

@ApiTags('checkout')
@Controller('users/:userId')
export class CheckoutController {
  constructor(private readonly checkoutService: CheckoutService) {}

  @Get('premium/plans')
  plans() {
    return this.checkoutService.listPlans();
  }

  @Post('checkouts')
  create(@Param('userId') userId: string, @Body() dto: CreateCheckoutDto) {
    return this.checkoutService.createCheckout(userId, dto.planCode);
  }

  @Post('checkouts/:checkoutId/coupon')
  applyCoupon(
    @Param('userId') userId: string,
    @Param('checkoutId') checkoutId: string,
    @Body() dto: ApplyCouponDto,
  ) {
    return this.checkoutService.applyCoupon(checkoutId, dto.couponCode, userId);
  }

  @Delete('checkouts/:checkoutId/coupon')
  removeCoupon(
    @Param('userId') userId: string,
    @Param('checkoutId') checkoutId: string,
  ) {
    return this.checkoutService.removeCoupon(checkoutId, userId);
  }

  @Post('checkouts/:checkoutId/cancel')
  cancel(
    @Param('userId') userId: string,
    @Param('checkoutId') checkoutId: string,
  ) {
    return this.checkoutService.cancelCheckout(checkoutId, userId);
  }

  @Get('checkouts/:checkoutId')
  summary(
    @Param('userId') userId: string,
    @Param('checkoutId') checkoutId: string,
  ) {
    return this.checkoutService.getCheckoutSummary(checkoutId, userId);
  }
}
