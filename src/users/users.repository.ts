import { Injectable } from '@nestjs/common';
import { Prisma, WeekStartDay } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByTelegramId(telegramId: bigint) {
    return this.prisma.user.findUnique({
      where: { telegramId },
      include: { preference: true },
    });
  }

  findById(id: string) {
    return this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      include: { preference: true },
    });
  }

  listActiveWithPreferences() {
    return this.prisma.user.findMany({
      where: { deletedAt: null },
      include: { preference: true },
    });
  }

  upsertTelegramUser(data: {
    telegramId: bigint;
    username?: string;
    firstName?: string;
    timezone: string;
  }) {
    return this.prisma.user.upsert({
      where: { telegramId: data.telegramId },
      update: {
        username: data.username,
        firstName: data.firstName,
      },
      create: {
        telegramId: data.telegramId,
        username: data.username,
        firstName: data.firstName,
        timezone: data.timezone,
        preference: {
          create: {
            timezone: data.timezone,
            weekStartDay: 'MONDAY',
            morningReminderTime: '07:00',
            eveningCheckInTime: '21:00',
            weeklyReviewTime: '20:00',
            monthlyReviewTime: '20:00',
          },
        },
      },
      include: { preference: true },
    });
  }

  updatePreferences(userId: string, data: Prisma.UserPreferenceUpdateInput) {
    return this.prisma.userPreference.upsert({
      where: { userId },
      create: {
        user: { connect: { id: userId } },
        timezone: typeof data.timezone === 'string' ? data.timezone : 'UTC',
        weekStartDay:
          typeof data.weekStartDay === 'string'
            ? data.weekStartDay
            : WeekStartDay.MONDAY,
        morningReminderTime:
          typeof data.morningReminderTime === 'string'
            ? data.morningReminderTime
            : '07:00',
        eveningCheckInTime:
          typeof data.eveningCheckInTime === 'string'
            ? data.eveningCheckInTime
            : '21:00',
        weeklyReviewTime:
          typeof data.weeklyReviewTime === 'string'
            ? data.weeklyReviewTime
            : '20:00',
        monthlyReviewTime:
          typeof data.monthlyReviewTime === 'string'
            ? data.monthlyReviewTime
            : '20:00',
      },
      update: data,
    });
  }

  updateUser(id: string, data: Prisma.UserUpdateInput) {
    return this.prisma.user.update({ where: { id }, data });
  }
}
