const { app, BrowserWindow, ipcMain, desktopCapturer, nativeImage, screen, Tray, Menu, powerMonitor, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const FormData = require('form-data');
const { API_BASE_URL, FRONTEND_URL, getApiHeaders } = require('./config');

// ──────────────────────────────────────────────
//  Config
// ──────────────────────────────────────────────
const SCREENSHOT_MIN_MS = 1 * 60 * 1000; // 1 minute minimum
const SCREENSHOT_MAX_MS = 4 * 60 * 1000; // 4 minutes maximum
const ACTIVITY_SYNC_INTERVAL_MS = 60 * 1000;  // 1 minute

// ──────────────────────────────────────────────
//  State
// ──────────────────────────────────────────────
let mainWindow = null;
let appIsQuitting = false;
let screenshotTimer = null;   // holds the current setTimeout handle
let activitySyncTimer = null;
let tokenRefreshTimer = null;
let distractionTimer = null;
let isPaused = false;
let pausedByLock = false;
let tray = null;
let lastInputActivityTs = Date.now();
const IDLE_THRESHOLD_MS = 5 * 60 * 1000;
const DISTRACTION_ALERT_MS = 5 * 1000;
const DISTRACTION_CHECK_MS = 2 * 1000;

const DISTRACTION_PATTERNS = [
    { pattern: /whatsapp/i, label: 'WhatsApp' },
    { pattern: /youtube/i, label: 'YouTube' },
    { pattern: /tiktok/i, label: 'TikTok' },
    { pattern: /instagram/i, label: 'Instagram' },
    { pattern: /facebook|messenger/i, label: 'Facebook' },
    { pattern: /netflix/i, label: 'Netflix' },
    { pattern: /discord/i, label: 'Discord' },
    { pattern: /spotify/i, label: 'Spotify' },
    { pattern: /twitter|^x\.exe$/i, label: 'X (Twitter)' },
    { pattern: /reddit/i, label: 'Reddit' },
    { pattern: /telegram/i, label: 'Telegram' },
    { pattern: /snapchat/i, label: 'Snapchat' },
    { pattern: /pinterest/i, label: 'Pinterest' },
    { pattern: /twitch/i, label: 'Twitch' },
];

let distractionState = {
    appKey: null,
    startedAt: null,
    notified: false,
};
let currentSession = {
    token: null,
    timeEntryId: null,
    isTracking: false,
    activityBuffer: { mouseMovements: 0, clicks: 0, keystrokes: 0 }
};

function clearDesktopSession() {
    currentSession.token = null;
    currentSession.timeEntryId = null;
    currentSession.isTracking = false;
    currentSession.activityBuffer = { mouseMovements: 0, clicks: 0, keystrokes: 0 };
    isPaused = false;
    pausedByLock = false;
    stopMonitoringLoop();
}

async function readTokenFromRenderer() {
    if (!mainWindow || mainWindow.isDestroyed()) {
        return currentSession.token;
    }
    try {
        const token = await mainWindow.webContents.executeJavaScript(
            'localStorage.getItem("access_token") || ""',
            true
        );
        if (token) {
            currentSession.token = token;
            return token;
        }
    } catch (err) {
        console.warn('[Auth] Could not read token from renderer:', err.message);
    }
    return currentSession.token;
}

async function refreshTokenViaRenderer() {
    if (!mainWindow || mainWindow.isDestroyed()) {
        return null;
    }
    try {
        const token = await mainWindow.webContents.executeJavaScript(`
            (async () => {
                const refresh = localStorage.getItem('refresh_token');
                if (!refresh) return null;
                try {
                    const res = await fetch('${API_BASE_URL}/auth/refresh', {
                        method: 'POST',
                        headers: ${JSON.stringify(getApiHeaders({ 'Content-Type': 'application/json' }))},
                        body: JSON.stringify({ refresh_token: refresh })
                    });
                    const json = await res.json();
                    const newToken = json?.data?.access_token;
                    if (newToken) {
                        localStorage.setItem('access_token', newToken);
                        if (json?.data?.organization_id) {
                            localStorage.setItem('organization_id', String(json.data.organization_id));
                        }
                        return newToken;
                    }
                } catch (e) {
                    console.error('[Auth] Refresh failed in renderer', e);
                }
                return null;
            })()
        `, true);
        if (token) {
            currentSession.token = token;
            console.log('[Auth] Access token refreshed for desktop session.');
        }
        return token;
    } catch (err) {
        console.warn('[Auth] Token refresh via renderer failed:', err.message);
        return null;
    }
}

async function resolveAuthToken(forceRefresh = false) {
    if (forceRefresh) {
        const refreshed = await refreshTokenViaRenderer();
        if (refreshed) return refreshed;
    }
    const fromRenderer = await readTokenFromRenderer();
    if (fromRenderer) return fromRenderer;
    return currentSession.token;
}

function resolveFrontendIndexPath() {
    if (app.isPackaged) {
        return path.join(process.resourcesPath, 'frontend', 'dist', 'index.html');
    }
    return path.join(__dirname, '..', 'frontend', 'dist', 'index.html');
}

// ──────────────────────────────────────────────
//  Window
// ──────────────────────────────────────────────
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 860,
        minWidth: 900,
        minHeight: 600,
        frame: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
        },
        backgroundColor: '#0A0C12',
        show: false,
    });

    const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
    const devUrl = process.env.FLOWTRACK_FRONTEND_URL || 'http://localhost:5173';
    const loadTarget = isDev ? devUrl : (FRONTEND_URL || null);

    if (loadTarget) {
        const entryUrl = `${loadTarget.replace(/\/$/, '')}/login`;
        console.log(`[Window] Loading URL: ${entryUrl}`);
        mainWindow.loadURL(entryUrl).catch((err) => {
            console.error('[Window] Failed to load remote UI:', err.message);
            if (!isDev && fs.existsSync(resolveFrontendIndexPath())) {
                console.log('[Window] Falling back to bundled UI.');
                mainWindow.loadFile(resolveFrontendIndexPath());
            }
        });
    } else {
        console.log('[Window] Loading bundled UI.');
        mainWindow.loadFile(resolveFrontendIndexPath());
    }

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    mainWindow.on('closed', () => { mainWindow = null; });

    mainWindow.on('close', (event) => {
        if (!appIsQuitting) {
            event.preventDefault();
            mainWindow.hide();
        }
    });

    mainWindow.on('maximize', () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('window-maximized-changed', true);
        }
    });

    mainWindow.on('unmaximize', () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('window-maximized-changed', false);
        }
    });
}

function showMainWindow() {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) {
        mainWindow.restore();
    }
    mainWindow.setSkipTaskbar(false);
    mainWindow.show();
    mainWindow.focus();
}

function setupTray() {
    if (tray) return;
    const iconPath = path.join(__dirname, 'icon.png');
    if (!fs.existsSync(iconPath)) {
        return;
    }
    const icon = nativeImage.createFromPath(iconPath);
    tray = new Tray(icon);
    tray.setToolTip('FlowTrack');
    tray.setContextMenu(Menu.buildFromTemplate([
        { label: 'Show FlowTrack', click: () => showMainWindow() },
        { label: 'Quit', click: () => { appIsQuitting = true; app.quit(); } },
    ]));
    tray.on('double-click', () => showMainWindow());
    tray.on('click', () => showMainWindow());
}

// ──────────────────────────────────────────────
//  Screenshot Capture
// ──────────────────────────────────────────────
async function captureAllScreens() {
    try {
        const displays = screen.getAllDisplays();
        if (!displays.length) {
            console.warn('[Screenshot] No displays found.');
            return [];
        }

        const maxWidth = Math.max(...displays.map(d => d.size.width));
        const maxHeight = Math.max(...displays.map(d => d.size.height));

        // Get all screen sources once using max display resolution.
        const sources = await desktopCapturer.getSources({
            types: ['screen'],
            thumbnailSize: { width: maxWidth, height: maxHeight }
        });

        if (sources.length === 0) {
            console.warn('[Screenshot] No screen sources found.');
            return [];
        }

        const shots = [];
        for (let index = 0; index < displays.length; index++) {
            const display = displays[index];
            const source = sources[index] ?? sources[0];
            if (!source || source.thumbnail.isEmpty()) {
                continue;
            }

            const resized = source.thumbnail.resize({ width: 1280, quality: 'good' });
            const jpeg = resized.toJPEG(85);
            shots.push({
                buffer: jpeg,
                name: source.name || `Display ${index + 1}`,
                index,
                displayId: display.id,
            });
        }

        console.log(`[Screenshot] Captured ${shots.length}/${displays.length} display(s).`);
        return shots;
    } catch (err) {
        console.error('[Screenshot] Capture error:', err);
        return [];
    }
}

function calculateActivityLevel(activity) {
    const total = activity.mouseMovements + (activity.clicks * 5) + (activity.keystrokes * 3);
    // Cap at 100%
    return Math.min(100, Math.round(total / 10));
}

async function uploadScreenshot(jpegBuffer, activityLevel, screenIndex = 0, retried = false) {
    if (!currentSession.timeEntryId) {
        console.warn('[Screenshot] No active session, skipping upload.');
        return;
    }

    const token = await resolveAuthToken(false);
    if (!token) {
        console.warn('[Screenshot] No auth token available, skipping upload.');
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
                ...getApiHeaders(),
                'Authorization': `Bearer ${token}`
            }
        };

        const statusCode = await new Promise((resolve, reject) => {
            const req = lib.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        console.log(`[Screenshot] Uploaded successfully. Status: ${res.statusCode}`);
                        if (mainWindow && !mainWindow.isDestroyed()) {
                            mainWindow.webContents.send('screenshot-captured', { activityLevel });
                        }
                        resolve(res.statusCode);
                    } else {
                        console.error(`[Screenshot] Upload failed. Status: ${res.statusCode}`, data);
                        reject(Object.assign(new Error(`Upload failed: ${res.statusCode}`), { statusCode: res.statusCode }));
                    }
                });
            });
            req.on('error', reject);
            form.pipe(req);
        });

        return statusCode;
    } catch (err) {
        if (err.statusCode === 401 && !retried) {
            console.log('[Screenshot] Token expired — refreshing and retrying upload...');
            const newToken = await resolveAuthToken(true);
            if (newToken) {
                return uploadScreenshot(jpegBuffer, activityLevel, screenIndex, true);
            }
        }
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
    if (!currentSession.isTracking || isPaused) return; // stopped or paused

    const delay = randomScreenshotDelay();
    const delayMin = (delay / 60000).toFixed(1);
    console.log(`[Screenshot] Next capture in ${delayMin} min`);

    screenshotTimer = setTimeout(async () => {
        if (!currentSession.isTracking) return;

        const shots = await captureAllScreens();
        if (shots.length > 0) {
            const activityLevel = calculateActivityLevel(currentSession.activityBuffer);
            for (const shot of shots) {
                await uploadScreenshot(shot.buffer, activityLevel, shot.index);
            }
        }
        // Reset activity counters after each shot
        currentSession.activityBuffer = { mouseMovements: 0, clicks: 0, keystrokes: 0 };

        // Schedule next screenshot with a new random delay
        scheduleNextScreenshot();
    }, delay);
}

function showDesktopNotification(title, body) {
    if (Notification.isSupported()) {
        new Notification({ title, body, silent: false }).show();
    }
}

function isInternalTrackerApp(appName, windowTitle = '') {
    const hay = `${appName} ${windowTitle}`.toLowerCase();
    return hay.includes('flowtrack')
        || (hay.includes('electron') && hay.includes('flowtrack'))
        || hay.includes('localhost:5173')
        || hay.includes('vite');
}

function getDistractionLabel(appName, windowTitle = '') {
    const hay = `${appName} ${windowTitle}`;
    for (const { pattern, label } of DISTRACTION_PATTERNS) {
        if (pattern.test(hay)) {
            return label;
        }
    }
    return null;
}

function resetDistractionState() {
    distractionState = { appKey: null, startedAt: null, notified: false };
}

async function checkDistractionAlert() {
    if (!currentSession.isTracking || isPaused) {
        resetDistractionState();
        return;
    }

    const { appName, windowTitle } = await getForegroundApp();

    if (isInternalTrackerApp(appName, windowTitle)) {
        resetDistractionState();
        return;
    }

    const label = getDistractionLabel(appName, windowTitle);
    if (!label) {
        resetDistractionState();
        return;
    }

    const key = label.toLowerCase();
    const now = Date.now();

    if (distractionState.appKey !== key) {
        distractionState = { appKey: key, startedAt: now, notified: false };
        return;
    }

    if (!distractionState.notified && distractionState.startedAt && (now - distractionState.startedAt) >= DISTRACTION_ALERT_MS) {
        distractionState.notified = true;
        showDesktopNotification(
            'Stay focused',
            `${label} is open — switch back to work when you're ready.`
        );
        console.log(`[Distraction] Alert sent for ${label}`);
    }
}

function startDistractionMonitor() {
    if (distractionTimer) return;
    distractionTimer = setInterval(checkDistractionAlert, DISTRACTION_CHECK_MS);
}

function stopDistractionMonitor() {
    if (distractionTimer) {
        clearInterval(distractionTimer);
        distractionTimer = null;
    }
    resetDistractionState();
}

async function getForegroundApp() {
    try {
        const activeWin = require('active-win');
        const win = await activeWin();
        if (win) {
            return {
                appName: win.owner?.name || 'Unknown App',
                windowTitle: win.title || '',
            };
        }
    } catch (err) {
        // active-win optional — fallback below
    }
    return { appName: 'FlowTrack Desktop', windowTitle: 'FlowTrack' };
}

async function syncActivityToBackend(retried = false) {
    if (!currentSession.isTracking || isPaused || !currentSession.timeEntryId) return;

    const token = await resolveAuthToken(false);
    if (!token) {
        console.warn('[Activity] No auth token available, skipping sync.');
        return;
    }

    try {
        const { appName, windowTitle } = await getForegroundApp();

        if (isInternalTrackerApp(appName, windowTitle)) {
            return;
        }

        const body = JSON.stringify({
            time_entry_id: currentSession.timeEntryId,
            app_name: appName,
            window_title: windowTitle,
            mouse_movement: currentSession.activityBuffer.mouseMovements,
            mouse_clicks: currentSession.activityBuffer.clicks,
            keyboard_strokes: currentSession.activityBuffer.keystrokes,
            duration_seconds: Math.round(ACTIVITY_SYNC_INTERVAL_MS / 1000),
            logged_at: new Date().toISOString(),
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
                ...getApiHeaders({
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(body),
                }),
                'Authorization': `Bearer ${token}`
            }
        };

        await new Promise((resolve, reject) => {
            const req = lib.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(data);
                    } else {
                        reject(Object.assign(new Error(`Activity sync failed: ${res.statusCode}`), { statusCode: res.statusCode, body: data }));
                    }
                });
            });
            req.on('error', reject);
            req.write(body);
            req.end();
        });
        console.log('[Activity] Synced to backend.');
    } catch (err) {
        if (err.statusCode === 401 && !retried) {
            console.log('[Activity] Token expired — refreshing and retrying sync...');
            const newToken = await resolveAuthToken(true);
            if (newToken) {
                return syncActivityToBackend(true);
            }
        }
        console.error('[Activity] Sync error:', err.message);
    }
}

function startMonitoringLoop() {
    if (screenshotTimer || isPaused) return; // already running or paused

    console.log('[Monitoring] Starting screenshot capture loop (random 1-4 min)...');

    // Kick off the first random screenshot
    scheduleNextScreenshot();

    // Activity sync every 1 minute
    activitySyncTimer = setInterval(syncActivityToBackend, ACTIVITY_SYNC_INTERVAL_MS);
    startTokenRefreshLoop();
    startDistractionMonitor();

    // Idle guard: auto-pause capture when no local activity for threshold
    setInterval(() => {
        if (!currentSession.isTracking || isPaused) return;
        const idleFor = Date.now() - lastInputActivityTs;
        if (idleFor >= IDLE_THRESHOLD_MS) {
            isPaused = true;
            stopMonitoringLoop();
            console.log('[Monitoring] Auto-paused due to idle inactivity.');
        }
    }, 30_000);
}

function stopMonitoringLoop() {
    if (screenshotTimer) { clearTimeout(screenshotTimer); screenshotTimer = null; }
    if (activitySyncTimer) { clearInterval(activitySyncTimer); activitySyncTimer = null; }
    if (tokenRefreshTimer) { clearInterval(tokenRefreshTimer); tokenRefreshTimer = null; }
    stopDistractionMonitor();
    console.log('[Monitoring] Stopped.');
}

function startTokenRefreshLoop() {
    if (tokenRefreshTimer) return;
    // Refresh access token every 10 min while tracking (JWT expires in 15 min)
    tokenRefreshTimer = setInterval(async () => {
        if (currentSession.isTracking) {
            await refreshTokenViaRenderer();
        }
    }, 10 * 60 * 1000);
}

// ──────────────────────────────────────────────
//  IPC Handlers
// ──────────────────────────────────────────────
ipcMain.handle('get-app-version', () => app.getVersion());

// Called from renderer when user logs in / out
ipcMain.handle('set-auth-token', (_event, token) => {
    if (!token) {
        clearDesktopSession();
        console.log('[IPC] Auth cleared — desktop session stopped.');
        return { success: true };
    }
    currentSession.token = token;
    console.log('[IPC] Auth token updated.');
    return { success: true };
});

ipcMain.handle('logout-session', () => {
    clearDesktopSession();
    console.log('[IPC] Full logout — desktop session cleared.');
    return { success: true };
});

// Called from renderer when a timer starts
ipcMain.handle('start-tracking', (_event, { timeEntryId, token }) => {
    currentSession.token = token || currentSession.token;
    currentSession.timeEntryId = timeEntryId;
    currentSession.isTracking = true;
    isPaused = false;
    pausedByLock = false;
    currentSession.activityBuffer = { mouseMovements: 0, clicks: 0, keystrokes: 0 };
    startMonitoringLoop();
    console.log(`[IPC] Tracking started for time entry: ${timeEntryId}`);
    return { success: true };
});

// Called from renderer when timer stops
ipcMain.handle('stop-tracking', () => {
    currentSession.isTracking = false;
    currentSession.timeEntryId = null;
    isPaused = false;
    pausedByLock = false;
    stopMonitoringLoop();
    console.log('[IPC] Tracking stopped.');
    return { success: true };
});

ipcMain.handle('pause-tracking', () => {
    if (!currentSession.isTracking) {
        return { success: false, error: 'No active tracking session' };
    }
    pausedByLock = false;
    isPaused = true;
    stopMonitoringLoop();
    return { success: true };
});

ipcMain.handle('resume-tracking', () => {
    if (!currentSession.isTracking) {
        return { success: false, error: 'No active tracking session' };
    }
    pausedByLock = false;
    isPaused = false;
    startMonitoringLoop();
    return { success: true };
});

// Called from renderer to record activity events
ipcMain.on('activity-event', (_event, type) => {
    if (!currentSession.isTracking) return;
    lastInputActivityTs = Date.now();
    if (type === 'mousemove') currentSession.activityBuffer.mouseMovements++;
    else if (type === 'click') currentSession.activityBuffer.clicks++;
    else if (type === 'keydown') currentSession.activityBuffer.keystrokes++;
});

// Capture a screenshot on demand (for testing / manual trigger)
ipcMain.handle('capture-screenshot-now', async () => {
    const shots = await captureAllScreens();
    if (!shots.length) return { success: false, error: 'Capture failed' };
    const activityLevel = calculateActivityLevel(currentSession.activityBuffer);
    for (const shot of shots) {
        await uploadScreenshot(shot.buffer, activityLevel, shot.index);
    }
    return { success: true, activityLevel, capturedScreens: shots.length };
});

// Check if running in Electron
ipcMain.handle('is-desktop', () => true);

ipcMain.handle('window-minimize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.minimize();
    }
    return { success: true };
});

ipcMain.handle('window-maximize', () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
        return { success: false, isMaximized: false };
    }
    if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
    } else {
        mainWindow.maximize();
    }
    return { success: true, isMaximized: mainWindow.isMaximized() };
});

ipcMain.handle('window-is-maximized', () => ({
    isMaximized: Boolean(mainWindow && !mainWindow.isDestroyed() && mainWindow.isMaximized()),
}));

ipcMain.handle('window-close', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.close();
    }
    return { success: true };
});

// ──────────────────────────────────────────────
//  App Lifecycle
// ──────────────────────────────────────────────
app.whenReady().then(() => {
    console.log(`[Config] API base URL: ${API_BASE_URL}`);
    console.log(`[Config] Frontend URL: ${FRONTEND_URL}`);
    createWindow();
    setupTray();

    powerMonitor.on('lock-screen', () => {
        if (!currentSession.isTracking || isPaused) return;
        pausedByLock = true;
        isPaused = true;
        stopMonitoringLoop();
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('system-locked');
        }
        showDesktopNotification('FlowTrack', 'Timer paused — your system was locked.');
        console.log('[Power] Lock screen — tracking paused.');
    });

    powerMonitor.on('unlock-screen', () => {
        if (!currentSession.isTracking || !pausedByLock) return;
        pausedByLock = false;
        isPaused = false;
        startMonitoringLoop();
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('system-unlocked');
        }
        showDesktopNotification('FlowTrack', 'Timer resumed — welcome back!');
        console.log('[Power] Unlock screen — tracking resumed.');
    });

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
        else showMainWindow();
    });

    if (mainWindow) {
        mainWindow.on('show', () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.setSkipTaskbar(false);
            }
        });
        mainWindow.on('restore', () => showMainWindow());
    }
});

app.on('before-quit', () => {
    appIsQuitting = true;
});

app.on('window-all-closed', () => {
    stopMonitoringLoop();
    // Keep running in tray on Windows — only quit via tray/menu.
});
