/** Keep Electron main process in sync with the renderer auth token. */
export function syncElectronAuthToken(token?: string | null): void {
    if (typeof window === 'undefined' || !('electronAPI' in window)) return;
    const value = token ?? localStorage.getItem('access_token') ?? '';
    void window.electronAPI?.setAuthToken(value);
}

export async function clearElectronSession(): Promise<void> {
    if (typeof window === 'undefined' || !('electronAPI' in window)) return;
    try {
        if (window.electronAPI?.logoutSession) {
            await window.electronAPI.logoutSession();
            return;
        }
        await window.electronAPI?.stopTracking?.();
        await window.electronAPI?.setAuthToken('');
    } catch {
        // best-effort cleanup
    }
}

export function isDesktopApp(): boolean {
    return typeof window !== 'undefined' && 'electronAPI' in window;
}

export function getDesktopHomePath(): string {
    return '/tracker';
}

export function getDesktopLoginPath(): string {
    return '/tracker/login';
}

export async function openWebAppInBrowser(): Promise<void> {
    if (isDesktopApp() && window.electronAPI?.openWebApp) {
        await window.electronAPI.openWebApp();
    }
}

export function hardRedirectToLogin(): void {
    const target = `${getDesktopLoginPath()}?signed_out=1`;
    if (isDesktopApp()) {
        window.location.replace(target);
        return;
    }
    window.location.href = target;
}
