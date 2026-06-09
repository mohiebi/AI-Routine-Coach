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
    const name = 'AI Routine Coach';
    if (goals.length === 0) {
      return [
        `Welcome to ${name}!`,
        '',
        'You have no goals yet. Tap *Goals* in the menu below and press *New Goal* to get started.',
      ].join('\n');
    }

    return [
      `${name} — Dashboard`,
      '',
      ...goals.map(
        (g) => `${g.healthStatus} ${g.title} — ${g.healthScore}/100`,
      ),
      '',
      'Use the menu below to navigate.',
    ].join('\n');
  }

  goals(goals: Goal[]) {
    if (goals.length === 0) {
      return 'No goals yet.\n\nTap *New Goal* to create your first goal.';
    }
    return [
      'Your Goals:',
      '',
      ...goals.map(
        (goal, i) =>
          `${i + 1}. ${goal.title}\n   ${goal.healthScore}/100 ${goal.healthStatus}`,
      ),
    ].join('\n');
  }

  routines(routines: (Routine & { goal?: Goal })[]) {
    if (routines.length === 0) {
      return 'No routines yet.\n\nOpen *Goals* and tap a goal to add a routine.';
    }
    return [
      'Your Routines:',
      '',
      ...routines.map(
        (r, i) =>
          `${i + 1}. ${r.title}\n   ${r.frequency} x${r.targetCount} | Streak ${r.currentStreak}\n   Goal: ${r.goal?.title ?? r.goalId}`,
      ),
    ].join('\n');
  }

  tasks(tasks: (DailyTask & { routine: Routine; goal: Goal })[]) {
    if (tasks.length === 0) {
      return 'No tasks for today.\n\nAdd active routines to your goals to see tasks here.';
    }
    return [
      "Today's Tasks:",
      '',
      ...tasks.map((t) => `${this.icon(t.status)} ${t.routine.title}`),
      '',
      'Tap a task button below to mark it.',
    ].join('\n');
  }

  weeklyReview(review: WeeklyReview | null) {
    if (!review) return 'No weekly review available yet.';
    return [
      'Weekly Review',
      '',
      `Completion rate: ${review.completionRate}%`,
      `Tasks completed: ${review.tasksCompleted}`,
      `Tasks missed: ${review.tasksMissed}`,
      `Current streak: ${review.currentStreak}`,
    ].join('\n');
  }

  monthlyReview(review: MonthlyReview) {
    return [
      'Monthly Review',
      '',
      `Completion rate: ${review.overallCompletionRate}%`,
      `Completed: ${review.totalTasksCompleted}`,
      `Missed: ${review.totalTasksMissed}`,
      `Longest streak: ${review.longestStreak}`,
      '',
      'Tap *Add Reflection* below to record your monthly reflection.',
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
      'Progress Dashboard',
      '',
      'Goals:',
      ...dashboard.goals.map(
        (g) =>
          `  ${g.healthStatus} ${g.title} — ${g.healthScore}/100, streak ${g.currentStreak}`,
      ),
      '',
      `Daily streak: ${dashboard.currentStreaks.dailyCompletion} days`,
      `Perfect day streak: ${dashboard.currentStreaks.perfectDay} days`,
      '',
      `This week: ${dashboard.recentPerformance.completionRate}% (${dashboard.recentPerformance.tasksCompleted} done, ${dashboard.recentPerformance.tasksMissed} missed)`,
      `This month: ${dashboard.monthToDate.completionRate}% (${dashboard.monthToDate.tasksCompleted} done, ${dashboard.monthToDate.tasksMissed} missed)`,
    ].join('\n');
  }

  settings(pref: Record<string, unknown>) {
    const tz = (pref?.timezone as string) ?? 'UTC';
    const weekStart = (pref?.weekStartDay as string) ?? 'MONDAY';
    const morning = (pref?.morningReminderTime as string) ?? 'not set';
    const evening = (pref?.eveningCheckInTime as string) ?? 'not set';
    const weekly = (pref?.weeklyReviewTime as string) ?? 'not set';
    const monthly = (pref?.monthlyReviewTime as string) ?? 'not set';

    return [
      'Settings',
      '',
      `Timezone: *${tz}*`,
      `Week starts: *${weekStart}*`,
      `Morning reminder: *${morning}*`,
      `Evening check-in: *${evening}*`,
      `Weekly review: *${weekly}*`,
      `Monthly review: *${monthly}*`,
      '',
      'Tap a button below to change your timezone or week start day.',
    ].join('\n');
  }

  help() {
    return [
      '*AI Routine Coach*',
      '',
      'Use the menu buttons at the bottom of the chat to navigate:',
      '',
      '📋 *Goals* — view goals and add routines',
      '🔄 *Routines* — view all your routines',
      "✅ *Today* — see and complete today's tasks",
      '📊 *Progress* — streaks, rates, and health scores',
      '📝 *Check In* — record notes, obstacles, and wins',
      '📖 *Review* — your latest weekly review',
      '⚙️ *Settings* — timezone and reminder preferences',
      '',
      'Type /cancel at any time to stop the current action.',
    ].join('\n');
  }

  private icon(status: TaskStatus) {
    if (status === TaskStatus.COMPLETED) return '✅';
    if (status === TaskStatus.SKIPPED) return '⏭';
    if (status === TaskStatus.FAILED) return '❌';
    return '☐';
  }
}
