import { Injectable } from '@nestjs/common';
import {
  getMonthRange,
  getWeekRange,
  todayInTimezone,
} from '../common/time/timezone.util';
import { PrismaService } from '../prisma/prisma.service';
import { TasksRepository } from '../tasks/tasks.repository';
import { UsersService } from '../users/users.service';
import { ReviewMetricsService } from '../reviews/review-metrics.service';

@Injectable()
export class ProgressService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly tasksRepository: TasksRepository,
    private readonly reviewMetricsService: ReviewMetricsService,
  ) {}

  async dashboard(userId: string) {
    const user = await this.usersService.findById(userId);
    const preference = user.preference;
    const today = todayInTimezone(preference?.timezone ?? user.timezone);
    const week = getWeekRange(today, preference?.weekStartDay ?? 'MONDAY');
    const month = getMonthRange(today);
    const [
      goals,
      routines,
      weekTasks,
      monthTasks,
      weeklyReview,
      monthlyReview,
    ] = await Promise.all([
      this.prisma.goal.findMany({
        where: { userId, status: 'ACTIVE', deletedAt: null },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.routine.findMany({
        where: {
          userId,
          isActive: true,
          deletedAt: null,
          goal: { status: 'ACTIVE', deletedAt: null },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.tasksRepository.listBetween(userId, week.start, week.end),
      this.tasksRepository.listBetween(userId, month.start, month.end),
      this.prisma.weeklyReview.findFirst({
        where: { userId, deletedAt: null },
        orderBy: { weekStartDate: 'desc' },
      }),
      this.prisma.monthlyReview.findFirst({
        where: { userId, deletedAt: null },
        orderBy: { monthStartDate: 'desc' },
      }),
    ]);

    return {
      goals: goals.map((goal) => ({
        id: goal.id,
        title: goal.title,
        status: goal.status,
        healthScore: goal.healthScore,
        healthStatus: goal.healthStatus,
        currentStreak: goal.currentStreak,
      })),
      currentStreaks: {
        dailyCompletion: user.dailyCompletionStreak,
        perfectDay: user.perfectDayStreak,
        routines: routines.map((routine) => ({
          routineId: routine.id,
          title: routine.title,
          currentStreak: routine.currentStreak,
          bestStreak: routine.bestStreak,
        })),
      },
      recentPerformance: this.reviewMetricsService.buildTaskMetrics(weekTasks),
      weeklyStatistics: weeklyReview,
      monthlyStatistics: monthlyReview,
      monthToDate: this.reviewMetricsService.buildTaskMetrics(monthTasks),
    };
  }
}
