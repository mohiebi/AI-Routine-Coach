import { WeekStartDay } from '@prisma/client';
import { WEEK_START_INDEX } from './week-start-day.map';

const isoDateTimeFormat = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

export function localParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? '00';

  return {
    year: Number(value('year')),
    month: Number(value('month')),
    day: Number(value('day')),
    hour: Number(value('hour')),
    minute: Number(value('minute')),
    second: Number(value('second')),
    date: `${value('year')}-${value('month')}-${value('day')}`,
    time: `${value('hour')}:${value('minute')}`,
  };
}

export function dateOnlyUtc(localDate: string) {
  return new Date(`${localDate}T00:00:00.000Z`);
}

export function todayInTimezone(timezone: string, now = new Date()) {
  return dateOnlyUtc(localParts(now, timezone).date);
}

export function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

export function toDateKey(date: Date) {
  return isoDateTimeFormat.format(date).slice(0, 10);
}

export function getWeekRange(date: Date, weekStartDay: WeekStartDay) {
  const dayIndex = date.getUTCDay();
  const weekStartIndex = WEEK_START_INDEX[weekStartDay];
  const diff = (dayIndex - weekStartIndex + 7) % 7;
  const start = addDays(date, -diff);
  const end = addDays(start, 6);
  return { start, end };
}

export function getMonthRange(date: Date) {
  const start = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1),
  );
  const end = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  );
  return { start, end };
}

export function daysInclusive(start: Date, end: Date) {
  return Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
}

export function isSameDate(a: Date, b: Date) {
  return toDateKey(a) === toDateKey(b);
}

export function isLastDayOfMonth(date: Date) {
  return addDays(date, 1).getUTCDate() === 1;
}
