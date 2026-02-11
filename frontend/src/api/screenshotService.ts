import client from './client';

export const screenshotService = {
    getAll: async (filters: any = {}) => {
        const response = await client.get('/screenshots', { params: filters });
        return response.data;
    },

    getByTimeEntry: async (timeEntryId: number) => {
        const response = await client.get(`/screenshots/time-entry/${timeEntryId}`);
        return response.data;
    },

    upload: async (formData: FormData) => {
        const response = await client.post('/screenshots/upload', formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });
        return response.data;
    },

    delete: async (id: number) => {
        const response = await client.delete(`/screenshots/${id}`);
        return response.data;
    }
};
