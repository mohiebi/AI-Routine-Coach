import { Injectable, NotFoundException } from '@nestjs/common';
import { GoalStatus, TaskStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ProgressService } from '../progress/progress.service';

@Injectable()
export class AiContextService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly progressService: ProgressService,
  ) {}

  async goal(userId: string, goalId: string) {
    const goal = await this.prisma.goal.findFirst({
      where: { id: goalId, userId, status: GoalStatus.ACTIVE, deletedAt: null },
      include: {
        routines: {
          where: { isActive: true, deletedAt: null },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!goal) {
      throw new NotFoundException('Active goal not found');
    }

    return {
      id: goal.id,
      title: goal.title,
      description: goal.description,
      category: goal.category,
      startDate: goal.startDate.toISOString(),
      targetDate: goal.targetDate?.toISOString() ?? null,
      healthScore: goal.healthScore,
      healthStatus: goal.healthStatus,
      currentStreak: goal.currentStreak,
      bestStreak: goal.bestStreak,
      activeRoutines: goal.routines.map((routine) => ({
        id: routine.id,
        title: routine.title,
        frequency: routine.frequency,
        targetCount: routine.targetCount,
        estimatedDuration: routine.estimatedDuration,
        currentStreak: routine.currentStreak,
        bestStreak: routine.bestStreak,
      })),
    };
  }

  async goalPlanning(userId: string, goalId: string, availableHoursPerWeek?: number) {
    const [goal, breakdown, activeGoals, activeRoutines] = await Promise.all([
      this.goal(userId, goalId),
      this.prisma.aIGoalBreakdown.findFirst({
        where: { userId, goalId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.goal.findMany({
        where: { userId, status: GoalStatus.ACTIVE, deletedAt: null },
        orderBy: { createdAt: 'asc' },
        select: { id: true, title: true, healthScore: true, healthStatus: true },
      }),
      this.prisma.routine.findMany({
        where: {
          userId,
          isActive: true,
          deletedAt: null,
          goal: { status: GoalStatus.ACTIVE, deletedAt: null },
        },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          goalId: true,
          title: true,
          frequency: true,
          targetCount: true,
          estimatedDuration: true,
          currentStreak: true,
        },
      }),
    ]);

    return {
      goal,
      latestBreakdown: breakdown
        ? {
            milestones: breakdown.milestones,
            phases: breakdown.phases,
            suggestedTimeline: breakdown.suggestedTimeline,
            dependencies: breakdown.dependencies,
            successIndicators: breakdown.successIndicators,
          }
        : null,
      availableHoursPerWeek: availableHoursPerWeek ?? null,
      activeGoals,
      activeRoutines,
    };
  }

  async weeklyReview(userId: string, weeklyReviewId: string) {
    const review = await this.prisma.weeklyReview.findFirst({
      where: { id: weeklyReviewId, userId, deletedAt: null },
    });
    if (!review) {
      throw new NotFoundException('Weekly review not found');
    }

    const checkIns = await this.prisma.dailyCheckIn.findMany({
      where: {
        userId,
        deletedAt: null,
        date: { gte: review.weekStartDate, lte: review.weekEndDate },
      },
      orderBy: { date: 'asc' },
      take: 7,
    });

    return {
      review: {
        id: review.id,
        weekStartDate: review.weekStartDate.toISOString(),
        weekEndDate: review.weekEndDate.toISOString(),
        completionRate: review.completionRate,
        tasksCompleted: review.tasksCompleted,
        tasksMissed: review.tasksMissed,
        currentStreak: review.currentStreak,
        goalHealthScores: review.goalHealthScores,
        snapshot: review.snapshot,
      },
      checkIns: checkIns.map((checkIn) => ({
        date: checkIn.date.toISOString(),
        notes: checkIn.notes,
        obstacles: checkIn.obstacles,
        wins: checkIn.wins,
      })),
    };
  }

  async monthlyReview(userId: string, monthlyReviewId: string) {
    const review = await this.prisma.monthlyReview.findFirst({
      where: { id: monthlyReviewId, userId, deletedAt: null },
      include: { reflection: true },
    });
    if (!review) {
      throw new NotFoundException('Monthly review not found');
    }

    return {
      review: {
        id: review.id,
        monthStartDate: review.monthStartDate.toISOString(),
        monthEndDate: review.monthEndDate.toISOString(),
        overallCompletionRate: review.overallCompletionRate,
        totalTasksCompleted: review.totalTasksCompleted,
        totalTasksMissed: review.totalTasksMissed,
        longestStreak: review.longestStreak,
        goalProgress: review.goalProgress,
        goalHealthTrends: review.goalHealthTrends,
        snapshot: review.snapshot,
      },
      reflection: review.reflection
        ? {
            wentWell: review.reflection.wentWell,
            heldBack: review.reflection.heldBack,
            nextFocus: review.reflection.nextFocus,
          }
        : null,
    };
  }

  async progress(userId: string) {
    const dashboard = await this.progressService.dashboard(userId);
    return {
      goals: dashboard.goals,
      currentStreaks: dashboard.currentStreaks,
      recentPerformance: dashboard.recentPerformance,
      monthToDate: dashboard.monthToDate,
      latestWeeklyReview: dashboard.weeklyStatistics
        ? {
            completionRate: dashboard.weeklyStatistics.completionRate,
            tasksCompleted: dashboard.weeklyStatistics.tasksCompleted,
            tasksMissed: dashboard.weeklyStatistics.tasksMissed,
            goalHealthScores: dashboard.weeklyStatistics.goalHealthScores,
          }
        : null,
      latestMonthlyReview: dashboard.monthlyStatistics
        ? {
            completionRate: dashboard.monthlyStatistics.overallCompletionRate,
            tasksCompleted: dashboard.monthlyStatistics.totalTasksCompleted,
            tasksMissed: dashboard.monthlyStatistics.totalTasksMissed,
            goalProgress: dashboard.monthlyStatistics.goalProgress,
            goalHealthTrends: dashboard.monthlyStatistics.goalHealthTrends,
          }
        : null,
    };
  }

  async routineOptimization(userId: string) {
    const [dashboard, routineStats] = await Promise.all([
      this.progress(userId),
      this.prisma.routine.findMany({
        where: {
          userId,
          isActive: true,
          deletedAt: null,
          goal: { status: GoalStatus.ACTIVE, deletedAt: null },
        },
        orderBy: { createdAt: 'asc' },
        include: {
          dailyTasks: {
            where: {
              deletedAt: null,
              date: {
                gte: new Date(Date.now() - 28 * 24 * 60 * 60 * 1000),
              },
            },
            select: { status: true },
          },
        },
      }),
    ]);

    return {
      dashboard,
      routines: routineStats.map((routine) => {
        const completed = routine.dailyTasks.filter(
          (task) => task.status === TaskStatus.COMPLETED,
        ).length;
        const missed = routine.dailyTasks.filter(
          (task) =>
            task.status === TaskStatus.SKIPPED ||
            task.status === TaskStatus.FAILED,
        ).length;
        const total = completed + missed;

        return {
          id: routine.id,
          title: routine.title,
          frequency: routine.frequency,
          targetCount: routine.targetCount,
          estimatedDuration: routine.estimatedDuration,
          currentStreak: routine.currentStreak,
          bestStreak: routine.bestStreak,
          last28DaysCompletionRate: total ? Math.round((completed / total) * 100) : null,
        };
      }),
    };
  }

  async coach(userId: string, message: string) {
    const [dashboard, recentMessages] = await Promise.all([
      this.progress(userId),
      this.prisma.aICoachMessage.findMany({
        where: { userId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 6,
      }),
    ]);

    return {
      userMessage: message,
      dashboard,
      recentCoachMessages: recentMessages.reverse().map((item) => ({
        role: item.role,
        content: item.content,
      })),
    };
  }
}
