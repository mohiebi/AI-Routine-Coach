import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Context, Telegraf } from 'telegraf';
import { Update } from 'telegraf/types';
import { GoalsService } from '../goals/goals.service';
import { PremiumAccessService } from '../premium/premium-access.service';
import { MAIN_KEYBOARD } from './telegram.constants';
import { TelegramConversationService } from './telegram-conversation.service';
import { TelegramFormattersService } from './telegram-formatters.service';
import { TelegramHelperService } from './telegram-helper.service';
import { AiHandler } from './handlers/ai.handler';
import { CheckInHandler } from './handlers/checkin.handler';
import { GoalHandler } from './handlers/goal.handler';
import { PremiumHandler } from './handlers/premium.handler';
import { RoutineHandler } from './handlers/routine.handler';
import { SettingsHandler } from './handlers/settings.handler';
import { TaskHandler } from './handlers/task.handler';

@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramService.name);
  private bot?: Telegraf<Context>;
  private pollingStarted = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly goalsService: GoalsService,
    private readonly premiumAccessService: PremiumAccessService,
    private readonly formatters: TelegramFormattersService,
    private readonly helper: TelegramHelperService,
    private readonly conversations: TelegramConversationService,
    // Domain handlers
    private readonly goalHandler: GoalHandler,
    private readonly routineHandler: RoutineHandler,
    private readonly taskHandler: TaskHandler,
    private readonly checkInHandler: CheckInHandler,
    private readonly premiumHandler: PremiumHandler,
    private readonly aiHandler: AiHandler,
    private readonly settingsHandler: SettingsHandler,
  ) {}

  async onModuleInit() {
    const enabled =
      this.configService.get<string>('TELEGRAM_BOT_ENABLED', 'true') !== 'false';
    const token = this.configService.get<string>('TELEGRAM_BOT_TOKEN');
    if (!enabled || !token) {
      this.logger.warn('Telegram bot disabled or TELEGRAM_BOT_TOKEN missing');
      return;
    }

    this.bot = new Telegraf(token);
    this.registerHandlers(this.bot);
    this.bot.catch((error) => {
      this.logger.error(
        `Unhandled Telegram bot error: ${this.helper.errorMessage(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
    });

    const prodLink = this.normalizeProdLink(this.configService.get<string>('PROD_LINK'));
    if (prodLink) {
      const webhookUrl = `${prodLink}/telegram/webhook`;
      const certB64 = this.configService.get<string>('TELEGRAM_WEBHOOK_CERT');
      const extra = certB64
        ? { certificate: { source: Buffer.from(certB64, 'base64') } }
        : {};
      await this.bot.telegram.setWebhook(webhookUrl, extra);
      this.logger.log(`Telegram webhook registered at ${webhookUrl}`);
      return;
    }

    await this.bot.telegram.deleteWebhook();
    void this.bot
      .launch()
      .then(() => {
        this.pollingStarted = true;
        this.logger.log('Telegram bot launched with long polling');
      })
      .catch((error: unknown) => {
        this.logger.error(
          `Telegram bot failed to launch: ${this.helper.errorMessage(error)}`,
        );
      });
  }

  onModuleDestroy() {
    if (this.pollingStarted) this.bot?.stop('NestJS shutdown');
  }

  async handleWebhookUpdate(update: unknown, _secretToken?: string) {
    if (!this.bot) throw new ServiceUnavailableException('Telegram bot is not initialized');
    try {
      await this.bot.handleUpdate(update as Update);
      return { ok: true };
    } catch (error) {
      this.logger.error(
        `Telegram webhook update failed: ${this.helper.errorMessage(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      return { ok: false };
    }
  }

  async sendMessage(
    telegramId: bigint,
    text: string,
    extra?: Parameters<Telegraf<Context>['telegram']['sendMessage']>[2],
  ) {
    if (!this.bot) return;
    await this.bot.telegram.sendMessage(Number(telegramId), text, extra);
  }

  // ── Handler registration ───────────────────────────────────────────────────

  private registerHandlers(bot: Telegraf<Context>) {
    // Top-level commands
    bot.start((ctx) => this.handleStart(ctx));
    bot.command('help', (ctx) => this.handleHelp(ctx));
    bot.command('cancel', (ctx) => this.handleCancel(ctx));

    // Global navigation should always win, even from nested inline menus.
    bot.action('cancel', (ctx) => this.handleCancel(ctx));
    bot.action('main_menu', (ctx) => this.handleMainMenu(ctx));

    // Delegate to domain handlers (each registers its own actions + hears)
    this.goalHandler.register(bot);
    this.routineHandler.register(bot);
    this.taskHandler.register(bot);
    this.checkInHandler.register(bot);
    this.premiumHandler.register(bot);
    this.aiHandler.register(bot);
    this.settingsHandler.register(bot);

    // Free-text: active conversation or reply-keyboard echo
    bot.on('text', (ctx) => this.handleConversationText(ctx));
  }

  // ── Top-level screens ──────────────────────────────────────────────────────

  private async handleStart(ctx: Context) {
    const user = await this.helper.ensureTelegramUser(ctx);
    const trial = await this.premiumAccessService.activateTrial(user.id);
    if (trial) {
      await ctx.reply(this.formatters.trialWelcome(trial.expiresAt), {
        parse_mode: 'Markdown',
        ...MAIN_KEYBOARD,
      });
      return;
    }
    const goals = await this.goalsService.list(user.id);
    const isPremium = await this.premiumAccessService.hasActivePremium(user.id);
    await ctx.reply(this.formatters.dashboard(goals, isPremium), MAIN_KEYBOARD);
  }

  private async handleHelp(ctx: Context) {
    await ctx.reply(this.formatters.help(), {
      parse_mode: 'Markdown',
      reply_markup: MAIN_KEYBOARD.reply_markup,
    });
  }

  private async handleCancel(ctx: Context) {
    const userId = ctx.from?.id;
    if (userId) this.conversations.delete(userId);
    await this.helper.ack(ctx);
    await ctx.reply('Cancelled. Use the menu to continue.', MAIN_KEYBOARD);
  }

  private async handleMainMenu(ctx: Context) {
    const userId = ctx.from?.id;
    if (userId) this.conversations.delete(userId);
    await this.helper.ack(ctx);
    const user = await this.helper.ensureTelegramUser(ctx);
    const goals = await this.goalsService.list(user.id);
    const isPremium = await this.premiumAccessService.hasActivePremium(user.id);
    await ctx.reply(this.formatters.dashboard(goals, isPremium), MAIN_KEYBOARD);
  }

  // ── Conversation text dispatcher ───────────────────────────────────────────

  private async handleConversationText(ctx: Context) {
    const userId = ctx.from?.id;
    if (!userId) return;
    const text =
      'message' in ctx && ctx.message && 'text' in ctx.message ? ctx.message.text : '';
    if (!text || text.startsWith('/')) return;

    if (this.normalizeMenuText(text) === 'main menu') {
      await this.handleMainMenu(ctx);
      return;
    }

    const state = this.conversations.get(userId);
    if (!state) {
      await this.handleMenuText(ctx, text);
      return;
    }

    const prefix = state.step.split(':')[0];
    switch (prefix) {
      case 'goal':
      case 'goal_edit':
        await this.goalHandler.handleConversationStep(ctx, state, text);
        break;
      case 'routine':
      case 'routine_edit':
        await this.routineHandler.handleConversationStep(ctx, state, text);
        break;
      case 'checkin':
      case 'reflection':
        await this.checkInHandler.handleConversationStep(ctx, state, text);
        break;
      case 'checkout':
      case 'payment':
        await this.premiumHandler.handleConversationStep(ctx, state, text);
        break;
      case 'ai_coach':
        await this.aiHandler.handleConversationStep(ctx, state, text);
        break;
    }
  }

  private async handleMenuText(ctx: Context, text: string) {
    const normalized = this.normalizeMenuText(text);

    switch (normalized) {
      case 'main menu':    return this.handleMainMenu(ctx);
      case 'goals':        return this.goalHandler.handleGoals(ctx);
      case 'routines':     return this.routineHandler.handleRoutines(ctx);
      case 'today':        return this.taskHandler.handleToday(ctx);
      case 'progress':     return this.settingsHandler.handleProgress(ctx);
      case 'check in':     return this.checkInHandler.startCheckIn(ctx);
      case 'review':       return this.settingsHandler.handleReview(ctx);
      case 'premium':      return this.premiumHandler.handlePremium(ctx);
      case 'settings':     return this.settingsHandler.handleSettings(ctx);
    }
  }

  private normalizeMenuText(text: string) {
    return text
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  private normalizeProdLink(prodLink?: string) {
    if (!prodLink) return undefined;
    return prodLink.trim().replace(/\/+$/, '');
  }
}
