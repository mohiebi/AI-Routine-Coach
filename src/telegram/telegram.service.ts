import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Goal, Routine, RoutineFrequency, TaskStatus, WeekStartDay } from '@prisma/client';
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
  // Goal creation
  | 'goal:title'
  | 'goal:description'
  | 'goal:category'
  | 'goal:startDate'
  | 'goal:targetDate'
  // Goal editing (editId stored in data)
  | 'goal_edit:title'
  | 'goal_edit:desc'
  | 'goal_edit:cat'
  | 'goal_edit:date'
  // Routine creation
  | 'routine:title'
  | 'routine:description'
  | 'routine:frequency'
  | 'routine:targetCount'
  | 'routine:duration'
  // Routine editing (editId stored in data)
  | 'routine_edit:title'
  | 'routine_edit:desc'
  | 'routine_edit:freq'
  | 'routine_edit:count'
  | 'routine_edit:dur'
  // Check-in
  | 'checkin:notes'
  | 'checkin:obstacles'
  | 'checkin:wins'
  // Monthly reflection
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
      this.configService.get<string>('TELEGRAM_BOT_ENABLED', 'true') !== 'false';
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
          error instanceof Error ? error.message : 'Unknown Telegram launch error';
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
    // Slash commands
    bot.start((ctx) => this.handleStart(ctx));
    bot.command('help', (ctx) => this.handleHelp(ctx));
    bot.command('goals', (ctx) => this.handleGoals(ctx));
    bot.command('routines', (ctx) => this.handleRoutines(ctx));
    bot.command('today', (ctx) => this.handleToday(ctx));
    bot.command('progress', (ctx) => this.handleProgress(ctx));
    bot.command('review', (ctx) => this.handleReview(ctx));
    bot.command('settings', (ctx) => this.handleSettings(ctx));
    bot.command('cancel', (ctx) => this.handleCancel(ctx));

    // Persistent reply keyboard
    bot.hears('📋 Goals', (ctx) => this.handleGoals(ctx));
    bot.hears('🔄 Routines', (ctx) => this.handleRoutines(ctx));
    bot.hears('✅ Today', (ctx) => this.handleToday(ctx));
    bot.hears('📊 Progress', (ctx) => this.handleProgress(ctx));
    bot.hears('📝 Check In', (ctx) => this.startCheckIn(ctx));
    bot.hears('📖 Review', (ctx) => this.handleReview(ctx));
    bot.hears('⚙️ Settings', (ctx) => this.handleSettings(ctx));
    bot.hears('❓ Help', (ctx) => this.handleHelp(ctx));

    // Task status
    bot.action(/^task:(COMPLETED|SKIPPED|FAILED):(.+)$/, (ctx) =>
      this.handleTaskAction(ctx),
    );

    // Goal creation
    bot.action('new_goal', (ctx) => this.startGoalCreation(ctx));

    // Goal management
    bot.action(/^goal:manage:(.+)$/, (ctx) => this.handleGoalManage(ctx));
    bot.action(/^goal:edit:title:(.+)$/, (ctx) => this.startGoalEdit(ctx, 'title'));
    bot.action(/^goal:edit:desc:(.+)$/, (ctx) => this.startGoalEdit(ctx, 'desc'));
    bot.action(/^goal:edit:cat:(.+)$/, (ctx) => this.startGoalEdit(ctx, 'cat'));
    bot.action(/^goal:edit:date:(.+)$/, (ctx) => this.startGoalEdit(ctx, 'date'));
    bot.action(/^goal:archive:(.+)$/, (ctx) => this.handleGoalArchive(ctx));
    bot.action(/^goal:archive_ok:(.+)$/, (ctx) => this.handleGoalArchiveConfirm(ctx));

    // Routine creation
    bot.action('new_routine', (ctx) => this.startRoutineCreation(ctx));
    bot.action(/^new_routine:(.+)$/, (ctx) =>
      this.startRoutineCreationForGoal(ctx, (ctx.match as RegExpExecArray)[1]),
    );

    // Routine management
    bot.action(/^routine:manage:(.+)$/, (ctx) => this.handleRoutineManage(ctx));
    bot.action(/^routine:edit:title:(.+)$/, (ctx) => this.startRoutineEdit(ctx, 'title'));
    bot.action(/^routine:edit:desc:(.+)$/, (ctx) => this.startRoutineEdit(ctx, 'desc'));
    bot.action(/^routine:edit:freq:(.+)$/, (ctx) => this.startRoutineEdit(ctx, 'freq'));
    bot.action(/^routine:edit:count:(.+)$/, (ctx) => this.startRoutineEdit(ctx, 'count'));
    bot.action(/^routine:edit:dur:(.+)$/, (ctx) => this.startRoutineEdit(ctx, 'dur'));
    bot.action(/^routine:archive:(.+)$/, (ctx) => this.handleRoutineArchive(ctx));
    bot.action(/^routine:archive_ok:(.+)$/, (ctx) => this.handleRoutineArchiveConfirm(ctx));

    // Inline selectors — creation
    bot.action(/^cat:(.+)$/, (ctx) => this.handleCategorySelection(ctx));
    bot.action(/^freq:(.+)$/, (ctx) => this.handleFrequencySelection(ctx));
    bot.action(/^count:(\d+)$/, (ctx) => this.handleCountSelection(ctx));
    bot.action(/^dur:(\d+)$/, (ctx) => this.handleDurationSelection(ctx));
    bot.action('date:today', (ctx) => this.handleDateToday(ctx));

    // Inline selectors — editing
    bot.action(/^ecat:(.+)$/, (ctx) => this.handleEditCategorySelection(ctx));
    bot.action(/^efreq:(.+)$/, (ctx) => this.handleEditFrequencySelection(ctx));

    // Check-in skips
    bot.action('skip:obstacles', (ctx) => this.skipCheckInStep(ctx, 'obstacles'));
    bot.action('skip:wins', (ctx) => this.skipCheckInStep(ctx, 'wins'));

    // Settings
    bot.action(/^settings:(.+)$/, (ctx) => this.handleSettingsAction(ctx));

    // Navigation shortcuts
    bot.action('view_goals', (ctx) => { void ctx.answerCbQuery(); return this.handleGoals(ctx); });
    bot.action('view_routines', (ctx) => { void ctx.answerCbQuery(); return this.handleRoutines(ctx); });
    bot.action('view_today', (ctx) => { void ctx.answerCbQuery(); return this.handleToday(ctx); });

    bot.action('cancel', (ctx) => this.handleCancel(ctx));
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
      reply_markup: MAIN_KEYBOARD.reply_markup,
    });
  }

  private async handleCancel(ctx: Context) {
    const userId = ctx.from?.id;
    if (userId) this.conversations.delete(userId);
    await this.ack(ctx);
    await ctx.reply('Cancelled. Use the menu to continue.', MAIN_KEYBOARD);
  }

  // ── Goals — list & creation ────────────────────────────────────────────────

  private async handleGoals(ctx: Context) {
    const user = await this.ensureTelegramUser(ctx);
    const goals = await this.goalsService.list(user.id);

    const manageButtons = goals.map((goal) => [
      Markup.button.callback(
        `⚙️ ${goal.title.slice(0, 30)}`,
        `goal:manage:${goal.id}`,
      ),
    ]);

    await ctx.reply(this.formatters.goals(goals), {
      ...Markup.inlineKeyboard([
        [Markup.button.callback('➕ New Goal', 'new_goal')],
        ...manageButtons,
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

  // ── Goals — manage menu ────────────────────────────────────────────────────

  private goalManageMenu(goal: Goal) {
    const id = goal.id;
    return Markup.inlineKeyboard([
      [Markup.button.callback('➕ Add Routine', `new_routine:${id}`)],
      [Markup.button.callback('✏️ Edit Title', `goal:edit:title:${id}`)],
      [Markup.button.callback('✏️ Edit Description', `goal:edit:desc:${id}`)],
      [Markup.button.callback('✏️ Edit Category', `goal:edit:cat:${id}`)],
      [Markup.button.callback('✏️ Edit Target Date', `goal:edit:date:${id}`)],
      [Markup.button.callback('🗑 Archive Goal', `goal:archive:${id}`)],
      [Markup.button.callback('← Back to Goals', 'view_goals')],
    ]);
  }

  private async handleGoalManage(ctx: Context) {
    const goalId = this.matchId(ctx);
    if (!goalId) return;
    await this.ack(ctx);
    const user = await this.ensureTelegramUser(ctx);
    const goal = await this.goalsService.find(user.id, goalId);
    await ctx.reply(
      `Managing: "${goal.title}"\n\nWhat would you like to change?`,
      this.goalManageMenu(goal),
    );
  }

  private async startGoalEdit(ctx: Context, field: string) {
    const userId = ctx.from?.id;
    if (!userId) return;
    await this.ack(ctx);
    const goalId = this.matchId(ctx);
    if (!goalId) return;
    const user = await this.ensureTelegramUser(ctx);
    const goal = await this.goalsService.find(user.id, goalId);

    if (field === 'cat') {
      this.conversations.set(userId, { step: 'goal_edit:cat', data: { editId: goalId } });
      await ctx.reply(
        `Current category: ${goal.category ?? 'not set'}\n\nChoose a new category:`,
        Markup.inlineKeyboard([
          CATEGORIES.slice(0, 4).map((c) => Markup.button.callback(c, `ecat:${c}`)),
          CATEGORIES.slice(4).map((c) => Markup.button.callback(c, `ecat:${c}`)),
          CANCEL_ROW,
        ]),
      );
      return;
    }

    const stepMap: Record<string, ConversationStep> = {
      title: 'goal_edit:title',
      desc: 'goal_edit:desc',
      date: 'goal_edit:date',
    };
    const currentMap: Record<string, string> = {
      title: goal.title,
      desc: goal.description ?? 'not set',
      date: goal.targetDate ? goal.targetDate.toISOString().slice(0, 10) : 'not set',
    };
    const promptMap: Record<string, string> = {
      title: 'Type the new title:',
      desc: 'Type the new description:',
      date: 'Type the new target date (YYYY-MM-DD):',
    };

    this.conversations.set(userId, { step: stepMap[field], data: { editId: goalId } });
    await ctx.reply(
      `Current: ${currentMap[field]}\n\n${promptMap[field]}`,
      Markup.inlineKeyboard([CANCEL_ROW]),
    );
  }

  private async handleGoalArchive(ctx: Context) {
    const goalId = this.matchId(ctx);
    if (!goalId) return;
    await this.ack(ctx);
    const user = await this.ensureTelegramUser(ctx);
    const goal = await this.goalsService.find(user.id, goalId);
    await ctx.reply(
      `Archive "${goal.title}"?\n\nThis hides the goal and its routines from your dashboard.`,
      Markup.inlineKeyboard([
        [Markup.button.callback('Yes, Archive', `goal:archive_ok:${goalId}`)],
        [Markup.button.callback('Cancel', `goal:manage:${goalId}`)],
      ]),
    );
  }

  private async handleGoalArchiveConfirm(ctx: Context) {
    const goalId = this.matchId(ctx);
    if (!goalId) return;
    await this.ack(ctx);
    const user = await this.ensureTelegramUser(ctx);
    await this.goalsService.archive(user.id, goalId);
    await ctx.reply('Goal archived.', {
      ...MAIN_KEYBOARD,
      ...Markup.inlineKeyboard([[Markup.button.callback('View Goals', 'view_goals')]]),
    });
  }

  private async handleEditCategorySelection(ctx: Context) {
    const userId = ctx.from?.id;
    if (!userId) return;
    await this.ack(ctx);
    const state = this.conversations.get(userId);
    if (!state || state.step !== 'goal_edit:cat') return;
    const cat = this.matchId(ctx);
    if (!cat) return;

    const user = await this.ensureTelegramUser(ctx);
    await this.goalsService.update(user.id, state.data.editId, { category: cat });
    this.conversations.delete(userId);
    const goal = await this.goalsService.find(user.id, state.data.editId);
    await ctx.reply(`Category updated to "${cat}".`, this.goalManageMenu(goal));
  }

  // ── Routines — list & creation ─────────────────────────────────────────────

  private async handleRoutines(ctx: Context) {
    const user = await this.ensureTelegramUser(ctx);
    const routines = await this.routinesService.list(user.id);

    const manageButtons = routines.map((r) => [
      Markup.button.callback(
        `⚙️ ${r.title.slice(0, 30)}`,
        `routine:manage:${r.id}`,
      ),
    ]);

    await ctx.reply(this.formatters.routines(routines), {
      ...Markup.inlineKeyboard([
        [Markup.button.callback('➕ New Routine', 'new_routine')],
        ...manageButtons,
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
      'New Routine — Which goal?',
      Markup.inlineKeyboard([...goalButtons, CANCEL_ROW]),
    );
  }

  private async startRoutineCreationForGoal(ctx: Context, goalId: string) {
    const userId = ctx.from?.id;
    if (!userId) return;
    await this.ack(ctx);
    this.conversations.set(userId, { step: 'routine:title', data: { goalId } });
    await ctx.reply(
      'New Routine — Step 1 of 5\n\nWhat is the title of this routine?',
      Markup.inlineKeyboard([CANCEL_ROW]),
    );
  }

  // ── Routines — manage menu ─────────────────────────────────────────────────

  private routineManageMenu(routine: Routine) {
    const id = routine.id;
    return Markup.inlineKeyboard([
      [Markup.button.callback('✏️ Edit Title', `routine:edit:title:${id}`)],
      [Markup.button.callback('✏️ Edit Description', `routine:edit:desc:${id}`)],
      [Markup.button.callback('✏️ Change Frequency', `routine:edit:freq:${id}`)],
      [Markup.button.callback('✏️ Change Target Count', `routine:edit:count:${id}`)],
      [Markup.button.callback('✏️ Change Duration', `routine:edit:dur:${id}`)],
      [Markup.button.callback('🗑 Archive Routine', `routine:archive:${id}`)],
      [Markup.button.callback('← Back to Routines', 'view_routines')],
    ]);
  }

  private async handleRoutineManage(ctx: Context) {
    const routineId = this.matchId(ctx);
    if (!routineId) return;
    await this.ack(ctx);
    const user = await this.ensureTelegramUser(ctx);
    const routine = await this.routinesService.find(user.id, routineId);
    await ctx.reply(
      `Managing: "${routine.title}" (${routine.frequency} x${routine.targetCount})\n\nWhat would you like to change?`,
      this.routineManageMenu(routine),
    );
  }

  private async startRoutineEdit(ctx: Context, field: string) {
    const userId = ctx.from?.id;
    if (!userId) return;
    await this.ack(ctx);
    const routineId = this.matchId(ctx);
    if (!routineId) return;
    const user = await this.ensureTelegramUser(ctx);
    const routine = await this.routinesService.find(user.id, routineId);

    if (field === 'freq') {
      this.conversations.set(userId, { step: 'routine_edit:freq', data: { editId: routineId } });
      await ctx.reply(
        `Current frequency: ${routine.frequency}\n\nChoose a new frequency:`,
        Markup.inlineKeyboard([
          [
            Markup.button.callback('Daily', 'efreq:DAILY'),
            Markup.button.callback('Weekly', 'efreq:WEEKLY'),
            Markup.button.callback('Monthly', 'efreq:MONTHLY'),
          ],
          CANCEL_ROW,
        ]),
      );
      return;
    }

    const stepMap: Record<string, ConversationStep> = {
      title: 'routine_edit:title',
      desc: 'routine_edit:desc',
      count: 'routine_edit:count',
      dur: 'routine_edit:dur',
    };
    const currentMap: Record<string, string> = {
      title: routine.title,
      desc: routine.description ?? 'not set',
      count: String(routine.targetCount),
      dur: routine.estimatedDuration ? String(routine.estimatedDuration) : 'not set',
    };
    const promptMap: Record<string, string> = {
      title: 'Type the new title:',
      desc: 'Type the new description:',
      count: 'Type the new target count (number):',
      dur: 'Type the new duration in minutes (number):',
    };

    this.conversations.set(userId, { step: stepMap[field], data: { editId: routineId } });
    await ctx.reply(
      `Current: ${currentMap[field]}\n\n${promptMap[field]}`,
      Markup.inlineKeyboard([CANCEL_ROW]),
    );
  }

  private async handleRoutineArchive(ctx: Context) {
    const routineId = this.matchId(ctx);
    if (!routineId) return;
    await this.ack(ctx);
    const user = await this.ensureTelegramUser(ctx);
    const routine = await this.routinesService.find(user.id, routineId);
    await ctx.reply(
      `Archive "${routine.title}"?\n\nThis will deactivate the routine and remove it from daily tasks.`,
      Markup.inlineKeyboard([
        [Markup.button.callback('Yes, Archive', `routine:archive_ok:${routineId}`)],
        [Markup.button.callback('Cancel', `routine:manage:${routineId}`)],
      ]),
    );
  }

  private async handleRoutineArchiveConfirm(ctx: Context) {
    const routineId = this.matchId(ctx);
    if (!routineId) return;
    await this.ack(ctx);
    const user = await this.ensureTelegramUser(ctx);
    await this.routinesService.archive(user.id, routineId);
    await ctx.reply('Routine archived.', {
      ...MAIN_KEYBOARD,
      ...Markup.inlineKeyboard([[Markup.button.callback('View Routines', 'view_routines')]]),
    });
  }

  private async handleEditFrequencySelection(ctx: Context) {
    const userId = ctx.from?.id;
    if (!userId) return;
    await this.ack(ctx);
    const state = this.conversations.get(userId);
    if (!state || state.step !== 'routine_edit:freq') return;
    const freq = this.matchId(ctx);
    if (!freq) return;

    const user = await this.ensureTelegramUser(ctx);
    await this.routinesService.update(user.id, state.data.editId, {
      frequency: freq as RoutineFrequency,
    });
    this.conversations.delete(userId);
    const routine = await this.routinesService.find(user.id, state.data.editId);
    await ctx.reply(`Frequency updated to ${freq}.`, this.routineManageMenu(routine));
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
    await ctx.reply(this.formatters.weeklyReview(review));
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
      'Daily Check-In — Step 1 of 3\n\nHow did your day go?',
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
      // ── Goal creation ──────────────────────────────────────────────────────
      case 'goal:title':
        state.data.title = text;
        state.step = 'goal:description';
        await ctx.reply(
          'New Goal — Step 2 of 5\n\nDescribe this goal briefly:',
          Markup.inlineKeyboard([CANCEL_ROW]),
        );
        break;

      case 'goal:description':
        state.data.description = text;
        state.step = 'goal:category';
        await ctx.reply(
          'New Goal — Step 3 of 5\n\nChoose a category:',
          Markup.inlineKeyboard([
            CATEGORIES.slice(0, 4).map((c) => Markup.button.callback(c, `cat:${c}`)),
            CATEGORIES.slice(4).map((c) => Markup.button.callback(c, `cat:${c}`)),
            CANCEL_ROW,
          ]),
        );
        break;

      case 'goal:category':
        await ctx.reply('Please choose a category from the buttons above.');
        break;

      case 'goal:startDate': {
        if (!this.isValidDate(text)) {
          await ctx.reply('Enter a valid date in YYYY-MM-DD format, e.g. 2026-06-09.');
          return;
        }
        state.data.startDate = text;
        state.step = 'goal:targetDate';
        await ctx.reply(
          'New Goal — Step 5 of 5\n\nTarget completion date? (YYYY-MM-DD)',
          Markup.inlineKeyboard([CANCEL_ROW]),
        );
        break;
      }

      case 'goal:targetDate': {
        if (!this.isValidDate(text)) {
          await ctx.reply('Enter a valid date in YYYY-MM-DD format, e.g. 2026-12-31.');
          return;
        }
        state.data.targetDate = text;
        this.conversations.delete(userId);
        const newGoal = await this.goalsService.create(user.id, {
          title: state.data.title,
          description: state.data.description,
          category: state.data.category,
          startDate: state.data.startDate,
          targetDate: state.data.targetDate,
        });
        await ctx.reply(
          `Goal created: "${newGoal.title}"\n\nWould you like to add a routine to it?`,
          Markup.inlineKeyboard([
            [Markup.button.callback('➕ Add Routine', `new_routine:${newGoal.id}`)],
            [Markup.button.callback('View Goals', 'view_goals')],
          ]),
        );
        break;
      }

      // ── Goal editing ───────────────────────────────────────────────────────
      case 'goal_edit:title': {
        await this.goalsService.update(user.id, state.data.editId, { title: text });
        this.conversations.delete(userId);
        const goal = await this.goalsService.find(user.id, state.data.editId);
        await ctx.reply(`Title updated to "${text}".`, this.goalManageMenu(goal));
        break;
      }

      case 'goal_edit:desc': {
        await this.goalsService.update(user.id, state.data.editId, { description: text });
        this.conversations.delete(userId);
        const goal = await this.goalsService.find(user.id, state.data.editId);
        await ctx.reply('Description updated.', this.goalManageMenu(goal));
        break;
      }

      case 'goal_edit:cat':
        await ctx.reply('Please choose a category from the buttons above.');
        break;

      case 'goal_edit:date': {
        if (!this.isValidDate(text)) {
          await ctx.reply('Enter a valid date in YYYY-MM-DD format.');
          return;
        }
        await this.goalsService.update(user.id, state.data.editId, { targetDate: text });
        this.conversations.delete(userId);
        const goal = await this.goalsService.find(user.id, state.data.editId);
        await ctx.reply(`Target date updated to ${text}.`, this.goalManageMenu(goal));
        break;
      }

      // ── Routine creation ───────────────────────────────────────────────────
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

      case 'routine:frequency':
        await ctx.reply('Please choose a frequency from the buttons above.');
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
          'New Routine — Step 5 of 5\n\nHow many minutes does this take?',
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

      // ── Routine editing ────────────────────────────────────────────────────
      case 'routine_edit:title': {
        await this.routinesService.update(user.id, state.data.editId, { title: text });
        this.conversations.delete(userId);
        const routine = await this.routinesService.find(user.id, state.data.editId);
        await ctx.reply(`Title updated to "${text}".`, this.routineManageMenu(routine));
        break;
      }

      case 'routine_edit:desc': {
        await this.routinesService.update(user.id, state.data.editId, { description: text });
        this.conversations.delete(userId);
        const routine = await this.routinesService.find(user.id, state.data.editId);
        await ctx.reply('Description updated.', this.routineManageMenu(routine));
        break;
      }

      case 'routine_edit:freq':
        await ctx.reply('Please choose a frequency from the buttons above.');
        break;

      case 'routine_edit:count': {
        const n = parseInt(text, 10);
        if (isNaN(n) || n < 1) {
          await ctx.reply('Enter a number greater than 0.');
          return;
        }
        await this.routinesService.update(user.id, state.data.editId, { targetCount: n });
        this.conversations.delete(userId);
        const routine = await this.routinesService.find(user.id, state.data.editId);
        await ctx.reply(`Target count updated to ${n}.`, this.routineManageMenu(routine));
        break;
      }

      case 'routine_edit:dur': {
        const mins = parseInt(text, 10);
        if (isNaN(mins) || mins < 0) {
          await ctx.reply('Enter a non-negative number of minutes.');
          return;
        }
        await this.routinesService.update(user.id, state.data.editId, {
          estimatedDuration: mins,
        });
        this.conversations.delete(userId);
        const routine = await this.routinesService.find(user.id, state.data.editId);
        await ctx.reply(`Duration updated to ${mins} minutes.`, this.routineManageMenu(routine));
        break;
      }

      // ── Check-in ───────────────────────────────────────────────────────────
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

      // ── Monthly reflection ─────────────────────────────────────────────────
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

  // ── Inline selectors — creation ────────────────────────────────────────────

  private async handleCategorySelection(ctx: Context) {
    const userId = ctx.from?.id;
    if (!userId) return;
    await this.ack(ctx);
    const state = this.conversations.get(userId);
    if (!state || state.step !== 'goal:category') return;
    const cat = this.matchId(ctx);
    if (!cat) return;

    state.data.category = cat;
    state.step = 'goal:startDate';
    const today = new Date().toISOString().slice(0, 10);
    await ctx.reply(
      `Category: ${cat}\n\nNew Goal — Step 4 of 5\n\nWhen does this goal start? (YYYY-MM-DD)`,
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

    state.data.startDate = new Date().toISOString().slice(0, 10);
    state.step = 'goal:targetDate';
    await ctx.reply(
      'New Goal — Step 5 of 5\n\nTarget completion date? (YYYY-MM-DD)',
      Markup.inlineKeyboard([CANCEL_ROW]),
    );
  }

  private async handleFrequencySelection(ctx: Context) {
    const userId = ctx.from?.id;
    if (!userId) return;
    await this.ack(ctx);
    const state = this.conversations.get(userId);
    if (!state || state.step !== 'routine:frequency') return;
    const freq = this.matchId(ctx);
    if (!freq) return;

    state.data.frequency = freq;
    state.step = 'routine:targetCount';
    await ctx.reply(
      `Frequency: ${freq}\n\nNew Routine — Step 4 of 5\n\nHow many times per ${freq.toLowerCase()}?`,
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
    const match = this.matchId(ctx);
    if (!match) return;

    state.data.targetCount = match;
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
    const match = this.matchId(ctx);
    if (!match) return;

    state.data.duration = match;
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
      estimatedDuration:
        state.data.duration && Number(state.data.duration) > 0
          ? Number(state.data.duration)
          : undefined,
    });

    await ctx.reply(
      `Routine created: "${routine.title}" — ${routine.frequency}`,
      Markup.inlineKeyboard([
        [Markup.button.callback('➕ Add Another Routine', `new_routine:${state.data.goalId}`)],
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

  private matchId(ctx: Context): string | undefined {
    return ('match' in ctx ? (ctx.match as RegExpExecArray) : undefined)?.[1];
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
