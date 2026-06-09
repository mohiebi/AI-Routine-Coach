import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RoutineFrequency, TaskStatus, WeekStartDay } from '@prisma/client';
import { Context, Markup, Telegraf } from 'telegraf';
import { CheckInsService } from '../check-ins/check-ins.service';
import { GoalsService } from '../goals/goals.service';
import { ProgressService } from '../progress/progress.service';
import { ReviewsService } from '../reviews/reviews.service';
import { RoutinesService } from '../routines/routines.service';
import { TasksService } from '../tasks/tasks.service';
import { UsersService } from '../users/users.service';
import { TelegramFormattersService } from './telegram-formatters.service';

@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramService.name);
  private bot?: Telegraf<Context>;

  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
    private readonly goalsService: GoalsService,
    private readonly routinesService: RoutinesService,
    private readonly tasksService: TasksService,
    private readonly progressService: ProgressService,
    private readonly reviewsService: ReviewsService,
    private readonly checkInsService: CheckInsService,
    private readonly formatters: TelegramFormattersService,
  ) {}

  async onModuleInit() {
    const enabled =
      this.configService.get<string>('TELEGRAM_BOT_ENABLED', 'true') !==
      'false';
    const token = this.configService.get<string>('TELEGRAM_BOT_TOKEN');
    if (!enabled || !token) {
      this.logger.warn('Telegram bot disabled or TELEGRAM_BOT_TOKEN missing');
      return;
    }

    this.bot = new Telegraf(token);
    this.registerHandlers(this.bot);
    await this.bot.launch();
    this.logger.log('Telegram bot launched');
  }

  onModuleDestroy() {
    this.bot?.stop('NestJS shutdown');
  }

  async sendMessage(
    telegramId: bigint,
    text: string,
    extra?: Parameters<Telegraf<Context>['telegram']['sendMessage']>[2],
  ) {
    if (!this.bot) return;
    await this.bot.telegram.sendMessage(Number(telegramId), text, extra);
  }

  private registerHandlers(bot: Telegraf<Context>) {
    bot.start((ctx) => this.handleStart(ctx));
    bot.command('help', (ctx) => ctx.reply(this.formatters.help()));
    bot.command('goals', (ctx) => this.handleGoals(ctx));
    bot.command('goal', (ctx) => this.handleCreateGoal(ctx));
    bot.command('routines', (ctx) => this.handleRoutines(ctx));
    bot.command('routine', (ctx) => this.handleCreateRoutine(ctx));
    bot.command('today', (ctx) => this.handleToday(ctx));
    bot.command('progress', (ctx) => this.handleProgress(ctx));
    bot.command('review', (ctx) => this.handleReview(ctx));
    bot.command('settings', (ctx) => this.handleSettings(ctx));
    bot.command('checkin', (ctx) => this.handleCheckIn(ctx));
    bot.command('reflection', (ctx) => this.handleReflection(ctx));
    bot.action(/^task:(COMPLETED|SKIPPED|FAILED):(.+)$/, (ctx) =>
      this.handleTaskAction(ctx),
    );
  }

  private async handleStart(ctx: Context) {
    const user = await this.ensureTelegramUser(ctx);
    const goals = await this.goalsService.list(user.id);
    await ctx.reply(this.formatters.dashboard(goals));
  }

  private async handleGoals(ctx: Context) {
    const user = await this.ensureTelegramUser(ctx);
    const goals = await this.goalsService.list(user.id);
    await ctx.reply(this.formatters.goals(goals));
  }

  private async handleCreateGoal(ctx: Context) {
    const user = await this.ensureTelegramUser(ctx);
    const parts = this.commandPayload(ctx)
      .split('|')
      .map((part) => part.trim());
    if (parts.length < 4) {
      await ctx.reply(
        'Use: /goal Title | Description | Category | YYYY-MM-DD | YYYY-MM-DD',
      );
      return;
    }

    const goal = await this.goalsService.create(user.id, {
      title: parts[0],
      description: parts[1],
      category: parts[2],
      startDate: parts[3],
      targetDate: parts[4],
    });
    await ctx.reply(`Goal created:\n${goal.title}\nID: ${goal.id}`);
  }

  private async handleRoutines(ctx: Context) {
    const user = await this.ensureTelegramUser(ctx);
    const routines = await this.routinesService.list(user.id);
    await ctx.reply(this.formatters.routines(routines));
  }

  private async handleCreateRoutine(ctx: Context) {
    const user = await this.ensureTelegramUser(ctx);
    const parts = this.commandPayload(ctx)
      .split('|')
      .map((part) => part.trim());
    if (parts.length < 5) {
      await ctx.reply(
        'Use: /routine GoalId | Title | Description | DAILY|WEEKLY|MONTHLY | TargetCount | Minutes',
      );
      return;
    }

    const routine = await this.routinesService.create(user.id, {
      goalId: parts[0],
      title: parts[1],
      description: parts[2],
      frequency: parts[3].toUpperCase() as RoutineFrequency,
      targetCount: Number(parts[4]),
      estimatedDuration: parts[5] ? Number(parts[5]) : undefined,
    });
    await ctx.reply(`Routine created:\n${routine.title}\nID: ${routine.id}`);
  }

  private async handleToday(ctx: Context) {
    const user = await this.ensureTelegramUser(ctx);
    const tasks = await this.tasksService.today(user.id);
    const buttons = tasks
      .filter((task) => task.status === TaskStatus.PENDING)
      .flatMap((task) => [
        [
          Markup.button.callback(
            `✅ ${task.routine.title}`,
            `task:COMPLETED:${task.id}`,
          ),
        ],
        [
          Markup.button.callback('⏭ Skip', `task:SKIPPED:${task.id}`),
          Markup.button.callback('❌ Fail', `task:FAILED:${task.id}`),
        ],
      ]);
    await ctx.reply(
      this.formatters.tasks(tasks),
      buttons.length > 0 ? Markup.inlineKeyboard(buttons) : undefined,
    );
  }

  private async handleTaskAction(ctx: Context) {
    const user = await this.ensureTelegramUser(ctx);
    const match = 'match' in ctx ? (ctx.match as RegExpExecArray) : undefined;
    if (!match) return;
    const status = match[1] as TaskStatus;
    const taskId = match[2];
    await this.tasksService.mark(user.id, taskId, { status });
    await ctx.answerCbQuery('Saved');
    await this.handleToday(ctx);
  }

  private async handleProgress(ctx: Context) {
    const user = await this.ensureTelegramUser(ctx);
    const dashboard = await this.progressService.dashboard(user.id);
    await ctx.reply(this.formatters.progress(dashboard));
  }

  private async handleReview(ctx: Context) {
    const user = await this.ensureTelegramUser(ctx);
    const review =
      (await this.reviewsService.latestWeeklyReview(user.id)) ??
      (await this.reviewsService.generateWeeklyReview(user.id, new Date()));
    await ctx.reply(this.formatters.weeklyReview(review));
  }

  private async handleSettings(ctx: Context) {
    const user = await this.ensureTelegramUser(ctx);
    const payload = this.commandPayload(ctx);
    if (!payload) {
      await ctx.reply(
        `Current settings:\n${JSON.stringify(user.preference, null, 2)}\n\nUse /settings timezone=Asia/Tehran weekStartDay=SATURDAY morning=07:00 evening=21:00 weekly=20:00 monthly=20:00`,
      );
      return;
    }
    const values = this.parseKeyValuePayload(payload);
    const preference = await this.usersService.updatePreferences(user.id, {
      timezone: values.timezone,
      weekStartDay: values.weekStartDay as WeekStartDay,
      morningReminderTime: values.morning,
      eveningCheckInTime: values.evening,
      weeklyReviewTime: values.weekly,
      monthlyReviewTime: values.monthly,
    });
    await ctx.reply(`Settings saved:\n${JSON.stringify(preference, null, 2)}`);
  }

  private async handleCheckIn(ctx: Context) {
    const user = await this.ensureTelegramUser(ctx);
    const parts = this.commandPayload(ctx)
      .split('|')
      .map((part) => part.trim());
    if (parts.length < 1 || !parts[0]) {
      await ctx.reply('Use: /checkin notes | obstacles | wins');
      return;
    }
    await this.checkInsService.saveToday(user.id, {
      notes: parts[0],
      obstacles: parts[1],
      wins: parts[2],
    });
    await ctx.reply('Daily check-in saved.');
  }

  private async handleReflection(ctx: Context) {
    const parts = this.commandPayload(ctx)
      .split('|')
      .map((part) => part.trim());
    if (parts.length < 4) {
      await ctx.reply(
        'Use: /reflection MonthlyReviewId | went well | held back | next focus',
      );
      return;
    }
    await this.reviewsService.saveMonthlyReflection(
      parts[0],
      parts[1],
      parts[2],
      parts[3],
    );
    await ctx.reply('Monthly reflection saved.');
  }

  private async ensureTelegramUser(ctx: Context) {
    if (!ctx.from) throw new Error('Telegram user context is missing');
    return this.usersService.registerTelegramUser({
      telegramId: ctx.from.id,
      username: ctx.from.username,
      firstName: ctx.from.first_name,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC',
    });
  }

  private commandPayload(ctx: Context) {
    const text = 'text' in ctx.message! ? ctx.message.text : '';
    return text.replace(/^\/\w+(@\w+)?\s*/, '').trim();
  }

  private parseKeyValuePayload(payload: string): Record<string, string> {
    return payload.split(/\s+/).reduce<Record<string, string>>((acc, pair) => {
      const [key, value] = pair.split('=');
      if (key && value) {
        acc[key] = value;
      }
      return acc;
    }, {});
  }
}
