const fs = require('fs');
const path = require('path');
const { autoUpdater } = require('electron-updater');
const { app } = require('electron');

/** @type {(() => import('electron').BrowserWindow | null) | null} */
let getMainWindow = null;
/** @type {((title: string, body: string) => void) | null} */
let showNotification = null;
/** @type {(() => string) | null} */
let resolveFeedUrl = null;

/** @type {{ status: string; data?: Record<string, unknown> | null }} */
let lastStatus = { status: 'idle', data: null };

function broadcast(status, data = null) {
    lastStatus = { status, data };
    const win = getMainWindow?.();
    if (win && !win.isDestroyed()) {
        win.webContents.send('app-update-status', lastStatus);
    }
}

/**
 * Older installs were packed without a publish config, so resources/app-update.yml
 * is missing and downloadUpdate() throws ENOENT. Create it from the live feed URL.
 */
function ensureAppUpdateYml(feedUrl) {
    try {
        const ymlPath = path.join(process.resourcesPath, 'app-update.yml');
        const body = [
            'provider: generic',
            `url: ${feedUrl.replace(/\/$/, '')}`,
            'updaterCacheDirName: flowtrack-desktop-updater',
            '',
        ].join('\n');

        if (fs.existsSync(ymlPath)) {
            const existing = fs.readFileSync(ymlPath, 'utf8');
            if (existing.includes(feedUrl.replace(/\/$/, ''))) {
                return;
            }
        }

        fs.writeFileSync(ymlPath, body, 'utf8');
        console.log(`[Updater] Wrote ${ymlPath}`);
    } catch (err) {
        // Program Files is often read-only without elevation — setFeedURL still helps check.
        console.warn('[Updater] Could not write app-update.yml:', err.message);
    }
}

function initAutoUpdater({ getMainWindow: windowGetter, getUpdateFeedUrl, showNotification: notify }) {
    getMainWindow = windowGetter;
    showNotification = notify;
    resolveFeedUrl = getUpdateFeedUrl;

    if (!app.isPackaged) {
        console.log('[Updater] Skipped — development build.');
        return;
    }

    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.logger = console;

    const feedUrl = `${getUpdateFeedUrl().replace(/\/$/, '')}/`;
    console.log(`[Updater] Feed URL: ${feedUrl}`);
    ensureAppUpdateYml(feedUrl);
    autoUpdater.setFeedURL({ provider: 'generic', url: feedUrl });

    autoUpdater.on('checking-for-update', () => broadcast('checking'));
    autoUpdater.on('update-available', (info) => {
        broadcast('available', {
            version: info.version,
            releaseDate: info.releaseDate ?? null,
        });
        notify?.(
            'FlowTrack Tracker',
            `Version ${info.version} is available. Open Settings → General to update.`,
        );
    });
    autoUpdater.on('update-not-available', (info) => {
        broadcast('not-available', { version: info.version ?? app.getVersion() });
    });
    autoUpdater.on('error', (err) => {
        broadcast('error', { message: err?.message || 'Update check failed.' });
    });
    autoUpdater.on('download-progress', (progress) => {
        broadcast('downloading', {
            percent: progress.percent,
            transferred: progress.transferred,
            total: progress.total,
        });
    });
    autoUpdater.on('update-downloaded', (info) => {
        broadcast('downloaded', { version: info.version });
        notify?.(
            'FlowTrack Tracker',
            `Version ${info.version} is ready. Restart the app to install.`,
        );
    });

    setTimeout(() => {
        void checkForUpdates(false);
    }, 30_000);

    setInterval(() => {
        void checkForUpdates(false);
    }, 6 * 60 * 60 * 1000);
}

async function checkForUpdates(manual = true) {
    if (!app.isPackaged) {
        broadcast('not-available', { version: app.getVersion(), dev: true });
        return { success: true, dev: true };
    }

    try {
        if (manual) broadcast('checking');
        await autoUpdater.checkForUpdates();
        return { success: true };
    } catch (err) {
        broadcast('error', { message: err?.message || 'Update check failed.' });
        return { success: false, error: err?.message || 'Update check failed.' };
    }
}

async function downloadUpdate() {
    if (!app.isPackaged) {
        return { success: false, error: 'Updates are only available in the installed app.' };
    }

    try {
        if (resolveFeedUrl) {
            ensureAppUpdateYml(`${resolveFeedUrl().replace(/\/$/, '')}/`);
        }
        broadcast('downloading', { percent: 0 });
        await autoUpdater.downloadUpdate();
        return { success: true };
    } catch (err) {
        let message = err?.message || 'Download failed.';
        if (/app-update\.yml|ENOENT/i.test(message)) {
            message = 'This install is missing update metadata. Close the app and run FlowTrack-Setup.exe from the downloads page once, then updates will work.';
        }
        broadcast('error', { message });
        return { success: false, error: message };
    }
}

function installUpdate() {
    if (!app.isPackaged) {
        return { success: false, error: 'Updates are only available in the installed app.' };
    }

    autoUpdater.quitAndInstall(false, true);
    return { success: true };
}

function getUpdateStatus() {
    return lastStatus;
}

module.exports = {
    initAutoUpdater,
    checkForUpdates,
    downloadUpdate,
    installUpdate,
    getUpdateStatus,
};
