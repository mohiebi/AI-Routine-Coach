import { Injectable } from '@nestjs/common';
import { WeekStartDay } from '@prisma/client';
import { Context, Markup, Telegraf } from 'telegraf';
import { ProgressService } from '../../progress/progress.service';
import { ReviewsService } from '../../reviews/reviews.service';
import { UsersService } from '../../users/users.service';
import { MAIN_KEYBOARD, MENU_ROW } from '../telegram.constants';
import { TelegramFormattersService } from '../telegram-formatters.service';
import { TelegramHelperService } from '../telegram-helper.service';

@Injectable()
export class SettingsHandler {
  constructor(
    private readonly usersService: UsersService,
    private readonly progressService: ProgressService,
    private readonly reviewsService: ReviewsService,
    private readonly helper: TelegramHelperService,
    private readonly formatters: TelegramFormattersService,
  ) {}

  register(bot: Telegraf<Context>): void {
    bot.hears('📊 Progress', (ctx) => this.handleProgress(ctx));
    bot.hears('📖 Review', (ctx) => this.handleReview(ctx));
    bot.hears('⚙️ Settings', (ctx) => this.handleSettings(ctx));
    bot.command('progress', (ctx) => this.handleProgress(ctx));
    bot.command('review', (ctx) => this.handleReview(ctx));
    bot.command('settings', (ctx) => this.handleSettings(ctx));

    bot.action(/^settings:(.+)$/, (ctx) => this.handleSettingsAction(ctx));
  }

  async handleProgress(ctx: Context): Promise<void> {
    const user = await this.helper.ensureTelegramUser(ctx);
    const dashboard = await this.progressService.dashboard(user.id);
    await ctx.reply(this.formatters.progress(dashboard), {
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🤖 AI Progress Insights', 'ai:insights')],
        MENU_ROW,
      ]),
    });
  }

  async handleReview(ctx: Context): Promise<void> {
    const user = await this.helper.ensureTelegramUser(ctx);
    const review =
      (await this.reviewsService.latestWeeklyReview(user.id)) ??
      (await this.reviewsService.generateWeeklyReview(user.id, new Date()));
    await ctx.reply(this.formatters.weeklyReview(review), {
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🤖 AI Weekly Coaching', `ai:weekly:${review.id}`)],
        MENU_ROW,
      ]),
    });
  }

  async handleSettings(ctx: Context): Promise<void> {
    const user = await this.helper.ensureTelegramUser(ctx);
    const pref = user.preference as Record<string, unknown>;
    await ctx.reply(this.formatters.settings(pref), {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback('Week: Mon', 'settings:weekStart:MONDAY'),
          Markup.button.callback('Week: Sat', 'settings:weekStart:SATURDAY'),
          Markup.button.callback('Week: Sun', 'settings:weekStart:SUNDAY'),
        ],
        [
          Markup.button.callback('Tehran', 'settings:tz:Asia/Tehran'),
          Markup.button.callback('UTC', 'settings:tz:UTC'),
        ],
        [
          Markup.button.callback('New York', 'settings:tz:America/New_York'),
          Markup.button.callback('London', 'settings:tz:Europe/London'),
        ],
        [
          Markup.button.callback('Dubai', 'settings:tz:Asia/Dubai'),
          Markup.button.callback('Istanbul', 'settings:tz:Europe/Istanbul'),
        ],
        MENU_ROW,
      ]),
    });
  }

  private async handleSettingsAction(ctx: Context): Promise<void> {
    await this.helper.ack(ctx);
    const user = await this.helper.ensureTelegramUser(ctx);
    const match = 'match' in ctx ? (ctx.match as RegExpExecArray) : undefined;
    if (!match) return;
    const [field, ...rest] = match[1].split(':');
    const value = rest.join(':');
    if (field === 'weekStart') {
      await this.usersService.updatePreferences(user.id, { weekStartDay: value as WeekStartDay });
      await ctx.reply(`Week start updated to ${value}.`, MAIN_KEYBOARD);
    } else if (field === 'tz') {
      await this.usersService.updatePreferences(user.id, { timezone: value });
      await ctx.reply(`Timezone updated to ${value}.`, MAIN_KEYBOARD);
    }
  }
}
