-- CreateEnum
CREATE TYPE "SubscriptionPlan" AS ENUM ('FREE', 'PREMIUM');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'PAST_DUE', 'CANCELED');

-- CreateEnum
CREATE TYPE "AIFeature" AS ENUM ('GOAL_REVIEW', 'GOAL_BREAKDOWN', 'ROUTINE_RECOMMENDATION', 'WEEKLY_COACH', 'MONTHLY_COACH', 'ACCOUNTABILITY_COACH', 'ROUTINE_OPTIMIZATION', 'PROGRESS_INSIGHT');

-- CreateEnum
CREATE TYPE "AIInteractionStatus" AS ENUM ('SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "AIRoutineRecommendationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AIRoutineOptimizationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AICoachRole" AS ENUM ('USER', 'ASSISTANT');

-- CreateTable
CREATE TABLE "UserSubscription" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "plan" "SubscriptionPlan" NOT NULL DEFAULT 'FREE',
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "UserSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIUsageCounter" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "feature" "AIFeature" NOT NULL,
    "monthKey" TEXT NOT NULL,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "limit" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "AIUsageCounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIInteraction" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "feature" "AIFeature" NOT NULL,
    "status" "AIInteractionStatus" NOT NULL,
    "promptSummary" JSONB NOT NULL,
    "response" JSONB,
    "model" TEXT NOT NULL,
    "promptTokens" INTEGER NOT NULL DEFAULT 0,
    "completionTokens" INTEGER NOT NULL DEFAULT 0,
    "estimatedCost" DECIMAL(12,6) NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "AIInteraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIGoalReview" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "goalId" UUID NOT NULL,
    "aiInteractionId" UUID NOT NULL,
    "clarityScore" INTEGER NOT NULL,
    "strengths" JSONB NOT NULL,
    "weaknesses" JSONB NOT NULL,
    "missingElements" JSONB NOT NULL,
    "suggestedVersion" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "AIGoalReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIGoalBreakdown" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "goalId" UUID NOT NULL,
    "aiInteractionId" UUID NOT NULL,
    "milestones" JSONB NOT NULL,
    "phases" JSONB NOT NULL,
    "suggestedTimeline" JSONB NOT NULL,
    "dependencies" JSONB NOT NULL,
    "successIndicators" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "AIGoalBreakdown_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIRoutineRecommendationBatch" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "goalId" UUID NOT NULL,
    "aiInteractionId" UUID NOT NULL,
    "availableHoursPerWeek" INTEGER,
    "recommendations" JSONB NOT NULL,
    "status" "AIRoutineRecommendationStatus" NOT NULL DEFAULT 'PENDING',
    "acceptedRoutineIds" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "AIRoutineRecommendationBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIWeeklyCoaching" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "weeklyReviewId" UUID NOT NULL,
    "aiInteractionId" UUID NOT NULL,
    "wins" JSONB NOT NULL,
    "challenges" JSONB NOT NULL,
    "insights" JSONB NOT NULL,
    "recommendations" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "AIWeeklyCoaching_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIMonthlyCoaching" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "monthlyReviewId" UUID NOT NULL,
    "aiInteractionId" UUID NOT NULL,
    "strengths" JSONB NOT NULL,
    "weaknesses" JSONB NOT NULL,
    "keyLessons" JSONB NOT NULL,
    "nextMonthPriorities" JSONB NOT NULL,
    "recommendedAdjustments" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "AIMonthlyCoaching_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIRoutineOptimization" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "aiInteractionId" UUID NOT NULL,
    "suggestions" JSONB NOT NULL,
    "status" "AIRoutineOptimizationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "AIRoutineOptimization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIProgressInsight" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "aiInteractionId" UUID NOT NULL,
    "summary" TEXT NOT NULL,
    "insights" JSONB NOT NULL,
    "opportunities" JSONB NOT NULL,
    "risks" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "AIProgressInsight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AICoachMessage" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "aiInteractionId" UUID,
    "role" "AICoachRole" NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "AICoachMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserSubscription_userId_key" ON "UserSubscription"("userId");

-- CreateIndex
CREATE INDEX "UserSubscription_plan_status_idx" ON "UserSubscription"("plan", "status");

-- CreateIndex
CREATE INDEX "UserSubscription_deletedAt_idx" ON "UserSubscription"("deletedAt");

-- CreateIndex
CREATE INDEX "AIUsageCounter_userId_monthKey_idx" ON "AIUsageCounter"("userId", "monthKey");

-- CreateIndex
CREATE INDEX "AIUsageCounter_deletedAt_idx" ON "AIUsageCounter"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AIUsageCounter_userId_feature_monthKey_key" ON "AIUsageCounter"("userId", "feature", "monthKey");

-- CreateIndex
CREATE INDEX "AIInteraction_userId_feature_createdAt_idx" ON "AIInteraction"("userId", "feature", "createdAt");

-- CreateIndex
CREATE INDEX "AIInteraction_status_createdAt_idx" ON "AIInteraction"("status", "createdAt");

-- CreateIndex
CREATE INDEX "AIInteraction_deletedAt_idx" ON "AIInteraction"("deletedAt");

-- CreateIndex
CREATE INDEX "AIGoalReview_userId_goalId_createdAt_idx" ON "AIGoalReview"("userId", "goalId", "createdAt");

-- CreateIndex
CREATE INDEX "AIGoalReview_deletedAt_idx" ON "AIGoalReview"("deletedAt");

-- CreateIndex
CREATE INDEX "AIGoalBreakdown_userId_goalId_createdAt_idx" ON "AIGoalBreakdown"("userId", "goalId", "createdAt");

-- CreateIndex
CREATE INDEX "AIGoalBreakdown_deletedAt_idx" ON "AIGoalBreakdown"("deletedAt");

-- CreateIndex
CREATE INDEX "AIRoutineRecommendationBatch_userId_goalId_status_idx" ON "AIRoutineRecommendationBatch"("userId", "goalId", "status");

-- CreateIndex
CREATE INDEX "AIRoutineRecommendationBatch_deletedAt_idx" ON "AIRoutineRecommendationBatch"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AIWeeklyCoaching_weeklyReviewId_key" ON "AIWeeklyCoaching"("weeklyReviewId");

-- CreateIndex
CREATE INDEX "AIWeeklyCoaching_userId_createdAt_idx" ON "AIWeeklyCoaching"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AIWeeklyCoaching_deletedAt_idx" ON "AIWeeklyCoaching"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AIMonthlyCoaching_monthlyReviewId_key" ON "AIMonthlyCoaching"("monthlyReviewId");

-- CreateIndex
CREATE INDEX "AIMonthlyCoaching_userId_createdAt_idx" ON "AIMonthlyCoaching"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AIMonthlyCoaching_deletedAt_idx" ON "AIMonthlyCoaching"("deletedAt");

-- CreateIndex
CREATE INDEX "AIRoutineOptimization_userId_createdAt_idx" ON "AIRoutineOptimization"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AIRoutineOptimization_deletedAt_idx" ON "AIRoutineOptimization"("deletedAt");

-- CreateIndex
CREATE INDEX "AIProgressInsight_userId_createdAt_idx" ON "AIProgressInsight"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AIProgressInsight_deletedAt_idx" ON "AIProgressInsight"("deletedAt");

-- CreateIndex
CREATE INDEX "AICoachMessage_userId_createdAt_idx" ON "AICoachMessage"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AICoachMessage_deletedAt_idx" ON "AICoachMessage"("deletedAt");

-- AddForeignKey
ALTER TABLE "UserSubscription" ADD CONSTRAINT "UserSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIUsageCounter" ADD CONSTRAINT "AIUsageCounter_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIInteraction" ADD CONSTRAINT "AIInteraction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIGoalReview" ADD CONSTRAINT "AIGoalReview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIGoalReview" ADD CONSTRAINT "AIGoalReview_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIGoalReview" ADD CONSTRAINT "AIGoalReview_aiInteractionId_fkey" FOREIGN KEY ("aiInteractionId") REFERENCES "AIInteraction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIGoalBreakdown" ADD CONSTRAINT "AIGoalBreakdown_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIGoalBreakdown" ADD CONSTRAINT "AIGoalBreakdown_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIGoalBreakdown" ADD CONSTRAINT "AIGoalBreakdown_aiInteractionId_fkey" FOREIGN KEY ("aiInteractionId") REFERENCES "AIInteraction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIRoutineRecommendationBatch" ADD CONSTRAINT "AIRoutineRecommendationBatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIRoutineRecommendationBatch" ADD CONSTRAINT "AIRoutineRecommendationBatch_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIRoutineRecommendationBatch" ADD CONSTRAINT "AIRoutineRecommendationBatch_aiInteractionId_fkey" FOREIGN KEY ("aiInteractionId") REFERENCES "AIInteraction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIWeeklyCoaching" ADD CONSTRAINT "AIWeeklyCoaching_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIWeeklyCoaching" ADD CONSTRAINT "AIWeeklyCoaching_weeklyReviewId_fkey" FOREIGN KEY ("weeklyReviewId") REFERENCES "WeeklyReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIWeeklyCoaching" ADD CONSTRAINT "AIWeeklyCoaching_aiInteractionId_fkey" FOREIGN KEY ("aiInteractionId") REFERENCES "AIInteraction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIMonthlyCoaching" ADD CONSTRAINT "AIMonthlyCoaching_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIMonthlyCoaching" ADD CONSTRAINT "AIMonthlyCoaching_monthlyReviewId_fkey" FOREIGN KEY ("monthlyReviewId") REFERENCES "MonthlyReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIMonthlyCoaching" ADD CONSTRAINT "AIMonthlyCoaching_aiInteractionId_fkey" FOREIGN KEY ("aiInteractionId") REFERENCES "AIInteraction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIRoutineOptimization" ADD CONSTRAINT "AIRoutineOptimization_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIRoutineOptimization" ADD CONSTRAINT "AIRoutineOptimization_aiInteractionId_fkey" FOREIGN KEY ("aiInteractionId") REFERENCES "AIInteraction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIProgressInsight" ADD CONSTRAINT "AIProgressInsight_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIProgressInsight" ADD CONSTRAINT "AIProgressInsight_aiInteractionId_fkey" FOREIGN KEY ("aiInteractionId") REFERENCES "AIInteraction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AICoachMessage" ADD CONSTRAINT "AICoachMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AICoachMessage" ADD CONSTRAINT "AICoachMessage_aiInteractionId_fkey" FOREIGN KEY ("aiInteractionId") REFERENCES "AIInteraction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
