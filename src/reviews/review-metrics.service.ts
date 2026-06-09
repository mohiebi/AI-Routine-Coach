import { Injectable } from '@nestjs/common';
import { DailyTask, Goal, Routine, TaskStatus } from '@prisma/client';

type TaskWithRelations = DailyTask & { routine: Routine; goal: Goal };
const MISSED_STATUSES: TaskStatus[] = [TaskStatus.SKIPPED, TaskStatus.FAILED];

@Injectable()
export class ReviewMetricsService {
  buildTaskMetrics(tasks: TaskWithRelations[]) {
    const completed = tasks.filter(
      (task) => task.status === TaskStatus.COMPLETED,
    ).length;
    const missed = tasks.filter((task) =>
      MISSED_STATUSES.includes(task.status),
    ).length;
    const decided = completed + missed;
    const completionRate =
      decided === 0 ? 0 : Math.round((completed / decided) * 10000) / 100;
    const routineStats = this.routineStats(tasks);

    return {
      completionRate,
      tasksCompleted: completed,
      tasksMissed: missed,
      bestRoutine: routineStats[0] ?? null,
      worstRoutine: routineStats[routineStats.length - 1] ?? null,
      routineStats,
    };
  }

  goalHealthScores(goals: Goal[]) {
    return goals.map((goal) => ({
      goalId: goal.id,
      title: goal.title,
      healthScore: goal.healthScore,
      healthStatus: goal.healthStatus,
      currentStreak: goal.currentStreak,
    }));
  }

  private routineStats(tasks: TaskWithRelations[]) {
    const grouped = new Map<
      string,
      { routineId: string; title: string; completed: number; missed: number }
    >();

    for (const task of tasks) {
      const row = grouped.get(task.routineId) ?? {
        routineId: task.routineId,
        title: task.routine.title,
        completed: 0,
        missed: 0,
      };
      if (task.status === TaskStatus.COMPLETED) row.completed += 1;
      if (MISSED_STATUSES.includes(task.status)) row.missed += 1;
      grouped.set(task.routineId, row);
    }

    return [...grouped.values()]
      .map((row) => ({
        ...row,
        completionRate:
          row.completed + row.missed === 0
            ? 0
            : Math.round(
                (row.completed / (row.completed + row.missed)) * 10000,
              ) / 100,
      }))
      .sort(
        (a, b) =>
          b.completionRate - a.completionRate || b.completed - a.completed,
      );
  }
}
