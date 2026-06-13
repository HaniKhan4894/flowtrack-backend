import client from './client';
import type { User } from '../types';

interface AuthResponse {
    success: boolean;
    message: string;
    data: {
        user: User;
        tokens: {
            access_token: string;
            refresh_token: string;
        };
    };
}

export const authService = {
    login: async (email: string, password: string): Promise<AuthResponse> => {
        const response = await client.post<AuthResponse>('/auth/login', { email, password });
        return response.data;
    },

    register: async (data: any): Promise<AuthResponse> => {
        const response = await client.post<AuthResponse>('/auth/register', data);
        return response.data;
    },

    me: async (): Promise<{ data: User }> => {
        const response = await client.get<{ data: User }>('/auth/me');
        return response.data;
    },

    logout: async (): Promise<void> => {
        await client.post('/auth/logout');
    },

    refresh: async (refreshToken: string): Promise<{ data: { access_token: string; token_type: string; expires_in: number } }> => {
        const response = await client.post('/auth/refresh', { refresh_token: refreshToken });
        return response.data;
    },

    forgotPassword: async (email: string): Promise<{ success: boolean; message: string }> => {
        const response = await client.post('/auth/forgot-password', { email });
        return response.data;
    },

    resetPassword: async (token: string, password: string): Promise<{ success: boolean; message: string }> => {
        const response = await client.post('/auth/reset-password', { token, password });
        return response.data;
    },

    verifyEmail: async (token: string): Promise<{ success: boolean; message: string }> => {
        const response = await client.post('/auth/verify-email', { token });
        return response.data;
    },

    resendVerification: async (email: string): Promise<{ success: boolean; message: string }> => {
        const response = await client.post('/auth/resend-verification', { email });
        return response.data;
    },

    changePassword: async (currentPassword: string, newPassword: string, confirmPassword: string): Promise<{ success: boolean; message: string }> => {
        const response = await client.post('/auth/change-password', {
            current_password: currentPassword,
            new_password: newPassword,
            confirm_password: confirmPassword,
        });
        return response.data;
    },

    setup2FA: async (): Promise<{ data: { secret: string; otpauth_url: string } }> => {
        const response = await client.post('/auth/2fa/setup');
        return response.data;
    },

    verify2FA: async (code: string): Promise<{ success: boolean; message: string }> => {
        const response = await client.post('/auth/2fa/verify', { code });
        return response.data;
    },

    disable2FA: async (password: string, code: string): Promise<{ success: boolean; message: string }> => {
        const response = await client.post('/auth/2fa/disable', { password, code });
        return response.data;
    },

    getSessions: async (): Promise<{ data: Array<{ id: number; device_info?: string | null; ip_address?: string | null; expires_at: string; created_at: string }> }> => {
        const response = await client.get('/auth/sessions');
        return response.data;
    },

    revokeSession: async (sessionId: number): Promise<{ success: boolean; message: string }> => {
        const response = await client.delete(`/auth/sessions/${sessionId}`);
        return response.data;
    },
};
