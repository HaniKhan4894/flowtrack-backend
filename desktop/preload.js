const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // App info
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    isDesktop: () => ipcRenderer.invoke('is-desktop'),

    // Auth
    setAuthToken: (token) => ipcRenderer.invoke('set-auth-token', token),

    // Tracking lifecycle
    startTracking: (timeEntryId, token) =>
        ipcRenderer.invoke('start-tracking', { timeEntryId, token }),
    stopTracking: () => ipcRenderer.invoke('stop-tracking'),

    // Manual capture
    captureNow: () => ipcRenderer.invoke('capture-screenshot-now'),

    // Activity events (fire-and-forget)
    sendActivityEvent: (type) => ipcRenderer.send('activity-event', type),

    // Listen for screenshot-captured event from main
    onScreenshotCaptured: (callback) => {
        ipcRenderer.on('screenshot-captured', (_event, data) => callback(data));
        // Return cleanup function
        return () => ipcRenderer.removeAllListeners('screenshot-captured');
    }
});
