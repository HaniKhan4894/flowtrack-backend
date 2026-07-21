import { create } from 'zustand';
import axios from 'axios';
import type { User } from '../types';
import { monitoringService } from '../api/monitoringService';
import { authService } from '../api/authService';
import { syncElectronAuthToken, clearElectronSession, isDesktopApp } from '../utils/electronAuth';
import { clearAuthTokens, persistAuthTokens } from '../utils/authStorage';

interface AuthState {
    user: User | null;
    accessToken: string | null;
    isAuthenticated: boolean;
    sessionReady: boolean;
    setAuth: (user: User, token: string) => void;
    setUser: (user: User) => void;
    refreshProfile: () => Promise<void>;
    ensureValidSession: () => Promise<boolean>;
    logout: () => Promise<void>;
    forceLogout: () => Promise<void>;
    initAuth: () => Promise<void>;
}

function normalizeUser(user: User | null, tokenOrgId = 0): User | null {
    if (!user) {
        return null;
    }
    if (!user.organization_id && tokenOrgId > 0) {
        return { ...user, organization_id: tokenOrgId };
    }
    return user;
}

function isNetworkError(error: unknown): boolean {
    return axios.isAxiosError(error) && !error.response;
}

function isAuthError(error: unknown): boolean {
    return axios.isAxiosError(error) && error.response?.status === 401;
}

export const useAuthStore = create<AuthState>((set, get) => ({
    user: null,
    accessToken: null,
    isAuthenticated: false,
    sessionReady: false,

    setAuth: (user, token) => {
        persistAuthTokens({ access_token: token });
        const tokenOrgId = Number(localStorage.getItem('organization_id') || 0);
        const normalizedUser = normalizeUser(user, tokenOrgId);
        if (normalizedUser) {
            localStorage.setItem('user', JSON.stringify(normalizedUser));
        }
        set({
            user: normalizedUser,
            accessToken: token,
            isAuthenticated: true,
            sessionReady: true,
        });

        syncElectronAuthToken(token);
    },

    setUser: (user) => {
        localStorage.setItem('user', JSON.stringify(user));
        if (user.organization_id) {
            localStorage.setItem('organization_id', String(user.organization_id));
        }
        set({ user, sessionReady: true });
    },

    refreshProfile: async () => {
        try {
            const response = await authService.me();
            get().setUser(response.data);
        } catch {
            // keep cached profile on transient failures
        }
    },

    ensureValidSession: async () => {
        const refreshToken = localStorage.getItem('refresh_token');
        const accessToken = localStorage.getItem('access_token');

        if (!refreshToken && !accessToken) {
            set({ sessionReady: true });
            return false;
        }

        try {
            const response = await authService.me();
            get().setUser(response.data);
            syncElectronAuthToken(localStorage.getItem('access_token'));
            set({ isAuthenticated: true, sessionReady: true });
            return true;
        } catch (error) {
            if (isNetworkError(error)) {
                set({ sessionReady: true });
                return Boolean(get().isAuthenticated || accessToken);
            }

            if (!isAuthError(error) || !refreshToken) {
                set({ sessionReady: true });
                return Boolean(get().isAuthenticated);
            }
        }

        try {
            const refreshed = await authService.refresh(refreshToken!);
            persistAuthTokens({
                access_token: refreshed.data.access_token,
                refresh_token: refreshed.data.refresh_token,
                organization_id: (refreshed.data as { organization_id?: number }).organization_id,
            });
            syncElectronAuthToken(refreshed.data.access_token);

            const profile = await authService.me();
            get().setUser(profile.data);
            set({
                accessToken: refreshed.data.access_token,
                isAuthenticated: true,
                sessionReady: true,
            });
            monitoringService.syncAuthToken(refreshed.data.access_token);
            return true;
        } catch (error) {
            if (isNetworkError(error)) {
                set({ sessionReady: true });
                return Boolean(get().isAuthenticated);
            }

            clearAuthTokens();
            set({
                user: null,
                accessToken: null,
                isAuthenticated: false,
                sessionReady: true,
            });
            monitoringService.stopMonitoring();
            await clearElectronSession();
            return false;
        }
    },

    logout: async () => {
        // Stop server-side timer while auth token is still valid.
        try {
            const { useTimerStore } = await import('./timerStore');
            await useTimerStore.getState().stopForLogout();
        } catch {
            monitoringService.stopMonitoring();
        }

        authService.logout().catch(() => undefined);
        clearAuthTokens();
        set({
            user: null,
            accessToken: null,
            isAuthenticated: false,
            sessionReady: true,
        });
        await clearElectronSession();
    },

    forceLogout: async () => {
        try {
            const { useTimerStore } = await import('./timerStore');
            await useTimerStore.getState().stopForLogout();
        } catch {
            monitoringService.stopMonitoring();
        }

        authService.logout().catch(() => undefined);

        clearAuthTokens();
        set({
            user: null,
            accessToken: null,
            isAuthenticated: false,
            sessionReady: true,
        });

        await clearElectronSession();
    },

    initAuth: async () => {
        const token = localStorage.getItem('access_token');
        const userStr = localStorage.getItem('user');
        const tokenOrgId = Number(localStorage.getItem('organization_id') || 0);

        if (token && userStr) {
            try {
                const user = normalizeUser(JSON.parse(userStr) as User, tokenOrgId);
                set({
                    user,
                    accessToken: token,
                    isAuthenticated: true,
                });
                syncElectronAuthToken(token);
                monitoringService.syncAuthToken(token);
            } catch {
                clearAuthTokens();
                set({
                    user: null,
                    accessToken: null,
                    isAuthenticated: false,
                    sessionReady: true,
                });
                return;
            }
        } else if (token) {
            monitoringService.syncAuthToken(token);
        }

        await get().ensureValidSession();
    },
}));

if (typeof window !== 'undefined') {
    void useAuthStore.getState().initAuth();

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && useAuthStore.getState().isAuthenticated) {
            void useAuthStore.getState().ensureValidSession();
        }
    });

    window.addEventListener('focus', () => {
        if (useAuthStore.getState().isAuthenticated) {
            void useAuthStore.getState().ensureValidSession();
        }
    });

    window.addEventListener('flowtrack-system-resume', () => {
        if (useAuthStore.getState().isAuthenticated) {
            void useAuthStore.getState().ensureValidSession();
        }
    });

    if (isDesktopApp() && window.electronAPI?.onSystemResume) {
        window.electronAPI.onSystemResume(() => {
            if (useAuthStore.getState().isAuthenticated) {
                void useAuthStore.getState().ensureValidSession();
            }
        });
    }
}
