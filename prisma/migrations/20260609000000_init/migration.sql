-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "WeekStartDay" AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY');

-- CreateEnum
CREATE TYPE "GoalStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "GoalHealthStatus" AS ENUM ('OFF_TRACK', 'AT_RISK', 'ON_TRACK', 'EXCELLENT');

-- CreateEnum
CREATE TYPE "RoutineFrequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('PENDING', 'COMPLETED', 'SKIPPED', 'FAILED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('MORNING_REMINDER', 'EVENING_CHECK_IN', 'WEEKLY_REVIEW', 'MONTHLY_REVIEW', 'DAILY_TASK_GENERATION');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "telegramId" BIGINT NOT NULL,
    "username" TEXT,
    "firstName" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "dailyCompletionStreak" INTEGER NOT NULL DEFAULT 0,
    "bestDailyCompletionStreak" INTEGER NOT NULL DEFAULT 0,
    "perfectDayStreak" INTEGER NOT NULL DEFAULT 0,
    "bestPerfectDayStreak" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPreference" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "weekStartDay" "WeekStartDay" NOT NULL DEFAULT 'MONDAY',
    "morningReminderTime" TEXT NOT NULL DEFAULT '07:00',
    "eveningCheckInTime" TEXT NOT NULL DEFAULT '21:00',
    "weeklyReviewTime" TEXT NOT NULL DEFAULT '20:00',
    "monthlyReviewTime" TEXT NOT NULL DEFAULT '20:00',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "UserPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Goal" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "targetDate" TIMESTAMP(3),
    "status" "GoalStatus" NOT NULL DEFAULT 'ACTIVE',
    "healthScore" INTEGER NOT NULL DEFAULT 0,
    "healthStatus" "GoalHealthStatus" NOT NULL DEFAULT 'OFF_TRACK',
    "currentStreak" INTEGER NOT NULL DEFAULT 0,
    "bestStreak" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Goal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Routine" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "goalId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "frequency" "RoutineFrequency" NOT NULL,
    "targetCount" INTEGER NOT NULL,
    "estimatedDuration" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "currentStreak" INTEGER NOT NULL DEFAULT 0,
    "bestStreak" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Routine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoutineSchedule" (
    "id" UUID NOT NULL,
    "routineId" UUID NOT NULL,
    "frequency" "RoutineFrequency" NOT NULL,
    "targetCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "RoutineSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyTask" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "goalId" UUID NOT NULL,
    "routineId" UUID NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'PENDING',
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "DailyTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskCompletion" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "dailyTaskId" UUID NOT NULL,
    "status" "TaskStatus" NOT NULL,
    "note" TEXT,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "TaskCompletion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyCheckIn" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "obstacles" TEXT,
    "wins" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "DailyCheckIn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyReview" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "goalId" UUID,
    "weekStartDate" TIMESTAMP(3) NOT NULL,
    "weekEndDate" TIMESTAMP(3) NOT NULL,
    "completionRate" DOUBLE PRECISION NOT NULL,
    "tasksCompleted" INTEGER NOT NULL,
    "tasksMissed" INTEGER NOT NULL,
    "bestRoutineId" TEXT,
    "worstRoutineId" TEXT,
    "currentStreak" INTEGER NOT NULL,
    "goalHealthScores" JSONB NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "WeeklyReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonthlyReview" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "goalId" UUID,
    "monthStartDate" TIMESTAMP(3) NOT NULL,
    "monthEndDate" TIMESTAMP(3) NOT NULL,
    "overallCompletionRate" DOUBLE PRECISION NOT NULL,
    "totalTasksCompleted" INTEGER NOT NULL,
    "totalTasksMissed" INTEGER NOT NULL,
    "bestRoutineId" TEXT,
    "worstRoutineId" TEXT,
    "longestStreak" INTEGER NOT NULL,
    "goalProgress" JSONB NOT NULL,
    "goalHealthTrends" JSONB NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "MonthlyReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonthlyReflection" (
    "id" UUID NOT NULL,
    "monthlyReviewId" UUID NOT NULL,
    "wentWell" TEXT,
    "heldBack" TEXT,
    "nextFocus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "MonthlyReflection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationLog" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_telegramId_key" ON "User"("telegramId");

-- CreateIndex
CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserPreference_userId_key" ON "UserPreference"("userId");

-- CreateIndex
CREATE INDEX "UserPreference_timezone_idx" ON "UserPreference"("timezone");

-- CreateIndex
CREATE INDEX "UserPreference_deletedAt_idx" ON "UserPreference"("deletedAt");

-- CreateIndex
CREATE INDEX "Goal_userId_status_idx" ON "Goal"("userId", "status");

-- CreateIndex
CREATE INDEX "Goal_deletedAt_idx" ON "Goal"("deletedAt");

-- CreateIndex
CREATE INDEX "Routine_userId_isActive_idx" ON "Routine"("userId", "isActive");

-- CreateIndex
CREATE INDEX "Routine_goalId_isActive_idx" ON "Routine"("goalId", "isActive");

-- CreateIndex
CREATE INDEX "Routine_deletedAt_idx" ON "Routine"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RoutineSchedule_routineId_key" ON "RoutineSchedule"("routineId");

-- CreateIndex
CREATE INDEX "RoutineSchedule_deletedAt_idx" ON "RoutineSchedule"("deletedAt");

-- CreateIndex
CREATE INDEX "DailyTask_userId_date_idx" ON "DailyTask"("userId", "date");

-- CreateIndex
CREATE INDEX "DailyTask_goalId_date_idx" ON "DailyTask"("goalId", "date");

-- CreateIndex
CREATE INDEX "DailyTask_routineId_status_idx" ON "DailyTask"("routineId", "status");

-- CreateIndex
CREATE INDEX "DailyTask_deletedAt_idx" ON "DailyTask"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DailyTask_routineId_date_key" ON "DailyTask"("routineId", "date");

-- CreateIndex
CREATE INDEX "TaskCompletion_userId_completedAt_idx" ON "TaskCompletion"("userId", "completedAt");

-- CreateIndex
CREATE INDEX "TaskCompletion_dailyTaskId_idx" ON "TaskCompletion"("dailyTaskId");

-- CreateIndex
CREATE INDEX "TaskCompletion_deletedAt_idx" ON "TaskCompletion"("deletedAt");

-- CreateIndex
CREATE INDEX "DailyCheckIn_deletedAt_idx" ON "DailyCheckIn"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DailyCheckIn_userId_date_key" ON "DailyCheckIn"("userId", "date");

-- CreateIndex
CREATE INDEX "WeeklyReview_userId_weekEndDate_idx" ON "WeeklyReview"("userId", "weekEndDate");

-- CreateIndex
CREATE INDEX "WeeklyReview_deletedAt_idx" ON "WeeklyReview"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyReview_userId_weekStartDate_key" ON "WeeklyReview"("userId", "weekStartDate");

-- CreateIndex
CREATE INDEX "MonthlyReview_userId_monthEndDate_idx" ON "MonthlyReview"("userId", "monthEndDate");

-- CreateIndex
CREATE INDEX "MonthlyReview_deletedAt_idx" ON "MonthlyReview"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyReview_userId_monthStartDate_key" ON "MonthlyReview"("userId", "monthStartDate");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyReflection_monthlyReviewId_key" ON "MonthlyReflection"("monthlyReviewId");

-- CreateIndex
CREATE INDEX "MonthlyReflection_deletedAt_idx" ON "MonthlyReflection"("deletedAt");

-- CreateIndex
CREATE INDEX "NotificationLog_userId_type_sentAt_idx" ON "NotificationLog"("userId", "type", "sentAt");

-- CreateIndex
CREATE INDEX "NotificationLog_deletedAt_idx" ON "NotificationLog"("deletedAt");

-- AddForeignKey
ALTER TABLE "UserPreference" ADD CONSTRAINT "UserPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Routine" ADD CONSTRAINT "Routine_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Routine" ADD CONSTRAINT "Routine_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutineSchedule" ADD CONSTRAINT "RoutineSchedule_routineId_fkey" FOREIGN KEY ("routineId") REFERENCES "Routine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyTask" ADD CONSTRAINT "DailyTask_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyTask" ADD CONSTRAINT "DailyTask_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyTask" ADD CONSTRAINT "DailyTask_routineId_fkey" FOREIGN KEY ("routineId") REFERENCES "Routine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskCompletion" ADD CONSTRAINT "TaskCompletion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskCompletion" ADD CONSTRAINT "TaskCompletion_dailyTaskId_fkey" FOREIGN KEY ("dailyTaskId") REFERENCES "DailyTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyCheckIn" ADD CONSTRAINT "DailyCheckIn_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyReview" ADD CONSTRAINT "WeeklyReview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyReview" ADD CONSTRAINT "WeeklyReview_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyReview" ADD CONSTRAINT "MonthlyReview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyReview" ADD CONSTRAINT "MonthlyReview_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyReflection" ADD CONSTRAINT "MonthlyReflection_monthlyReviewId_fkey" FOREIGN KEY ("monthlyReviewId") REFERENCES "MonthlyReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
