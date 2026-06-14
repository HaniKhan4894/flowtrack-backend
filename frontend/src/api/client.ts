import axios from 'axios';
import { authService } from './authService';
import { syncElectronAuthToken } from '../utils/electronAuth';

const apiBaseUrl =
    import.meta.env.VITE_API_URL ||
    'https://2310-154-192-119-80.ngrok-free.app/flowtrack-backend/public/api/v1';

const usesNgrok = apiBaseUrl.includes('ngrok');

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
                    const newAccessToken = refreshed.data.access_token;
                    const refreshedOrgId = (refreshed.data as any)?.organization_id;
                    localStorage.setItem('access_token', newAccessToken);
                    if (refreshedOrgId) {
                        localStorage.setItem('organization_id', String(refreshedOrgId));
                    }
                    syncElectronAuthToken(newAccessToken);
                    flushPendingRequests(newAccessToken);
                    originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
                    return client(originalRequest);
                } catch (refreshError) {
                    flushPendingRequests(null);
                    localStorage.removeItem('access_token');
                    localStorage.removeItem('refresh_token');
                    localStorage.removeItem('organization_id');
                    localStorage.removeItem('user');
                    syncElectronAuthToken('');
                    if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
                        window.location.href = '/login';
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
                window.dispatchEvent(new CustomEvent('plan-limit-reached', { detail: { message } }));
                if (window.location.pathname !== '/billing' && confirm(`${message}\n\nOpen billing to upgrade?`)) {
                    window.location.href = '/billing';
                }
            }
        }

        return Promise.reject(error);
    }
);

export default client;
