import client from './client';
import type { User } from '../types';

export const userService = {
    uploadAvatar: async (userId: number, file: File): Promise<{ data: User }> => {
        const formData = new FormData();
        formData.append('avatar', file);

        const response = await client.post(`/users/${userId}/avatar`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        });
        return response.data;
    },

    fetchAvatarUrl: async (userId: number): Promise<string | null> => {
        try {
            const response = await client.get(`/users/${userId}/avatar`, { responseType: 'blob' });
            return URL.createObjectURL(response.data);
        } catch {
            return null;
        }
    },
};
