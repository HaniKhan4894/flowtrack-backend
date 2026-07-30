import axios from 'axios';
import { authService } from './authService';
import { syncElectronAuthToken, getAppLoginPath } from '../utils/electronAuth';
import { persistAuthTokens, clearAuthTokens } from '../utils/authStorage';
import { isLoginPath } from '../utils/authSessionRefresh';

const apiBaseUrl =
    import.meta.env.VITE_API_URL ||
    'https://548a-124-109-46-74.ngrok-free.app/flowtrack-backend/public/api/v1';

const usesNgrok = apiBaseUrl.includes('ngrok');

export const API_BASE_URL = apiBaseUrl;

const client = axios.create({
    baseURL: apiBaseUrl,
    headers: {
        'Content-Type': 'application/json',
        ...(usesNgrok ? { 'ngrok-skip-browser-warning': 'true' } : {}),
    },
});

client.interceptors.request.use((config) => {
    const token = localStorage.getItem('access_token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    if (usesNgrok) {
        config.headers['ngrok-skip-browser-warning'] = 'true';
    }
    return config;
});

let isRefreshingToken = false;
let pendingRequests: Array<(token: string | null) => void> = [];

const flushPendingRequests = (token: string | null) => {
    pendingRequests.forEach((callback) => callback(token));
    pendingRequests = [];
};

client.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;
        const requestUrl = String(originalRequest?.url ?? '');
        const isAuthRoute = requestUrl.includes('/auth/login') || requestUrl.includes('/auth/refresh') || requestUrl.includes('/auth/register');

        if (error.response?.status === 401 && !originalRequest?._retry && !isAuthRoute) {
            const refreshToken = localStorage.getItem('refresh_token');
            if (refreshToken) {
                if (isRefreshingToken) {
                    return new Promise((resolve, reject) => {
                        pendingRequests.push((token) => {
                            if (!token) {
                                reject(error);
                                return;
                            }
                            originalRequest.headers.Authorization = `Bearer ${token}`;
                            resolve(client(originalRequest));
                        });
                    });
                }

                originalRequest._retry = true;
                isRefreshingToken = true;
                try {
                    const refreshed = await authService.refresh(refreshToken);
                    persistAuthTokens({
                        access_token: refreshed.data.access_token,
                        refresh_token: refreshed.data.refresh_token,
                        organization_id: (refreshed.data as { organization_id?: number }).organization_id,
                    });
                    const newAccessToken = refreshed.data.access_token;
                    syncElectronAuthToken(newAccessToken);
                    void import('../store/authStore').then(({ useAuthStore }) => {
                        useAuthStore.setState({
                            accessToken: newAccessToken,
                            isAuthenticated: true,
                        });
                    });
                    flushPendingRequests(newAccessToken);
                    originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
                    return client(originalRequest);
                } catch (refreshError) {
                    flushPendingRequests(null);
                    const trackingActive =
                        typeof window !== 'undefined' &&
                        Boolean((window as Window & { __flowtrackTrackingActive?: boolean }).__flowtrackTrackingActive);

                    if (!trackingActive) {
                        clearAuthTokens();
                        syncElectronAuthToken('');
                        if (typeof window !== 'undefined' && !isLoginPath(window.location.pathname)) {
                            window.location.href = getAppLoginPath();
                        }
                    }
                    return Promise.reject(refreshError);
                } finally {
                    isRefreshingToken = false;
                }
            }
        }

        if (error.response?.status === 403 && error.response.data?.error_code === 'PLAN_LIMIT_REACHED') {
            const message = error.response.data?.message || 'Plan limit reached. Please upgrade your subscription.';
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('plan-limit-reached', {
                    detail: {
                        message,
                        upgrade_url: typeof error.response.data?.upgrade_url === 'string'
                            ? error.response.data.upgrade_url
                            : '/billing',
                    },
                }));
                // Soft toast only — never interrupt with window.confirm()
                void import('../store/toastStore').then(({ toastWarning }) => {
                    toastWarning(message, 'Plan limit');
                }).catch(() => undefined);
            }
        }

        // Surface server errors as toasts (avoid double-toasting routine 4xx handled in pages)
        if (typeof window !== 'undefined' && error.response?.status && error.response.status >= 500) {
            const msg =
                error.response?.data?.message ||
                error.response?.data?.error ||
                'Server error. Please try again.';
            void import('../store/toastStore').then(({ toastError }) => {
                toastError(String(msg));
            });
        }

        return Promise.reject(error);
    }
);

export default client;
