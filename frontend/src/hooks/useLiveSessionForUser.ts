import { useEffect, useMemo, useState } from 'react';
import { useActiveSessions } from './useActiveSessions';
import { useAuthStore } from '../store/authStore';
import { useTimerStore } from '../store/timerStore';
import type { TimeEntry } from '../types';

export interface LiveSessionView {
  isRunning: boolean;
  isPaused: boolean;
  elapsed: number;
  entryId: number | null;
  userId: number | null;
  projectName: string | null;
  description: string;
  startedAt: string | null;
  /** Synthetic entry shape for injecting into lists */
  asEntry: TimeEntry | null;
}

/**
 * Live timer for self (timerStore) or another teammate (shared active-sessions query).
 * Keeps admin/manager views in sync with a running user timer.
 */
export function useLiveSessionForUser(
  targetUserId: number | null | undefined,
  options?: { enabled?: boolean; pollMs?: number },
): LiveSessionView {
  const enabled = options?.enabled !== false;
  const pollMs = options?.pollMs ?? 60_000;
  const selfId = useAuthStore((s) => s.user?.id);
  const ownActive = useTimerStore((s) => s.activeEntry);
  const ownElapsed = useTimerStore((s) => s.elapsed);
  const ownRunning = useTimerStore((s) => s.isRunning);
  const ownPaused = useTimerStore((s) => s.isPaused);

  const isSelf =
    targetUserId != null && selfId != null && Number(targetUserId) === Number(selfId);

  const sessionsQuery = useActiveSessions({
    enabled: enabled && !isSelf && targetUserId != null,
    pollMs,
  });

  const remote = useMemo(() => {
    if (targetUserId == null) return null;
    return (sessionsQuery.data ?? []).find((s) => Number(s.user_id) === Number(targetUserId)) ?? null;
  }, [sessionsQuery.data, targetUserId]);

  const remoteFetchedAt = sessionsQuery.dataUpdatedAt || 0;
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!enabled) return;
    const needsTick = isSelf
      ? ownRunning && !ownPaused
      : !!remote && !remote.is_paused;
    if (!needsTick) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [enabled, isSelf, ownRunning, ownPaused, remote]);

  return useMemo((): LiveSessionView => {
    if (!enabled || targetUserId == null) {
      return emptySession();
    }

    if (isSelf && ownRunning && ownActive) {
      return {
        isRunning: true,
        isPaused: ownPaused,
        elapsed: ownElapsed,
        entryId: ownActive.id,
        userId: Number(selfId),
        projectName: null,
        description: ownActive.description || 'No description',
        startedAt: ownActive.started_at,
        asEntry: {
          ...ownActive,
          duration_seconds: ownElapsed,
          ended_at: null,
        },
      };
    }

    if (!isSelf && remote) {
      const base = remote.elapsed_seconds ?? 0;
      const drift = remote.is_paused || !remoteFetchedAt
        ? 0
        : Math.max(0, Math.floor((nowMs - remoteFetchedAt) / 1000));
      const elapsed = base + drift;
      return {
        isRunning: true,
        isPaused: !!remote.is_paused,
        elapsed,
        entryId: remote.time_entry_id,
        userId: remote.user_id,
        projectName: remote.project_name,
        description: 'No description',
        startedAt: remote.started_at,
        asEntry: {
          id: remote.time_entry_id,
          description: 'No description',
          started_at: remote.started_at,
          ended_at: null,
          duration_seconds: elapsed,
          elapsed_seconds: elapsed,
          project_id: undefined,
        },
      };
    }

    return emptySession();
  }, [
    enabled,
    targetUserId,
    isSelf,
    ownRunning,
    ownPaused,
    ownActive,
    ownElapsed,
    selfId,
    remote,
    remoteFetchedAt,
    nowMs,
  ]);
}

function emptySession(): LiveSessionView {
  return {
    isRunning: false,
    isPaused: false,
    elapsed: 0,
    entryId: null,
    userId: null,
    projectName: null,
    description: '',
    startedAt: null,
    asEntry: null,
  };
}
