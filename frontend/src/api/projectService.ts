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
    getAll: async (params?: { search?: string; is_active?: number; per_page?: number }): Promise<{ data: Project[] }> => {
        const response = await client.get<{ data: Project[] }>('/projects', {
            params: { per_page: 200, ...params },
        });
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

    getMembers: async (projectId: number): Promise<{ data: Array<{ user_id: number; first_name?: string; last_name?: string; email?: string }> }> => {
        const response = await client.get(`/projects/${projectId}/members`);
        return response.data;
    },

    syncMembers: async (projectId: number, userIds: number[]): Promise<{ data: unknown }> => {
        const response = await client.put(`/projects/${projectId}/members`, { user_ids: userIds });
        return response.data;
    },
};
