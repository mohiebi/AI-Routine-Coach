import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { NotificationType, User, UserPreference } from '@prisma/client';
import { Job } from 'bullmq';
import {
  addDays,
  getWeekRange,
  isLastDayOfMonth,
  localParts,
  todayInTimezone,
} from '../common/time/timezone.util';
import { NotificationsService } from '../notifications/notifications.service';
import { ReviewsService } from '../reviews/reviews.service';
import { TaskGenerationService } from '../tasks/task-generation.service';
import { TasksRepository } from '../tasks/tasks.repository';
import { TelegramFormattersService } from '../telegram/telegram-formatters.service';
import { TelegramService } from '../telegram/telegram.service';
import { UsersRepository } from '../users/users.repository';
import { ROUTINE_SCHEDULER_QUEUE } from './scheduler.constants';

type UserWithPreference = User & { preference: UserPreference | null };

@Injectable()
@Processor(ROUTINE_SCHEDULER_QUEUE)
export class SchedulerProcessor extends WorkerHost {
  private readonly logger = new Logger(SchedulerProcessor.name);

  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly taskGenerationService: TaskGenerationService,
    private readonly tasksRepository: TasksRepository,
    private readonly notificationsService: NotificationsService,
    private readonly telegramService: TelegramService,
    private readonly telegramFormattersService: TelegramFormattersService,
    private readonly reviewsService: ReviewsService,
  ) {
    super();
  }

  async process(job: Job) {
    if (job.name !== 'tick') return;
    const users = await this.usersRepository.listActiveWithPreferences();
    await Promise.all(users.map((user) => this.processUser(user)));
  }

  private async processUser(user: UserWithPreference) {
    if (!user.preference) return;
    const now = new Date();
    const parts = localParts(now, user.preference.timezone);
    const today = todayInTimezone(user.preference.timezone, now);

    await this.generateDailyTasks(user, today, parts.time);
    await this.sendMorningReminder(user, today, parts.time);
    await this.sendEveningCheckIn(user, today, parts.time);
    await this.sendWeeklyReview(user, today, parts.time);
    await this.sendMonthlyReview(user, today, parts.time);
  }

  private async generateDailyTasks(
    user: UserWithPreference,
    today: Date,
    localTime: string,
  ) {
    if (!user.preference || localTime !== '00:05') return;
    if (
      await this.notificationsService.alreadySentToday(
        user.id,
        NotificationType.DAILY_TASK_GENERATION,
        today,
      )
    ) {
      return;
    }
    const tasks = await this.taskGenerationService.generateForUserDate(
      user.id,
      today,
      user.preference,
    );
    await this.notificationsService.log(
      user.id,
      NotificationType.DAILY_TASK_GENERATION,
      {
        taskCount: tasks.length,
        date: today.toISOString(),
      },
    );
  }

  private async sendMorningReminder(
    user: UserWithPreference,
    today: Date,
    localTime: string,
  ) {
    if (!user.preference || localTime !== user.preference.morningReminderTime)
      return;
    if (
      await this.notificationsService.alreadySentToday(
        user.id,
        NotificationType.MORNING_REMINDER,
        today,
      )
    ) {
      return;
    }
    await this.taskGenerationService.generateForUserDate(
      user.id,
      today,
      user.preference,
    );
    const tasks = await this.tasksRepository.listForDate(user.id, today);
    await this.telegramService.sendMessage(
      user.telegramId,
      `Good Morning.\n\n${this.telegramFormattersService.tasks(tasks)}`,
    );
    await this.notificationsService.log(
      user.id,
      NotificationType.MORNING_REMINDER,
      { date: today.toISOString() },
    );
  }

  private async sendEveningCheckIn(
    user: UserWithPreference,
    today: Date,
    localTime: string,
  ) {
    if (!user.preference || localTime !== user.preference.eveningCheckInTime)
      return;
    if (
      await this.notificationsService.alreadySentToday(
        user.id,
        NotificationType.EVENING_CHECK_IN,
        today,
      )
    ) {
      return;
    }
    await this.telegramService.sendMessage(
      user.telegramId,
      'How was your day?\n\nReply with /checkin notes | obstacles | wins',
    );
    await this.notificationsService.log(
      user.id,
      NotificationType.EVENING_CHECK_IN,
      { date: today.toISOString() },
    );
  }

  private async sendWeeklyReview(
    user: UserWithPreference,
    today: Date,
    localTime: string,
  ) {
    if (!user.preference || localTime !== user.preference.weeklyReviewTime)
      return;
    const range = getWeekRange(today, user.preference.weekStartDay);
    if (today.getTime() !== range.end.getTime()) return;
    if (
      await this.notificationsService.alreadySentToday(
        user.id,
        NotificationType.WEEKLY_REVIEW,
        today,
      )
    ) {
      return;
    }
    const review = await this.reviewsService.generateWeeklyReview(
      user.id,
      today,
    );
    await this.telegramService.sendMessage(
      user.telegramId,
      this.telegramFormattersService.weeklyReview(review),
    );
    await this.notificationsService.log(
      user.id,
      NotificationType.WEEKLY_REVIEW,
      {
        weekStart: range.start.toISOString(),
        weekEnd: range.end.toISOString(),
      },
    );
  }

  private async sendMonthlyReview(
    user: UserWithPreference,
    today: Date,
    localTime: string,
  ) {
    if (
      !user.preference ||
      localTime !== user.preference.monthlyReviewTime ||
      !isLastDayOfMonth(today)
    ) {
      return;
    }
    if (
      await this.notificationsService.alreadySentToday(
        user.id,
        NotificationType.MONTHLY_REVIEW,
        today,
      )
    ) {
      return;
    }
    const review = await this.reviewsService.generateMonthlyReview(
      user.id,
      today,
    );
    await this.telegramService.sendMessage(
      user.telegramId,
      this.telegramFormattersService.monthlyReview(review),
    );
    await this.notificationsService.log(
      user.id,
      NotificationType.MONTHLY_REVIEW,
      {
        monthEnd: today.toISOString(),
        nextMonthStart: addDays(today, 1).toISOString(),
      },
    );
  }
}
