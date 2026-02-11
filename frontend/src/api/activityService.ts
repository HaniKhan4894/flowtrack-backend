import client from './client';

export const activityService = {
    getAll: async (filters: any = {}) => {
        const response = await client.get('/activity-logs', { params: filters });
        return response.data;
    },

    sync: async (data: any) => {
        const response = await client.post('/activity-logs/sync', data);
        return response.data;
    },

    getStats: async (filters: any = {}) => {
        const response = await client.get('/activity-logs/stats', { params: filters });
        return response.data;
    }
};
