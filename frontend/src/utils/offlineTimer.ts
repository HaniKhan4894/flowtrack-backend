import { timeService } from '../api/timeService';
import { monitoringService } from '../api/monitoringService';
import { useAuthStore } from '../store/authStore';
import { syncElectronAuthToken } from './electronAuth';
import { isNetworkError } from './networkError';
import type { TimeEntry } from '../types';

const STORAGE_KEY = 'flowtrack_offline_timer_v1';
export const OFFLINE_ENTRY_ID = -1;

export type OfflineTimerStatus = 'running' | 'paused' | 'stopped';
export type OfflinePendingAction = 'stop' | 'pause' | 'resume';

export interface OfflineTimerSession {
  clientId: string;
  startedAt: string;
  endedAt?: string | null;
  projectId?: number | null;
  taskId?: number | null;
  description?: string;
  isPaused: boolean;
  elapsedAtPause?: number;
  status: OfflineTimerStatus;
  /** Set when the session was started online and only a server action is pending. */
  serverEntryId?: number | null;
  pendingAction?: OfflinePendingAction | null;
}

export function toApiDateTime(isoOrLocal: string): string {
  const normalized = isoOrLocal.includes('T') ? isoOrLocal : isoOrLocal.replace(' ', 'T');
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return isoOrLocal;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function loadOfflineTimerSession(): OfflineTimerSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OfflineTimerSession;
    if (!parsed?.clientId || !parsed.startedAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveOfflineTimerSession(session: OfflineTimerSession): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearOfflineTimerSession(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function offlineElapsedSeconds(session: OfflineTimerSession): number {
  if (session.status === 'paused' || session.isPaused) {
    return Math.max(0, session.elapsedAtPause ?? 0);
  }
  const started = new Date(session.startedAt).getTime();
  if (Number.isNaN(started)) return 0;
  return Math.max(0, Math.floor((Date.now() - started) / 1000));
}

export function buildOfflineTimeEntry(session: OfflineTimerSession): TimeEntry {
  const elapsed = offlineElapsedSeconds(session);
  return {
    id: OFFLINE_ENTRY_ID,
    project_id: session.projectId ?? null,
    task_id: session.taskId ?? null,
    description: session.description ?? '',
    started_at: session.startedAt,
    ended_at: null,
    duration_seconds: elapsed,
    elapsed_seconds: elapsed,
  } as TimeEntry;
}

let flushInFlight = false;

/**
 * Push queued offline timer work to the API when connectivity returns.
 */
export async function flushOfflineTimerSession(): Promise<boolean> {
  const session = loadOfflineTimerSession();
  if (!session || flushInFlight) return false;

  flushInFlight = true;
  try {
    if (session.serverEntryId && session.serverEntryId > 0) {
      if (session.pendingAction === 'stop' || session.status === 'stopped') {
        await timeService.stopTimer(session.serverEntryId);
      } else if (session.pendingAction === 'pause') {
        await timeService.pauseTimer(session.serverEntryId);
      } else if (session.pendingAction === 'resume') {
        await timeService.resumeTimer(session.serverEntryId);
      }
      clearOfflineTimerSession();
      return true;
    }

    if (session.status === 'stopped' && session.endedAt) {
      await timeService.createManual({
        project_id: session.projectId ?? undefined,
        task_id: session.taskId ?? undefined,
        description: session.description,
        started_at: toApiDateTime(session.startedAt),
        ended_at: toApiDateTime(session.endedAt),
      });
      clearOfflineTimerSession();
      return true;
    }

    if (session.status === 'running' || session.status === 'paused') {
      const response = await timeService.startTimer({
        project_id: session.projectId ?? undefined,
        task_id: session.taskId ?? undefined,
        description: session.description,
        started_at: toApiDateTime(session.startedAt),
      });
      const entry = response.data as TimeEntry;
      const token = useAuthStore.getState().accessToken ?? localStorage.getItem('access_token') ?? undefined;
      monitoringService.startMonitoring(entry.id, token ?? undefined);
      syncElectronAuthToken(token ?? null);

      if (session.status === 'paused' || session.isPaused) {
        await timeService.pauseTimer(entry.id);
      }

      clearOfflineTimerSession();
      return true;
    }

    clearOfflineTimerSession();
    return true;
  } catch (error) {
    if (isNetworkError(error)) return false;
    console.error('[OfflineTimer] Sync failed:', error);
    return false;
  } finally {
    flushInFlight = false;
  }
}
