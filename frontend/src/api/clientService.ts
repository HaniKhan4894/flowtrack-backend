import client from './client';

export interface Client {
    id: number;
    organization_id: number;
    name: string;
    email?: string | null;
    phone?: string | null;
    default_rate?: number | null;
    notes?: string | null;
    is_active: boolean;
    project_count?: number;
    projects?: Array<{ id: number; name: string; is_active: boolean; is_billable: boolean }>;
    created_at?: string;
    updated_at?: string;
}

export const clientService = {
    getAll: async (params?: { search?: string; is_active?: number; page?: number }): Promise<{ data: Client[]; pagination?: Record<string, number> }> => {
        const response = await client.get('/clients', { params });
        return response.data;
    },

    get: async (id: number): Promise<{ data: Client }> => {
        const response = await client.get(`/clients/${id}`);
        return response.data;
    },

    create: async (data: Partial<Client>): Promise<{ data: Client }> => {
        const response = await client.post('/clients', data);
        return response.data;
    },

    update: async (id: number, data: Partial<Client>): Promise<{ data: Client }> => {
        const response = await client.put(`/clients/${id}`, data);
        return response.data;
    },

    delete: async (id: number): Promise<void> => {
        await client.delete(`/clients/${id}`);
    },

    linkProjects: async (id: number, projectIds: number[]): Promise<{ data: Client }> => {
        const response = await client.post(`/clients/${id}/projects`, { project_ids: projectIds });
        return response.data;
    },
};
