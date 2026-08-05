import {
  buildOfflineTimeEntry,
  clearOfflineTimerSession,
  flushOfflineTimerSession,
  loadOfflineTimerSession,
  OFFLINE_ENTRY_ID,
  offlineElapsedSeconds,
  saveOfflineTimerSession,
  type OfflineTimerSession,
} from '../utils/offlineTimer';
import { isNetworkError } from '../utils/networkError';
import { syncElectronAuthToken } from '../utils/electronAuth';
import { isDesktopForeground } from '../utils/desktopLifecycle';
import { useAuthStore } from './authStore';
import { create } from 'zustand';
import { timeService } from '../api/timeService';
import { monitoringService } from '../api/monitoringService';
import { type TimeEntry } from '../types';

interface TimerState {
    activeEntry: TimeEntry | null;
    elapsed: number;
    isRunning: boolean;
    isPaused: boolean;
    isOfflineSession: boolean;
    start: (projectId?: number | null, description?: string, taskId?: number) => Promise<void>;
    stop: () => Promise<void>;
    /** Stop running timer without reverting UI — used before logout/sign-out. */
    stopForLogout: () => Promise<void>;
    pause: (options?: { discardIdleSeconds?: number }) => Promise<void>;
    resume: () => Promise<void>;
    loadActive: () => Promise<void>;
    syncOfflineSession: () => Promise<void>;
    tick: () => void;
    resetLocal: () => void;
}

let resyncInterval: ReturnType<typeof setInterval> | null = null;
let pausedBySystemIdle = false;
let pausedBySystemLock = false;
let lockPausePromise: Promise<void> | null = null;

function setTrackingSessionActive(active: boolean) {
    if (typeof window !== 'undefined') {
        (window as Window & { __flowtrackTrackingActive?: boolean }).__flowtrackTrackingActive = active;
    }
}

function startResync() {
    if (resyncInterval || !isDesktopForeground()) return;
    resyncInterval = setInterval(() => {
        if (!isDesktopForeground()) return;
        const { isRunning, isOfflineSession } = useTimerStore.getState();
        if (isRunning && !isOfflineSession) {
            useTimerStore.getState().loadActive().catch(() => undefined);
        }
    }, 60_000);
}

function stopResync() {
    if (resyncInterval) {
        clearInterval(resyncInterval);
        resyncInterval = null;
    }
}

function persistOfflineSession(patch: Partial<OfflineTimerSession> & Pick<OfflineTimerSession, 'clientId' | 'startedAt' | 'status'>) {
    const existing = loadOfflineTimerSession();
    saveOfflineTimerSession({
        clientId: patch.clientId,
        startedAt: patch.startedAt,
        status: patch.status,
        endedAt: patch.endedAt ?? existing?.endedAt ?? null,
        projectId: patch.projectId ?? existing?.projectId ?? null,
        taskId: patch.taskId ?? existing?.taskId ?? null,
        description: patch.description ?? existing?.description ?? '',
        isPaused: patch.isPaused ?? existing?.isPaused ?? false,
        elapsedAtPause: patch.elapsedAtPause ?? existing?.elapsedAtPause,
        serverEntryId: patch.serverEntryId ?? existing?.serverEntryId ?? null,
        pendingAction: patch.pendingAction ?? existing?.pendingAction ?? null,
    });
}

function beginOfflineSession(
    set: (partial: Partial<TimerState> | ((state: TimerState) => Partial<TimerState>)) => void,
    session: OfflineTimerSession,
) {
    const token = useAuthStore.getState().accessToken ?? localStorage.getItem('access_token') ?? undefined;
    saveOfflineTimerSession(session);
    set({
        activeEntry: buildOfflineTimeEntry(session),
        isRunning: true,
        isPaused: session.isPaused,
        isOfflineSession: true,
        elapsed: offlineElapsedSeconds(session),
    });
    setTrackingSessionActive(true);
    monitoringService.startMonitoring(OFFLINE_ENTRY_ID, token ?? undefined);
    syncElectronAuthToken(token ?? null);
    startResync();
}

function hydrateOfflineSession(
    set: (partial: Partial<TimerState> | ((state: TimerState) => Partial<TimerState>)) => void,
) {
    const session = loadOfflineTimerSession();
    if (!session || session.status === 'stopped') return false;
    beginOfflineSession(set, session);
    return true;
}

export const useTimerStore = create<TimerState>((set, get) => ({
    activeEntry: null,
    elapsed: 0,
    isRunning: false,
    isPaused: false,
    isOfflineSession: false,

    start: async (projectId, description, taskId) => {
        const startedAt = new Date().toISOString();
        set({
            isRunning: true,
            isPaused: false,
            isOfflineSession: false,
            elapsed: 0,
            activeEntry: {
                id: OFFLINE_ENTRY_ID,
                project_id: projectId ?? null,
                task_id: taskId ?? null,
                description: description ?? '',
                started_at: startedAt,
                ended_at: null,
                duration_seconds: 0,
                elapsed_seconds: 0,
            } as TimeEntry,
        });
        setTrackingSessionActive(true);
        try {
            const response = await timeService.startTimer({
                project_id: projectId ?? undefined,
                task_id: taskId,
                description,
            });
            const entry = response.data;
            clearOfflineTimerSession();
            set({
                activeEntry: entry,
                isRunning: true,
                isPaused: false,
                isOfflineSession: false,
                elapsed: entry.elapsed_seconds ?? 0,
            });
            const token = useAuthStore.getState().accessToken ?? undefined;
            monitoringService.startMonitoring(response.data.id, token);
            syncElectronAuthToken(token ?? localStorage.getItem('access_token'));
            startResync();
        } catch (error) {
            if (!isNetworkError(error)) {
                console.error('Failed to start timer', error);
                set({ activeEntry: null, isRunning: false, isPaused: false, isOfflineSession: false, elapsed: 0 });
                setTrackingSessionActive(false);
                await get().loadActive();
                if (get().isRunning) {
                    return;
                }
                throw error;
            }

            console.warn('[Timer] Offline — running locally until sync.');
            beginOfflineSession(set, {
                clientId: `offline-${Date.now()}`,
                startedAt,
                projectId: projectId ?? null,
                taskId: taskId ?? null,
                description: description ?? '',
                isPaused: false,
                status: 'running',
            });
        }
    },

    stop: async () => {
        const { activeEntry, elapsed, isOfflineSession } = get();
        if (!activeEntry) return;

        const snapshot = { activeEntry, elapsed, isRunning: true as const, isPaused: get().isPaused };
        set({ activeEntry: null, isRunning: false, isPaused: false, isOfflineSession: false, elapsed: 0 });
        setTrackingSessionActive(false);
        pausedBySystemIdle = false;
        pausedBySystemLock = false;
        monitoringService.stopMonitoring();
        stopResync();

        if (isOfflineSession || activeEntry.id === OFFLINE_ENTRY_ID) {
            const session = loadOfflineTimerSession();
            persistOfflineSession({
                clientId: session?.clientId ?? `offline-${Date.now()}`,
                startedAt: session?.startedAt ?? activeEntry.started_at ?? new Date().toISOString(),
                projectId: session?.projectId ?? activeEntry.project_id ?? null,
                taskId: session?.taskId ?? activeEntry.task_id ?? null,
                description: session?.description ?? activeEntry.description ?? '',
                isPaused: false,
                status: 'stopped',
                endedAt: new Date().toISOString(),
            });
            return;
        }

        try {
            await timeService.stopTimer(activeEntry.id);
            clearOfflineTimerSession();
        } catch (error: unknown) {
            if (isNetworkError(error)) {
                persistOfflineSession({
                    clientId: `srv-${activeEntry.id}`,
                    serverEntryId: activeEntry.id,
                    startedAt: activeEntry.started_at,
                    projectId: activeEntry.project_id ?? null,
                    taskId: activeEntry.task_id ?? null,
                    description: activeEntry.description ?? '',
                    isPaused: false,
                    status: 'stopped',
                    endedAt: new Date().toISOString(),
                    pendingAction: 'stop',
                });
                return;
            }
            console.error('Failed to stop timer', error);
            const message = (error as { response?: { data?: { message?: string } } })?.response?.data?.message ?? '';
            if (message.toLowerCase().includes('already stopped')) {
                return;
            }
            set({
                activeEntry: snapshot.activeEntry,
                isRunning: true,
                isPaused: snapshot.isPaused,
                elapsed: snapshot.elapsed,
            });
            setTrackingSessionActive(true);
            startResync();
            await get().loadActive();
            if (!get().isRunning) {
                return;
            }
            throw error;
        }
    },

    stopForLogout: async () => {
        const { activeEntry } = get();
        const entryId = activeEntry?.id;

        if (entryId && entryId > 0) {
            try {
                await timeService.stopTimer(entryId);
            } catch (error) {
                console.warn('[Timer] Stop on logout failed:', error);
            }
        }

        set({ activeEntry: null, isRunning: false, isPaused: false, isOfflineSession: false, elapsed: 0 });
        setTrackingSessionActive(false);
        pausedBySystemIdle = false;
        pausedBySystemLock = false;
        monitoringService.stopMonitoring();
        stopResync();
        clearOfflineTimerSession();
    },

    resetLocal: () => {
        set({ activeEntry: null, isRunning: false, isPaused: false, isOfflineSession: false, elapsed: 0 });
        setTrackingSessionActive(false);
        pausedBySystemIdle = false;
        pausedBySystemLock = false;
        monitoringService.stopMonitoring();
        stopResync();
    },

    pause: async (options) => {
        const { activeEntry, elapsed, isOfflineSession } = get();
        if (!activeEntry) return;

        if (isOfflineSession || activeEntry.id === OFFLINE_ENTRY_ID) {
            const session = loadOfflineTimerSession();
            if (!session) return;
            persistOfflineSession({
                ...session,
                isPaused: true,
                status: 'paused',
                elapsedAtPause: elapsed,
            });
            set({ isPaused: true, elapsed });
            monitoringService.pauseMonitoring();
            return;
        }

        try {
            const discard = Math.max(0, Math.round(options?.discardIdleSeconds ?? 0));
            const response = await timeService.pauseTimer(activeEntry.id, {
                discard_idle_seconds: discard,
            });
            set({
                isPaused: true,
                activeEntry: response.data,
                elapsed: response.data.elapsed_seconds ?? get().elapsed,
            });
            monitoringService.pauseMonitoring();
        } catch (error) {
            if (isNetworkError(error)) {
                persistOfflineSession({
                    clientId: `srv-${activeEntry.id}`,
                    serverEntryId: activeEntry.id,
                    startedAt: activeEntry.started_at,
                    projectId: activeEntry.project_id ?? null,
                    taskId: activeEntry.task_id ?? null,
                    description: activeEntry.description ?? '',
                    isPaused: true,
                    status: 'paused',
                    elapsedAtPause: elapsed,
                    pendingAction: 'pause',
                });
                set({ isPaused: true });
                monitoringService.pauseMonitoring();
                return;
            }
            console.error('Failed to pause timer', error);
        }
    },

    resume: async () => {
        const { activeEntry, isOfflineSession } = get();
        if (!activeEntry) return;

        if (isOfflineSession || activeEntry.id === OFFLINE_ENTRY_ID) {
            const session = loadOfflineTimerSession();
            if (!session) return;
            persistOfflineSession({
                ...session,
                isPaused: false,
                status: 'running',
                elapsedAtPause: undefined,
            });
            set({ isPaused: false });
            const token = useAuthStore.getState().accessToken ?? undefined;
            monitoringService.resumeMonitoring(token);
            return;
        }

        try {
            const response = await timeService.resumeTimer(activeEntry.id);
            set({
                isPaused: false,
                activeEntry: response.data,
                elapsed: response.data.elapsed_seconds ?? get().elapsed,
            });
            const token = useAuthStore.getState().accessToken ?? undefined;
            monitoringService.resumeMonitoring(token);
        } catch (error: unknown) {
            if (isNetworkError(error)) {
                persistOfflineSession({
                    clientId: `srv-${activeEntry.id}`,
                    serverEntryId: activeEntry.id,
                    startedAt: activeEntry.started_at,
                    projectId: activeEntry.project_id ?? null,
                    taskId: activeEntry.task_id ?? null,
                    description: activeEntry.description ?? '',
                    isPaused: false,
                    status: 'running',
                    pendingAction: 'resume',
                });
                set({ isPaused: false });
                const token = useAuthStore.getState().accessToken ?? undefined;
                monitoringService.resumeMonitoring(token);
                return;
            }
            console.error('Failed to resume timer', error);
            const message = (error as { response?: { data?: { message?: string } } })?.response?.data?.message ?? '';
            if (/already stopped|start a new timer/i.test(message)) {
                const projectId = activeEntry.project_id ?? null;
                const description = activeEntry.description || undefined;
                const taskId = activeEntry.task_id ?? undefined;
                set({ activeEntry: null, isRunning: false, isPaused: false, isOfflineSession: false, elapsed: 0 });
                await get().start(projectId, description, taskId ?? undefined);
                return;
            }
            await get().loadActive();
        }
    },

    syncOfflineSession: async () => {
        const synced = await flushOfflineTimerSession();
        if (!synced) return;
        await get().loadActive();
    },

    loadActive: async () => {
        const offlineSession = loadOfflineTimerSession();
        if (offlineSession && offlineSession.status !== 'stopped') {
            const { isRunning } = get();
            if (!isRunning) {
                hydrateOfflineSession(set);
            }
        }

        try {
            const response = await timeService.getActive();
            if (response.data && response.data.started_at) {
                const isPaused = !!response.data.paused_at;
                const elapsed = response.data.elapsed_seconds ?? 0;

                clearOfflineTimerSession();
                set({
                    activeEntry: response.data,
                    isRunning: true,
                    isPaused,
                    isOfflineSession: false,
                    elapsed: elapsed > 0 ? elapsed : 0,
                });

                if (!isPaused) {
                    const token = useAuthStore.getState().accessToken ?? undefined;
                    const currentId = get().activeEntry?.id;
                    if (currentId !== response.data.id || !monitoringService.isMonitoringEntry(response.data.id)) {
                        monitoringService.startMonitoring(response.data.id, token);
                    }
                }
                startResync();
                setTrackingSessionActive(true);
            } else {
                if (offlineSession && offlineSession.status !== 'stopped') {
                    return;
                }
                set({ activeEntry: null, isRunning: false, isPaused: false, isOfflineSession: false, elapsed: 0 });
                setTrackingSessionActive(false);
                pausedBySystemIdle = false;
                pausedBySystemLock = false;
                monitoringService.stopMonitoring();
                stopResync();
            }
        } catch (error) {
            if (isNetworkError(error)) {
                if (offlineSession && offlineSession.status !== 'stopped') {
                    hydrateOfflineSession(set);
                }
                return;
            }
            console.error('Failed to load active timer', error);
        }
    },

    tick: () => {
        const { isRunning, isPaused } = get();
        if (isRunning && !isPaused) {
            set((state) => ({ elapsed: state.elapsed + 1 }));
        }
    },
}));

if (typeof window !== 'undefined') {
    setInterval(() => {
        useTimerStore.getState().tick();
    }, 1000);

    const onBackground = () => stopResync();
    const onShutdown = () => stopResync();
    const onForeground = () => {
        if (useTimerStore.getState().isRunning) {
            startResync();
        }
    };

    window.addEventListener('flowtrack-app-background', onBackground);
    window.addEventListener('flowtrack-app-shutdown', onShutdown);
    window.addEventListener('flowtrack-app-foreground', onForeground);

    if ('electronAPI' in window && window.electronAPI?.onTimerReminderResume) {
        window.electronAPI.onTimerReminderResume(() => {
            const store = useTimerStore.getState();
            if (store.isRunning && store.isPaused) {
                store.resume().catch(() => undefined);
            }
        });
    }

    if ('electronAPI' in window && window.electronAPI?.onTimerSyncRequired) {
        window.electronAPI.onTimerSyncRequired(() => {
            useTimerStore.getState().loadActive().catch(() => undefined);
        });
    }

    if ('electronAPI' in window && window.electronAPI?.onSystemLockChange) {
        window.electronAPI.onSystemLockChange((locked: boolean) => {
            const store = useTimerStore.getState();
            if (locked && store.isRunning && !store.isPaused) {
                pausedBySystemLock = true;
                lockPausePromise = store.pause()
                    .catch(() => undefined)
                    .finally(() => { lockPausePromise = null; });
                window.dispatchEvent(new CustomEvent('flowtrack-idle-notice', {
                    detail: {
                        type: 'paused',
                        message: 'Timer paused — your system was locked.',
                    },
                }));
                return;
            }

            if (!locked && pausedBySystemLock) {
                pausedBySystemLock = false;
                const pendingPause = lockPausePromise;
                void (async () => {
                    if (pendingPause) {
                        await pendingPause;
                    }
                    const latest = useTimerStore.getState();
                    if (latest.activeEntry && (latest.isRunning || latest.isPaused)) {
                        await latest.resume().catch(() => undefined);
                    }
                    window.dispatchEvent(new CustomEvent('flowtrack-idle-notice', {
                        detail: {
                            type: 'resumed',
                            message: 'Timer resumed — welcome back!',
                        },
                    }));
                })();
            }
        });
    }

    if ('electronAPI' in window && window.electronAPI?.onTimerIdleChange) {
        window.electronAPI.onTimerIdleChange((state, data) => {
            const store = useTimerStore.getState();
            const idleMinutes = data?.idleMinutes ?? 5;

            if (state === 'paused') {
                pausedBySystemIdle = true;
                if (store.isRunning && !store.isPaused) {
                    store.pause({
                        discardIdleSeconds: Number(data?.discardIdleSeconds ?? 0) || 0,
                    }).catch(() => undefined);
                }
                window.dispatchEvent(new CustomEvent('flowtrack-idle-notice', {
                    detail: {
                        type: 'paused',
                        message: `Timer paused — you were idle for ${idleMinutes} minutes.`,
                    },
                }));
                return;
            }

            if (state === 'resumed' && pausedBySystemIdle) {
                pausedBySystemIdle = false;
                if (store.isRunning && store.isPaused) {
                    store.resume().catch(() => undefined);
                }
                window.dispatchEvent(new CustomEvent('flowtrack-idle-notice', {
                    detail: {
                        type: 'resumed',
                        message: `Timer resumed. Your previous ${idleMinutes} minutes were idle/unproductive.`,
                    },
                }));
            }
        });
    }

    void useTimerStore.getState().loadActive();
}
