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
    start: (projectId: number, description?: string) => Promise<void>;
    stop: () => Promise<void>;
    pause: () => Promise<void>;
    resume: () => Promise<void>;
    loadActive: () => Promise<void>;
    tick: () => void;
    resetLocal: () => void;
}

export const useTimerStore = create<TimerState>((set, get) => ({
    activeEntry: null,
    elapsed: 0,
    isRunning: false,
    isPaused: false,

    start: async (projectId, description) => {
        try {
            const response = await timeService.startTimer({ project_id: projectId, description });
            set({
                activeEntry: response.data,
                isRunning: true,
                isPaused: false,
                elapsed: 0
            });
            // Start monitoring — pass current auth token so Electron has it immediately
            const token = useAuthStore.getState().accessToken ?? undefined;
            monitoringService.startMonitoring(response.data.id, token);
            syncElectronAuthToken(token ?? localStorage.getItem('access_token'));
        } catch (error) {
            console.error('Failed to start timer', error);
            throw error;
        }
    },

    stop: async () => {
        const { activeEntry } = get();
        if (!activeEntry) return;

        try {
            await timeService.stopTimer(activeEntry.id);
            set({ activeEntry: null, isRunning: false, isPaused: false, elapsed: 0 });
            monitoringService.stopMonitoring();
        } catch (error) {
            console.error('Failed to stop timer', error);
            throw error;
        }
    },

    /** Local reset only — used during logout (do not await API). */
    resetLocal: () => {
        set({ activeEntry: null, isRunning: false, isPaused: false, elapsed: 0 });
        monitoringService.stopMonitoring();
    },

    pause: async () => {
        const { activeEntry } = get();
        if (!activeEntry) return;

        try {
            await timeService.pauseTimer(activeEntry.id);
            set({ isPaused: true });
            monitoringService.pauseMonitoring();
        } catch (error) {
            console.error('Failed to pause timer', error);
        }
    },

    resume: async () => {
        const { activeEntry } = get();
        if (!activeEntry) return;

        try {
            await timeService.resumeTimer(activeEntry.id);
            set({ isPaused: false });
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
                const startTime = new Date(response.data.started_at).getTime();
                const now = new Date().getTime();

                // If paused, we show duration until pause start
                // If not, we show total net duration
                let elapsed = 0;
                if (isPaused) {
                    const pausedAt = new Date(response.data.paused_at).getTime();
                    elapsed = Math.floor((pausedAt - startTime) / 1000) - (response.data.paused_duration_seconds || 0);
                } else {
                    elapsed = Math.floor((now - startTime) / 1000) - (response.data.paused_duration_seconds || 0);
                }

                set({
                    activeEntry: response.data,
                    isRunning: true,
                    isPaused: isPaused,
                    elapsed: elapsed > 0 ? elapsed : 0
                });
                if (!isPaused) {
                    // Resume monitoring only when timer is running
                    const token = useAuthStore.getState().accessToken ?? undefined;
                    monitoringService.startMonitoring(response.data.id, token);
                }
            } else {
                set({ activeEntry: null, isRunning: false, isPaused: false });
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

// Global ticker
if (typeof window !== 'undefined') {
    setInterval(() => {
        useTimerStore.getState().tick();
    }, 1000);

    // Desktop: auto pause/resume timer when system is locked/unlocked
    if ('electronAPI' in window && window.electronAPI?.onSystemLockChange) {
        window.electronAPI.onSystemLockChange((locked: boolean) => {
            const store = useTimerStore.getState();
            if (locked && store.isRunning && !store.isPaused) {
                store.pause().catch(() => undefined);
            } else if (!locked && store.isRunning) {
                store.resume().catch(() => undefined);
            }
        });
    }
}
