import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Pause, Play, Square } from 'lucide-react';
import { timeService } from '../../api/timeService';
import { useTimerStore } from '../../store/timerStore';
import { getApiErrorMessage } from '../../utils/apiError';
import {
  entryDisplaySeconds,
  formatDurationHms,
  isActiveTimerEntry,
  localDateKey,
} from '../../utils/liveTimer';
import type { TimeEntry } from '../../types';
import { cn } from '../../lib/cn';

interface Props {
  selectedDate: string;
  refreshToken?: number;
}

type EntryWithProject = TimeEntry & { project_name?: string | null };

function formatEntryClock(value: string | null | undefined): string {
  if (!value) return '--:--';
  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return '--:--';
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function formatClockShort(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}:${String(m).padStart(2, '0')}`;
}

function EntryControlBtn({
  onClick,
  title,
  children,
  variant = 'play',
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
  variant?: 'play' | 'pause' | 'stop';
}) {
  const styles = {
    play: 'border-emerald-500/45 bg-emerald-500/12 text-emerald-300 hover:border-emerald-400/55 hover:bg-emerald-500/22',
    pause: 'border-amber-500/45 bg-amber-500/12 text-amber-300 hover:border-amber-400/55 hover:bg-amber-500/22',
    stop: 'border-rose-500/45 bg-rose-500/12 text-rose-300 hover:border-rose-400/55 hover:bg-rose-500/22',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-all active:scale-95',
        styles[variant],
      )}
    >
      {children}
    </button>
  );
}

export function TrackerTimesheetTab({ selectedDate, refreshToken = 0 }: Props) {
  const [entries, setEntries] = useState<EntryWithProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const activeEntry = useTimerStore((s) => s.activeEntry);
  const isRunning = useTimerStore((s) => s.isRunning);
  const isPaused = useTimerStore((s) => s.isPaused);
  const elapsed = useTimerStore((s) => s.elapsed);
  const start = useTimerStore((s) => s.start);
  const stop = useTimerStore((s) => s.stop);
  const pause = useTimerStore((s) => s.pause);
  const resume = useTimerStore((s) => s.resume);

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await timeService.getAll({
        start_date: `${selectedDate} 00:00:00`,
        end_date: `${selectedDate} 23:59:59`,
        per_page: 100,
      });
      setEntries((resp.data ?? []) as EntryWithProject[]);
    } catch (e) {
      setError(getApiErrorMessage(e, 'Failed to load entries'));
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    void fetchEntries();
  }, [fetchEntries, refreshToken]);

  useEffect(() => {
    const onFocus = () => void fetchEntries();
    window.addEventListener('flowtrack-app-foreground', onFocus);
    return () => window.removeEventListener('flowtrack-app-foreground', onFocus);
  }, [fetchEntries]);

  const handleToggleEntry = async (entry: EntryWithProject) => {
    try {
      if (isActiveTimerEntry(entry, activeEntry, isRunning)) {
        await stop();
      } else if (isRunning) {
        await stop();
        await start(entry.project_id ?? null, entry.description || undefined, entry.task_id ?? undefined);
      } else {
        await start(entry.project_id ?? null, entry.description || undefined, entry.task_id ?? undefined);
      }
      await fetchEntries();
    } catch {
      // timerStore handles errors
    }
  };

  const totalSeconds = useMemo(
    () => entries.reduce(
      (sum, entry) => sum + entryDisplaySeconds(entry, activeEntry, elapsed, isRunning),
      0,
    ),
    [entries, activeEntry, elapsed, isRunning],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (error) {
    return <p className="py-8 text-center text-sm text-rose-400">{error}</p>;
  }

  const today = localDateKey();
  const showHint = selectedDate === today;

  return (
    <div className="space-y-2.5">
      {showHint && (
        <p className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[11px] text-slate-400">
          Tap an entry to resume it, or use <span className="text-sky-300">+ Add</span> for manual time.
        </p>
      )}

      {entries.length === 0 ? (
        <div className="rounded-2xl border border-white/[0.07] bg-[#0b0f17]/90 py-12 text-center">
          <p className="text-sm text-slate-500">No entries for this day.</p>
          <p className="mt-1 text-xs text-slate-600">Start the timer or add time manually.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0b0f17]/90">
          <div className="flex items-center justify-between border-b border-white/[0.06] px-3 py-2">
            <span className="text-[11px] text-slate-500">
              {entries.length} entr{entries.length === 1 ? 'y' : 'ies'}
            </span>
            <span className="font-mono text-sm font-bold tabular-nums text-sky-300">
              {formatClockShort(totalSeconds)} total
            </span>
          </div>

          <ul>
            {entries.map((entry) => {
              const active = isActiveTimerEntry(entry, activeEntry, isRunning);
              const seconds = entryDisplaySeconds(entry, activeEntry, elapsed, isRunning);
              const startLabel = formatEntryClock(entry.started_at_local ?? entry.started_at);
              const endLabel = active
                ? (isPaused ? 'Paused' : 'Running')
                : formatEntryClock(entry.ended_at_local ?? entry.ended_at);

              return (
                <li
                  key={entry.id}
                  className={cn(
                    'flex items-center gap-2 border-b border-white/[0.06] px-3 py-2.5 last:border-0',
                    active && 'bg-sky-500/[0.06]',
                  )}
                >
                  <div className="w-[72px] shrink-0">
                    <p className="font-mono text-[10px] tabular-nums text-slate-500">{startLabel}</p>
                    <p className={cn(
                      'font-mono text-[10px] tabular-nums',
                      active ? (isPaused ? 'text-amber-400' : 'text-sky-400') : 'text-slate-600',
                    )}>
                      {endLabel}
                    </p>
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-white">
                      {entry.description?.trim() || 'No description'}
                    </p>
                    <p className="truncate text-[10px] text-slate-500">
                      {entry.project_name ?? (entry.project_id != null ? `Project #${entry.project_id}` : 'No project')}
                    </p>
                  </div>

                  <span className={cn(
                    'shrink-0 font-mono text-sm tabular-nums',
                    active ? 'text-sky-300' : 'text-slate-300',
                  )}>
                    {formatDurationHms(seconds)}
                  </span>

                  {active && isRunning && !isPaused ? (
                    <EntryControlBtn onClick={() => void pause()} title="Pause" variant="pause">
                      <Pause className="h-3.5 w-3.5" />
                    </EntryControlBtn>
                  ) : active && isPaused ? (
                    <EntryControlBtn onClick={() => void resume()} title="Resume" variant="play">
                      <Play className="h-3.5 w-3.5" />
                    </EntryControlBtn>
                  ) : (
                    <EntryControlBtn
                      onClick={() => void handleToggleEntry(entry)}
                      title={active ? 'Stop' : 'Start'}
                      variant={active ? 'stop' : 'play'}
                    >
                      {active ? <Square className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                    </EntryControlBtn>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
