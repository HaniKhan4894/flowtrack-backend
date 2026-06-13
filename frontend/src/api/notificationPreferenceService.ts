import client from './client';
import type { NotificationPreference } from '../types';

export const notificationPreferenceService = {
    get: async (): Promise<{ data: NotificationPreference[] }> => {
        const response = await client.get('/notification-preferences');
        return response.data;
    },

    update: async (preferences: NotificationPreference[]): Promise<{ data: NotificationPreference[] }> => {
        const response = await client.put('/notification-preferences', { preferences });
        return response.data;
    },
};
