import { create } from 'zustand';
import { timeService } from '../api/timeService';
import { monitoringService } from '../api/monitoringService';
import { syncElectronAuthToken } from '../utils/electronAuth';
import { isDesktopForeground } from '../utils/desktopLifecycle';
import { useAuthStore } from './authStore';
import { type TimeEntry } from '../types';

interface TimerState {
    activeEntry: TimeEntry | null;
    elapsed: number;
    isRunning: boolean;
    isPaused: boolean;
    start: (projectId?: number | null, description?: string, taskId?: number) => Promise<void>;
    stop: () => Promise<void>;
    pause: () => Promise<void>;
    resume: () => Promise<void>;
    loadActive: () => Promise<void>;
    tick: () => void;
    resetLocal: () => void;
}

let resyncInterval: ReturnType<typeof setInterval> | null = null;
let pausedBySystemIdle = false;

function setTrackingSessionActive(active: boolean) {
    if (typeof window !== 'undefined') {
        (window as Window & { __flowtrackTrackingActive?: boolean }).__flowtrackTrackingActive = active;
    }
}

function startResync() {
    if (resyncInterval || !isDesktopForeground()) return;
    resyncInterval = setInterval(() => {
        if (!isDesktopForeground()) return;
        const { isRunning } = useTimerStore.getState();
        if (isRunning) {
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

export const useTimerStore = create<TimerState>((set, get) => ({
    activeEntry: null,
    elapsed: 0,
    isRunning: false,
    isPaused: false,

    start: async (projectId, description, taskId) => {
        // Optimistic UI — show running state immediately
        const optimisticId = -Date.now();
        set({
            isRunning: true,
            isPaused: false,
            elapsed: 0,
            activeEntry: {
                id: optimisticId,
                project_id: projectId ?? null,
                task_id: taskId ?? null,
                description: description ?? '',
                started_at: new Date().toISOString(),
                ended_at: null,
                duration_seconds: 0,
                elapsed_seconds: 0,
            } as import('../types').TimeEntry,
        });
        setTrackingSessionActive(true);
        try {
            const response = await timeService.startTimer({
                project_id: projectId ?? undefined,
                task_id: taskId,
                description,
            });
            const entry = response.data;
            set({
                activeEntry: entry,
                isRunning: true,
                isPaused: false,
                elapsed: entry.elapsed_seconds ?? 0,
            });
            const token = useAuthStore.getState().accessToken ?? undefined;
            monitoringService.startMonitoring(response.data.id, token);
            syncElectronAuthToken(token ?? localStorage.getItem('access_token'));
            startResync();
        } catch (error) {
            console.error('Failed to start timer', error);
            set({ activeEntry: null, isRunning: false, isPaused: false, elapsed: 0 });
            setTrackingSessionActive(false);
            await get().loadActive();
            if (get().isRunning) {
                return;
            }
            throw error;
        }
    },

    stop: async () => {
        const { activeEntry, elapsed } = get();
        if (!activeEntry) return;

        // Optimistic clear — revert on failure
        const snapshot = { activeEntry, elapsed, isRunning: true as const, isPaused: get().isPaused };
        set({ activeEntry: null, isRunning: false, isPaused: false, elapsed: 0 });
        setTrackingSessionActive(false);
        pausedBySystemIdle = false;
        monitoringService.stopMonitoring();
        stopResync();

        if (activeEntry.id < 0) {
            return;
        }

        try {
            await timeService.stopTimer(activeEntry.id);
        } catch (error: unknown) {
            console.error('Failed to stop timer', error);
            const message = (error as { response?: { data?: { message?: string } } })?.response?.data?.message ?? '';
            if (message.toLowerCase().includes('already stopped')) {
                return;
            }
            // Revert optimistic clear
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

    resetLocal: () => {
        set({ activeEntry: null, isRunning: false, isPaused: false, elapsed: 0 });
        setTrackingSessionActive(false);
        pausedBySystemIdle = false;
        monitoringService.stopMonitoring();
        stopResync();
    },

    pause: async () => {
        const { activeEntry } = get();
        if (!activeEntry) return;

        try {
            const response = await timeService.pauseTimer(activeEntry.id);
            set({
                isPaused: true,
                activeEntry: response.data,
                elapsed: response.data.elapsed_seconds ?? get().elapsed,
            });
            monitoringService.pauseMonitoring();
        } catch (error) {
            console.error('Failed to pause timer', error);
        }
    },

    resume: async () => {
        const { activeEntry } = get();
        if (!activeEntry) return;

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
            console.error('Failed to resume timer', error);
            const message = (error as { response?: { data?: { message?: string } } })?.response?.data?.message ?? '';
            // Overnight pause closes yesterday's entry — start a fresh timer for today.
            if (/already stopped|start a new timer/i.test(message)) {
                const projectId = activeEntry.project_id ?? null;
                const description = activeEntry.description || undefined;
                const taskId = activeEntry.task_id ?? undefined;
                set({ activeEntry: null, isRunning: false, isPaused: false, elapsed: 0 });
                await get().start(projectId, description, taskId ?? undefined);
                return;
            }
            await get().loadActive();
        }
    },

    loadActive: async () => {
        try {
            const response = await timeService.getActive();
            if (response.data && response.data.started_at) {
                const isPaused = !!response.data.paused_at;
                const elapsed = response.data.elapsed_seconds ?? 0;

                set({
                    activeEntry: response.data,
                    isRunning: true,
                    isPaused,
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
                set({ activeEntry: null, isRunning: false, isPaused: false });
                setTrackingSessionActive(false);
                pausedBySystemIdle = false;
                stopResync();
            }
        } catch (error) {
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

    if ('electronAPI' in window && window.electronAPI?.onSystemLockChange) {
        window.electronAPI.onSystemLockChange((locked: boolean) => {
            const store = useTimerStore.getState();
            if (locked && store.isRunning && !store.isPaused) {
                store.pause().catch(() => undefined);
            } else if (!locked && store.isRunning && store.isPaused && !pausedBySystemIdle) {
                store.resume().catch(() => undefined);
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
                    store.pause().catch(() => undefined);
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
}
