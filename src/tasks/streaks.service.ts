import { Injectable } from '@nestjs/common';
import { TaskStatus } from '@prisma/client';
import { GoalHealthService } from '../goals/goal-health.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class StreaksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly goalHealthService: GoalHealthService,
  ) {}

  async refreshAfterTaskChange(
    userId: string,
    routineId: string,
    goalId: string,
  ) {
    await this.refreshRoutineStreak(routineId);
    await this.refreshUserStreaks(userId);
    await this.goalHealthService.recalculateGoal(goalId);
  }

  private async refreshRoutineStreak(routineId: string) {
    const tasks = await this.prisma.dailyTask.findMany({
      where: { routineId, deletedAt: null },
      orderBy: { date: 'desc' },
    });
    const current = this.currentCompletedStreak(tasks);
    const routine = await this.prisma.routine.findUniqueOrThrow({
      where: { id: routineId },
    });
    await this.prisma.routine.update({
      where: { id: routineId },
      data: {
        currentStreak: current,
        bestStreak: Math.max(routine.bestStreak, current),
      },
    });
  }

  private async refreshUserStreaks(userId: string) {
    const grouped = await this.prisma.dailyTask.groupBy({
      by: ['date', 'status'],
      where: { userId, deletedAt: null },
      _count: true,
      orderBy: { date: 'desc' },
    });
    const dates = [...new Set(grouped.map((item) => item.date.toISOString()))]
      .sort()
      .reverse();
    let dailyCompletionStreak = 0;
    let perfectDayStreak = 0;

    for (const dateKey of dates) {
      const statuses = grouped.filter(
        (item) => item.date.toISOString() === dateKey,
      );
      const completed = statuses.some(
        (item) => item.status === TaskStatus.COMPLETED,
      );
      const allCompleted = statuses.every(
        (item) => item.status === TaskStatus.COMPLETED,
      );

      if (completed) dailyCompletionStreak += 1;
      else break;

      if (allCompleted) perfectDayStreak += 1;
      else break;
    }

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        dailyCompletionStreak,
        perfectDayStreak,
        bestDailyCompletionStreak: Math.max(
          user.bestDailyCompletionStreak,
          dailyCompletionStreak,
        ),
        bestPerfectDayStreak: Math.max(
          user.bestPerfectDayStreak,
          perfectDayStreak,
        ),
      },
    });
  }

  private currentCompletedStreak(tasks: { status: TaskStatus }[]) {
    let streak = 0;
    for (const task of tasks) {
      if (task.status !== TaskStatus.COMPLETED) break;
      streak += 1;
    }
    return streak;
  }
}
