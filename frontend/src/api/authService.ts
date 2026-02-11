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
};
