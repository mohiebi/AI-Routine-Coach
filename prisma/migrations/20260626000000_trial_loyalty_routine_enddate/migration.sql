-- Add TRIAL to PremiumSource enum
ALTER TYPE "PremiumSource" ADD VALUE IF NOT EXISTS 'TRIAL';

-- Add TRIAL_ENDING_REMINDER to NotificationType enum
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'TRIAL_ENDING_REMINDER';

-- Add optional end date to Routine (null = lifetime routine)
ALTER TABLE "Routine" ADD COLUMN IF NOT EXISTS "endDate" TIMESTAMP(3);
