import { Injectable } from '@nestjs/common';
import { GoalHealthStatus, TaskStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const MISSED_STATUSES: TaskStatus[] = [TaskStatus.SKIPPED, TaskStatus.FAILED];

@Injectable()
export class GoalHealthService {
  constructor(private readonly prisma: PrismaService) {}

  async recalculateGoal(goalId: string) {
    const tasks = await this.prisma.dailyTask.findMany({
      where: { goalId, deletedAt: null },
      orderBy: { date: 'desc' },
    });

    if (tasks.length === 0) {
      return this.prisma.goal.update({
        where: { id: goalId },
        data: { healthScore: 0, healthStatus: GoalHealthStatus.OFF_TRACK },
      });
    }

    const completed = tasks.filter(
      (task) => task.status === TaskStatus.COMPLETED,
    ).length;
    const missed = tasks.filter((task) =>
      MISSED_STATUSES.includes(task.status),
    ).length;
    const completionRate = completed / tasks.length;
    const missedPenalty = Math.min(25, missed * 3);
    const latestCompletedStreak = this.calculateLatestCompletedStreak(tasks);
    const streakBonus = Math.min(20, latestCompletedStreak * 2);
    const consistency = this.calculateConsistency(tasks);
    const score = Math.max(
      0,
      Math.min(
        100,
        Math.round(
          completionRate * 55 + consistency * 25 + streakBonus - missedPenalty,
        ),
      ),
    );
    const healthStatus = this.toHealthStatus(score);

    const goal = await this.prisma.goal.findUniqueOrThrow({
      where: { id: goalId },
    });

    return this.prisma.goal.update({
      where: { id: goalId },
      data: {
        healthScore: score,
        healthStatus,
        currentStreak: latestCompletedStreak,
        bestStreak: Math.max(goal.bestStreak, latestCompletedStreak),
      },
    });
  }

  toHealthStatus(score: number): GoalHealthStatus {
    if (score >= 90) return GoalHealthStatus.EXCELLENT;
    if (score >= 70) return GoalHealthStatus.ON_TRACK;
    if (score >= 40) return GoalHealthStatus.AT_RISK;
    return GoalHealthStatus.OFF_TRACK;
  }

  private calculateLatestCompletedStreak(tasks: { status: TaskStatus }[]) {
    let streak = 0;
    for (const task of tasks) {
      if (task.status !== TaskStatus.COMPLETED) break;
      streak += 1;
    }
    return streak;
  }

  private calculateConsistency(tasks: { status: TaskStatus }[]) {
    const decidedTasks = tasks.filter(
      (task) => task.status !== TaskStatus.PENDING,
    );
    if (decidedTasks.length === 0) return 0;
    return (
      decidedTasks.filter((task) => task.status === TaskStatus.COMPLETED)
        .length / decidedTasks.length
    );
  }
}
