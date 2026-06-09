import {
  GoalHealthStatus,
  GoalStatus,
  RoutineFrequency,
  TaskStatus,
} from '@prisma/client';
import { ReviewMetricsService } from './review-metrics.service';

const baseDate = new Date('2026-06-09T00:00:00.000Z');

describe('ReviewMetricsService', () => {
  it('calculates completion rate and best/worst routines deterministically', () => {
    const service = new ReviewMetricsService();
    const goal = {
      id: 'goal-1',
      userId: 'user-1',
      title: 'Backend',
      description: null,
      category: 'Career',
      startDate: baseDate,
      targetDate: null,
      status: GoalStatus.ACTIVE,
      healthScore: 80,
      healthStatus: GoalHealthStatus.ON_TRACK,
      currentStreak: 3,
      bestStreak: 5,
      archivedAt: null,
      createdAt: baseDate,
      updatedAt: baseDate,
      deletedAt: null,
    };
    const routineA = routine('routine-a', 'Study');
    const routineB = routine('routine-b', 'Exercise');
    const metrics = service.buildTaskMetrics([
      task('task-1', routineA, goal, TaskStatus.COMPLETED),
      task('task-2', routineA, goal, TaskStatus.COMPLETED),
      task('task-3', routineB, goal, TaskStatus.FAILED),
      task('task-4', routineB, goal, TaskStatus.SKIPPED),
    ]);

    expect(metrics.completionRate).toBe(50);
    expect(metrics.tasksCompleted).toBe(2);
    expect(metrics.tasksMissed).toBe(2);
    expect(metrics.bestRoutine?.routineId).toBe('routine-a');
    expect(metrics.worstRoutine?.routineId).toBe('routine-b');
  });
});

function routine(id: string, title: string) {
  return {
    id,
    userId: 'user-1',
    goalId: 'goal-1',
    title,
    description: null,
    frequency: RoutineFrequency.DAILY,
    targetCount: 1,
    estimatedDuration: null,
    isActive: true,
    currentStreak: 0,
    bestStreak: 0,
    createdAt: baseDate,
    updatedAt: baseDate,
    deletedAt: null,
  };
}

function task(
  id: string,
  routineValue: ReturnType<typeof routine>,
  goal: Parameters<ReviewMetricsService['goalHealthScores']>[0][number],
  status: TaskStatus,
) {
  return {
    id,
    userId: 'user-1',
    goalId: goal.id,
    routineId: routineValue.id,
    date: baseDate,
    status,
    completedAt: status === TaskStatus.COMPLETED ? baseDate : null,
    createdAt: baseDate,
    updatedAt: baseDate,
    deletedAt: null,
    routine: routineValue,
    goal,
  };
}
