import { Injectable } from '@nestjs/common';
import { Routine, RoutineFrequency } from '@prisma/client';
import { Context, Markup, Telegraf } from 'telegraf';
import { GoalsService } from '../../goals/goals.service';
import { RoutinesService } from '../../routines/routines.service';
import { CANCEL_ROW, MAIN_KEYBOARD, MENU_ROW } from '../telegram.constants';
import { TelegramConversationService } from '../telegram-conversation.service';
import { TelegramFormattersService } from '../telegram-formatters.service';
import { TelegramHelperService } from '../telegram-helper.service';
import { ConversationState } from '../telegram.types';

@Injectable()
export class RoutineHandler {
  constructor(
    private readonly routinesService: RoutinesService,
    private readonly goalsService: GoalsService,
    private readonly helper: TelegramHelperService,
    private readonly conversations: TelegramConversationService,
    private readonly formatters: TelegramFormattersService,
  ) {}

  register(bot: Telegraf<Context>): void {
    bot.hears('🔄 Routines', (ctx) => this.handleRoutines(ctx));
    bot.command('routines', (ctx) => this.handleRoutines(ctx));

    bot.action('new_routine', (ctx) => this.startRoutineCreation(ctx));
    bot.action(/^new_routine:(.+)$/, (ctx) =>
      this.startRoutineCreationForGoal(ctx, this.helper.matchId(ctx)!),
    );
    bot.action(/^routine:manage:(.+)$/, (ctx) => this.handleRoutineManage(ctx));
    bot.action(/^routine:edit:title:(.+)$/, (ctx) => this.startRoutineEdit(ctx, 'title'));
    bot.action(/^routine:edit:desc:(.+)$/, (ctx) => this.startRoutineEdit(ctx, 'desc'));
    bot.action(/^routine:edit:freq:(.+)$/, (ctx) => this.startRoutineEdit(ctx, 'freq'));
    bot.action(/^routine:edit:count:(.+)$/, (ctx) => this.startRoutineEdit(ctx, 'count'));
    bot.action(/^routine:edit:dur:(.+)$/, (ctx) => this.startRoutineEdit(ctx, 'dur'));
    bot.action(/^routine:archive:(.+)$/, (ctx) => this.handleRoutineArchive(ctx));
    bot.action(/^routine:archive_ok:(.+)$/, (ctx) => this.handleRoutineArchiveConfirm(ctx));

    bot.action(/^freq:(.+)$/, (ctx) => this.handleFrequencySelection(ctx));
    bot.action(/^efreq:(.+)$/, (ctx) => this.handleEditFrequencySelection(ctx));
    bot.action(/^count:(\d+)$/, (ctx) => this.handleCountSelection(ctx));
    bot.action(/^dur:(\d+)$/, (ctx) => this.handleDurationSelection(ctx));
    bot.action('desc:skip', (ctx) => this.handleDescriptionSkip(ctx));
    bot.action('routine:enddate:skip', (ctx) => this.handleEndDateSkip(ctx));

    bot.action('view_routines', (ctx) => {
      void ctx.answerCbQuery();
      return this.handleRoutines(ctx);
    });
  }

  async handleRoutines(ctx: Context): Promise<void> {
    const user = await this.helper.ensureTelegramUser(ctx);
    const routines = await this.routinesService.list(user.id);
    const manageButtons = routines.map((r) => [
      Markup.button.callback(`⚙️ ${r.title.slice(0, 30)}`, `routine:manage:${r.id}`),
    ]);
    await ctx.reply(this.formatters.routines(routines), {
      ...Markup.inlineKeyboard([
        [Markup.button.callback('➕ New Routine', 'new_routine')],
        [Markup.button.callback('🤖 AI Optimize Routines', 'ai:optimize')],
        ...manageButtons,
        MENU_ROW,
      ]),
    });
  }

  routineManageMenu(routine: Routine) {
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

  private async startRoutineCreation(ctx: Context): Promise<void> {
    await this.helper.ack(ctx);
    const user = await this.helper.ensureTelegramUser(ctx);
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

  async startRoutineCreationForGoal(ctx: Context, goalId: string): Promise<void> {
    const userId = ctx.from?.id;
    if (!userId) return;
    await this.helper.ack(ctx);
    this.conversations.set(userId, { step: 'routine:title', data: { goalId } });
    await ctx.reply(
      'New Routine — Step 1 of 6\n\nWhat is the title of this routine?',
      Markup.inlineKeyboard([CANCEL_ROW]),
    );
  }

  private async handleRoutineManage(ctx: Context): Promise<void> {
    const routineId = this.helper.matchId(ctx);
    if (!routineId) return;
    await this.helper.ack(ctx);
    const user = await this.helper.ensureTelegramUser(ctx);
    const routine = await this.routinesService.find(user.id, routineId);
    await ctx.reply(
      `Managing: "${routine.title}" (${routine.frequency} x${routine.targetCount})\n\nWhat would you like to change?`,
      this.routineManageMenu(routine),
    );
  }

  private async startRoutineEdit(ctx: Context, field: string): Promise<void> {
    const userId = ctx.from?.id;
    if (!userId) return;
    await this.helper.ack(ctx);
    const routineId = this.helper.matchId(ctx);
    if (!routineId) return;
    const user = await this.helper.ensureTelegramUser(ctx);
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

    const stepMap: Record<string, 'routine_edit:title' | 'routine_edit:desc' | 'routine_edit:count' | 'routine_edit:dur'> = {
      title: 'routine_edit:title', desc: 'routine_edit:desc',
      count: 'routine_edit:count', dur: 'routine_edit:dur',
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
      dur: 'Type the new duration in minutes:',
    };
    this.conversations.set(userId, { step: stepMap[field], data: { editId: routineId } });
    await ctx.reply(
      `Current: ${currentMap[field]}\n\n${promptMap[field]}`,
      Markup.inlineKeyboard([CANCEL_ROW]),
    );
  }

  private async handleRoutineArchive(ctx: Context): Promise<void> {
    const routineId = this.helper.matchId(ctx);
    if (!routineId) return;
    await this.helper.ack(ctx);
    const user = await this.helper.ensureTelegramUser(ctx);
    const routine = await this.routinesService.find(user.id, routineId);
    await ctx.reply(
      `Archive "${routine.title}"?\n\nThis deactivates the routine and removes it from daily tasks.`,
      Markup.inlineKeyboard([
        [Markup.button.callback('Yes, Archive', `routine:archive_ok:${routineId}`)],
        [Markup.button.callback('Cancel', `routine:manage:${routineId}`)],
      ]),
    );
  }

  private async handleRoutineArchiveConfirm(ctx: Context): Promise<void> {
    const routineId = this.helper.matchId(ctx);
    if (!routineId) return;
    await this.helper.ack(ctx);
    const user = await this.helper.ensureTelegramUser(ctx);
    await this.routinesService.archive(user.id, routineId);
    await ctx.reply('Routine archived.', {
      ...MAIN_KEYBOARD,
      ...Markup.inlineKeyboard([[Markup.button.callback('View Routines', 'view_routines')]]),
    });
  }

  private async handleFrequencySelection(ctx: Context): Promise<void> {
    const userId = ctx.from?.id;
    if (!userId) return;
    await this.helper.ack(ctx);
    const state = this.conversations.get(userId);
    if (!state || state.step !== 'routine:frequency') return;
    const freq = this.helper.matchId(ctx);
    if (!freq) return;
    state.data.frequency = freq;
    state.step = 'routine:targetCount';
    await ctx.reply(
      `Frequency: ${freq}\n\nNew Routine — Step 4 of 6\n\nHow many times per ${freq.toLowerCase()}?`,
      Markup.inlineKeyboard([
        [
          Markup.button.callback('1', 'count:1'), Markup.button.callback('2', 'count:2'),
          Markup.button.callback('3', 'count:3'), Markup.button.callback('5', 'count:5'),
          Markup.button.callback('7', 'count:7'),
        ],
        CANCEL_ROW,
      ]),
    );
  }

  private async handleEditFrequencySelection(ctx: Context): Promise<void> {
    const userId = ctx.from?.id;
    if (!userId) return;
    await this.helper.ack(ctx);
    const state = this.conversations.get(userId);
    if (!state || state.step !== 'routine_edit:freq') return;
    const freq = this.helper.matchId(ctx);
    if (!freq) return;
    const user = await this.helper.ensureTelegramUser(ctx);
    await this.routinesService.update(user.id, state.data.editId, {
      frequency: freq as RoutineFrequency,
    });
    this.conversations.delete(userId);
    const routine = await this.routinesService.find(user.id, state.data.editId);
    await ctx.reply(`Frequency updated to ${freq}.`, this.routineManageMenu(routine));
  }

  private async handleCountSelection(ctx: Context): Promise<void> {
    const userId = ctx.from?.id;
    if (!userId) return;
    await this.helper.ack(ctx);
    const state = this.conversations.get(userId);
    if (!state || state.step !== 'routine:targetCount') return;
    const match = this.helper.matchId(ctx);
    if (!match) return;
    state.data.targetCount = match;
    state.step = 'routine:duration';
    await ctx.reply(
      'New Routine — Step 5 of 6\n\nHow many minutes does this routine take?',
      Markup.inlineKeyboard([
        [
          Markup.button.callback('15 min', 'dur:15'), Markup.button.callback('30 min', 'dur:30'),
          Markup.button.callback('45 min', 'dur:45'), Markup.button.callback('60 min', 'dur:60'),
        ],
        [Markup.button.callback('Skip', 'dur:0')],
        CANCEL_ROW,
      ]),
    );
  }

  private async handleDurationSelection(ctx: Context): Promise<void> {
    const userId = ctx.from?.id;
    if (!userId) return;
    await this.helper.ack(ctx);
    const state = this.conversations.get(userId);
    if (!state || state.step !== 'routine:duration') return;
    const match = this.helper.matchId(ctx);
    if (!match) return;
    state.data.duration = match;
    // Advance to the endDate step (same as when the user types a duration).
    state.step = 'routine:endDate';
    await ctx.reply(
      'New Routine — Step 6 of 6\n\nWhen should this routine end? _(YYYY-MM-DD)_\nLeave it running forever by tapping Skip.',
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('⏭ No end date (lifetime)', 'routine:enddate:skip')],
          CANCEL_ROW,
        ]),
      },
    );
  }

  private async handleDescriptionSkip(ctx: Context): Promise<void> {
    await this.helper.ack(ctx);
    const userId = ctx.from?.id;
    if (!userId) return;
    const state = this.conversations.get(userId);
    if (!state || state.step !== 'routine:description') return;
    state.data.description = '';
    state.step = 'routine:frequency';
    await ctx.reply(
      'New Routine — Step 3 of 6\n\nHow often should this repeat?',
      Markup.inlineKeyboard([
        [
          Markup.button.callback('Daily', 'freq:DAILY'),
          Markup.button.callback('Weekly', 'freq:WEEKLY'),
          Markup.button.callback('Monthly', 'freq:MONTHLY'),
        ],
        CANCEL_ROW,
      ]),
    );
  }

  private async handleEndDateSkip(ctx: Context): Promise<void> {
    await this.helper.ack(ctx);
    const userId = ctx.from?.id;
    if (!userId) return;
    const state = this.conversations.get(userId);
    if (!state || state.step !== 'routine:endDate') return;
    state.data.endDate = '';
    const user = await this.helper.ensureTelegramUser(ctx);
    await this.finalizeRoutine(ctx, user.id, state);
  }

  async finalizeRoutine(
    ctx: Context,
    userId: string,
    state: ConversationState,
  ): Promise<void> {
    const telegramId = ctx.from?.id;
    if (telegramId) this.conversations.delete(telegramId);
    const routine = await this.routinesService.create(userId, {
      goalId: state.data.goalId,
      title: state.data.title,
      description: state.data.description || undefined,
      frequency: state.data.frequency as RoutineFrequency,
      targetCount: Number(state.data.targetCount),
      estimatedDuration:
        state.data.duration && Number(state.data.duration) > 0
          ? Number(state.data.duration)
          : undefined,
      endDate: state.data.endDate || undefined,
    });
    await ctx.reply(
      `Routine created: "${routine.title}" — ${routine.frequency}`,
      Markup.inlineKeyboard([
        [Markup.button.callback('➕ Add Another', `new_routine:${state.data.goalId}`)],
        [Markup.button.callback("See Today's Tasks", 'view_today')],
      ]),
    );
  }

  async handleConversationStep(
    ctx: Context,
    state: ConversationState,
    text: string,
  ): Promise<void> {
    const userId = ctx.from!.id;
    const user = await this.helper.ensureTelegramUser(ctx);

    switch (state.step) {
      case 'routine:title':
        state.data.title = text;
        state.step = 'routine:description';
        await ctx.reply(
          'New Routine — Step 2 of 6\n\nBriefly describe this routine: _(optional)_',
          {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('⏭ Skip', 'desc:skip')],
              CANCEL_ROW,
            ]),
          },
        );
        break;

      case 'routine:description':
        state.data.description = text;
        state.step = 'routine:frequency';
        await ctx.reply(
          'New Routine — Step 3 of 6\n\nHow often should this repeat?',
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
          await ctx.reply('Enter a number greater than 0.');
          return;
        }
        state.data.targetCount = String(n);
        state.step = 'routine:duration';
        await ctx.reply(
          'New Routine — Step 5 of 6\n\nHow many minutes does this take?',
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
        state.step = 'routine:endDate';
        await ctx.reply(
          'New Routine — Step 6 of 6\n\nWhen should this routine end? _(YYYY-MM-DD)_\nLeave it running forever by tapping Skip.',
          {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('⏭ No end date (lifetime)', 'routine:enddate:skip')],
              CANCEL_ROW,
            ]),
          },
        );
        break;
      }

      case 'routine:endDate': {
        if (!this.helper.isValidDate(text)) {
          await ctx.reply('Please enter a valid date in YYYY-MM-DD format, or tap Skip.');
          return;
        }
        state.data.endDate = text;
        await this.finalizeRoutine(ctx, user.id, state);
        break;
      }

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
    }
  }
}
