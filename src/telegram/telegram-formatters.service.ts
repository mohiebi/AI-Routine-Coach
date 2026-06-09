import { Injectable } from '@nestjs/common';
import {
  DailyTask,
  Goal,
  MonthlyReview,
  Routine,
  TaskStatus,
  WeeklyReview,
} from '@prisma/client';

@Injectable()
export class TelegramFormattersService {
  dashboard(
    goals: { title: string; healthScore: number; healthStatus: string }[],
  ) {
    if (goals.length === 0) {
      return [
        'Welcome to AI Routine Coach Phase 1.',
        '',
        'No goals yet.',
        'Create one with:',
        '/goal Become a Senior Backend Engineer | Build backend mastery | Career | 2026-06-09 | 2026-12-31',
      ].join('\n');
    }

    return [
      'Your dashboard:',
      ...goals.map(
        (goal) =>
          `- ${goal.title}: ${goal.healthScore}/100 ${goal.healthStatus}`,
      ),
    ].join('\n');
  }

  goals(goals: Goal[]) {
    if (goals.length === 0)
      return 'No goals yet. Use /goal Title | Description | Category | YYYY-MM-DD | YYYY-MM-DD';
    return goals
      .map(
        (goal, index) =>
          `${index + 1}. ${goal.title}\n${goal.healthScore}/100 ${goal.healthStatus}\nID: ${goal.id}`,
      )
      .join('\n\n');
  }

  routines(routines: (Routine & { goal?: Goal })[]) {
    if (routines.length === 0)
      return 'No routines yet. Use /routine goalId | Title | Description | DAILY | 1 | 30';
    return routines
      .map(
        (routine, index) =>
          `${index + 1}. ${routine.title}\n${routine.frequency} x${routine.targetCount} | Streak ${routine.currentStreak}\nGoal: ${routine.goal?.title ?? routine.goalId}\nID: ${routine.id}`,
      )
      .join('\n\n');
  }

  tasks(tasks: (DailyTask & { routine: Routine; goal: Goal })[]) {
    if (tasks.length === 0)
      return 'No tasks for today. Add active routines to your goals.';
    return [
      "Today's tasks:",
      ...tasks.map((task) => `${this.icon(task.status)} ${task.routine.title}`),
    ].join('\n');
  }

  weeklyReview(review: WeeklyReview | null) {
    if (!review) return 'No weekly review yet.';
    return [
      'Weekly review',
      `Completion rate: ${review.completionRate}%`,
      `Completed: ${review.tasksCompleted}`,
      `Missed: ${review.tasksMissed}`,
      `Current streak: ${review.currentStreak}`,
    ].join('\n');
  }

  monthlyReview(review: MonthlyReview) {
    return [
      'Monthly review',
      `Completion rate: ${review.overallCompletionRate}%`,
      `Completed: ${review.totalTasksCompleted}`,
      `Missed: ${review.totalTasksMissed}`,
      `Longest streak: ${review.longestStreak}`,
      '',
      'Reflection:',
      '1. What went well this month?',
      '2. What held you back?',
      '3. What will you focus on next month?',
      '',
      `Reply with /reflection ${review.id} | went well | held back | next focus`,
    ].join('\n');
  }

  progress(dashboard: {
    goals: {
      title: string;
      healthScore: number;
      healthStatus: string;
      currentStreak: number;
    }[];
    currentStreaks: { dailyCompletion: number; perfectDay: number };
    recentPerformance: {
      completionRate: number;
      tasksCompleted: number;
      tasksMissed: number;
    };
    monthToDate: {
      completionRate: number;
      tasksCompleted: number;
      tasksMissed: number;
    };
  }) {
    return [
      'Progress',
      '',
      'Goals:',
      ...dashboard.goals.map(
        (goal) =>
          `- ${goal.title}: ${goal.healthScore}/100 ${goal.healthStatus}, streak ${goal.currentStreak}`,
      ),
      '',
      `Daily streak: ${dashboard.currentStreaks.dailyCompletion}`,
      `Perfect day streak: ${dashboard.currentStreaks.perfectDay}`,
      '',
      `This week: ${dashboard.recentPerformance.completionRate}% (${dashboard.recentPerformance.tasksCompleted} done, ${dashboard.recentPerformance.tasksMissed} missed)`,
      `This month: ${dashboard.monthToDate.completionRate}% (${dashboard.monthToDate.tasksCompleted} done, ${dashboard.monthToDate.tasksMissed} missed)`,
    ].join('\n');
  }

  help() {
    return [
      'Commands',
      '/start - register and open dashboard',
      '/goal Title | Description | Category | StartDate | TargetDate',
      '/goals - view goals',
      '/routine GoalId | Title | Description | DAILY|WEEKLY|MONTHLY | TargetCount | Minutes',
      '/routines - view routines',
      "/today - view and update today's tasks",
      '/progress - dashboard',
      '/review - latest weekly review',
      '/settings timezone=Asia/Tehran weekStartDay=SATURDAY morning=07:00 evening=21:00 weekly=20:00 monthly=20:00',
    ].join('\n');
  }

  private icon(status: TaskStatus) {
    if (status === TaskStatus.COMPLETED) return '✅';
    if (status === TaskStatus.SKIPPED) return '⏭';
    if (status === TaskStatus.FAILED) return '❌';
    return '☐';
  }
}
