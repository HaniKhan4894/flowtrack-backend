import { useEffect, useMemo, useState } from 'react';
import { timeService } from '../api/timeService';
import { entryDisplaySeconds, localDateKey } from '../utils/liveTimer';
import type { TimeEntry } from '../types';
import { getWeekDateKeysFromStart, getWeekStartDate } from '../utils/trackerWeek';

export function entryLocalDate(entry: TimeEntry): string {
  const raw = entry.started_at_local ?? entry.started_at;
  if (!raw) return '';
  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return '';
  return localDateKey(d);
}

export function sumEntriesSecondsByDate(
  entries: TimeEntry[],
  activeEntry: TimeEntry | null,
  elapsed: number,
  isRunning: boolean,
): Record<string, number> {
  const sums: Record<string, number> = {};
  for (const entry of entries) {
    const dateKey = entryLocalDate(entry);
    if (!dateKey) continue;
    sums[dateKey] = (sums[dateKey] || 0) + entryDisplaySeconds(entry, activeEntry, elapsed, isRunning);
  }
  return sums;
}

export function useWeekEntryTotals(
  weekOffset: number,
  refreshToken: number,
  activeEntry: TimeEntry | null,
  isRunning: boolean,
  elapsed: number,
) {
  const weekStart = useMemo(() => getWeekStartDate(weekOffset), [weekOffset]);
  const weekKeys = useMemo(() => getWeekDateKeysFromStart(weekStart), [weekStart]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);

  useEffect(() => {
    if (weekKeys.length === 0) return;
    let cancelled = false;
    const start = weekKeys[0];
    const end = weekKeys[weekKeys.length - 1];

    void timeService.getAll({
      start_date: `${start} 00:00:00`,
      end_date: `${end} 23:59:59`,
      per_page: 500,
    }).then((resp) => {
      if (!cancelled) setEntries((resp.data ?? []) as TimeEntry[]);
    }).catch(() => {
      if (!cancelled) setEntries([]);
    });

    return () => {
      cancelled = true;
    };
  }, [weekKeys, refreshToken, activeEntry?.id]);

  const sumsByDate = useMemo(
    () => sumEntriesSecondsByDate(entries, activeEntry, elapsed, isRunning),
    [entries, activeEntry, elapsed, isRunning],
  );

  return { weekKeys, sumsByDate, entries };
}
