import { Injectable } from '@nestjs/common';
import { Context, Markup, Telegraf } from 'telegraf';
import { CheckInsService } from '../../check-ins/check-ins.service';
import { ReviewsService } from '../../reviews/reviews.service';
import { CANCEL_ROW, MAIN_KEYBOARD } from '../telegram.constants';
import { TelegramConversationService } from '../telegram-conversation.service';
import { TelegramHelperService } from '../telegram-helper.service';
import { ConversationState } from '../telegram.types';

@Injectable()
export class CheckInHandler {
  constructor(
    private readonly checkInsService: CheckInsService,
    private readonly reviewsService: ReviewsService,
    private readonly helper: TelegramHelperService,
    private readonly conversations: TelegramConversationService,
  ) {}

  register(bot: Telegraf<Context>): void {
    bot.hears('📝 Check In', (ctx) => this.startCheckIn(ctx));

    bot.action('checkin:start', (ctx) => this.startCheckIn(ctx));
    bot.action('skip:obstacles', (ctx) => this.skipCheckInStep(ctx, 'obstacles'));
    bot.action('skip:wins', (ctx) => this.skipCheckInStep(ctx, 'wins'));
  }

  async startCheckIn(ctx: Context): Promise<void> {
    await this.helper.ack(ctx);
    const userId = ctx.from?.id;
    if (!userId) return;
    this.conversations.set(userId, { step: 'checkin:notes', data: {} });
    await ctx.reply(
      'Daily Check-In — Step 1 of 3\n\nHow did your day go?',
      Markup.inlineKeyboard([CANCEL_ROW]),
    );
  }

  private async skipCheckInStep(
    ctx: Context,
    field: 'obstacles' | 'wins',
  ): Promise<void> {
    const userId = ctx.from?.id;
    if (!userId) return;
    await this.helper.ack(ctx);
    const state = this.conversations.get(userId);
    if (!state) return;
    if (field === 'obstacles') {
      state.data.obstacles = '';
      state.step = 'checkin:wins';
      await ctx.reply(
        'Step 3 of 3 — What were your wins today?',
        Markup.inlineKeyboard([[Markup.button.callback('Skip', 'skip:wins')], CANCEL_ROW]),
      );
    } else {
      state.data.wins = '';
      await this.saveCheckIn(ctx, state);
    }
  }

  async saveCheckIn(ctx: Context, state: ConversationState): Promise<void> {
    const userId = ctx.from?.id;
    if (!userId) return;
    this.conversations.delete(userId);
    const user = await this.helper.ensureTelegramUser(ctx);
    await this.checkInsService.saveToday(user.id, {
      notes: state.data.notes,
      obstacles: state.data.obstacles,
      wins: state.data.wins,
    });
    await ctx.reply('Check-in saved! Keep it up.', MAIN_KEYBOARD);
  }

  async handleConversationStep(
    ctx: Context,
    state: ConversationState,
    text: string,
  ): Promise<void> {
    const userId = ctx.from!.id;

    switch (state.step) {
      case 'checkin:notes':
        state.data.notes = text;
        state.step = 'checkin:obstacles';
        await ctx.reply(
          'Check-In — Step 2 of 3\n\nWhat obstacles did you face?',
          Markup.inlineKeyboard([
            [Markup.button.callback('Skip', 'skip:obstacles')],
            CANCEL_ROW,
          ]),
        );
        break;

      case 'checkin:obstacles':
        state.data.obstacles = text;
        state.step = 'checkin:wins';
        await ctx.reply(
          'Check-In — Step 3 of 3\n\nWhat were your wins today?',
          Markup.inlineKeyboard([
            [Markup.button.callback('Skip', 'skip:wins')],
            CANCEL_ROW,
          ]),
        );
        break;

      case 'checkin:wins':
        state.data.wins = text;
        await this.saveCheckIn(ctx, state);
        break;

      case 'reflection:wentWell':
        state.data.wentWell = text;
        state.step = 'reflection:heldBack';
        await ctx.reply(
          'Reflection — Step 2 of 3\n\nWhat held you back?',
          Markup.inlineKeyboard([CANCEL_ROW]),
        );
        break;

      case 'reflection:heldBack':
        state.data.heldBack = text;
        state.step = 'reflection:nextFocus';
        await ctx.reply(
          'Reflection — Step 3 of 3\n\nWhat will you focus on next month?',
          Markup.inlineKeyboard([CANCEL_ROW]),
        );
        break;

      case 'reflection:nextFocus':
        state.data.nextFocus = text;
        this.conversations.delete(userId);
        await this.reviewsService.saveMonthlyReflection(
          state.data.reviewId,
          state.data.wentWell,
          state.data.heldBack,
          state.data.nextFocus,
        );
        await ctx.reply('Monthly reflection saved!', MAIN_KEYBOARD);
        break;
    }
  }
}
