import { Injectable } from '@nestjs/common';
import {
  AIGoalBreakdown,
  AIGoalReview,
  AIProgressInsight,
  AIRoutineOptimization,
  AIWeeklyCoaching,
  CheckoutSession,
  Coupon,
  DailyTask,
  Goal,
  MonthlyReview,
  Routine,
  SubscriptionPlan,
  TaskStatus,
  WeeklyReview,
} from '@prisma/client';
import { formatUsd } from '../payments/decimal-money';
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
    isPremium = false,
  ) {
    const name = 'AI Routine Coach';
    const header = isPremium ? ['👑 *Premium Member*', ''] : [];
    if (goals.length === 0) {
      return [
        ...header,
        `Welcome to ${name}!`,
        '',
        'You have no goals yet. Tap *Goals* in the menu below and press *New Goal* to get started.',
      ].join('\n');
    }

    return [
      ...header,
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

  /** Upgrade pitch shown to free users, with live plan pricing. */
  premiumPitch(plans: SubscriptionPlan[]) {
    const lines = [
      '⭐ *Unlock AI Routine Coach Premium*',
      '',
      'Your AI coach helps you set sharper goals, build a clear roadmap, and stay accountable every week:',
      '',
      '🤖 *AI Goal Review* — clarity score + suggested improvements',
      '🗺 *AI Roadmap* — milestones and phased breakdown',
      '💡 *Routine Suggestions* — a personalised weekly plan',
      '📊 *Progress Insights* — patterns, risks, and opportunities',
      '📖 *Weekly Coaching* — wins, challenges and action items',
      '🔧 *Routine Optimiser* — trim & improve your schedule',
      '💬 *AI Accountability Coach* — chat anytime',
    ];

    if (plans.length > 0) {
      const best = this.bestValuePlan(plans);
      lines.push('', '*Plans:*');
      for (const plan of plans) {
        const perMonth = Number(plan.priceUsd) / (plan.durationDays / 30);
        const badge = best && plan.id === best.id ? ' 🔥 _Best value_' : '';
        lines.push(
          `• *${plan.name}* — ${formatUsd(plan.priceUsd)} / ${plan.durationDays} days (~${formatUsd(perMonth)}/mo)${badge}`,
        );
      }
    }

    lines.push(
      '',
      'Tap a plan below to continue. You can apply a coupon or pay with crypto on the next screen.',
    );
    return lines.join('\n');
  }

  /** Returns the plan with the lowest effective monthly cost, if more than one plan exists. */
  private bestValuePlan(plans: SubscriptionPlan[]): SubscriptionPlan | undefined {
    if (plans.length < 2) return undefined;
    return plans.reduce((best, plan) => {
      const perMonth = Number(plan.priceUsd) / (plan.durationDays / 30);
      const bestPerMonth = Number(best.priceUsd) / (best.durationDays / 30);
      return perMonth < bestPerMonth ? plan : best;
    });
  }

  /** Active-member screen with days remaining and quick AI links. */
  premiumActive(expiresAt: Date) {
    const daysRemaining = Math.max(
      0,
      Math.ceil((expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)),
    );
    return [
      '👑 *You are a Premium member!*',
      '',
      `Your access is active for *${daysRemaining} more day${daysRemaining === 1 ? '' : 's'}* (until ${expiresAt.toISOString().slice(0, 10)}).`,
      '',
      '*Your AI toolkit:*',
      '🤖 AI Goal Review & Roadmap — open any goal in 📋 Goals',
      '💡 Routine Suggestions — open any goal in 📋 Goals',
      '🔧 Routine Optimiser — open 🔄 Routines',
      '📊 Progress Insights — open 📊 Progress',
      '📖 Weekly Coaching — open 📖 Review',
      '💬 AI Accountability Coach — tap a button below',
    ].join('\n');
  }

  /** Celebration screen shown right after a coupon or crypto payment activates Premium. */
  premiumActivated(expiresAt?: Date) {
    const lines = [
      '🎉 *Premium Activated!*',
      '',
      'Welcome to AI Routine Coach Premium.',
    ];
    if (expiresAt) {
      lines.push(`Active until *${expiresAt.toISOString().slice(0, 10)}*.`);
    }
    lines.push(
      '',
      'All AI features are now available:',
      '• Tap any goal to see AI Review and Roadmap',
      '• Tap 📊 Progress → AI Insights',
      '• Tap 📖 Review → AI Weekly Coaching',
      '• Tap 🔄 Routines → AI Optimise',
      '• Tap *Open AI Coach* below to start chatting',
    );
    return lines.join('\n');
  }

  /** Checkout summary with coupon savings and an expiry countdown. */
  checkoutSummary(
    checkout: CheckoutSession & { plan: SubscriptionPlan; coupon?: Coupon | null },
  ) {
    const lines = [`🧾 *${checkout.plan.name}*`, ''];

    if (checkout.coupon && checkout.discountAmountUsd.greaterThan(0)) {
      lines.push(`Price: ${formatUsd(checkout.originalAmountUsd)}`);
      lines.push(
        `Coupon *${checkout.coupon.code}*: -${formatUsd(checkout.discountAmountUsd)} (-${checkout.coupon.discountPercent}%)`,
      );
      lines.push(`*You pay: ${formatUsd(checkout.finalAmountUsd)}*`);
    } else {
      lines.push(`*Price: ${formatUsd(checkout.originalAmountUsd)}*`);
    }

    if (checkout.finalAmountUsd.equals(0)) {
      lines.push('', '✅ Fully covered by your coupon — Premium is now active!');
    } else {
      const minutesLeft = Math.max(
        0,
        Math.round((checkout.expiresAt.getTime() - Date.now()) / 60000),
      );
      lines.push('', `⏳ This checkout expires in ${minutesLeft} min.`);
    }

    return lines.join('\n');
  }

  /** Shown when a submitted crypto payment could not be verified yet. */
  paymentVerificationFailed(reason: string) {
    return [
      '⚠️ *Payment not verified yet*',
      '',
      reason,
      '',
      'If you just sent the payment, on-chain confirmations can take a few minutes.',
      'Tap *Check Again* to re-check the blockchain, or *Resubmit Tx Hash* if you pasted the wrong transaction.',
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
