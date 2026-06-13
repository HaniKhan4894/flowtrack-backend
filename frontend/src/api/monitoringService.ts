import client from './client';
import { useAuthStore } from '../store/authStore';

// Detect if running inside Electron desktop app
const isElectron = typeof window !== 'undefined' && 'electronAPI' in window;
const electronAPI = isElectron ? (window as any).electronAPI : null;

// ─────────────────────────────────────────────────────────
//  Web-only activity tracking (fallback when not in Electron)
// ─────────────────────────────────────────────────────────
let monitoringInterval: ReturnType<typeof setInterval> | null = null;
let screenshotInterval: ReturnType<typeof setInterval> | null = null;
let cleanupScreenshotListener: (() => void) | null = null;
let activeTimeEntryId: number | null = null;
let webActivityHandlersAttached = false;
let onWebMouseMove: (() => void) | null = null;
let onWebClick: (() => void) | null = null;
let onWebKeyDown: (() => void) | null = null;

const webActivityData = {
    mouseMovements: 0,
    clicks: 0,
    keystrokes: 0,
};

function trackWebActivity() {
    if (webActivityHandlersAttached) {
        return;
    }
    onWebMouseMove = () => webActivityData.mouseMovements++;
    onWebClick = () => webActivityData.clicks++;
    onWebKeyDown = () => webActivityData.keystrokes++;
    window.addEventListener('mousemove', onWebMouseMove);
    window.addEventListener('click', onWebClick);
    window.addEventListener('keydown', onWebKeyDown);
    webActivityHandlersAttached = true;
}

function untrackWebActivity() {
    if (!webActivityHandlersAttached) {
        return;
    }
    if (onWebMouseMove) window.removeEventListener('mousemove', onWebMouseMove);
    if (onWebClick) window.removeEventListener('click', onWebClick);
    if (onWebKeyDown) window.removeEventListener('keydown', onWebKeyDown);
    webActivityHandlersAttached = false;
    onWebMouseMove = null;
    onWebClick = null;
    onWebKeyDown = null;
}

function resetWebActivity() {
    webActivityData.mouseMovements = 0;
    webActivityData.clicks = 0;
    webActivityData.keystrokes = 0;
}

// Web screenshot capture disabled — desktop-only

// ─────────────────────────────────────────────────────────
//  Electron activity forwarding
// ─────────────────────────────────────────────────────────
let electronActivityListeners: Array<() => void> = [];

function startElectronActivityForwarding() {
    const onMouseMove = () => electronAPI?.sendActivityEvent('mousemove');
    const onClick = () => electronAPI?.sendActivityEvent('click');
    const onKeyDown = () => electronAPI?.sendActivityEvent('keydown');

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('click', onClick);
    window.addEventListener('keydown', onKeyDown);

    electronActivityListeners = [
        () => window.removeEventListener('mousemove', onMouseMove),
        () => window.removeEventListener('click', onClick),
        () => window.removeEventListener('keydown', onKeyDown),
    ];
}

function stopElectronActivityForwarding() {
    electronActivityListeners.forEach(fn => fn());
    electronActivityListeners = [];
}

// ─────────────────────────────────────────────────────────
//  Public API
// ─────────────────────────────────────────────────────────
export const monitoringService = {
    isDesktop: isElectron,

    startMonitoring: (timeEntryId: number, token?: string) => {
        activeTimeEntryId = timeEntryId;
        const screenshotInterval = Number(useAuthStore.getState().user?.features?.screenshot_interval ?? 0);

        if (isElectron && electronAPI) {
            console.log('[Desktop] Starting tracking via Electron IPC');
            electronAPI.startTracking(timeEntryId, token ?? null, screenshotInterval);
            startElectronActivityForwarding();

            // Listen for events pushed from the main process
            cleanupScreenshotListener = electronAPI.onScreenshotCaptured((data: any) => {
                console.log('[Desktop] Screenshot captured, activity:', data.activityLevel);
            });

            return () => {
                monitoringService.stopMonitoring();
            };
        } else {
            // Web: activity sync only — screenshots are desktop-only
            console.log('[Web] View-only mode — no screenshot capture');
            if (monitoringInterval) return;
            trackWebActivity();

            monitoringInterval = setInterval(async () => {
                try {
                    await client.post('/activity-logs/sync', {
                        time_entry_id: activeTimeEntryId ?? timeEntryId,
                        app_name: 'FlowTrack Web',
                        window_title: document.title,
                        mouse_movement: webActivityData.mouseMovements,
                        mouse_clicks: webActivityData.clicks,
                        keyboard_strokes: webActivityData.keystrokes,
                        duration_seconds: 60,
                        logged_at: new Date().toISOString(),
                    });
                    resetWebActivity();
                } catch (err) {
                    console.error('[Web] Activity sync error:', err);
                }
            }, 60_000);

            return () => {
                monitoringService.stopMonitoring();
            };
        }
    },

    stopMonitoring: () => {
        activeTimeEntryId = null;
        if (isElectron && electronAPI) {
            electronAPI.stopTracking();
            stopElectronActivityForwarding();
            if (cleanupScreenshotListener) {
                cleanupScreenshotListener();
                cleanupScreenshotListener = null;
            }
        } else {
            if (monitoringInterval) { clearInterval(monitoringInterval); monitoringInterval = null; }
            if (screenshotInterval) { clearInterval(screenshotInterval); screenshotInterval = null; }
            untrackWebActivity();
        }
    },

    pauseMonitoring: () => {
        if (isElectron && electronAPI) {
            electronAPI.pauseTracking();
        } else {
            if (monitoringInterval) { clearInterval(monitoringInterval); monitoringInterval = null; }
            if (screenshotInterval) { clearInterval(screenshotInterval); screenshotInterval = null; }
        }
    },

    resumeMonitoring: (token?: string) => {
        if (!activeTimeEntryId) return;
        if (isElectron && electronAPI) {
            electronAPI.resumeTracking();
            if (token) {
                electronAPI.setAuthToken(token);
            }
        } else if (!monitoringInterval) {
            monitoringService.startMonitoring(activeTimeEntryId, token);
        }
    },

    /**
     * Push auth token to the main process (call after login).
     */
    syncAuthToken: (token: string) => {
        if (isElectron && electronAPI) {
            electronAPI.setAuthToken(token);
        }
    },

    /**
     * Trigger an immediate screenshot (e.g. from a UI button).
     */
    captureNow: async () => {
        if (isElectron && electronAPI) {
            return electronAPI.captureNow();
        }
        return { success: false, error: 'Only available in desktop app' };
    }
};
