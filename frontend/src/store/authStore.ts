import { create } from 'zustand';
import type { User } from '../types';
import { monitoringService } from '../api/monitoringService';
import { authService } from '../api/authService';
import { syncElectronAuthToken, clearElectronSession } from '../utils/electronAuth';

interface AuthState {
    user: User | null;
    accessToken: string | null;
    isAuthenticated: boolean;
    setAuth: (user: User, token: string) => void;
    setUser: (user: User) => void;
    refreshProfile: () => Promise<void>;
    logout: () => void;
    forceLogout: () => Promise<void>;
    initAuth: () => void;
}

function clearStoredAuth() {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('organization_id');
    localStorage.removeItem('user');
    sessionStorage.clear();
}

export const useAuthStore = create<AuthState>((set) => ({
    user: null,
    accessToken: null,
    isAuthenticated: false,

    setAuth: (user, token) => {
        localStorage.setItem('access_token', token);
        const tokenOrgId = Number(localStorage.getItem('organization_id') || 0);
        const normalizedUser =
            user && !user.organization_id && tokenOrgId > 0
                ? { ...user, organization_id: tokenOrgId }
                : user;
        localStorage.setItem('user', JSON.stringify(normalizedUser));
        set({ user: normalizedUser, accessToken: token, isAuthenticated: true });

        syncElectronAuthToken(token);
    },

    setUser: (user) => {
        localStorage.setItem('user', JSON.stringify(user));
        set({ user });
    },

    refreshProfile: async () => {
        try {
            const response = await authService.me();
            const user = response.data;
            localStorage.setItem('user', JSON.stringify(user));
            if (user.organization_id) {
                localStorage.setItem('organization_id', String(user.organization_id));
            }
            set({ user });
        } catch {
            // keep cached profile on transient failures
        }
    },

    logout: () => {
        monitoringService.stopMonitoring();
        authService.logout().catch(() => undefined);
        clearStoredAuth();
        set({ user: null, accessToken: null, isAuthenticated: false });
        void clearElectronSession();
    },

    forceLogout: async () => {
        monitoringService.stopMonitoring();
        // Fire server logout while token still available (best-effort, non-blocking)
        authService.logout().catch(() => undefined);

        clearStoredAuth();
        set({ user: null, accessToken: null, isAuthenticated: false });

        await clearElectronSession();
    },

    initAuth: () => {
        const token = localStorage.getItem('access_token');
        const userStr = localStorage.getItem('user');

        if (token && userStr) {
            try {
                const user = JSON.parse(userStr);
                const tokenOrgId = Number(localStorage.getItem('organization_id') || 0);
                const normalizedUser =
                    user && !user.organization_id && tokenOrgId > 0
                        ? { ...user, organization_id: tokenOrgId }
                        : user;
                set({ user: normalizedUser, accessToken: token, isAuthenticated: true });
                syncElectronAuthToken(token);
                monitoringService.syncAuthToken(token);
                authService.me()
                    .then((res) => {
                        localStorage.setItem('user', JSON.stringify(res.data));
                        if (res.data.organization_id) {
                            localStorage.setItem('organization_id', String(res.data.organization_id));
                        }
                        set({ user: res.data });
                        syncElectronAuthToken(localStorage.getItem('access_token'));
                    })
                    .catch(async () => {
                        clearStoredAuth();
                        set({ user: null, accessToken: null, isAuthenticated: false });
                        monitoringService.stopMonitoring();
                        await clearElectronSession();
                    });
            } catch {
                clearStoredAuth();
                set({ user: null, accessToken: null, isAuthenticated: false });
            }
        } else if (token) {
            monitoringService.syncAuthToken(token);
        }
    },
}));

// Initialize auth state on load
if (typeof window !== 'undefined') {
    useAuthStore.getState().initAuth();
}
