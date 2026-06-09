import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { CouponsService } from './coupons.service';

@Module({
  imports: [AiModule],
  providers: [CouponsService],
  exports: [CouponsService],
})
export class CouponsModule {}
