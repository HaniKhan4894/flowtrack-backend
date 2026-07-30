import client from './client';
import type { PlatformAnnouncementBanner } from '../types/admin';

export const announcementService = {
    getActive: async (): Promise<{ data: PlatformAnnouncementBanner[] }> => {
        const response = await client.get('/announcements');
        return response.data;
    },
    dismiss: async (id: number) => {
        const response = await client.post(`/announcements/${id}/dismiss`);
        return response.data;
    },
};
