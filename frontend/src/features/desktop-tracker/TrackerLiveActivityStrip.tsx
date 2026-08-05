import { useEffect, useState } from 'react';
import { Activity, CloudOff, Loader2, Monitor } from 'lucide-react';
import type { LiveActivitySnapshot } from '../../types/electron';
import { cn } from '../../lib/cn';

function formatSyncedAgo(lastSyncAt: number | null): string {
  if (!lastSyncAt) return 'Not synced yet';
  const sec = Math.max(0, Math.floor((Date.now() - lastSyncAt) / 1000));
  if (sec < 15) return 'Synced just now';
  if (sec < 60) return `Synced ${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `Synced ${min}m ago`;
  return `Synced ${Math.floor(min / 60)}h ago`;
}

function truncate(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

type Props = {
  enabled: boolean;
};

/**
 * Trackabi-style "Now" strip — driven only by Electron IPC (no API polling).
 */
export function TrackerLiveActivityStrip({ enabled }: Props) {
  const [snap, setSnap] = useState<LiveActivitySnapshot | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!enabled || !window.electronAPI?.onActivityLive) {
      setSnap(null);
      return;
    }

    let cancelled = false;
    void window.electronAPI.getLiveActivity?.().then((s) => {
      if (!cancelled) setSnap(s);
    }).catch(() => undefined);

    const unsub = window.electronAPI.onActivityLive((next) => {
      setSnap(next);
    });

    // Refresh relative "Synced Xm ago" label.
    const id = window.setInterval(() => setTick((n) => n + 1), 15_000);

    return () => {
      cancelled = true;
      unsub();
      window.clearInterval(id);
    };
  }, [enabled]);

  if (!enabled || typeof window === 'undefined' || !window.electronAPI?.onActivityLive) {
    return null;
  }

  const appName = snap?.current?.app_name || (snap?.tracking ? 'Detecting…' : '—');
  const title = snap?.current?.window_title || '';
  const softIdle = !!snap?.soft_idle;
  const queued = snap?.pending_count ?? 0;
  const syncError = snap?.last_sync_error;
  const syncing = !!snap?.sync_in_flight;

  return (
    <div className="mx-3 mt-2 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2">
      <div className="flex items-start gap-2.5">
        <div className={cn(
          'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border',
          softIdle
            ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
            : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
        )}>
          <Monitor className="h-3.5 w-3.5" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-xs font-semibold text-white">
              {truncate(appName, 36)}
            </p>
            <span className={cn(
              'shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide',
              softIdle
                ? 'bg-amber-500/15 text-amber-300'
                : 'bg-emerald-500/15 text-emerald-300',
            )}>
              {softIdle ? 'Idle' : 'Active'}
            </span>
          </div>
          {title ? (
            <p className="mt-0.5 truncate text-[10px] text-slate-500">{truncate(title, 64)}</p>
          ) : (
            <p className="mt-0.5 text-[10px] text-slate-600">Current window</p>
          )}
        </div>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-500">
        <span className="inline-flex items-center gap-1">
          {syncing ? (
            <Loader2 className="h-3 w-3 animate-spin text-sky-400" />
          ) : syncError ? (
            <CloudOff className="h-3 w-3 text-amber-400" />
          ) : (
            <Activity className="h-3 w-3 text-slate-500" />
          )}
          {syncing
            ? 'Syncing…'
            : syncError
              ? `Offline — queued ${queued}`
              : formatSyncedAgo(snap?.last_sync_at ?? null)}
        </span>
        {!syncError && queued > 1 && (
          <span className="text-slate-600">{queued} segments pending</span>
        )}
      </div>
    </div>
  );
}
