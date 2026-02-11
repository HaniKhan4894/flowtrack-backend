import client from './client';

export const timeService = {
    startTimer: async (data: { project_id: number; task_id?: number; description?: string }) => {
        const response = await client.post('/time-entries/start', data);
        return response.data;
    },

    stopTimer: async (id: number) => {
        const response = await client.post(`/time-entries/${id}/stop`);
        return response.data;
    },

    getActive: async () => {
        const response = await client.get('/time-entries/active');
        return response.data;
    },

    getHistory: async () => {
        const response = await client.get('/time-entries');
        return response.data;
    },

    getAll: async () => {
        const response = await client.get('/time-entries');
        return response.data;
    },
};
