import { Injectable } from '@nestjs/common';
import {
  AIGoalBreakdown,
  AIGoalReview,
  AIProgressInsight,
  AIRoutineOptimization,
  AIWeeklyCoaching,
  DailyTask,
  Goal,
  MonthlyReview,
  Routine,
  TaskStatus,
  WeeklyReview,
} from '@prisma/client';
// Local looser type so JSON-parsed recs (frequency: string) are accepted
interface RoutineRecItem {
  title: string;
  description: string;
  frequency: string;
  targetCount: number;
  estimatedDuration: number;
  whyItMatters: string;
}

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

  // ── Premium screens ─────────────────────────────────────────────────────────

  premiumUpgrade() {
    return [
      '⭐ *Upgrade to Premium*',
      '',
      'Unlock AI-powered coaching to supercharge your goals:',
      '',
      '🤖 *AI Goal Review* — clarity score + suggested improvements',
      '🗺 *AI Roadmap* — milestones and phased breakdown',
      '💡 *Routine Suggestions* — personalised weekly plan',
      '📊 *Progress Insights* — patterns, risks, and opportunities',
      '📖 *Weekly Coaching* — wins, challenges and action items',
      '🔧 *Routine Optimiser* — trim & improve your schedule',
      '💬 *AI Accountability Coach* — chat anytime',
      '',
      'Enter your coupon code below to activate Premium for free.',
    ].join('\n');
  }

  premiumActive() {
    return [
      '⭐ *You are on Premium!*',
      '',
      'All AI features are unlocked. Enjoy your coaching experience.',
      '',
      'Use the buttons on Goals, Routines, and Progress screens to access AI tools,',
      'or tap *Open AI Coach* to chat directly.',
    ].join('\n');
  }

  premiumActivated() {
    return [
      '🎉 *Premium Activated!*',
      '',
      'Welcome to AI Routine Coach Premium.',
      '',
      'All AI features are now available:',
      '• Tap any goal to see AI Review and Roadmap',
      '• Tap 📊 Progress → AI Insights',
      '• Tap 📖 Review → AI Weekly Coaching',
      '• Tap 🔄 Routines → AI Optimise',
      '• Tap *Open AI Coach* below to start chatting',
    ].join('\n');
  }

  // ── AI output formatters ─────────────────────────────────────────────────

  aiGoalReview(review: AIGoalReview) {
    const strengths = this.bullets(review.strengths as string[]);
    const weaknesses = this.bullets(review.weaknesses as string[]);
    const missing = this.bullets(review.missingElements as string[]);
    return [
      '🤖 *AI Goal Review*',
      '',
      `*Clarity Score:* ${review.clarityScore}/100`,
      '',
      '*Strengths:*',
      strengths,
      '',
      '*Areas to Improve:*',
      weaknesses,
      '',
      '*Missing Elements:*',
      missing,
      '',
      '*Suggested Version:*',
      `_"${review.suggestedVersion}"_`,
    ].join('\n');
  }

  aiBreakdown(breakdown: AIGoalBreakdown) {
    const milestones = this.numbered(breakdown.milestones as string[]);
    const phases = this.numbered(breakdown.phases as string[]);
    const timeline = this.bullets(breakdown.suggestedTimeline as string[]);
    const indicators = this.bullets(breakdown.successIndicators as string[]);
    return [
      '🗺 *AI Goal Roadmap*',
      '',
      '*Milestones:*',
      milestones,
      '',
      '*Phases:*',
      phases,
      '',
      '*Suggested Timeline:*',
      timeline,
      '',
      '*Success Indicators:*',
      indicators,
    ].join('\n');
  }

  aiRoutineRecommendations(recs: RoutineRecItem[]) {
    if (recs.length === 0) return '💡 No routine suggestions generated.';
    const items = recs
      .map(
        (r, i) =>
          `${i + 1}. *${r.title}*\n   ${r.frequency} × ${r.targetCount} — ${r.estimatedDuration} min\n   _${r.whyItMatters}_`,
      )
      .join('\n\n');
    return ['💡 *AI Routine Suggestions*', '', items, '', 'Tap a button below to add one or all at once.'].join('\n');
  }

  aiWeeklyCoach(coaching: AIWeeklyCoaching) {
    return [
      '📖 *AI Weekly Coaching*',
      '',
      '*Wins:*',
      this.bullets(coaching.wins as string[]),
      '',
      '*Challenges:*',
      this.bullets(coaching.challenges as string[]),
      '',
      '*Insights:*',
      this.bullets(coaching.insights as string[]),
      '',
      '*Recommendations:*',
      this.bullets(coaching.recommendations as string[]),
    ].join('\n');
  }

  aiProgressInsights(insight: AIProgressInsight) {
    return [
      '📊 *AI Progress Insights*',
      '',
      insight.summary,
      '',
      '*Key Insights:*',
      this.bullets(insight.insights as string[]),
      '',
      '*Opportunities:*',
      this.bullets(insight.opportunities as string[]),
      '',
      '*Risks:*',
      this.bullets(insight.risks as string[]),
    ].join('\n');
  }

  aiOptimize(result: AIRoutineOptimization) {
    const suggestions = result.suggestions as Array<{
      action: string; routineTitle?: string; suggestion: string; reason: string;
    }>;
    if (suggestions.length === 0) return '🔧 Your routines look great — no optimisations needed right now!';
    const items = suggestions
      .map(
        (s) =>
          `• *${s.action}*${s.routineTitle ? ` — ${s.routineTitle}` : ''}\n  ${s.suggestion}\n  _${s.reason}_`,
      )
      .join('\n\n');
    return ['🔧 *AI Routine Optimisation*', '', items].join('\n');
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private bullets(items: string[]) {
    return items.map((i) => `• ${i}`).join('\n');
  }

  private numbered(items: string[]) {
    return items.map((item, i) => `${i + 1}. ${item}`).join('\n');
  }

  private icon(status: TaskStatus) {
    if (status === TaskStatus.COMPLETED) return '✅';
    if (status === TaskStatus.SKIPPED) return '⏭';
    if (status === TaskStatus.FAILED) return '❌';
    return '☐';
  }
}
