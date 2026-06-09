import { WeekStartDay } from '@prisma/client';

export const WEEK_START_INDEX: Record<WeekStartDay, number> = {
  [WeekStartDay.SUNDAY]: 0,
  [WeekStartDay.MONDAY]: 1,
  [WeekStartDay.TUESDAY]: 2,
  [WeekStartDay.WEDNESDAY]: 3,
  [WeekStartDay.THURSDAY]: 4,
  [WeekStartDay.FRIDAY]: 5,
  [WeekStartDay.SATURDAY]: 6,
};
