import { create } from 'zustand';
import { timeService } from '../api/timeService';
import { monitoringService } from '../api/monitoringService';
import { syncElectronAuthToken } from '../utils/electronAuth';
import { useAuthStore } from './authStore';
import { type TimeEntry } from '../types';

interface TimerState {
    activeEntry: TimeEntry | null;
    elapsed: number;
    isRunning: boolean;
    isPaused: boolean;
    start: (projectId: number, description?: string, taskId?: number) => Promise<void>;
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
    if (resyncInterval) return;
    resyncInterval = setInterval(() => {
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
        try {
            const response = await timeService.startTimer({
                project_id: projectId,
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
            setTrackingSessionActive(true);
            const token = useAuthStore.getState().accessToken ?? undefined;
            monitoringService.startMonitoring(response.data.id, token);
            syncElectronAuthToken(token ?? localStorage.getItem('access_token'));
            startResync();
        } catch (error) {
            console.error('Failed to start timer', error);
            await get().loadActive();
            if (get().isRunning) {
                return;
            }
            throw error;
        }
    },

    stop: async () => {
        const { activeEntry } = get();
        if (!activeEntry) return;

        try {
            await timeService.stopTimer(activeEntry.id);
            set({ activeEntry: null, isRunning: false, isPaused: false, elapsed: 0 });
            setTrackingSessionActive(false);
            pausedBySystemIdle = false;
            monitoringService.stopMonitoring();
            stopResync();
        } catch (error: unknown) {
            console.error('Failed to stop timer', error);
            const message = (error as { response?: { data?: { message?: string } } })?.response?.data?.message ?? '';
            if (message.toLowerCase().includes('already stopped')) {
                set({ activeEntry: null, isRunning: false, isPaused: false, elapsed: 0 });
                setTrackingSessionActive(false);
                pausedBySystemIdle = false;
                monitoringService.stopMonitoring();
                stopResync();
                return;
            }
            await get().loadActive();
            if (!get().isRunning) {
                monitoringService.stopMonitoring();
                stopResync();
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
        } catch (error) {
            console.error('Failed to resume timer', error);
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
                    monitoringService.startMonitoring(response.data.id, token);
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
