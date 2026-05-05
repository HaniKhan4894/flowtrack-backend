import { create } from 'zustand';
import type { User } from '../types';

interface AuthState {
    user: User | null;
    accessToken: string | null;
    isAuthenticated: boolean;
    setAuth: (user: User, token: string) => void;
    logout: () => void;
    initAuth: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
    user: null,
    accessToken: null,
    isAuthenticated: false,

    setAuth: (user, token) => {
        localStorage.setItem('access_token', token);
        localStorage.setItem('user', JSON.stringify(user));
        set({ user, accessToken: token, isAuthenticated: true });

        // Sync token with Electron main process (no-op in browser)
        if (typeof window !== 'undefined' && 'electronAPI' in window) {
            (window as any).electronAPI.setAuthToken(token);
        }
    },

    logout: () => {
        localStorage.removeItem('access_token');
        localStorage.removeItem('user');
        set({ user: null, accessToken: null, isAuthenticated: false });
    },

    initAuth: () => {
        const token = localStorage.getItem('access_token');
        const userStr = localStorage.getItem('user');

        if (token && userStr) {
            try {
                const user = JSON.parse(userStr);
                set({ user, accessToken: token, isAuthenticated: true });
            } catch (error) {
                localStorage.removeItem('access_token');
                localStorage.removeItem('user');
            }
        }
    },
}));

// Initialize auth state on load
if (typeof window !== 'undefined') {
    useAuthStore.getState().initAuth();
}
