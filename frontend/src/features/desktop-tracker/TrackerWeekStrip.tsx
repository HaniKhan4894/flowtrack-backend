import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { reportService, type HoursCalendarDay } from '../../api/reportService';
import { localDateKey } from '../../utils/liveTimer';
import { cn } from '../../lib/cn';
import { formatClockShort } from './trackerMetrics';

const DAILY_GOAL_SECONDS = 8 * 3600;

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

function dayShortLabel(dateKey: string): string {
  const d = new Date(`${dateKey}T12:00:00`);
  return d.toLocaleDateString(undefined, { weekday: 'short' });
}

function dayNumOnly(dateKey: string): string {
  const d = new Date(`${dateKey}T12:00:00`);
  return String(d.getDate());
}

function weekRangeLabel(weekKeys: string[]): string {
  if (weekKeys.length === 0) return '';
  const start = new Date(`${weekKeys[0]}T12:00:00`);
  const end = new Date(`${weekKeys[weekKeys.length - 1]}T12:00:00`);
  const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `${fmt(start)} – ${fmt(end)}`;
}

function dayProgressPercent(seconds: number): number {
  return Math.min(100, Math.round((seconds / DAILY_GOAL_SECONDS) * 100));
}

function progressBarClass(pct: number): string {
  if (pct <= 0) return 'bg-slate-500/45';
  if (pct < 25) return 'bg-rose-500';
  if (pct < 50) return 'bg-amber-500';
  if (pct < 75) return 'bg-sky-500';
  if (pct < 100) return 'bg-emerald-500';
  return 'bg-emerald-400';
}

function progressHoursClass(pct: number, isSelected: boolean): string {
  if (pct <= 0) return 'text-slate-600';
  if (isSelected) return 'text-slate-200';
  if (pct < 25) return 'text-rose-400/90';
  if (pct < 50) return 'text-amber-400/90';
  if (pct < 75) return 'text-sky-400/90';
  return 'text-emerald-400/90';
}

interface Props {
  weekOffset: number;
  onWeekOffsetChange: (offset: number) => void;
  selectedDate: string;
  onSelectDate: (dateKey: string) => void;
  liveTodaySeconds?: number;
  compact?: boolean;
}

export function TrackerWeekStrip({
  weekOffset,
  onWeekOffsetChange,
  selectedDate,
  onSelectDate,
  liveTodaySeconds = 0,
  compact = false,
}: Props) {
  const weekStart = useMemo(() => getWeekStartDate(weekOffset), [weekOffset]);
  const weekKeys = useMemo(() => getWeekDateKeysFromStart(weekStart), [weekStart]);
  const [dayMap, setDayMap] = useState<Record<string, HoursCalendarDay>>({});
  const today = localDateKey();

  useEffect(() => {
    let cancelled = false;
    const months = new Set<string>();
    for (const key of weekKeys) {
      const d = new Date(`${key}T12:00:00`);
      months.add(`${d.getFullYear()}-${d.getMonth() + 1}`);
    }

    void (async () => {
      try {
        const responses = await Promise.all(
          Array.from(months).map(async (token) => {
            const [y, m] = token.split('-').map(Number);
            const resp = await reportService.getHoursCalendar({ year: y, month: m });
            return resp.data.days.filter((day) => day.in_month);
          }),
        );
        if (cancelled) return;
        const map: Record<string, HoursCalendarDay> = {};
        for (const days of responses) {
          for (const day of days) {
            map[day.date] = day;
          }
        }
        setDayMap(map);
      } catch {
        if (!cancelled) setDayMap({});
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [weekKeys]);

  const shiftWeek = (delta: number) => {
    const nextOffset = weekOffset + delta;
    onWeekOffsetChange(nextOffset);
    const nextStart = getWeekStartDate(nextOffset);
    const selected = new Date(`${selectedDate}T12:00:00`);
    const weekdayIndex = (selected.getDay() + 6) % 7;
    const nextDate = new Date(nextStart);
    nextDate.setDate(nextStart.getDate() + weekdayIndex);
    onSelectDate(localDateKey(nextDate));
  };

  return (
    <div className={compact ? 'space-y-2.5' : 'space-y-3'}>
      <div className="flex items-center justify-between gap-2 px-0.5">
        <button
          type="button"
          onClick={() => shiftWeek(-1)}
          className="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
          aria-label="Previous week"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <p className="text-xs font-medium text-slate-400">{weekRangeLabel(weekKeys)}</p>
        <button
          type="button"
          onClick={() => shiftWeek(1)}
          className="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
          aria-label="Next week"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="flex items-end justify-between gap-0.5">
        {weekKeys.map((dateKey) => {
          const row = dayMap[dateKey];
          const isSelected = dateKey === selectedDate;
          const isToday = dateKey === today;
          let seconds = row?.seconds ?? 0;
          if (isToday && liveTodaySeconds > 0) {
            seconds = Math.max(seconds, liveTodaySeconds);
          }
          const h = Math.floor(seconds / 3600);
          const m = Math.floor((seconds % 3600) / 60);
          const hoursLabel = `${h}:${String(m).padStart(2, '0')}`;
          const fillPct = dayProgressPercent(seconds);
          const barClass = progressBarClass(fillPct);
          const trackedLabel = formatClockShort(seconds);
          const requiredLabel = formatClockShort(DAILY_GOAL_SECONDS);

          return (
            <button
              key={dateKey}
              type="button"
              onClick={() => onSelectDate(dateKey)}
              title={`Required: ${requiredLabel} · Tracked: ${trackedLabel}`}
              className={cn(
                'group relative flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl px-0.5 py-1.5 transition-all',
                isSelected && 'bg-sky-500/10',
                !isSelected && 'hover:bg-white/[0.03]',
              )}
            >
              <span
                role="tooltip"
                className={cn(
                  'pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 -translate-x-1/2 rounded-lg border border-white/15 bg-[#12141C] px-2.5 py-1.5 text-[10px] leading-relaxed text-slate-200 shadow-lg',
                  'opacity-0 transition-opacity group-hover:opacity-100',
                )}
              >
                <span className="block whitespace-nowrap">
                  Required: <span className="font-semibold tabular-nums text-white">{requiredLabel}</span>
                </span>
                <span className="block whitespace-nowrap">
                  Tracked: <span className={cn('font-semibold tabular-nums', progressHoursClass(fillPct, false))}>{trackedLabel}</span>
                  <span className="text-slate-500"> · {fillPct}%</span>
                </span>
              </span>
              <span className={cn(
                'text-[9px] font-medium uppercase tracking-wide',
                isSelected ? 'text-sky-300' : 'text-slate-500',
              )}>
                {dayShortLabel(dateKey).slice(0, 1)}
              </span>
              <span className={cn(
                'flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold tabular-nums transition-all',
                isSelected && 'bg-sky-500 text-white shadow-[0_0_12px_rgba(56,189,248,0.35)]',
                !isSelected && isToday && 'ring-2 ring-sky-400/60 bg-sky-500/10 text-sky-200',
                !isSelected && !isToday && 'bg-white/[0.04] text-slate-300 group-hover:bg-white/[0.07]',
              )}>
                {dayNumOnly(dateKey)}
              </span>
              <span className={cn(
                'text-[9px] tabular-nums',
                progressHoursClass(fillPct, isSelected),
              )}>
                {hoursLabel}
              </span>
              <span className="h-0.5 w-full max-w-[28px] overflow-hidden rounded-full bg-white/[0.06]">
                <span
                  className={cn('block h-full rounded-full transition-all', barClass)}
                  style={{ width: `${fillPct}%` }}
                />
              </span>
            </button>
          );
        })}
      </div>

      {(weekOffset !== 0 || selectedDate !== today) && (
        <div className="flex items-center justify-center gap-4 pt-0.5">
          {weekOffset !== 0 && (
            <button
              type="button"
              onClick={() => {
                onWeekOffsetChange(0);
                onSelectDate(today);
              }}
              className="text-[11px] font-medium text-slate-400 hover:text-sky-300"
            >
              Jump to this week
            </button>
          )}
          {selectedDate !== today && (
            <button
              type="button"
              onClick={() => {
                onWeekOffsetChange(0);
                onSelectDate(today);
              }}
              className="text-[11px] font-medium text-sky-400 hover:text-sky-300"
            >
              Go to today
            </button>
          )}
        </div>
      )}
    </div>
  );
}
