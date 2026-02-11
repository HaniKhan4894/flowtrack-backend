import client from './client';

export interface Project {
    id: number;
    name: string;
    description: string;
    status: 'active' | 'archived' | 'completed';
    color: string;
    organization_id: number;
}

export const projectService = {
    getAll: async (): Promise<{ data: Project[] }> => {
        const response = await client.get<{ data: Project[] }>('/projects');
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
