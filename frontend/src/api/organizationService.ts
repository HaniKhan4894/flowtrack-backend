import client from './client';
import type { Organization } from '../types';

export const organizationService = {
    get: async (id: number): Promise<{ data: Organization }> => {
        const response = await client.get(`/organizations/${id}`);
        return response.data;
    },
    update: async (id: number, data: Partial<Organization>): Promise<{ data: Organization }> => {
        const response = await client.put(`/organizations/${id}`, data);
        return response.data;
    },
};
