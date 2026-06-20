const { app, BrowserWindow, ipcMain, desktopCapturer, nativeImage, screen, Tray, Menu, powerMonitor, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const FormData = require('form-data');
const { API_BASE_URL, FRONTEND_URL, getApiHeaders } = require('./config');
const activityTracker = require('./activityTracker');
const systemInput = require('./systemInput');
const networkInfo = require('./networkInfo');
const timerReminderPrompt = require('./timerReminderPrompt');

// ──────────────────────────────────────────────
//  Config
// ──────────────────────────────────────────────
const SCREENSHOT_MIN_MS = 1 * 60 * 1000; // fallback minimum
const SCREENSHOT_MAX_MS = 4 * 60 * 1000; // fallback maximum
let planScreenshotIntervalMinutes = 0;
let suppressScreenshotNotifications = false;
let urlTrackingEnabled = true;
let activityTrackingEnabled = true;
let idleThresholdSec = 5 * 60;
let keepIdleTimeMode = 'prompt';
let idleGuardTimer = null;
let timerReminderEnabled = true;
let pausedWorkReminderState = {
    activeSince: null,
    snoozeUntil: 0,
};

const PAUSED_WORK_ACTIVE_SEC = 30;
const PAUSED_WORK_REMINDER_MS = 90 * 1000;
const PAUSED_WORK_SNOOZE_MS = 15 * 60 * 1000;

// ──────────────────────────────────────────────
//  State
// ──────────────────────────────────────────────
let mainWindow = null;
let appIsQuitting = false;
let screenshotTimer = null;   // holds the current setTimeout handle
let tokenRefreshTimer = null;
let sessionRefreshTimer = null;
let distractionTimer = null;
let isPaused = false;
let pausedByLock = false;
let pausedByIdle = false;
let tray = null;
let shutdownDone = false;
let windowVisible = false;
const IDLE_RESUME_SEC = 12;
const IDLE_CHECK_MS = 5 * 1000;
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
};

function resetPausedWorkReminder() {
    pausedWorkReminderState.activeSince = null;
    timerReminderPrompt.close();
}

function handleTimerReminderResponse(action) {
    resetPausedWorkReminder();
    if (action === 'yes') {
        if (!currentSession.isTracking || !isPaused) return;
        pausedByLock = false;
        pausedByIdle = false;
        isPaused = false;
        startMonitoringLoop();
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('timer-reminder-resume');
        }
        showDesktopNotification('FlowTrack', 'Timer resumed — tracking your work again.');
        console.log('[TimerReminder] User chose Yes — timer resumed.');
        return;
    }
    pausedWorkReminderState.snoozeUntil = Date.now() + PAUSED_WORK_SNOOZE_MS;
    console.log('[TimerReminder] User chose No — snoozed for 15 minutes.');
}

async function checkPausedWorkReminder() {
    if (!timerReminderEnabled || !currentSession.isTracking || !isPaused || pausedByIdle || pausedByLock) {
        resetPausedWorkReminder();
        return;
    }
    if (Date.now() < pausedWorkReminderState.snoozeUntil) {
        pausedWorkReminderState.activeSince = null;
        return;
    }
    if (timerReminderPrompt.isOpen()) return;

    const systemIdleSec = powerMonitor.getSystemIdleTime();
    if (systemIdleSec >= PAUSED_WORK_ACTIVE_SEC) {
        pausedWorkReminderState.activeSince = null;
        return;
    }

    const { appName, windowTitle } = await getForegroundApp();
    if (isInternalTrackerApp(appName, windowTitle)) {
        pausedWorkReminderState.activeSince = null;
        return;
    }

    const now = Date.now();
    if (!pausedWorkReminderState.activeSince) {
        pausedWorkReminderState.activeSince = now;
        return;
    }

    if (now - pausedWorkReminderState.activeSince < PAUSED_WORK_REMINDER_MS) {
        return;
    }

    pausedWorkReminderState.activeSince = null;
    timerReminderPrompt.show(handleTimerReminderResponse);
    console.log('[TimerReminder] Prompt shown — working while timer paused.');
}

function clearDesktopSession() {
    currentSession.token = null;
    currentSession.timeEntryId = null;
    currentSession.isTracking = false;
    isPaused = false;
    pausedByLock = false;
    pausedByIdle = false;
    resetPausedWorkReminder();
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
                    const newRefresh = json?.data?.refresh_token;
                    if (newToken) {
                        localStorage.setItem('access_token', newToken);
                        if (newRefresh) {
                            localStorage.setItem('refresh_token', newRefresh);
                        }
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

function resolveAppIcon() {
    const candidates = process.platform === 'win32'
        ? [
            path.join(__dirname, 'build', 'icon.ico'),
            path.join(__dirname, 'build', 'icon.png'),
            path.join(__dirname, 'icon.png'),
        ]
        : [
            path.join(__dirname, 'build', 'icon.png'),
            path.join(__dirname, 'icon.png'),
        ];

    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
            const image = nativeImage.createFromPath(candidate);
            if (!image.isEmpty()) {
                return image;
            }
        }
    }
    return null;
}

function isFlowTrackProcess(win) {
    if (!win?.owner) {
        return false;
    }

    const ownerPath = String(win.owner.path || '').toLowerCase();
    const ownerName = String(win.owner.name || '').toLowerCase();
    const title = String(win.title || '').toLowerCase();

    if (Number(win.owner.processId) === process.pid) {
        return true;
    }
    if (ownerPath.includes('flowtrack')) {
        return true;
    }
    if (ownerName.includes('flowtrack')) {
        return true;
    }
    if (ownerName === 'electron' && (
        title.includes('flowtrack')
        || title.includes('localhost:5173')
        || title.includes('flowtrackhani.vercel.app')
    )) {
        return true;
    }

    return false;
}

function normalizeTrackedAppName(appName, windowTitle = '', win = null) {
    if (win && isFlowTrackProcess(win)) {
        return 'FlowTrack Desktop';
    }

    const hay = `${appName} ${windowTitle}`.toLowerCase();
    if (hay.includes('flowtrack') || (String(appName).toLowerCase() === 'electron' && hay.includes('flowtrack'))) {
        return 'FlowTrack Desktop';
    }

    return appName || 'Unknown App';
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
    const appIcon = resolveAppIcon();

    mainWindow = new BrowserWindow({
        width: 1280,
        height: 860,
        minWidth: 900,
        minHeight: 600,
        frame: false,
        icon: appIcon || undefined,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
        },
        backgroundColor: '#0A0C12',
        show: false,
        title: 'FlowTrack',
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
            windowVisible = false;
            pauseBackgroundActivity();
            console.log('[App] Window hidden — background API sync paused. Use tray → Exit FlowTrack to quit.');
        }
    });

    mainWindow.on('hide', () => {
        if (!appIsQuitting) {
            windowVisible = false;
            pauseBackgroundActivity();
        }
    });

    mainWindow.on('show', () => {
        windowVisible = true;
        resumeBackgroundActivity();
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
    windowVisible = true;
    resumeBackgroundActivity();
}

function setupTray() {
    if (tray) return;
    const appIcon = resolveAppIcon();
    if (!appIcon || appIcon.isEmpty()) {
        return;
    }
    const icon = appIcon.resize({ width: 16, height: 16 });
    tray = new Tray(icon);
    tray.setToolTip('FlowTrack — running in background');
    tray.setContextMenu(Menu.buildFromTemplate([
        { label: 'Show FlowTrack', click: () => showMainWindow() },
        { type: 'separator' },
        { label: 'Exit FlowTrack', click: () => requestQuit() },
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

function getScreenshotActivityLevel() {
    return activityTracker.getScreenshotActivityLevel();
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
                        if (mainWindow && !mainWindow.isDestroyed() && !suppressScreenshotNotifications) {
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
    const minutes = Number(planScreenshotIntervalMinutes) || 0;
    if (minutes > 0) {
        const baseMs = minutes * 60 * 1000;
        const jitter = Math.floor(baseMs * 0.1);
        return baseMs + Math.floor(Math.random() * jitter);
    }
    return Math.floor(Math.random() * (SCREENSHOT_MAX_MS - SCREENSHOT_MIN_MS + 1)) + SCREENSHOT_MIN_MS;
}

/**
 * Recursive screenshot scheduler honoring plan interval when provided.
 */
async function scheduleNextScreenshot() {
    if (!currentSession.isTracking || isPaused) return;

    if (Number(planScreenshotIntervalMinutes) === 0) {
        console.log('[Screenshot] Disabled for current plan (interval=0)');
        return;
    }

    const delay = randomScreenshotDelay();
    const delayMin = (delay / 60000).toFixed(1);
    console.log(`[Screenshot] Next capture in ${delayMin} min`);

    screenshotTimer = setTimeout(async () => {
        if (!currentSession.isTracking) return;

        const shots = await captureAllScreens();
        if (shots.length > 0) {
            const activityLevel = getScreenshotActivityLevel();
            for (const shot of shots) {
                await uploadScreenshot(shot.buffer, activityLevel, shot.index);
            }
        }
        systemInput.resetActivityCounters();

        // Schedule next screenshot with a new random delay
        scheduleNextScreenshot();
    }, delay);
}

function showDesktopNotification(title, body) {
    if (Notification.isSupported()) {
        const appIcon = resolveAppIcon();
        new Notification({
            title,
            body,
            silent: false,
            icon: appIcon && !appIcon.isEmpty() ? appIcon : undefined,
        }).show();
    }
}

function isInternalTrackerApp(appName, windowTitle = '') {
    const hay = `${appName} ${windowTitle}`.toLowerCase();
    return hay.includes('localhost:5173') || hay.includes('vite');
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

const SENSITIVE_APP_PATTERNS = [
    { pattern: /bank|chase|wells\s*fargo|bofa|citibank|capital\s*one|hdfc|barclays/i, label: 'banking' },
    { pattern: /1password|1pw/i, label: '1password' },
    { pattern: /lastpass/i, label: 'lastpass' },
];

function extractUrlFromTitle(windowTitle, appName) {
    const title = (windowTitle || '').trim();
    if (!title) return '';

    if (/^localhost\b/i.test(title) || /\blocalhost\b/i.test(title)) {
        return 'http://localhost';
    }

    const domainMatch = title.match(/^([a-z0-9][-a-z0-9.]+)(?:\/[^\s|–—-]+)?/i);
    if (domainMatch && domainMatch[1].includes('.')) {
        return `https://${domainMatch[1]}`;
    }

    const directUrl = title.match(/https?:\/\/[^\s|–—-]+/i);
    if (directUrl) return directUrl[0].replace(/[|–—-]+$/, '');

    const hay = `${appName} ${title}`.toLowerCase();
    const isBrowser = /chrome|firefox|edge|msedge|brave|opera|safari/i.test(hay);
    if (!isBrowser) return '';

    const chromeMatch = title.match(/^(.+?)\s*[-–—]\s*Google Chrome\s*$/i);
    const firefoxMatch = title.match(/^(.+?)\s*[-–—]\s*(?:Mozilla )?Firefox\s*$/i);
    const edgeMatch = title.match(/^(.+?)\s*[-–—]\s*(?:.+?\s*[-–—]\s*)?Microsoft(?:\s*Edge)?\s*$/i);

    const candidate = (chromeMatch || firefoxMatch || edgeMatch)?.[1]?.trim() || '';
    if (!candidate) return '';

    if (/^https?:\/\//i.test(candidate)) return candidate;

    if (/^localhost\b/i.test(candidate)) return 'http://localhost';

    const pathDomain = candidate.match(/^([a-z0-9][-a-z0-9.]+)(?:\/[^\s|]*)?/i);
    if (pathDomain && pathDomain[1].includes('.')) {
        return `https://${pathDomain[1]}`;
    }

    return '';
}

function detectSensitiveApp(appName, windowTitle = '') {
    const hay = `${appName} ${windowTitle}`;
    for (const { pattern, label } of SENSITIVE_APP_PATTERNS) {
        if (pattern.test(hay)) {
            return { sensitive: true, reason: label };
        }
    }
    return { sensitive: false };
}

async function getForegroundApp() {
    try {
        const activeWin = require('active-win');
        const win = await activeWin();
        if (win) {
            const rawName = win.owner?.name || 'Unknown App';
            return {
                appName: normalizeTrackedAppName(rawName, win.title || '', win),
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
        const payload = activityTracker.buildSyncPayload(currentSession.timeEntryId);
        if (!payload.logs.length && payload.idle_seconds <= 0 && payload.active_seconds <= 0) {
            return;
        }

        const routerMac = networkInfo.getDefaultGatewayMac();
        if (routerMac) {
            payload.client_router_mac = routerMac;
        }

        const body = JSON.stringify(payload);

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
        console.log(`[Activity] Synced ${payload.logs.length} segment(s) to backend.`);
    } catch (err) {
        if (err.statusCode === 401 && !retried) {
            console.log('[Activity] Token expired — refreshing and retrying sync...');
            const newToken = await resolveAuthToken(true);
            if (newToken) {
                return syncActivityToBackend(true);
            }
        }
        console.error('[Activity] Sync error:', err.message, err.body ? `- ${err.body}` : '');
    }
}

function stopMonitoringCapture() {
    if (screenshotTimer) { clearTimeout(screenshotTimer); screenshotTimer = null; }
    activityTracker.stop();
    stopDistractionMonitor();
}

function notifyRendererLifecycle(state) {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const channel = state === 'show' ? 'app-show' : state === 'shutdown' ? 'app-shutdown' : 'app-hide';
    mainWindow.webContents.send(channel);
}

function stopSessionRefreshLoop() {
    if (sessionRefreshTimer) {
        clearInterval(sessionRefreshTimer);
        sessionRefreshTimer = null;
    }
}

function pauseBackgroundActivity() {
    stopSessionRefreshLoop();
    notifyRendererLifecycle('hide');
}

function resumeBackgroundActivity() {
    if (!currentSession.token) return;
    startSessionRefreshLoop();
    notifyRendererLifecycle('show');
}

function shutdownApp() {
    if (shutdownDone) return;
    shutdownDone = true;
    appIsQuitting = true;

    console.log('[App] Shutting down — stopping timers and background sync.');
    resetPausedWorkReminder();
    clearDesktopSession();
    stopSessionRefreshLoop();

    if (tray) {
        tray.destroy();
        tray = null;
    }

    notifyRendererLifecycle('shutdown');

    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.removeAllListeners('close');
        mainWindow.destroy();
        mainWindow = null;
    }
}

function stopTokenRefreshLoop() {
    if (tokenRefreshTimer) { clearInterval(tokenRefreshTimer); tokenRefreshTimer = null; }
}

function stopIdleGuard() {
    if (idleGuardTimer) { clearInterval(idleGuardTimer); idleGuardTimer = null; }
}

function requestQuit() {
    shutdownApp();
    app.quit();
}

function stopMonitoringLoop() {
    stopMonitoringCapture();
    stopTokenRefreshLoop();
    stopIdleGuard();
    console.log('[Monitoring] Stopped.');
}

function handleIdlePause() {
    if (!currentSession.isTracking || isPaused || pausedByIdle || pausedByLock) return;

    pausedByIdle = true;
    isPaused = true;
    stopMonitoringCapture();

    showDesktopNotification(
        'FlowTrack — Timer Paused',
        'You were idle for 5 minutes. Timer will resume automatically when you return.'
    );

    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('timer-idle-paused', { idleMinutes: 5 });
    }

    console.log('[Monitoring] Auto-paused after 5 minutes of system idle.');
}

function handleIdleResume() {
    if (!currentSession.isTracking || !pausedByIdle) return;

    pausedByIdle = false;
    isPaused = false;
    startMonitoringLoop();

    showDesktopNotification(
        'FlowTrack — Timer Resumed',
        'Welcome back! Your previous 5 minutes were idle/unproductive.'
    );

    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('timer-idle-resumed', { idleMinutes: 5 });
    }

    console.log('[Monitoring] Auto-resumed after user returned from idle.');
}

function startIdleGuard() {
    if (idleGuardTimer) return;

    idleGuardTimer = setInterval(() => {
        if (!currentSession.isTracking) return;

        const systemIdleSec = powerMonitor.getSystemIdleTime();

        if (pausedByIdle) {
            if (systemIdleSec < IDLE_RESUME_SEC) {
                handleIdleResume();
            }
            return;
        }

        if (isPaused) {
            void checkPausedWorkReminder();
            return;
        }

        if (systemIdleSec >= idleThresholdSec) {
            handleIdlePause();
        }
    }, IDLE_CHECK_MS);
}

function startMonitoringLoop() {
    if (!currentSession.isTracking || isPaused) return;
    if (screenshotTimer) return;

    console.log(`[Monitoring] Starting screenshot loop (interval: ${planScreenshotIntervalMinutes || 'random 1-4'} min)...`);

    scheduleNextScreenshot();

    if (activityTrackingEnabled) {
        activityTracker.start({
            getForegroundApp,
            extractUrlFromTitle: (title, appName) => (
                urlTrackingEnabled ? extractUrlFromTitle(title, appName) : ''
            ),
            detectSensitiveApp,
            isInternalTrackerApp,
            onSync: syncActivityToBackend,
        });
    }

    startTokenRefreshLoop();
    startDistractionMonitor();
    startIdleGuard();
}

function startTokenRefreshLoop() {
    if (tokenRefreshTimer) return;
    // Refresh access token every 8 min while tracking (JWT expires in 15 min)
    tokenRefreshTimer = setInterval(async () => {
        if (currentSession.isTracking) {
            await refreshTokenViaRenderer();
        }
    }, 8 * 60 * 1000);
}

function startSessionRefreshLoop() {
    if (sessionRefreshTimer || !currentSession.token || !windowVisible || appIsQuitting) return;
    sessionRefreshTimer = setInterval(async () => {
        if (!windowVisible || appIsQuitting || !currentSession.token) return;
        if (mainWindow && !mainWindow.isDestroyed()) {
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
        stopSessionRefreshLoop();
        console.log('[IPC] Auth cleared — desktop session stopped.');
        return { success: true };
    }
    currentSession.token = token;
    if (windowVisible) {
        startSessionRefreshLoop();
    }
    console.log('[IPC] Auth token updated.');
    return { success: true };
});

ipcMain.handle('logout-session', () => {
    clearDesktopSession();
    stopSessionRefreshLoop();
    console.log('[IPC] Full logout — desktop session cleared.');
    return { success: true };
});

// Called from renderer when a timer starts
ipcMain.handle('start-tracking', (_event, { timeEntryId, token, screenshotIntervalMinutes, trackingConfig }) => {
    currentSession.token = token || currentSession.token;
    currentSession.timeEntryId = timeEntryId;
    currentSession.isTracking = true;
    const cfg = trackingConfig || {};
    planScreenshotIntervalMinutes = cfg.screenshot_enabled === false
        ? 0
        : Number(screenshotIntervalMinutes ?? cfg.screenshot_frequency_minutes) || 0;
    suppressScreenshotNotifications = !!cfg.screenshot_suppress_notifications;
    urlTrackingEnabled = cfg.url_tracking_enabled !== false;
    activityTrackingEnabled = cfg.activity_tracking_enabled !== false;
    const idleMinutes = Number(cfg.idle_timeout_minutes ?? 5);
    idleThresholdSec = Math.max(60, idleMinutes * 60);
    keepIdleTimeMode = cfg.keep_idle_time || 'prompt';
    timerReminderEnabled = cfg.timer_reminder_enabled !== false;
    isPaused = false;
    pausedByLock = false;
    pausedByIdle = false;
    resetPausedWorkReminder();
    startMonitoringLoop();
    startTokenRefreshLoop();
    startIdleGuard();
    console.log(`[IPC] Tracking started for time entry: ${timeEntryId}`);
    return { success: true };
});

// Called from renderer when timer stops
ipcMain.handle('stop-tracking', () => {
    currentSession.isTracking = false;
    currentSession.timeEntryId = null;
    isPaused = false;
    pausedByLock = false;
    pausedByIdle = false;
    resetPausedWorkReminder();
    stopMonitoringLoop();
    console.log('[IPC] Tracking stopped.');
    return { success: true };
});

ipcMain.handle('pause-tracking', () => {
    if (!currentSession.isTracking) {
        return { success: false, error: 'No active tracking session' };
    }
    pausedByLock = false;
    pausedByIdle = false;
    isPaused = true;
    pausedWorkReminderState.activeSince = null;
    pausedWorkReminderState.snoozeUntil = 0;
    stopMonitoringCapture();
    startTokenRefreshLoop();
    startIdleGuard();
    return { success: true };
});

ipcMain.handle('resume-tracking', () => {
    if (!currentSession.isTracking) {
        return { success: false, error: 'No active tracking session' };
    }
    pausedByLock = false;
    pausedByIdle = false;
    isPaused = false;
    resetPausedWorkReminder();
    startMonitoringLoop();
    return { success: true };
});

// Called from renderer to record activity events
ipcMain.on('activity-event', (_event, type) => {
    if (!currentSession.isTracking) return;
    systemInput.bumpActivity(type);
});

// Capture a screenshot on demand (for testing / manual trigger)
ipcMain.handle('capture-screenshot-now', async () => {
    const shots = await captureAllScreens();
    if (!shots.length) return { success: false, error: 'Capture failed' };
    const activityLevel = getScreenshotActivityLevel();
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
    if (process.platform === 'win32') {
        app.setAppUserModelId('com.flowtrack.desktop');
    }
    app.setName('FlowTrack');
    const appIcon = resolveAppIcon();
    if (appIcon && !appIcon.isEmpty()) {
        app.dock?.setIcon?.(appIcon);
    }
    console.log(`[Config] API base URL: ${API_BASE_URL}`);
    console.log(`[Config] Frontend URL: ${FRONTEND_URL}`);
    createWindow();
    setupTray();
    windowVisible = true;

    powerMonitor.on('lock-screen', () => {
        if (!currentSession.isTracking || isPaused) return;
        pausedByLock = true;
        isPaused = true;
        stopMonitoringCapture();
        startTokenRefreshLoop();
        startIdleGuard();
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

    powerMonitor.on('resume', () => {
        if (mainWindow && !mainWindow.isDestroyed() && windowVisible) {
            mainWindow.webContents.send('system-resume');
            void refreshTokenViaRenderer();
        }
        console.log('[Power] System resumed — refreshing auth session.');
    });

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
        else showMainWindow();
    });

    if (mainWindow) {
        mainWindow.on('restore', () => showMainWindow());
    }
});

app.on('before-quit', () => {
    shutdownApp();
});

app.on('will-quit', () => {
    shutdownApp();
});

app.on('window-all-closed', () => {
    if (!appIsQuitting) {
        pauseBackgroundActivity();
    }
});
