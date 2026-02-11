import axios from 'axios';

const client = axios.create({
    baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8080/api/v1',
    headers: {
        'Content-Type': 'application/json',
    },
});

// Interceptor for Auth
client.interceptors.request.use((config) => {
    const token = localStorage.getItem('access_token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Interceptor for response errors (e.g. 401 Unauthorized or Plan Limits)
client.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;

        // Handle 401 - Refresh Token logic here later
        if (error.response?.status === 401 && !originalRequest._retry) {
            // Logic for refresh token
        }

        // Handle 403 - Plan Limits
        if (error.response?.status === 403 && error.response.data?.error_code === 'PLAN_LIMIT_REACHED') {
            // We can trigger a global "Upgrade Required" modal here via Store
        }

        return Promise.reject(error);
    }
);

export default client;
