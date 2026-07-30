import type { HourlyTimelineData } from '../../types';
import { localDateKey } from '../../utils/liveTimer';

export function shiftDateKey(dateKey: string, deltaDays: number): string {
  const d = new Date(`${dateKey}T12:00:00`);
  d.setDate(d.getDate() + deltaDays);
  return localDateKey(d);
}

export function formatClockShort(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}:${String(m).padStart(2, '0')}`;
}

export function computeActivityPct(loggedSeconds: number, timeline: HourlyTimelineData | null): number {
  if (!timeline || loggedSeconds <= 0) return 0;
  const activitySeconds = timeline.summary.productive_seconds + timeline.summary.unproductive_seconds;
  return Math.min(100, Math.round((activitySeconds / loggedSeconds) * 100));
}
