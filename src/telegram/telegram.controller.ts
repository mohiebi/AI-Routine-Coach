import { Body, Controller, Headers, HttpCode, Post } from '@nestjs/common';
import { ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import { TelegramService } from './telegram.service';

@ApiTags('telegram')
@Controller('telegram')
export class TelegramController {
  constructor(private readonly telegramService: TelegramService) {}

  @Post('webhook')
  @HttpCode(200)
  @ApiExcludeEndpoint()
  handleWebhook(
    @Body() update: unknown,
    @Headers('x-telegram-bot-api-secret-token') secretToken?: string,
  ) {
    return this.telegramService.handleWebhookUpdate(update, secretToken);
  }
}
