import { Injectable } from '@nestjs/common';
import { ForbiddenException, HttpException, HttpStatus } from '@nestjs/common';
import { Context, Markup, Telegraf } from 'telegraf';
import { AiFeatureGateService } from '../../ai/ai-feature-gate.service';
import { AiService } from '../../ai/ai.service';
import { MENU_ROW } from '../telegram.constants';
import { TelegramConversationService } from '../telegram-conversation.service';
import { TelegramFormattersService } from '../telegram-formatters.service';
import { TelegramHelperService } from '../telegram-helper.service';
import { ConversationState } from '../telegram.types';

@Injectable()
export class AiHandler {
  constructor(
    private readonly aiService: AiService,
    private readonly aiGate: AiFeatureGateService,
    private readonly helper: TelegramHelperService,
    private readonly conversations: TelegramConversationService,
    private readonly formatters: TelegramFormattersService,
  ) {}

  register(bot: Telegraf<Context>): void {
    bot.action(/^ai:review:(.+)$/, (ctx) => this.handleAiGoalReview(ctx));
    bot.action(/^ai:breakdown:(.+)$/, (ctx) => this.handleAiBreakdown(ctx));
    bot.action(/^ai:routines:(.+)$/, (ctx) => this.handleAiRoutinesPrompt(ctx));
    bot.action(/^ai:rec:([^:]+):(\d+)$/, (ctx) => this.handleAiRoutineRec(ctx));
    bot.action(/^ai:accept_all:(.+)$/, (ctx) => this.handleAiAcceptAll(ctx));
    bot.action(/^ai:add:([^:]+):(\d+)$/, (ctx) => this.handleAiAddOne(ctx));
    bot.action(/^ai:accept_review:(.+)$/, (ctx) => this.handleAiAcceptReview(ctx));
    bot.action('ai:insights', (ctx) => this.handleAiInsights(ctx));
    bot.action(/^ai:weekly:(.+)$/, (ctx) => this.handleAiWeeklyCoach(ctx));
    bot.action('ai:optimize', (ctx) => this.handleAiOptimize(ctx));
    bot.action('ai:coach', (ctx) => this.handleAiCoachStart(ctx));
    bot.action('end_coach', (ctx) => this.handleAiCoachEnd(ctx));
  }

  private async handleAiGoalReview(ctx: Context): Promise<void> {
    const goalId = this.helper.matchId(ctx);
    if (!goalId) return;
    await this.helper.ack(ctx);
    const user = await this.helper.ensureTelegramUser(ctx);
    await this.helper.typing(ctx);
    await ctx.reply('Analyzing your goal...');
    try {
      const review = await this.aiService.reviewGoal(user.id, goalId);
      await ctx.reply(this.formatters.aiGoalReview(review), {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('Accept Suggested Title', `ai:accept_review:${review.id}`)],
          [Markup.button.callback('← Back to Goal', `goal:manage:${goalId}`)],
        ]),
      });
    } catch (e) {
      await this.handleAiError(ctx, e);
    }
  }

  private async handleAiAcceptReview(ctx: Context): Promise<void> {
    const reviewId = this.helper.matchId(ctx);
    if (!reviewId) return;
    await this.helper.ack(ctx);
    const user = await this.helper.ensureTelegramUser(ctx);
    try {
      const goal = await this.aiService.acceptGoalReview(user.id, reviewId);
      await ctx.reply(
        `Goal title updated to:\n"${goal.title}"`,
        Markup.inlineKeyboard([[Markup.button.callback('← Back to Goals', 'view_goals')]]),
      );
    } catch (e) {
      await this.handleAiError(ctx, e);
    }
  }

  private async handleAiBreakdown(ctx: Context): Promise<void> {
    const goalId = this.helper.matchId(ctx);
    if (!goalId) return;
    await this.helper.ack(ctx);
    const user = await this.helper.ensureTelegramUser(ctx);
    await this.helper.typing(ctx);
    await ctx.reply('Building your roadmap...');
    try {
      const breakdown = await this.aiService.breakDownGoal(user.id, goalId);
      await ctx.reply(this.formatters.aiBreakdown(breakdown), {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('← Back to Goal', `goal:manage:${goalId}`)],
        ]),
      });
    } catch (e) {
      await this.handleAiError(ctx, e);
    }
  }

  private async handleAiRoutinesPrompt(ctx: Context): Promise<void> {
    const goalId = this.helper.matchId(ctx);
    if (!goalId) return;
    await this.helper.ack(ctx);
    await ctx.reply(
      'How many hours per week can you dedicate to this goal?',
      Markup.inlineKeyboard([
        [
          Markup.button.callback('5 hrs', `ai:rec:${goalId}:5`),
          Markup.button.callback('10 hrs', `ai:rec:${goalId}:10`),
          Markup.button.callback('15 hrs', `ai:rec:${goalId}:15`),
          Markup.button.callback('20+ hrs', `ai:rec:${goalId}:20`),
        ],
        [Markup.button.callback('← Back to Goal', `goal:manage:${goalId}`)],
      ]),
    );
  }

  private async handleAiRoutineRec(ctx: Context): Promise<void> {
    await this.helper.ack(ctx);
    const match = 'match' in ctx ? (ctx.match as RegExpExecArray) : undefined;
    if (!match) return;
    const goalId = match[1];
    const hours = parseInt(match[2], 10);
    const user = await this.helper.ensureTelegramUser(ctx);
    await this.helper.typing(ctx);
    await ctx.reply('Generating personalized routine suggestions...');
    try {
      const batch = await this.aiService.recommendRoutines(user.id, goalId, {
        availableHoursPerWeek: hours,
      });
      const recs = batch.recommendations as unknown as Array<{
        title: string; description: string; frequency: string;
        targetCount: number; estimatedDuration: number; whyItMatters: string;
      }>;

      await ctx.reply(this.formatters.aiRoutineRecommendations(recs), {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('Add All Routines', `ai:accept_all:${batch.id}`)],
          ...recs.map((r, i) => [
            Markup.button.callback(`Add: ${r.title.slice(0, 30)}`, `ai:add:${batch.id}:${i}`),
          ]),
          MENU_ROW,
        ]),
      });
    } catch (e) {
      await this.handleAiError(ctx, e);
    }
  }

  private async handleAiAcceptAll(ctx: Context): Promise<void> {
    const batchId = this.helper.matchId(ctx);
    if (!batchId) return;
    await this.helper.ack(ctx);
    const user = await this.helper.ensureTelegramUser(ctx);
    try {
      const routines = await this.aiService.acceptAllRoutineRecommendations(user.id, batchId);
      await ctx.reply(
        `Added ${routines.length} routine${routines.length === 1 ? '' : 's'} to your plan!`,
        Markup.inlineKeyboard([
          [Markup.button.callback("See Today's Tasks", 'view_today')],
          MENU_ROW,
        ]),
      );
    } catch (e) {
      await this.handleAiError(ctx, e);
    }
  }

  private async handleAiAddOne(ctx: Context): Promise<void> {
    await this.helper.ack(ctx);
    const match = 'match' in ctx ? (ctx.match as RegExpExecArray) : undefined;
    if (!match) return;
    const batchId = match[1];
    const idx = parseInt(match[2], 10);
    const user = await this.helper.ensureTelegramUser(ctx);
    try {
      const routines = await this.aiService.acceptRoutineRecommendations(user.id, batchId, {
        recommendationIndexes: [idx],
      });
      const title = routines[0]?.title ?? 'Routine';
      await ctx.reply(
        `Added: "${title}"`,
        Markup.inlineKeyboard([[Markup.button.callback('← Back to Routines', 'view_routines')]]),
      );
    } catch (e) {
      await this.handleAiError(ctx, e);
    }
  }

  async handleAiInsights(ctx: Context): Promise<void> {
    await this.helper.ack(ctx);
    const user = await this.helper.ensureTelegramUser(ctx);
    await this.helper.typing(ctx);
    await ctx.reply('Generating insights from your data...');
    try {
      const insight = await this.aiService.progressInsights(user.id);
      await ctx.reply(this.formatters.aiProgressInsights(insight), {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([MENU_ROW]),
      });
    } catch (e) {
      await this.handleAiError(ctx, e);
    }
  }

  async handleAiWeeklyCoach(ctx: Context): Promise<void> {
    const reviewId = this.helper.matchId(ctx);
    if (!reviewId) return;
    await this.helper.ack(ctx);
    const user = await this.helper.ensureTelegramUser(ctx);
    await this.helper.typing(ctx);
    await ctx.reply('Generating your weekly coaching session...');
    try {
      const coaching = await this.aiService.analyzeWeeklyReview(user.id, reviewId);
      await ctx.reply(this.formatters.aiWeeklyCoach(coaching), {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([MENU_ROW]),
      });
    } catch (e) {
      await this.handleAiError(ctx, e);
    }
  }

  async handleAiOptimize(ctx: Context): Promise<void> {
    await this.helper.ack(ctx);
    const user = await this.helper.ensureTelegramUser(ctx);
    await this.helper.typing(ctx);
    await ctx.reply('Analyzing your routines for optimization...');
    try {
      const result = await this.aiService.optimizeRoutines(user.id);
      await ctx.reply(this.formatters.aiOptimize(result), {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('← Back to Routines', 'view_routines')],
          MENU_ROW,
        ]),
      });
    } catch (e) {
      await this.handleAiError(ctx, e);
    }
  }

  async handleAiCoachStart(ctx: Context): Promise<void> {
    const userId = ctx.from?.id;
    if (!userId) return;
    await this.helper.ack(ctx);
    const user = await this.helper.ensureTelegramUser(ctx);
    const isPremium = await this.aiGate.isPremium(user.id);
    if (!isPremium) {
      await ctx.reply(
        '🔒 *AI Accountability Coach* is a Premium feature.\n\nUpgrade to chat with your AI coach anytime, plus unlock AI Goal Review, Roadmaps, Insights and more.',
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([[Markup.button.callback('⭐ Upgrade to Premium', 'premium_info')]]),
        },
      );
      return;
    }
    this.conversations.set(userId, { step: 'ai_coach:active', data: {} });
    await ctx.reply(
      "Hi! I'm your AI Accountability Coach. What's on your mind?\n\nType your message and I'll respond. Tap *End Chat* when you're done.",
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([[Markup.button.callback('End Chat', 'end_coach')]]),
      },
    );
  }

  async handleAiCoachEnd(ctx: Context): Promise<void> {
    const userId = ctx.from?.id;
    if (userId) this.conversations.delete(userId);
    await this.helper.ack(ctx);
    await ctx.reply(
      'Coach session ended. Great work today!',
      Markup.inlineKeyboard([MENU_ROW]),
    );
  }

  async handleAiError(ctx: Context, error: unknown): Promise<void> {
    const status = (error as HttpException)?.getStatus?.();
    if (error instanceof ForbiddenException || status === HttpStatus.FORBIDDEN) {
      await ctx.reply(
        '🔒 *This AI feature requires Premium.*\n\nTap below to see plans and unlock the full AI toolkit.',
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([[Markup.button.callback('⭐ View Premium', 'premium_info')]]),
        },
      );
    } else if (status === HttpStatus.TOO_MANY_REQUESTS) {
      await ctx.reply(
        '⏳ *Monthly AI limit reached* for this feature.\n\nLimits reset on the 1st of each month.',
        { parse_mode: 'Markdown' },
      );
    } else {
      await ctx.reply('The AI service is temporarily unavailable. Please try again shortly.');
    }
  }

  async handleConversationStep(
    ctx: Context,
    state: ConversationState,
    text: string,
  ): Promise<void> {
    const user = await this.helper.ensureTelegramUser(ctx);

    if (state.step === 'ai_coach:active') {
      try {
        await this.helper.typing(ctx);
        const message = await this.aiService.coach(user.id, { message: text });
        await ctx.reply(message.content, {
          ...Markup.inlineKeyboard([[Markup.button.callback('End Chat', 'end_coach')]]),
        });
      } catch (e) {
        await this.handleAiError(ctx, e);
      }
    }
  }
}
