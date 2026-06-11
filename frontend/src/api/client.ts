import axios from 'axios';
import { authService } from './authService';
import { syncElectronAuthToken } from '../utils/electronAuth';

const apiBaseUrl =
    import.meta.env.VITE_API_URL ||
    'https://8b8a-124-109-46-74.ngrok-free.app/flowtrack-backend/public/api/v1';

const client = axios.create({
    baseURL: apiBaseUrl,
    headers: {
        'Content-Type': 'application/json',
        ...(apiBaseUrl.includes('ngrok') ? { 'ngrok-skip-browser-warning': 'true' } : {}),
    },
});

// Interceptor for Auth
client.interceptors.request.use((config) => {
    const token = localStorage.getItem('access_token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    if (apiBaseUrl.includes('ngrok')) {
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

// Interceptor for response errors (e.g. 401 Unauthorized or Plan Limits)
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

        // Handle 403 - Plan Limits
        if (error.response?.status === 403 && error.response.data?.error_code === 'PLAN_LIMIT_REACHED') {
            // We can trigger a global "Upgrade Required" modal here via Store
        }

        return Promise.reject(error);
    }
);

export default client;
