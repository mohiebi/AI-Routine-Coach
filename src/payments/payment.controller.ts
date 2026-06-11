import { Body, Controller, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CreateCryptoPaymentDto, SubmitTxHashDto } from './dto/payment.dto';
import { PaymentService } from './payment.service';

@ApiTags('payments')
@Controller('users/:userId')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post('checkouts/:checkoutId/payments')
  createPayment(
    @Param('userId') userId: string,
    @Param('checkoutId') checkoutId: string,
    @Body() dto: CreateCryptoPaymentDto,
  ) {
    return this.paymentService.createCryptoPayment(
      userId,
      checkoutId,
      dto.tokenSymbol,
      dto.network,
    );
  }

  @Post('payments/:paymentId/tx')
  submitTxHash(
    @Param('userId') userId: string,
    @Param('paymentId') paymentId: string,
    @Body() dto: SubmitTxHashDto,
  ) {
    return this.paymentService.submitTxHash(userId, paymentId, dto.txHash);
  }

  @Post('payments/:paymentId/verify')
  verify(
    @Param('userId') userId: string,
    @Param('paymentId') paymentId: string,
  ) {
    return this.paymentService.verifyPayment(userId, paymentId);
  }
}
