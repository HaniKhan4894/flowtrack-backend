const { app, BrowserWindow, ipcMain, desktopCapturer, nativeImage, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const FormData = require('form-data');

// ──────────────────────────────────────────────
//  Config
// ──────────────────────────────────────────────
const API_BASE_URL = 'http://localhost:8080/api/v1';
const SCREENSHOT_MIN_MS = 1 * 60 * 1000; // 1 minute minimum
const SCREENSHOT_MAX_MS = 4 * 60 * 1000; // 4 minutes maximum
const ACTIVITY_SYNC_INTERVAL_MS = 60 * 1000;  // 1 minute

// ──────────────────────────────────────────────
//  State
// ──────────────────────────────────────────────
let mainWindow = null;
let screenshotTimer = null;   // holds the current setTimeout handle
let activitySyncTimer = null;
let currentSession = {
    token: null,
    timeEntryId: null,
    isTracking: false,
    activityBuffer: { mouseMovements: 0, clicks: 0, keystrokes: 0 }
};

// ──────────────────────────────────────────────
//  Window
// ──────────────────────────────────────────────
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 860,
        minWidth: 900,
        minHeight: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
        },
        titleBarStyle: 'hidden',
        titleBarOverlay: process.platform === 'win32' ? {
            color: '#0A0C12',
            symbolColor: '#94a3b8',
            height: 32
        } : true,
        backgroundColor: '#0A0C12',
    });

    const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
    if (isDev) {
        mainWindow.loadURL('http://localhost:5173');
    } else {
        mainWindow.loadFile(path.join(__dirname, '../frontend/dist/index.html'));
    }

    mainWindow.on('closed', () => { mainWindow = null; });
}

// ──────────────────────────────────────────────
//  Screenshot Capture
// ──────────────────────────────────────────────
async function captureActiveScreen() {
    try {
        // Find which display the cursor is currently on
        const cursorPoint    = screen.getCursorScreenPoint();
        const activeDisplay  = screen.getDisplayNearestPoint(cursorPoint);

        const { width, height } = activeDisplay.size;

        // Get all screen sources at the active display's resolution
        const sources = await desktopCapturer.getSources({
            types: ['screen'],
            thumbnailSize: { width, height }
        });

        if (sources.length === 0) {
            console.warn('[Screenshot] No screen sources found.');
            return null;
        }

        // Match the source to the active display.
        // Electron source IDs look like "screen:0:0", "screen:1:0" etc.
        // The display index maps to the source list order on most platforms.
        const allDisplays  = screen.getAllDisplays();
        const displayIndex = allDisplays.findIndex(d => d.id === activeDisplay.id);

        // Use the matched index, fall back to source[0] if not found
        const matchedSource = sources[displayIndex] ?? sources[0];

        const resized = matchedSource.thumbnail.resize({ width: 1280, quality: 'good' });
        const jpeg    = resized.toJPEG(85);

        console.log(`[Screenshot] Active screen: "${matchedSource.name}" (display ${displayIndex + 1}) — cursor at (${cursorPoint.x}, ${cursorPoint.y})`);

        return { buffer: jpeg, name: matchedSource.name, index: displayIndex };
    } catch (err) {
        console.error('[Screenshot] Capture error:', err);
        return null;
    }
}

function calculateActivityLevel(activity) {
    const total = activity.mouseMovements + (activity.clicks * 5) + (activity.keystrokes * 3);
    // Cap at 100%
    return Math.min(100, Math.round(total / 10));
}

async function uploadScreenshot(jpegBuffer, activityLevel, screenIndex = 0) {
    if (!currentSession.token || !currentSession.timeEntryId) {
        console.warn('[Screenshot] No active session, skipping upload.');
        return;
    }

    try {
        const form = new FormData();
        form.append('time_entry_id', currentSession.timeEntryId.toString());
        form.append('activity_level', activityLevel.toString());
        form.append('is_blurred', '0');
        form.append('screenshot', jpegBuffer, {
            filename: `screenshot_screen${screenIndex + 1}_${Date.now()}.jpg`,
            contentType: 'image/jpeg'
        });

        const urlParts = new URL(`${API_BASE_URL}/screenshots/upload`);
        const isHttps = urlParts.protocol === 'https:';
        const lib = isHttps ? https : http;

        const options = {
            hostname: urlParts.hostname,
            port: urlParts.port || (isHttps ? 443 : 80),
            path: urlParts.pathname,
            method: 'POST',
            headers: {
                ...form.getHeaders(),
                'Authorization': `Bearer ${currentSession.token}`
            }
        };

        await new Promise((resolve, reject) => {
            const req = lib.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        console.log(`[Screenshot] Uploaded successfully. Status: ${res.statusCode}`);
                        // Notify renderer that a new screenshot was taken
                        if (mainWindow && !mainWindow.isDestroyed()) {
                            mainWindow.webContents.send('screenshot-captured', { activityLevel });
                        }
                        resolve(data);
                    } else {
                        console.error(`[Screenshot] Upload failed. Status: ${res.statusCode}`, data);
                        reject(new Error(`Upload failed: ${res.statusCode}`));
                    }
                });
            });
            req.on('error', reject);
            form.pipe(req);
        });
    } catch (err) {
        console.error('[Screenshot] Upload error:', err.message);
    }
}

// ──────────────────────────────────────────────
//  Monitoring Loop
// ──────────────────────────────────────────────
/**
 * Returns a random delay between SCREENSHOT_MIN_MS and SCREENSHOT_MAX_MS
 */
function randomScreenshotDelay() {
    return Math.floor(Math.random() * (SCREENSHOT_MAX_MS - SCREENSHOT_MIN_MS + 1)) + SCREENSHOT_MIN_MS;
}

/**
 * Recursive random-interval screenshot scheduler.
 * Each screenshot schedules the NEXT one with a fresh random delay.
 */
async function scheduleNextScreenshot() {
    if (!currentSession.isTracking) return; // stopped

    const delay = randomScreenshotDelay();
    const delayMin = (delay / 60000).toFixed(1);
    console.log(`[Screenshot] Next capture in ${delayMin} min`);

    screenshotTimer = setTimeout(async () => {
        if (!currentSession.isTracking) return;

        const shot = await captureActiveScreen();
        if (shot) {
            const activityLevel = calculateActivityLevel(currentSession.activityBuffer);
            await uploadScreenshot(shot.buffer, activityLevel, shot.index);
        }
        // Reset activity counters after each shot
        currentSession.activityBuffer = { mouseMovements: 0, clicks: 0, keystrokes: 0 };

        // Schedule next screenshot with a new random delay
        scheduleNextScreenshot();
    }, delay);
}

function startMonitoringLoop() {
    if (screenshotTimer) return; // already running

    console.log('[Monitoring] Starting screenshot capture loop (random 1-4 min)...');

    // Kick off the first random screenshot
    scheduleNextScreenshot();

    // Activity sync every 1 minute
    activitySyncTimer = setInterval(async () => {
        if (!currentSession.isTracking || !currentSession.token || !currentSession.timeEntryId) return;

        try {
            const body = JSON.stringify({
                time_entry_id: currentSession.timeEntryId,
                app_name: 'FlowTrack Desktop',
                window_title: 'FlowTrack',
                mouse_movement: currentSession.activityBuffer.mouseMovements,
                mouse_clicks: currentSession.activityBuffer.clicks,
                keyboard_strokes: currentSession.activityBuffer.keystrokes,
                logged_at: new Date().toISOString()
            });

            const urlParts = new URL(`${API_BASE_URL}/activity-logs/sync`);
            const isHttps = urlParts.protocol === 'https:';
            const lib = isHttps ? https : http;

            const options = {
                hostname: urlParts.hostname,
                port: urlParts.port || (isHttps ? 443 : 80),
                path: urlParts.pathname,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(body),
                    'Authorization': `Bearer ${currentSession.token}`
                }
            };

            await new Promise((resolve, reject) => {
                const req = lib.request(options, (res) => {
                    res.on('data', () => {});
                    res.on('end', resolve);
                });
                req.on('error', reject);
                req.write(body);
                req.end();
            });
            console.log('[Activity] Synced to backend.');
        } catch (err) {
            console.error('[Activity] Sync error:', err.message);
        }
    }, ACTIVITY_SYNC_INTERVAL_MS);
}

function stopMonitoringLoop() {
    if (screenshotTimer) { clearTimeout(screenshotTimer); screenshotTimer = null; }  // setTimeout, not setInterval
    if (activitySyncTimer) { clearInterval(activitySyncTimer); activitySyncTimer = null; }
    console.log('[Monitoring] Stopped.');
}

// ──────────────────────────────────────────────
//  IPC Handlers
// ──────────────────────────────────────────────
ipcMain.handle('get-app-version', () => app.getVersion());

// Called from renderer when user logs in
ipcMain.handle('set-auth-token', (_event, token) => {
    currentSession.token = token;
    console.log('[IPC] Auth token set.');
    return { success: true };
});

// Called from renderer when a timer starts
ipcMain.handle('start-tracking', (_event, { timeEntryId, token }) => {
    currentSession.token = token || currentSession.token;
    currentSession.timeEntryId = timeEntryId;
    currentSession.isTracking = true;
    currentSession.activityBuffer = { mouseMovements: 0, clicks: 0, keystrokes: 0 };
    startMonitoringLoop();
    console.log(`[IPC] Tracking started for time entry: ${timeEntryId}`);
    return { success: true };
});

// Called from renderer when timer stops
ipcMain.handle('stop-tracking', () => {
    currentSession.isTracking = false;
    stopMonitoringLoop();
    console.log('[IPC] Tracking stopped.');
    return { success: true };
});

// Called from renderer to record activity events
ipcMain.on('activity-event', (_event, type) => {
    if (!currentSession.isTracking) return;
    if (type === 'mousemove') currentSession.activityBuffer.mouseMovements++;
    else if (type === 'click') currentSession.activityBuffer.clicks++;
    else if (type === 'keydown') currentSession.activityBuffer.keystrokes++;
});

// Capture a screenshot on demand (for testing / manual trigger)
ipcMain.handle('capture-screenshot-now', async () => {
    const buffer = await captureScreenshot();
    if (!buffer) return { success: false, error: 'Capture failed' };
    const activityLevel = calculateActivityLevel(currentSession.activityBuffer);
    await uploadScreenshot(buffer, activityLevel);
    return { success: true, activityLevel };
});

// Check if running in Electron
ipcMain.handle('is-desktop', () => true);

// ──────────────────────────────────────────────
//  App Lifecycle
// ──────────────────────────────────────────────
app.whenReady().then(() => {
    createWindow();
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    stopMonitoringLoop();
    if (process.platform !== 'darwin') app.quit();
});
