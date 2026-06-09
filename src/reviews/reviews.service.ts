import { Injectable, NotFoundException } from '@nestjs/common';
import { getMonthRange, getWeekRange } from '../common/time/timezone.util';
import { PrismaService } from '../prisma/prisma.service';
import { TasksRepository } from '../tasks/tasks.repository';
import { UsersService } from '../users/users.service';
import { ReviewMetricsService } from './review-metrics.service';

@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly tasksRepository: TasksRepository,
    private readonly reviewMetricsService: ReviewMetricsService,
  ) {}

  async generateWeeklyReview(userId: string, date: Date) {
    const user = await this.usersService.findById(userId);
    if (!user.preference)
      throw new NotFoundException('User preferences not found');
    const range = getWeekRange(date, user.preference.weekStartDay);
    const [tasks, goals] = await Promise.all([
      this.tasksRepository.listBetween(userId, range.start, range.end),
      this.prisma.goal.findMany({
        where: { userId, status: 'ACTIVE', deletedAt: null },
      }),
    ]);
    const metrics = this.reviewMetricsService.buildTaskMetrics(tasks);
    const goalHealthScores = this.reviewMetricsService.goalHealthScores(goals);
    const snapshot = { range, metrics, goalHealthScores };

    return this.prisma.weeklyReview.upsert({
      where: { userId_weekStartDate: { userId, weekStartDate: range.start } },
      create: {
        userId,
        weekStartDate: range.start,
        weekEndDate: range.end,
        completionRate: metrics.completionRate,
        tasksCompleted: metrics.tasksCompleted,
        tasksMissed: metrics.tasksMissed,
        bestRoutineId: metrics.bestRoutine?.routineId,
        worstRoutineId: metrics.worstRoutine?.routineId,
        currentStreak: user.dailyCompletionStreak,
        goalHealthScores,
        snapshot,
      },
      update: {
        weekEndDate: range.end,
        completionRate: metrics.completionRate,
        tasksCompleted: metrics.tasksCompleted,
        tasksMissed: metrics.tasksMissed,
        bestRoutineId: metrics.bestRoutine?.routineId,
        worstRoutineId: metrics.worstRoutine?.routineId,
        currentStreak: user.dailyCompletionStreak,
        goalHealthScores,
        snapshot,
      },
    });
  }

  async latestWeeklyReview(userId: string) {
    return this.prisma.weeklyReview.findFirst({
      where: { userId, deletedAt: null },
      orderBy: { weekStartDate: 'desc' },
    });
  }

  async generateMonthlyReview(userId: string, date: Date) {
    const user = await this.usersService.findById(userId);
    const range = getMonthRange(date);
    const [tasks, goals] = await Promise.all([
      this.tasksRepository.listBetween(userId, range.start, range.end),
      this.prisma.goal.findMany({
        where: { userId, status: 'ACTIVE', deletedAt: null },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    const metrics = this.reviewMetricsService.buildTaskMetrics(tasks);
    const goalProgress = goals.map((goal) => ({
      goalId: goal.id,
      title: goal.title,
      status: goal.status,
      healthScore: goal.healthScore,
    }));
    const goalHealthTrends = goals.map((goal) => ({
      goalId: goal.id,
      healthScore: goal.healthScore,
      healthStatus: goal.healthStatus,
    }));
    const longestStreak = Math.max(
      user.bestDailyCompletionStreak,
      ...goals.map((goal) => goal.bestStreak),
      0,
    );
    const snapshot = {
      range,
      metrics,
      goalProgress,
      goalHealthTrends,
      longestStreak,
    };

    return this.prisma.monthlyReview.upsert({
      where: { userId_monthStartDate: { userId, monthStartDate: range.start } },
      create: {
        userId,
        monthStartDate: range.start,
        monthEndDate: range.end,
        overallCompletionRate: metrics.completionRate,
        totalTasksCompleted: metrics.tasksCompleted,
        totalTasksMissed: metrics.tasksMissed,
        bestRoutineId: metrics.bestRoutine?.routineId,
        worstRoutineId: metrics.worstRoutine?.routineId,
        longestStreak,
        goalProgress,
        goalHealthTrends,
        snapshot,
      },
      update: {
        monthEndDate: range.end,
        overallCompletionRate: metrics.completionRate,
        totalTasksCompleted: metrics.tasksCompleted,
        totalTasksMissed: metrics.tasksMissed,
        bestRoutineId: metrics.bestRoutine?.routineId,
        worstRoutineId: metrics.worstRoutine?.routineId,
        longestStreak,
        goalProgress,
        goalHealthTrends,
        snapshot,
      },
    });
  }

  saveMonthlyReflection(
    monthlyReviewId: string,
    wentWell?: string,
    heldBack?: string,
    nextFocus?: string,
  ) {
    return this.prisma.monthlyReflection.upsert({
      where: { monthlyReviewId },
      create: { monthlyReviewId, wentWell, heldBack, nextFocus },
      update: { wentWell, heldBack, nextFocus },
    });
  }
}
