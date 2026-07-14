import { Injectable } from '@nestjs/common';
import { TaskStatus } from '@prisma/client';
import { Context, Markup, Telegraf } from 'telegraf';
import { TasksService } from '../../tasks/tasks.service';
import { MAIN_KEYBOARD, MENU_ROW } from '../telegram.constants';
import { TelegramFormattersService } from '../telegram-formatters.service';
import { TelegramHelperService } from '../telegram-helper.service';

@Injectable()
export class TaskHandler {
  constructor(
    private readonly tasksService: TasksService,
    private readonly helper: TelegramHelperService,
    private readonly formatters: TelegramFormattersService,
  ) {}

  register(bot: Telegraf<Context>): void {
    bot.hears('✅ Today', (ctx) => this.handleToday(ctx));
    bot.command('today', (ctx) => this.handleToday(ctx));

    bot.action(/^task:(COMPLETED|SKIPPED|FAILED):(.+)$/, (ctx) => this.handleTaskAction(ctx));

    bot.action('view_today', (ctx) => {
      void ctx.answerCbQuery();
      return this.handleToday(ctx);
    });
  }

  async handleToday(ctx: Context): Promise<void> {
    const user = await this.helper.ensureTelegramUser(ctx);
    const tasks = await this.tasksService.today(user.id);
    const taskButtons = tasks
      .filter((t) => t.status === TaskStatus.PENDING)
      .flatMap((task) => [
        [Markup.button.callback(`✅ ${task.routine.title}`, `task:COMPLETED:${task.id}`)],
        [
          Markup.button.callback('⏭ Skip', `task:SKIPPED:${task.id}`),
          Markup.button.callback('❌ Fail', `task:FAILED:${task.id}`),
        ],
      ]);
    await ctx.reply(
      this.formatters.tasks(tasks),
      Markup.inlineKeyboard([...taskButtons, MENU_ROW]),
    );
  }

  private async handleTaskAction(ctx: Context): Promise<void> {
    const user = await this.helper.ensureTelegramUser(ctx);
    const match = 'match' in ctx ? (ctx.match as RegExpExecArray) : undefined;
    if (!match) return;
    await this.tasksService.mark(user.id, match[2], { status: match[1] as TaskStatus });
    await ctx.answerCbQuery('✅ Saved');

    const tasks = await this.tasksService.today(user.id);
    const taskButtons = tasks
      .filter((t) => t.status === TaskStatus.PENDING)
      .flatMap((task) => [
        [Markup.button.callback(`✅ ${task.routine.title}`, `task:COMPLETED:${task.id}`)],
        [
          Markup.button.callback('⏭ Skip', `task:SKIPPED:${task.id}`),
          Markup.button.callback('❌ Fail', `task:FAILED:${task.id}`),
        ],
      ]);

    const text = this.formatters.tasks(tasks);
    const inlineMarkup = Markup.inlineKeyboard([...taskButtons, MENU_ROW]);

    try {
      await ctx.editMessageText(text, inlineMarkup);
    } catch (e: unknown) {
      const code = (e as any)?.response?.error_code;
      if (code !== 400) {
        await ctx.reply(text, inlineMarkup);
      }
    }
  }
}
