import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { NotificationType, PremiumEntitlementStatus, PremiumSource, User, UserPreference } from '@prisma/client';
import { Markup } from 'telegraf';
import { Job } from 'bullmq';
import {
  addDays,
  getWeekRange,
  isLastDayOfMonth,
  localParts,
  todayInTimezone,
} from '../common/time/timezone.util';
import { CouponGeneratorService } from '../coupons/coupon-generator.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
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
    private readonly prisma: PrismaService,
    private readonly couponGeneratorService: CouponGeneratorService,
  ) {
    super();
  }

  async process(job: Job) {
    if (job.name !== 'tick') return;
    const users = await this.usersRepository.listActiveWithPreferences();
    const results = await Promise.allSettled(
      users.map((user) => this.processUser(user)),
    );
    results.forEach((result, i) => {
      if (result.status === 'rejected') {
        this.logger.error(
          `Scheduler failed for user ${users[i].id}: ${String(result.reason)}`,
        );
      }
    });
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
    await this.sendTrialEndingReminder(user);
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
    const inspiration = this.telegramFormattersService.morningInspiration(
      today,
      user.preference.weekStartDay,
    );
    await this.telegramService.sendMessage(
      user.telegramId,
      `${inspiration}\n\n*Good morning!* Here are your tasks for today.\n\n${this.telegramFormattersService.tasks(tasks)}`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([[Markup.button.callback("✅ Open Today's Tasks", 'view_today')]]),
      },
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
      "How was your day? Tap below to log your notes, obstacles, and wins — it only takes a minute.",
      {
        ...Markup.inlineKeyboard([[Markup.button.callback('📝 Start Check-In', 'checkin:start')]]),
      },
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

  private async sendTrialEndingReminder(user: UserWithPreference) {
    const alreadySent = await this.notificationsService.alreadySentEver(
      user.id,
      NotificationType.TRIAL_ENDING_REMINDER,
    );
    if (alreadySent) return;

    const now = new Date();
    const windowStart = new Date(now.getTime() + 6 * 24 * 60 * 60 * 1000);
    const windowEnd = new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000);

    const trialEntitlement = await this.prisma.premiumEntitlement.findFirst({
      where: {
        userId: user.id,
        source: PremiumSource.TRIAL,
        status: PremiumEntitlementStatus.ACTIVE,
        expiresAt: { gte: windowStart, lte: windowEnd },
        deletedAt: null,
      },
    });
    if (!trialEntitlement) return;

    const coupon = await this.couponGeneratorService.getOrCreateTrialEndingCoupon(user.id);
    const daysLeft = Math.ceil(
      (trialEntitlement.expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000),
    );

    await this.telegramService.sendMessage(
      user.telegramId,
      [
        `⏳ *${daysLeft} days left on your free trial*`,
        '',
        'We hope AI Routine Coach has been useful! To keep your AI toolkit running after the trial, upgrade now with *50% off* your first payment.',
        '',
        `🎟 Your personal code: \`${coupon.code}\``,
        '_Apply it at checkout — valid for your first payment only._',
        '',
        'Tap ⭐ Premium in the menu to choose a plan.',
      ].join('\n'),
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([[Markup.button.callback('⭐ See Plans', 'premium_info')]]),
      },
    );

    await this.notificationsService.log(
      user.id,
      NotificationType.TRIAL_ENDING_REMINDER,
      { couponCode: coupon.code, daysLeft },
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
