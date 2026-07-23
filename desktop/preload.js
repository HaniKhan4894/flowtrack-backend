const { contextBridge, ipcRenderer } = require('electron');

const desktopVariant = 'tracker';

contextBridge.exposeInMainWorld('electronAPI', {
    // App info
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    isDesktop: () => ipcRenderer.invoke('is-desktop'),
    desktopVariant: () => desktopVariant,
    openWebApp: () => ipcRenderer.invoke('open-web-app'),
    startBrowserSignIn: () => ipcRenderer.invoke('start-browser-sign-in'),

    // Auth
    setAuthToken: (token) => ipcRenderer.invoke('set-auth-token', token),
    logoutSession: () => ipcRenderer.invoke('logout-session'),

    windowMinimize: () => ipcRenderer.invoke('window-minimize'),
    windowMaximize: () => ipcRenderer.invoke('window-maximize'),
    windowIsMaximized: () => ipcRenderer.invoke('window-is-maximized'),
    windowClose: () => ipcRenderer.invoke('window-close'),
    onWindowMaximizedChanged: (callback) => {
        const handler = (_event, isMaximized) => callback(isMaximized);
        ipcRenderer.on('window-maximized-changed', handler);
        return () => ipcRenderer.removeListener('window-maximized-changed', handler);
    },

    // Tracking lifecycle
    startTracking: (timeEntryId, token, trackingConfig = {}) =>
        ipcRenderer.invoke('start-tracking', {
            timeEntryId,
            token,
            screenshotIntervalMinutes: trackingConfig.screenshot_frequency_minutes ?? trackingConfig.screenshotIntervalMinutes ?? 0,
            trackingConfig,
        }),
    stopTracking: () => ipcRenderer.invoke('stop-tracking'),
    pauseTracking: () => ipcRenderer.invoke('pause-tracking'),
    resumeTracking: () => ipcRenderer.invoke('resume-tracking'),

    // Manual capture
    captureNow: () => ipcRenderer.invoke('capture-screenshot-now'),

    // Activity events (fire-and-forget)
    sendActivityEvent: (type) => ipcRenderer.send('activity-event', type),

    // Listen for screenshot-captured event from main
    onScreenshotCaptured: (callback) => {
        ipcRenderer.on('screenshot-captured', (_event, data) => callback(data));
        return () => ipcRenderer.removeAllListeners('screenshot-captured');
    },

    onSystemLockChange: (callback) => {
        const onLock = () => callback(true);
        const onUnlock = () => callback(false);
        ipcRenderer.on('system-locked', onLock);
        ipcRenderer.on('system-unlocked', onUnlock);
        return () => {
            ipcRenderer.removeListener('system-locked', onLock);
            ipcRenderer.removeListener('system-unlocked', onUnlock);
        };
    },

    onSystemResume: (callback) => {
        const handler = () => callback();
        ipcRenderer.on('system-resume', handler);
        return () => ipcRenderer.removeListener('system-resume', handler);
    },

    onTimerIdleChange: (callback) => {
        const onPaused = (_event, data) => callback('paused', data);
        const onResumed = (_event, data) => callback('resumed', data);
        ipcRenderer.on('timer-idle-paused', onPaused);
        ipcRenderer.on('timer-idle-resumed', onResumed);
        return () => {
            ipcRenderer.removeListener('timer-idle-paused', onPaused);
            ipcRenderer.removeListener('timer-idle-resumed', onResumed);
        };
    },

    onAppLifecycle: (callback) => {
        const onHide = () => callback('hide');
        const onShow = () => callback('show');
        const onShutdown = () => callback('shutdown');
        ipcRenderer.on('app-hide', onHide);
        ipcRenderer.on('app-show', onShow);
        ipcRenderer.on('app-shutdown', onShutdown);
        return () => {
            ipcRenderer.removeListener('app-hide', onHide);
            ipcRenderer.removeListener('app-show', onShow);
            ipcRenderer.removeListener('app-shutdown', onShutdown);
        };
    },

    onTimerReminderResume: (callback) => {
        const handler = () => callback();
        ipcRenderer.on('timer-reminder-resume', handler);
        return () => ipcRenderer.removeListener('timer-reminder-resume', handler);
    },

    onBrowserSignInComplete: (callback) => {
        const handler = (_event, tokens) => callback(tokens);
        ipcRenderer.on('browser-sign-in-complete', handler);
        return () => ipcRenderer.removeListener('browser-sign-in-complete', handler);
    },

    onBrowserSignInError: (callback) => {
        const handler = (_event, payload) => callback(payload);
        ipcRenderer.on('browser-sign-in-error', handler);
        return () => ipcRenderer.removeListener('browser-sign-in-error', handler);
    },
});
