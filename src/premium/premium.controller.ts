import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PremiumAccessService } from './premium-access.service';

@ApiTags('premium')
@Controller('users/:userId/premium')
export class PremiumController {
  constructor(private readonly premiumAccessService: PremiumAccessService) {}

  @Get()
  async status(@Param('userId') userId: string) {
    const entitlement =
      await this.premiumAccessService.getActiveEntitlement(userId);
    return {
      active: Boolean(entitlement),
      entitlement,
    };
  }
}
