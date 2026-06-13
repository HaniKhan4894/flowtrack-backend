import client from './client';
import type { Task } from '../types';

export const taskService = {
    getAll: async (params?: {
        project_id?: number;
        is_active?: number | string;
        search?: string;
        page?: number;
        per_page?: number;
    }): Promise<{ data: Task[]; pagination?: Record<string, number> }> => {
        const response = await client.get('/tasks', { params });
        return response.data;
    },

    getById: async (id: number): Promise<{ data: Task }> => {
        const response = await client.get(`/tasks/${id}`);
        return response.data;
    },

    create: async (data: {
        project_id: number;
        name: string;
        description?: string;
        estimated_hours?: number;
        is_active?: boolean;
    }): Promise<{ data: Task }> => {
        const response = await client.post('/tasks', data);
        return response.data;
    },

    update: async (
        id: number,
        data: Partial<Pick<Task, 'name' | 'description' | 'estimated_hours' | 'is_active'>>,
    ): Promise<{ data: Task }> => {
        const response = await client.put(`/tasks/${id}`, data);
        return response.data;
    },

    delete: async (id: number): Promise<void> => {
        await client.delete(`/tasks/${id}`);
    },
};
