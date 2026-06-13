import client from './client';
import type { Permission, Role } from '../types';

export const roleService = {
    getRoles: async (): Promise<{ data: Role[] }> => {
        const response = await client.get('/roles');
        return response.data;
    },

    create: async (data: {
        name: string;
        description?: string;
        permission_ids?: number[];
    }): Promise<{ data: Role }> => {
        const response = await client.post('/roles', data);
        return response.data;
    },

    updatePermissions: async (roleId: number, permissionIds: number[]): Promise<{ success: boolean }> => {
        const response = await client.put(`/roles/${roleId}/permissions`, { permission_ids: permissionIds });
        return response.data;
    },

    update: async (roleId: number, data: { name?: string; description?: string }): Promise<{ data: Role }> => {
        const response = await client.put(`/roles/${roleId}`, data);
        return response.data;
    },

    delete: async (roleId: number): Promise<void> => {
        await client.delete(`/roles/${roleId}`);
    },

    getPermissions: async (): Promise<{ data: Record<string, Permission[]> }> => {
        const response = await client.get('/permissions');
        return response.data;
    },

    getUserPermissions: async (userId: number): Promise<{ data: Permission[] }> => {
        const response = await client.get(`/users/${userId}/permissions`);
        return response.data;
    },
};
