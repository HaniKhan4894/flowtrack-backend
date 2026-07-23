import { authService } from '../api/authService';
import { useAuthStore } from '../store/authStore';
import { persistAuthTokens } from './authStorage';
import { getDesktopHomePath, isDesktopApp, syncElectronAuthToken } from './electronAuth';
import { getApiErrorMessage } from './apiError';

export interface BrowserSignInTokens {
  access_token: string;
  refresh_token?: string | null;
  organization_id?: number | null;
}

export async function startDesktopBrowserSignIn(): Promise<{ success: boolean; error?: string }> {
  if (!isDesktopApp() || !window.electronAPI?.startBrowserSignIn) {
    return { success: false, error: 'Browser sign-in is only available in the desktop app.' };
  }
  return window.electronAPI.startBrowserSignIn();
}

export async function completeDesktopBrowserSignIn(tokens: BrowserSignInTokens): Promise<void> {
  persistAuthTokens({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token ?? undefined,
    organization_id: tokens.organization_id ?? undefined,
  });
  syncElectronAuthToken(tokens.access_token);

  const profile = await authService.me();
  useAuthStore.getState().setAuth(profile.data, tokens.access_token);
}

export function subscribeDesktopBrowserSignIn(handlers: {
  onComplete: (tokens: BrowserSignInTokens) => void | Promise<void>;
  onError?: (message: string) => void;
}): () => void {
  if (!isDesktopApp() || !window.electronAPI?.onBrowserSignInComplete) {
    return () => {};
  }

  const unsubComplete = window.electronAPI.onBrowserSignInComplete((tokens) => {
    void handlers.onComplete(tokens);
  });
  const unsubError = window.electronAPI.onBrowserSignInError?.((payload) => {
    handlers.onError?.(payload.error || 'Browser sign-in failed.');
  });

  return () => {
    unsubComplete();
    unsubError?.();
  };
}

export function getPostLoginRedirect(search: string): string | null {
  const redirect = new URLSearchParams(search).get('redirect');
  if (!redirect || !redirect.startsWith('/')) {
    return null;
  }
  if (redirect.startsWith('//')) {
    return null;
  }
  return redirect;
}

export function navigateAfterLogin(search: string, navigate: (path: string, opts?: { replace?: boolean }) => void): void {
  const redirect = getPostLoginRedirect(search);
  navigate(redirect ?? getDesktopHomePath(), { replace: true });
}

export function browserSignInErrorMessage(error?: string): string {
  if (error === 'timeout') {
    return 'Browser sign-in timed out. Make sure you are signed in on the web, then try again.';
  }
  return getApiErrorMessage(error, 'Could not complete browser sign-in.');
}
