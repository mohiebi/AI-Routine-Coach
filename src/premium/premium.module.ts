import { Module } from '@nestjs/common';
import { PremiumController } from './premium.controller';
import { PremiumAccessService } from './premium-access.service';

@Module({
  controllers: [PremiumController],
  providers: [PremiumAccessService],
  exports: [PremiumAccessService],
})
export class PremiumModule {}
