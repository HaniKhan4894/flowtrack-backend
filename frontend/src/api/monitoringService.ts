import client from './client';

// Detect if running inside Electron desktop app
const isElectron = typeof window !== 'undefined' && 'electronAPI' in window;
const electronAPI = isElectron ? (window as any).electronAPI : null;

// ─────────────────────────────────────────────────────────
//  Web-only activity tracking (fallback when not in Electron)
// ─────────────────────────────────────────────────────────
let monitoringInterval: ReturnType<typeof setInterval> | null = null;
let screenshotInterval: ReturnType<typeof setInterval> | null = null;
let cleanupScreenshotListener: (() => void) | null = null;

const webActivityData = {
    mouseMovements: 0,
    clicks: 0,
    keystrokes: 0,
};

function trackWebActivity() {
    window.addEventListener('mousemove', () => webActivityData.mouseMovements++);
    window.addEventListener('click', () => webActivityData.clicks++);
    window.addEventListener('keydown', () => webActivityData.keystrokes++);
}

function calcWebActivityLevel() {
    const total = webActivityData.mouseMovements + (webActivityData.clicks * 5) + (webActivityData.keystrokes * 3);
    return Math.min(100, Math.round(total / 10));
}

function resetWebActivity() {
    webActivityData.mouseMovements = 0;
    webActivityData.clicks = 0;
    webActivityData.keystrokes = 0;
}

// ─────────────────────────────────────────────────────────
//  Web screenshot fallback (canvas placeholder)
// ─────────────────────────────────────────────────────────
async function captureWebScreenshot(timeEntryId: number, activityLevel: number) {
    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext('2d');
    if (ctx) {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#3b82f6';
        ctx.font = 'bold 24px Arial';
        ctx.fillText('FlowTrack – Web Session Capture', 60, 120);
        ctx.fillStyle = '#94a3b8';
        ctx.font = '18px Arial';
        ctx.fillText(new Date().toLocaleString(), 60, 160);
        ctx.fillText(`Activity: ${activityLevel}%`, 60, 200);
    }
    const blob = await new Promise<Blob>((resolve) =>
        canvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.85)
    );
    const formData = new FormData();
    formData.append('time_entry_id', timeEntryId.toString());
    formData.append('activity_level', activityLevel.toString());
    formData.append('is_blurred', '0');
    formData.append('screenshot', blob, 'screenshot.jpg');
    await client.post('/screenshots/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    });
}

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
        if (isElectron && electronAPI) {
            // ── DESKTOP MODE ─────────────────────────────────────
            console.log('[Desktop] Starting tracking via Electron IPC');
            electronAPI.startTracking(timeEntryId, token ?? null);
            startElectronActivityForwarding();

            // Listen for events pushed from the main process
            cleanupScreenshotListener = electronAPI.onScreenshotCaptured((data: any) => {
                console.log('[Desktop] Screenshot captured, activity:', data.activityLevel);
            });

            return () => {
                monitoringService.stopMonitoring();
            };
        } else {
            // ── WEB FALLBACK MODE ─────────────────────────────────
            console.log('[Web] Starting monitoring via browser APIs');
            if (monitoringInterval) return;
            trackWebActivity();

            // Activity sync every 1 minute
            monitoringInterval = setInterval(async () => {
                try {
                    await client.post('/activity-logs/sync', {
                        time_entry_id: timeEntryId,
                        app_name: 'FlowTrack Web',
                        window_title: document.title,
                        mouse_movement: webActivityData.mouseMovements,
                        mouse_clicks: webActivityData.clicks,
                        keyboard_strokes: webActivityData.keystrokes,
                        logged_at: new Date().toISOString()
                    });
                    resetWebActivity();
                } catch (err) {
                    console.error('[Web] Activity sync error:', err);
                }
            }, 60_000);

            // Screenshot every 3 minutes
            screenshotInterval = setInterval(async () => {
                const level = calcWebActivityLevel();
                await captureWebScreenshot(timeEntryId, level);
                resetWebActivity();
            }, 180_000);

            return () => {
                monitoringService.stopMonitoring();
            };
        }
    },

    stopMonitoring: () => {
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
