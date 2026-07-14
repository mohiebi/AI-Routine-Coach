import { Injectable } from '@nestjs/common';
import { Context } from 'telegraf';
import { UsersService } from '../users/users.service';

@Injectable()
export class TelegramHelperService {
  constructor(private readonly usersService: UsersService) {}

  async ensureTelegramUser(ctx: Context) {
    if (!ctx.from) throw new Error('Telegram user context is missing');
    return this.usersService.registerTelegramUser({
      telegramId: ctx.from.id,
      username: ctx.from.username,
      firstName: ctx.from.first_name,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC',
    });
  }

  async ack(ctx: Context): Promise<void> {
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery();
    }
  }

  matchId(ctx: Context): string | undefined {
    return ('match' in ctx ? (ctx.match as RegExpExecArray) : undefined)?.[1];
  }

  async typing(ctx: Context): Promise<void> {
    if (ctx.chat) {
      await ctx.telegram.sendChatAction(ctx.chat.id, 'typing').catch(() => void 0);
    }
  }

  isValidDate(text: string): boolean {
    return /^\d{4}-\d{2}-\d{2}$/.test(text) && !isNaN(Date.parse(text));
  }

  errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Something went wrong.';
  }
}
