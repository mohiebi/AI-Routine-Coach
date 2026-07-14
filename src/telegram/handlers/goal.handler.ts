import { Injectable } from '@nestjs/common';
import { Goal } from '@prisma/client';
import { Context, Markup, Telegraf } from 'telegraf';
import { GoalsService } from '../../goals/goals.service';
import { CANCEL_ROW, CATEGORIES, MAIN_KEYBOARD, MENU_ROW } from '../telegram.constants';
import { TelegramConversationService } from '../telegram-conversation.service';
import { TelegramFormattersService } from '../telegram-formatters.service';
import { TelegramHelperService } from '../telegram-helper.service';
import { ConversationState } from '../telegram.types';

@Injectable()
export class GoalHandler {
  constructor(
    private readonly goalsService: GoalsService,
    private readonly helper: TelegramHelperService,
    private readonly conversations: TelegramConversationService,
    private readonly formatters: TelegramFormattersService,
  ) {}

  register(bot: Telegraf<Context>): void {
    bot.hears('📋 Goals', (ctx) => this.handleGoals(ctx));
    bot.command('goals', (ctx) => this.handleGoals(ctx));

    bot.action('new_goal', (ctx) => this.startGoalCreation(ctx));
    bot.action(/^goal:manage:(.+)$/, (ctx) => this.handleGoalManage(ctx));
    bot.action(/^goal:edit:title:(.+)$/, (ctx) => this.startGoalEdit(ctx, 'title'));
    bot.action(/^goal:edit:desc:(.+)$/, (ctx) => this.startGoalEdit(ctx, 'desc'));
    bot.action(/^goal:edit:cat:(.+)$/, (ctx) => this.startGoalEdit(ctx, 'cat'));
    bot.action(/^goal:edit:date:(.+)$/, (ctx) => this.startGoalEdit(ctx, 'date'));
    bot.action(/^goal:archive:(.+)$/, (ctx) => this.handleGoalArchive(ctx));
    bot.action(/^goal:archive_ok:(.+)$/, (ctx) => this.handleGoalArchiveConfirm(ctx));

    bot.action(/^cat:(.+)$/, (ctx) => this.handleCategorySelection(ctx));
    bot.action(/^ecat:(.+)$/, (ctx) => this.handleEditCategorySelection(ctx));
    bot.action('date:today', (ctx) => this.handleDateToday(ctx));

    bot.action('view_goals', (ctx) => {
      void ctx.answerCbQuery();
      return this.handleGoals(ctx);
    });
  }

  async handleGoals(ctx: Context): Promise<void> {
    const user = await this.helper.ensureTelegramUser(ctx);
    const goals = await this.goalsService.list(user.id);
    const manageButtons = goals.map((goal) => [
      Markup.button.callback(`⚙️ ${goal.title.slice(0, 30)}`, `goal:manage:${goal.id}`),
    ]);
    await ctx.reply(this.formatters.goals(goals), {
      ...Markup.inlineKeyboard([
        [Markup.button.callback('➕ New Goal', 'new_goal')],
        ...manageButtons,
        MENU_ROW,
      ]),
    });
  }

  goalManageMenu(goal: Goal) {
    const id = goal.id;
    return Markup.inlineKeyboard([
      [Markup.button.callback('➕ Add Routine', `new_routine:${id}`)],
      [
        Markup.button.callback('🤖 AI Review', `ai:review:${id}`),
        Markup.button.callback('🗺 AI Roadmap', `ai:breakdown:${id}`),
      ],
      [Markup.button.callback('💡 AI Suggest Routines', `ai:routines:${id}`)],
      [Markup.button.callback('✏️ Edit Title', `goal:edit:title:${id}`)],
      [Markup.button.callback('✏️ Edit Description', `goal:edit:desc:${id}`)],
      [Markup.button.callback('✏️ Edit Category', `goal:edit:cat:${id}`)],
      [Markup.button.callback('✏️ Edit Target Date', `goal:edit:date:${id}`)],
      [Markup.button.callback('🗑 Archive Goal', `goal:archive:${id}`)],
      [Markup.button.callback('← Back to Goals', 'view_goals')],
    ]);
  }

  private async startGoalCreation(ctx: Context): Promise<void> {
    const userId = ctx.from?.id;
    if (!userId) return;
    await this.helper.ack(ctx);
    this.conversations.set(userId, { step: 'goal:title', data: {} });
    await ctx.reply(
      'New Goal — Step 1 of 5\n\nWhat is the title of your goal?',
      Markup.inlineKeyboard([CANCEL_ROW]),
    );
  }

  private async handleGoalManage(ctx: Context): Promise<void> {
    const goalId = this.helper.matchId(ctx);
    if (!goalId) return;
    await this.helper.ack(ctx);
    const user = await this.helper.ensureTelegramUser(ctx);
    try {
      const goal = await this.goalsService.find(user.id, goalId);
      await ctx.reply(
        `Managing: "${goal.title}"\n\nWhat would you like to do?`,
        this.goalManageMenu(goal),
      );
    } catch {
      await ctx.reply('This goal no longer exists.', MAIN_KEYBOARD);
    }
  }

  private async startGoalEdit(ctx: Context, field: string): Promise<void> {
    const userId = ctx.from?.id;
    if (!userId) return;
    await this.helper.ack(ctx);
    const goalId = this.helper.matchId(ctx);
    if (!goalId) return;
    const user = await this.helper.ensureTelegramUser(ctx);
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

    const stepMap: Record<string, 'goal_edit:title' | 'goal_edit:desc' | 'goal_edit:date'> = {
      title: 'goal_edit:title', desc: 'goal_edit:desc', date: 'goal_edit:date',
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

  private async handleGoalArchive(ctx: Context): Promise<void> {
    const goalId = this.helper.matchId(ctx);
    if (!goalId) return;
    await this.helper.ack(ctx);
    const user = await this.helper.ensureTelegramUser(ctx);
    const goal = await this.goalsService.find(user.id, goalId);
    await ctx.reply(
      `Archive "${goal.title}"?\n\nThis hides the goal and its routines from your dashboard.`,
      Markup.inlineKeyboard([
        [Markup.button.callback('Yes, Archive', `goal:archive_ok:${goalId}`)],
        [Markup.button.callback('Cancel', `goal:manage:${goalId}`)],
      ]),
    );
  }

  private async handleGoalArchiveConfirm(ctx: Context): Promise<void> {
    const goalId = this.helper.matchId(ctx);
    if (!goalId) return;
    await this.helper.ack(ctx);
    const user = await this.helper.ensureTelegramUser(ctx);
    await this.goalsService.archive(user.id, goalId);
    await ctx.reply('Goal archived.', {
      ...MAIN_KEYBOARD,
      ...Markup.inlineKeyboard([[Markup.button.callback('View Goals', 'view_goals')]]),
    });
  }

  private async handleCategorySelection(ctx: Context): Promise<void> {
    const userId = ctx.from?.id;
    if (!userId) return;
    await this.helper.ack(ctx);
    const state = this.conversations.get(userId);
    if (!state || state.step !== 'goal:category') return;
    const cat = this.helper.matchId(ctx);
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

  private async handleDateToday(ctx: Context): Promise<void> {
    const userId = ctx.from?.id;
    if (!userId) return;
    await this.helper.ack(ctx);
    const state = this.conversations.get(userId);
    if (!state || state.step !== 'goal:startDate') return;
    state.data.startDate = new Date().toISOString().slice(0, 10);
    state.step = 'goal:targetDate';
    await ctx.reply(
      'New Goal — Step 5 of 5\n\nTarget completion date? (YYYY-MM-DD)',
      Markup.inlineKeyboard([CANCEL_ROW]),
    );
  }

  private async handleEditCategorySelection(ctx: Context): Promise<void> {
    const userId = ctx.from?.id;
    if (!userId) return;
    await this.helper.ack(ctx);
    const state = this.conversations.get(userId);
    if (!state || state.step !== 'goal_edit:cat') return;
    const cat = this.helper.matchId(ctx);
    if (!cat) return;
    const user = await this.helper.ensureTelegramUser(ctx);
    await this.goalsService.update(user.id, state.data.editId, { category: cat });
    this.conversations.delete(userId);
    const goal = await this.goalsService.find(user.id, state.data.editId);
    await ctx.reply(`Category updated to "${cat}".`, this.goalManageMenu(goal));
  }

  async handleConversationStep(
    ctx: Context,
    state: ConversationState,
    text: string,
  ): Promise<void> {
    const userId = ctx.from!.id;
    const user = await this.helper.ensureTelegramUser(ctx);

    switch (state.step) {
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
        if (!this.helper.isValidDate(text)) {
          await ctx.reply('Enter a valid YYYY-MM-DD date.');
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
        if (!this.helper.isValidDate(text)) {
          await ctx.reply('Enter a valid YYYY-MM-DD date.');
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
          `Goal created: "${newGoal.title}"\n\nAdd a routine to start tracking progress?`,
          Markup.inlineKeyboard([
            [Markup.button.callback('➕ Add Routine', `new_routine:${newGoal.id}`)],
            [Markup.button.callback('View Goals', 'view_goals')],
          ]),
        );
        break;
      }

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
        if (!this.helper.isValidDate(text)) {
          await ctx.reply('Enter a valid YYYY-MM-DD date.');
          return;
        }
        await this.goalsService.update(user.id, state.data.editId, { targetDate: text });
        this.conversations.delete(userId);
        const goal = await this.goalsService.find(user.id, state.data.editId);
        await ctx.reply(`Target date updated to ${text}.`, this.goalManageMenu(goal));
        break;
      }
    }
  }
}
