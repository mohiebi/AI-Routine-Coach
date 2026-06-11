import { Module } from '@nestjs/common';
import { CheckoutModule } from '../checkout/checkout.module';
import { PremiumModule } from '../premium/premium.module';
import { CRYPTO_TRANSACTION_VERIFIER } from './crypto-transaction-verifier';
import { EtherscanV2VerifierService } from './etherscan-v2-verifier.service';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';

@Module({
  imports: [CheckoutModule, PremiumModule],
  controllers: [PaymentController],
  providers: [
    PaymentService,
    EtherscanV2VerifierService,
    {
      provide: CRYPTO_TRANSACTION_VERIFIER,
      useExisting: EtherscanV2VerifierService,
    },
  ],
  exports: [PaymentService],
})
export class PaymentModule {}
