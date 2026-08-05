import { localDateKey } from './liveTimer';

export function getWeekStartDate(weekOffset = 0): Date {
  const start = new Date();
  const day = start.getDay();
  const diff = start.getDate() - day + (day === 0 ? -6 : 1);
  start.setDate(diff + weekOffset * 7);
  start.setHours(0, 0, 0, 0);
  return start;
}

export function getWeekDateKeysFromStart(weekStart: Date): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return localDateKey(d);
  });
}
