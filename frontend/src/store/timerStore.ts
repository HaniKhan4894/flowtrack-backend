import { create } from 'zustand';
import { timeService } from '../api/timeService';
import { monitoringService } from '../api/monitoringService';
import { type TimeEntry } from '../types';

interface TimerState {
    activeEntry: TimeEntry | null;
    elapsed: number;
    isRunning: boolean;
    start: (projectId: number, description?: string) => Promise<void>;
    stop: () => Promise<void>;
    loadActive: () => Promise<void>;
    tick: () => void;
}

export const useTimerStore = create<TimerState>((set, get) => ({
    activeEntry: null,
    elapsed: 0,
    isRunning: false,

    start: async (projectId, description) => {
        try {
            const response = await timeService.startTimer({ project_id: projectId, description });
            set({
                activeEntry: response.data,
                isRunning: true,
                elapsed: 0
            });
            // Start monitoring
            monitoringService.startMonitoring(response.data.id);
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
            set({ activeEntry: null, isRunning: false, elapsed: 0 });
            // Stop monitoring
            monitoringService.stopMonitoring();
        } catch (error) {
            console.error('Failed to stop timer', error);
        }
    },

    loadActive: async () => {
        try {
            const response = await timeService.getActive();
            if (response.data && response.data.started_at) {
                const startTime = new Date(response.data.started_at).getTime();
                const now = new Date().getTime();
                set({
                    activeEntry: response.data,
                    isRunning: true,
                    elapsed: Math.floor((now - startTime) / 1000)
                });
                // Resume monitoring
                monitoringService.startMonitoring(response.data.id);
            } else {
                set({ activeEntry: null, isRunning: false });
            }
        } catch (error) {
            console.error('Failed to load active timer', error);
        }
    },

    tick: () => {
        const { isRunning } = get();
        if (isRunning) {
            set((state) => ({ elapsed: state.elapsed + 1 }));
        }
    },
}));

// Global ticker
if (typeof window !== 'undefined') {
    setInterval(() => {
        useTimerStore.getState().tick();
    }, 1000);
}
