import type { TimeEntry } from '../types';

/** True when this list row is the currently running timer. */
export function isActiveTimerEntry(
  entry: Pick<TimeEntry, 'id' | 'ended_at'>,
  activeEntry: Pick<TimeEntry, 'id'> | null,
  isRunning: boolean,
): boolean {
  if (!isRunning || !activeEntry) return false;
  if (entry.ended_at) return false;
  return entry.id === activeEntry.id;
}

/** Seconds to show for an entry — live `elapsed` while that timer is running. */
export function entryDisplaySeconds(
  entry: Pick<TimeEntry, 'id' | 'ended_at' | 'duration_seconds' | 'started_at'>,
  activeEntry: Pick<TimeEntry, 'id'> | null,
  elapsed: number,
  isRunning: boolean,
): number {
  if (isActiveTimerEntry(entry, activeEntry, isRunning)) {
    return Math.max(0, elapsed);
  }
  return resolvedDurationSeconds(entry);
}

/**
 * Prefer stored duration; if missing/zero but start+end exist and no pause accounting,
 * derive from timestamps (legacy / bad-write rows).
 */
export function resolvedDurationSeconds(
  entry: Pick<TimeEntry, 'duration_seconds' | 'started_at' | 'ended_at'> & {
    paused_duration_seconds?: number;
  },
): number {
  const stored = Math.max(0, entry.duration_seconds || 0);
  if (stored > 0) return stored;
  if ((entry.paused_duration_seconds ?? 0) > 0) return 0;
  if (!entry.ended_at || !entry.started_at) return 0;

  const start = Date.parse(
    entry.started_at.includes('T') ? entry.started_at : entry.started_at.replace(' ', 'T') + 'Z',
  );
  const end = Date.parse(
    entry.ended_at.includes('T') ? entry.ended_at : entry.ended_at.replace(' ', 'T') + 'Z',
  );
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return 0;
  return Math.floor((end - start) / 1000);
}

/** `1h 13m` style (stopped / summaries). */
export function formatDurationHm(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${m}m`;
}

/** `01:13:17` style (live running timer, Trackabi-like). */
export function formatDurationHms(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map((n) => String(n).padStart(2, '0')).join(':');
}

/** Local calendar date key `YYYY-MM-DD` for matching timesheet day rows. */
export function localDateKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function entryLocalDateKey(entry: Pick<TimeEntry, 'started_at' | 'started_at_local'>): string {
  const raw = entry.started_at_local || entry.started_at;
  if (!raw) return localDateKey();
  // Prefer date portion when API already sent local datetime
  if (/^\d{4}-\d{2}-\d{2}/.test(raw) && !raw.includes('Z') && !raw.includes('+')) {
    return raw.slice(0, 10);
  }
  const parsed = new Date(raw.includes('T') ? raw : raw.replace(' ', 'T') + 'Z');
  if (Number.isNaN(parsed.getTime())) return localDateKey();
  return localDateKey(parsed);
}
