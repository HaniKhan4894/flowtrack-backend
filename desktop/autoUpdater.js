const { autoUpdater } = require('electron-updater');
const { app } = require('electron');

/** @type {(() => import('electron').BrowserWindow | null) | null} */
let getMainWindow = null;
/** @type {((title: string, body: string) => void) | null} */
let showNotification = null;

/** @type {{ status: string; data?: Record<string, unknown> | null }} */
let lastStatus = { status: 'idle', data: null };

function broadcast(status, data = null) {
    lastStatus = { status, data };
    const win = getMainWindow?.();
    if (win && !win.isDestroyed()) {
        win.webContents.send('app-update-status', lastStatus);
    }
}

function initAutoUpdater({ getMainWindow: windowGetter, getUpdateFeedUrl, showNotification: notify }) {
    getMainWindow = windowGetter;
    showNotification = notify;

    if (!app.isPackaged) {
        console.log('[Updater] Skipped — development build.');
        return;
    }

    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.logger = console;

    const feedUrl = `${getUpdateFeedUrl().replace(/\/$/, '')}/`;
    console.log(`[Updater] Feed URL: ${feedUrl}`);
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
        broadcast('downloading', { percent: 0 });
        await autoUpdater.downloadUpdate();
        return { success: true };
    } catch (err) {
        broadcast('error', { message: err?.message || 'Download failed.' });
        return { success: false, error: err?.message || 'Download failed.' };
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
