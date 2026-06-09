import { Body, Controller, Post } from '@nestjs/common';
import { ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import { TelegramService } from './telegram.service';

@ApiTags('telegram')
@Controller('telegram')
export class TelegramController {
  constructor(private readonly telegramService: TelegramService) {}

  @Post('webhook')
  @ApiExcludeEndpoint()
  handleWebhook(@Body() update: unknown) {
    return this.telegramService.handleWebhookUpdate(update);
  }
}
