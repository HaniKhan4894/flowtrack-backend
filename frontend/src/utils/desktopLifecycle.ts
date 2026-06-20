import { isDesktopApp } from './electronAuth';

let desktopForeground = true;

export function isDesktopForeground(): boolean {
    if (!isDesktopApp()) return true;
    return desktopForeground;
}

export function initDesktopLifecycle(): void {
    if (!isDesktopApp() || !window.electronAPI?.onAppLifecycle) return;

    window.electronAPI.onAppLifecycle((state) => {
        if (state === 'show') {
            desktopForeground = true;
            window.dispatchEvent(new CustomEvent('flowtrack-app-foreground'));
            return;
        }

        desktopForeground = false;
        if (state === 'shutdown') {
            window.dispatchEvent(new CustomEvent('flowtrack-app-shutdown'));
            return;
        }
        window.dispatchEvent(new CustomEvent('flowtrack-app-background'));
    });
}
