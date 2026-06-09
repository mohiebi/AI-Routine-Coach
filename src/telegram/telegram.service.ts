import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RoutineFrequency, TaskStatus, WeekStartDay } from '@prisma/client';
import { Context, Markup, Telegraf } from 'telegraf';
import { Update } from 'telegraf/types';
import { CheckInsService } from '../check-ins/check-ins.service';
import { GoalsService } from '../goals/goals.service';
import { ProgressService } from '../progress/progress.service';
import { ReviewsService } from '../reviews/reviews.service';
import { RoutinesService } from '../routines/routines.service';
import { TasksService } from '../tasks/tasks.service';
import { UsersService } from '../users/users.service';
import { TelegramFormattersService } from './telegram-formatters.service';

type ConversationStep =
  | 'goal:title'
  | 'goal:description'
  | 'goal:category'
  | 'goal:startDate'
  | 'goal:targetDate'
  | 'routine:title'
  | 'routine:description'
  | 'routine:frequency'
  | 'routine:targetCount'
  | 'routine:duration'
  | 'checkin:notes'
  | 'checkin:obstacles'
  | 'checkin:wins'
  | 'reflection:wentWell'
  | 'reflection:heldBack'
  | 'reflection:nextFocus';

interface ConversationState {
  step: ConversationStep;
  data: Record<string, string>;
}

const MAIN_KEYBOARD = Markup.keyboard([
  ['📋 Goals', '🔄 Routines'],
  ['✅ Today', '📊 Progress'],
  ['📝 Check In', '📖 Review'],
  ['⚙️ Settings', '❓ Help'],
]).resize();

const CANCEL_ROW = [Markup.button.callback('Cancel', 'cancel')];

const CATEGORIES = [
  'Health',
  'Career',
  'Learning',
  'Finance',
  'Relationships',
  'Personal',
  'Other',
];

@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramService.name);
  private bot?: Telegraf<Context>;
  private pollingStarted = false;
  private readonly conversations = new Map<number, ConversationState>();

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
    const prodLink = this.normalizeProdLink(
      this.configService.get<string>('PROD_LINK'),
    );

    if (prodLink) {
      const webhookUrl = `${prodLink}/telegram/webhook`;
      await this.bot.telegram.setWebhook(webhookUrl);
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
        const message =
          error instanceof Error
            ? error.message
            : 'Unknown Telegram launch error';
        this.logger.error(`Telegram bot failed to launch: ${message}`);
      });
  }

  onModuleDestroy() {
    if (this.pollingStarted) {
      this.bot?.stop('NestJS shutdown');
    }
  }

  async handleWebhookUpdate(update: unknown) {
    if (!this.bot) {
      throw new ServiceUnavailableException('Telegram bot is not initialized');
    }
    await this.bot.handleUpdate(update as Update);
    return { ok: true };
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
    // Slash commands (kept for power users)
    bot.start((ctx) => this.handleStart(ctx));
    bot.command('help', (ctx) => this.handleHelp(ctx));
    bot.command('goals', (ctx) => this.handleGoals(ctx));
    bot.command('routines', (ctx) => this.handleRoutines(ctx));
    bot.command('today', (ctx) => this.handleToday(ctx));
    bot.command('progress', (ctx) => this.handleProgress(ctx));
    bot.command('review', (ctx) => this.handleReview(ctx));
    bot.command('settings', (ctx) => this.handleSettings(ctx));
    bot.command('cancel', (ctx) => this.handleCancel(ctx));

    // Persistent reply keyboard buttons
    bot.hears('📋 Goals', (ctx) => this.handleGoals(ctx));
    bot.hears('🔄 Routines', (ctx) => this.handleRoutines(ctx));
    bot.hears('✅ Today', (ctx) => this.handleToday(ctx));
    bot.hears('📊 Progress', (ctx) => this.handleProgress(ctx));
    bot.hears('📝 Check In', (ctx) => this.startCheckIn(ctx));
    bot.hears('📖 Review', (ctx) => this.handleReview(ctx));
    bot.hears('⚙️ Settings', (ctx) => this.handleSettings(ctx));
    bot.hears('❓ Help', (ctx) => this.handleHelp(ctx));

    // Task status inline buttons
    bot.action(/^task:(COMPLETED|SKIPPED|FAILED):(.+)$/, (ctx) =>
      this.handleTaskAction(ctx),
    );

    // Goal flow
    bot.action('new_goal', (ctx) => this.startGoalCreation(ctx));

    // Routine flow
    bot.action('new_routine', (ctx) => this.startRoutineCreation(ctx));
    bot.action(/^new_routine:(.+)$/, (ctx) =>
      this.startRoutineCreationForGoal(ctx, (ctx.match as RegExpExecArray)[1]),
    );
    bot.action(/^freq:(.+)$/, (ctx) => this.handleFrequencySelection(ctx));
    bot.action(/^count:(\d+)$/, (ctx) => this.handleCountSelection(ctx));
    bot.action(/^dur:(\d+)$/, (ctx) => this.handleDurationSelection(ctx));

    // Goal category & date shortcuts
    bot.action(/^cat:(.+)$/, (ctx) => this.handleCategorySelection(ctx));
    bot.action('date:today', (ctx) => this.handleDateToday(ctx));

    // Check-in skips
    bot.action('skip:obstacles', (ctx) => this.skipCheckInStep(ctx, 'obstacles'));
    bot.action('skip:wins', (ctx) => this.skipCheckInStep(ctx, 'wins'));

    // Settings inline actions
    bot.action(/^settings:(.+)$/, (ctx) => this.handleSettingsAction(ctx));

    // Navigation after creation
    bot.action('view_goals', (ctx) => {
      void ctx.answerCbQuery();
      return this.handleGoals(ctx);
    });
    bot.action('view_today', (ctx) => {
      void ctx.answerCbQuery();
      return this.handleToday(ctx);
    });

    // Cancel any active flow
    bot.action('cancel', (ctx) => this.handleCancel(ctx));

    // Catch-all text handler — drives conversation state machine
    bot.on('text', (ctx) => this.handleConversationText(ctx));
  }

  // ── Navigation ─────────────────────────────────────────────────────────────

  private async handleStart(ctx: Context) {
    const user = await this.ensureTelegramUser(ctx);
    const goals = await this.goalsService.list(user.id);
    await ctx.reply(this.formatters.dashboard(goals), MAIN_KEYBOARD);
  }

  private async handleHelp(ctx: Context) {
    await ctx.reply(this.formatters.help(), {
      parse_mode: 'Markdown',
      reply_markup: {
        ...MAIN_KEYBOARD.reply_markup,
      },
    });
  }

  private async handleCancel(ctx: Context) {
    const userId = ctx.from?.id;
    if (userId) this.conversations.delete(userId);
    if ('answerCbQuery' in ctx) {
      await (ctx as Context & { answerCbQuery: () => Promise<void> }).answerCbQuery();
    }
    await ctx.reply('Cancelled. Use the menu to continue.', MAIN_KEYBOARD);
  }

  // ── Goals ──────────────────────────────────────────────────────────────────

  private async handleGoals(ctx: Context) {
    const user = await this.ensureTelegramUser(ctx);
    const goals = await this.goalsService.list(user.id);

    const goalRoutineButtons = goals.map((goal) => [
      Markup.button.callback(
        `+ Routine: ${goal.title.slice(0, 28)}`,
        `new_routine:${goal.id}`,
      ),
    ]);

    await ctx.reply(this.formatters.goals(goals), {
      ...Markup.inlineKeyboard([
        [Markup.button.callback('➕ New Goal', 'new_goal')],
        ...goalRoutineButtons,
      ]),
    });
  }

  private async startGoalCreation(ctx: Context) {
    const userId = ctx.from?.id;
    if (!userId) return;
    await this.ack(ctx);
    this.conversations.set(userId, { step: 'goal:title', data: {} });
    await ctx.reply(
      'New Goal — Step 1 of 5\n\nWhat is the title of your goal?',
      Markup.inlineKeyboard([CANCEL_ROW]),
    );
  }

  // ── Routines ───────────────────────────────────────────────────────────────

  private async handleRoutines(ctx: Context) {
    const user = await this.ensureTelegramUser(ctx);
    const routines = await this.routinesService.list(user.id);
    await ctx.reply(this.formatters.routines(routines), {
      ...Markup.inlineKeyboard([
        [Markup.button.callback('➕ New Routine', 'new_routine')],
      ]),
    });
  }

  private async startRoutineCreation(ctx: Context) {
    await this.ack(ctx);
    const user = await this.ensureTelegramUser(ctx);
    const goals = await this.goalsService.list(user.id);

    if (goals.length === 0) {
      await ctx.reply(
        'You need a goal before creating routines.',
        Markup.inlineKeyboard([
          [Markup.button.callback('➕ Create a Goal', 'new_goal')],
          CANCEL_ROW,
        ]),
      );
      return;
    }

    const goalButtons = goals.map((g) => [
      Markup.button.callback(g.title.slice(0, 32), `new_routine:${g.id}`),
    ]);
    await ctx.reply(
      'New Routine — Pick a goal:',
      Markup.inlineKeyboard([...goalButtons, CANCEL_ROW]),
    );
  }

  private async startRoutineCreationForGoal(ctx: Context, goalId: string) {
    const userId = ctx.from?.id;
    if (!userId) return;
    await this.ack(ctx);
    this.conversations.set(userId, {
      step: 'routine:title',
      data: { goalId },
    });
    await ctx.reply(
      'New Routine — Step 1 of 5\n\nWhat is the title of this routine?',
      Markup.inlineKeyboard([CANCEL_ROW]),
    );
  }

  // ── Today's tasks ──────────────────────────────────────────────────────────

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
      buttons.length > 0 ? Markup.inlineKeyboard(buttons) : MAIN_KEYBOARD,
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

  // ── Progress & review ──────────────────────────────────────────────────────

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
    await ctx.reply(this.formatters.weeklyReview(review), {
      ...Markup.inlineKeyboard([
        [Markup.button.callback('Refresh Review', 'view_today')],
      ]),
    });
  }

  // ── Settings ───────────────────────────────────────────────────────────────

  private async handleSettings(ctx: Context) {
    const user = await this.ensureTelegramUser(ctx);
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
      ]),
    });
  }

  private async handleSettingsAction(ctx: Context) {
    await this.ack(ctx);
    const user = await this.ensureTelegramUser(ctx);
    const match = 'match' in ctx ? (ctx.match as RegExpExecArray) : undefined;
    if (!match) return;

    const [field, ...rest] = match[1].split(':');
    const value = rest.join(':');

    if (field === 'weekStart') {
      await this.usersService.updatePreferences(user.id, {
        weekStartDay: value as WeekStartDay,
      });
      await ctx.reply(`Week start day updated to ${value}.`, MAIN_KEYBOARD);
    } else if (field === 'tz') {
      await this.usersService.updatePreferences(user.id, { timezone: value });
      await ctx.reply(`Timezone updated to ${value}.`, MAIN_KEYBOARD);
    }
  }

  // ── Check-in flow ──────────────────────────────────────────────────────────

  private async startCheckIn(ctx: Context) {
    const userId = ctx.from?.id;
    if (!userId) return;
    this.conversations.set(userId, { step: 'checkin:notes', data: {} });
    await ctx.reply(
      'Daily Check-In — Step 1 of 3\n\nHow did your day go? Write your general notes:',
      Markup.inlineKeyboard([CANCEL_ROW]),
    );
  }

  private async skipCheckInStep(ctx: Context, field: 'obstacles' | 'wins') {
    const userId = ctx.from?.id;
    if (!userId) return;
    await this.ack(ctx);
    const state = this.conversations.get(userId);
    if (!state) return;

    if (field === 'obstacles') {
      state.data.obstacles = '';
      state.step = 'checkin:wins';
      await ctx.reply(
        'Step 3 of 3 — What were your wins today?',
        Markup.inlineKeyboard([
          [Markup.button.callback('Skip Wins', 'skip:wins')],
          CANCEL_ROW,
        ]),
      );
    } else {
      state.data.wins = '';
      await this.saveCheckIn(ctx, state);
    }
  }

  private async saveCheckIn(ctx: Context, state: ConversationState) {
    const userId = ctx.from?.id;
    if (!userId) return;
    this.conversations.delete(userId);
    const user = await this.ensureTelegramUser(ctx);
    await this.checkInsService.saveToday(user.id, {
      notes: state.data.notes,
      obstacles: state.data.obstacles,
      wins: state.data.wins,
    });
    await ctx.reply('Check-in saved! Keep it up.', MAIN_KEYBOARD);
  }

  // ── Conversation state machine ─────────────────────────────────────────────

  private async handleConversationText(ctx: Context) {
    const userId = ctx.from?.id;
    if (!userId) return;
    const state = this.conversations.get(userId);
    if (!state) return;

    const text =
      'message' in ctx && ctx.message && 'text' in ctx.message
        ? ctx.message.text
        : '';
    if (!text || text.startsWith('/')) return;

    const user = await this.ensureTelegramUser(ctx);

    switch (state.step) {
      case 'goal:title':
        state.data.title = text;
        state.step = 'goal:description';
        await ctx.reply(
          'New Goal — Step 2 of 5\n\nDescribe this goal in a few words:',
          Markup.inlineKeyboard([CANCEL_ROW]),
        );
        break;

      case 'goal:description':
        state.data.description = text;
        state.step = 'goal:category';
        await ctx.reply(
          'New Goal — Step 3 of 5\n\nChoose a category:',
          Markup.inlineKeyboard([
            CATEGORIES.slice(0, 4).map((c) =>
              Markup.button.callback(c, `cat:${c}`),
            ),
            CATEGORIES.slice(4).map((c) =>
              Markup.button.callback(c, `cat:${c}`),
            ),
            CANCEL_ROW,
          ]),
        );
        break;

      case 'goal:startDate': {
        if (!this.isValidDate(text)) {
          await ctx.reply(
            'Enter a valid date in YYYY-MM-DD format, e.g. 2026-06-09.',
          );
          return;
        }
        state.data.startDate = text;
        state.step = 'goal:targetDate';
        await ctx.reply(
          'New Goal — Step 5 of 5\n\nWhat is your target completion date? (YYYY-MM-DD)',
          Markup.inlineKeyboard([CANCEL_ROW]),
        );
        break;
      }

      case 'goal:targetDate': {
        if (!this.isValidDate(text)) {
          await ctx.reply(
            'Enter a valid date in YYYY-MM-DD format, e.g. 2026-12-31.',
          );
          return;
        }
        state.data.targetDate = text;
        this.conversations.delete(userId);
        const goal = await this.goalsService.create(user.id, {
          title: state.data.title,
          description: state.data.description,
          category: state.data.category,
          startDate: state.data.startDate,
          targetDate: state.data.targetDate,
        });
        await ctx.reply(
          `Goal created: "${goal.title}"\n\nWould you like to add a routine to it?`,
          Markup.inlineKeyboard([
            [
              Markup.button.callback(
                '➕ Add Routine',
                `new_routine:${goal.id}`,
              ),
            ],
            [Markup.button.callback('View Goals', 'view_goals')],
          ]),
        );
        break;
      }

      case 'routine:title':
        state.data.title = text;
        state.step = 'routine:description';
        await ctx.reply(
          'New Routine — Step 2 of 5\n\nBriefly describe this routine:',
          Markup.inlineKeyboard([CANCEL_ROW]),
        );
        break;

      case 'routine:description':
        state.data.description = text;
        state.step = 'routine:frequency';
        await ctx.reply(
          'New Routine — Step 3 of 5\n\nHow often should this repeat?',
          Markup.inlineKeyboard([
            [
              Markup.button.callback('Daily', 'freq:DAILY'),
              Markup.button.callback('Weekly', 'freq:WEEKLY'),
              Markup.button.callback('Monthly', 'freq:MONTHLY'),
            ],
            CANCEL_ROW,
          ]),
        );
        break;

      case 'routine:targetCount': {
        const n = parseInt(text, 10);
        if (isNaN(n) || n < 1) {
          await ctx.reply('Enter a number greater than 0, e.g. 1, 3, 5.');
          return;
        }
        state.data.targetCount = String(n);
        state.step = 'routine:duration';
        await ctx.reply(
          'New Routine — Step 5 of 5\n\nHow many minutes does this take? (or type 0 to skip)',
          Markup.inlineKeyboard([
            [
              Markup.button.callback('15 min', 'dur:15'),
              Markup.button.callback('30 min', 'dur:30'),
              Markup.button.callback('45 min', 'dur:45'),
              Markup.button.callback('60 min', 'dur:60'),
            ],
            [Markup.button.callback('Skip', 'dur:0')],
            CANCEL_ROW,
          ]),
        );
        break;
      }

      case 'routine:duration': {
        const mins = parseInt(text, 10);
        state.data.duration = isNaN(mins) ? '0' : String(Math.max(0, mins));
        await this.finalizeRoutine(ctx, user.id, state);
        break;
      }

      case 'checkin:notes':
        state.data.notes = text;
        state.step = 'checkin:obstacles';
        await ctx.reply(
          'Check-In — Step 2 of 3\n\nWhat obstacles did you face today?',
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
          'Reflection — Step 2 of 3\n\nWhat held you back this month?',
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

  // ── Inline selection callbacks ─────────────────────────────────────────────

  private async handleCategorySelection(ctx: Context) {
    const userId = ctx.from?.id;
    if (!userId) return;
    await this.ack(ctx);
    const state = this.conversations.get(userId);
    if (!state || state.step !== 'goal:category') return;
    const match = 'match' in ctx ? (ctx.match as RegExpExecArray) : undefined;
    if (!match) return;

    state.data.category = match[1];
    state.step = 'goal:startDate';
    const today = new Date().toISOString().slice(0, 10);
    await ctx.reply(
      `Category: ${match[1]}\n\nNew Goal — Step 4 of 5\n\nWhen does this goal start? (YYYY-MM-DD)`,
      Markup.inlineKeyboard([
        [Markup.button.callback(`Today (${today})`, 'date:today')],
        CANCEL_ROW,
      ]),
    );
  }

  private async handleDateToday(ctx: Context) {
    const userId = ctx.from?.id;
    if (!userId) return;
    await this.ack(ctx);
    const state = this.conversations.get(userId);
    if (!state || state.step !== 'goal:startDate') return;

    const today = new Date().toISOString().slice(0, 10);
    state.data.startDate = today;
    state.step = 'goal:targetDate';
    await ctx.reply(
      'New Goal — Step 5 of 5\n\nWhat is your target completion date? (YYYY-MM-DD)',
      Markup.inlineKeyboard([CANCEL_ROW]),
    );
  }

  private async handleFrequencySelection(ctx: Context) {
    const userId = ctx.from?.id;
    if (!userId) return;
    await this.ack(ctx);
    const state = this.conversations.get(userId);
    if (!state || state.step !== 'routine:frequency') return;
    const match = 'match' in ctx ? (ctx.match as RegExpExecArray) : undefined;
    if (!match) return;

    state.data.frequency = match[1];
    state.step = 'routine:targetCount';
    const period = match[1].toLowerCase();
    await ctx.reply(
      `Frequency: ${match[1]}\n\nNew Routine — Step 4 of 5\n\nHow many times per ${period}?`,
      Markup.inlineKeyboard([
        [
          Markup.button.callback('1', 'count:1'),
          Markup.button.callback('2', 'count:2'),
          Markup.button.callback('3', 'count:3'),
          Markup.button.callback('5', 'count:5'),
          Markup.button.callback('7', 'count:7'),
        ],
        CANCEL_ROW,
      ]),
    );
  }

  private async handleCountSelection(ctx: Context) {
    const userId = ctx.from?.id;
    if (!userId) return;
    await this.ack(ctx);
    const state = this.conversations.get(userId);
    if (!state || state.step !== 'routine:targetCount') return;
    const match = 'match' in ctx ? (ctx.match as RegExpExecArray) : undefined;
    if (!match) return;

    state.data.targetCount = match[1];
    state.step = 'routine:duration';
    await ctx.reply(
      'New Routine — Step 5 of 5\n\nHow many minutes does this routine take?',
      Markup.inlineKeyboard([
        [
          Markup.button.callback('15 min', 'dur:15'),
          Markup.button.callback('30 min', 'dur:30'),
          Markup.button.callback('45 min', 'dur:45'),
          Markup.button.callback('60 min', 'dur:60'),
        ],
        [Markup.button.callback('Skip', 'dur:0')],
        CANCEL_ROW,
      ]),
    );
  }

  private async handleDurationSelection(ctx: Context) {
    const userId = ctx.from?.id;
    if (!userId) return;
    await this.ack(ctx);
    const state = this.conversations.get(userId);
    if (!state || state.step !== 'routine:duration') return;
    const match = 'match' in ctx ? (ctx.match as RegExpExecArray) : undefined;
    if (!match) return;

    state.data.duration = match[1];
    const user = await this.ensureTelegramUser(ctx);
    await this.finalizeRoutine(ctx, user.id, state);
  }

  private async finalizeRoutine(
    ctx: Context,
    userId: string,
    state: ConversationState,
  ) {
    const telegramId = ctx.from?.id;
    if (telegramId) this.conversations.delete(telegramId);

    const routine = await this.routinesService.create(userId, {
      goalId: state.data.goalId,
      title: state.data.title,
      description: state.data.description,
      frequency: state.data.frequency as RoutineFrequency,
      targetCount: Number(state.data.targetCount),
      estimatedDuration: state.data.duration
        ? Number(state.data.duration)
        : undefined,
    });

    await ctx.reply(
      `Routine created: "${routine.title}" — ${routine.frequency}`,
      Markup.inlineKeyboard([
        [
          Markup.button.callback(
            '➕ Add Another Routine',
            `new_routine:${state.data.goalId}`,
          ),
        ],
        [Markup.button.callback("See Today's Tasks", 'view_today')],
      ]),
    );
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async ack(ctx: Context) {
    if ('answerCbQuery' in ctx) {
      await (ctx as Context & { answerCbQuery: () => Promise<void> }).answerCbQuery();
    }
  }

  private isValidDate(text: string) {
    return /^\d{4}-\d{2}-\d{2}$/.test(text) && !isNaN(Date.parse(text));
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

  private normalizeProdLink(prodLink?: string) {
    if (!prodLink) return undefined;
    return prodLink.trim().replace(/\/+$/, '');
  }
}
