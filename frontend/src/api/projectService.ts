import client from './client';

export interface Project {
    id: number;
    name: string;
    description: string;
    status: 'active' | 'archived' | 'completed';
    color: string;
    organization_id: number;
    is_active?: number;
    is_billable?: number;
    client_name?: string;
    client_id?: number;
    budget_hours?: number;
    budget_amount?: number;
    total_time_seconds?: number;
    member_count?: number;
}

export const projectService = {
    getAll: async (params?: { search?: string; is_active?: number }): Promise<{ data: Project[] }> => {
        const response = await client.get<{ data: Project[] }>('/projects', { params });
        return response.data;
    },

    create: async (data: Partial<Project>): Promise<{ data: Project }> => {
        const response = await client.post<{ data: Project }>('/projects', data);
        return response.data;
    },

    update: async (id: number, data: Partial<Project>): Promise<{ data: Project }> => {
        const response = await client.put<{ data: Project }>(`/projects/${id}`, data);
        return response.data;
    },

    delete: async (id: number): Promise<void> => {
        await client.delete(`/projects/${id}`);
    },
};
