const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // App info
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    isDesktop: () => ipcRenderer.invoke('is-desktop'),

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
    startTracking: (timeEntryId, token, screenshotIntervalMinutes = 0) =>
        ipcRenderer.invoke('start-tracking', { timeEntryId, token, screenshotIntervalMinutes }),
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
});
