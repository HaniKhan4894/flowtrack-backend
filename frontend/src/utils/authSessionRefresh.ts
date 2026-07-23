const REFRESH_INTERVAL_MS = 10 * 60 * 1000; // refresh before 15-min JWT expiry
let refreshTimer: ReturnType<typeof setInterval> | null = null;
let refreshInFlight = false;

function isOnLoginRoute(): boolean {
  if (typeof window === 'undefined') return false;
  return isLoginPath(window.location.pathname);
}

/** Silent background refresh — never toasts or redirects by itself. */
export async function silentRefreshSession(): Promise<boolean> {
  if (refreshInFlight) return false;
  const refreshToken = localStorage.getItem('refresh_token');
  if (!refreshToken) return false;

  refreshInFlight = true;
  try {
    const { authService } = await import('../api/authService');
    const { persistAuthTokens } = await import('./authStorage');
    const { syncElectronAuthToken } = await import('./electronAuth');
    const { useAuthStore } = await import('../store/authStore');
    const { monitoringService } = await import('../api/monitoringService');

    const refreshed = await authService.refresh(refreshToken);
    persistAuthTokens({
      access_token: refreshed.data.access_token,
      refresh_token: refreshed.data.refresh_token,
      organization_id: (refreshed.data as { organization_id?: number }).organization_id,
    });
    syncElectronAuthToken(refreshed.data.access_token);
    monitoringService.syncAuthToken(refreshed.data.access_token);

    useAuthStore.setState({
      accessToken: refreshed.data.access_token,
      isAuthenticated: true,
    });

    try {
      const profile = await authService.me();
      useAuthStore.getState().setUser(profile.data);
    } catch {
      // token is valid even if profile fetch fails transiently
    }

    return true;
  } catch {
    return false;
  } finally {
    refreshInFlight = false;
  }
}

export function startSilentSessionRefreshLoop(): void {
  if (refreshTimer || typeof window === 'undefined') return;

  refreshTimer = setInterval(() => {
    if (!localStorage.getItem('refresh_token')) return;
    if (isOnLoginRoute()) return;
    void silentRefreshSession();
  }, REFRESH_INTERVAL_MS);
}

export function stopSilentSessionRefreshLoop(): void {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
}

export function isLoginPath(pathname: string): boolean {
  return pathname === '/login' || pathname === '/tracker/login';
}
