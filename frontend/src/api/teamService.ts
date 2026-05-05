import client from './client';
import type { User } from '../types';
import { useAuthStore } from '../store/authStore';

export interface TeamMember extends User {
    joined_at: string;
    user_id?: number;
}

function getOrgId(): number {
    const user = useAuthStore.getState().user;
    return (user as any)?.organization_id ?? 1;
}

export const teamService = {
    getAll: async (): Promise<{ data: TeamMember[] }> => {
        const response = await client.get(`/organizations/${getOrgId()}/members`);
        return response.data;
    },

    invite: async (email: string, role: string): Promise<any> => {
        const response = await client.post(`/organizations/${getOrgId()}/members`, { email, role });
        return response.data;
    },

    remove: async (userId: string | number): Promise<any> => {
        const response = await client.delete(`/organizations/${getOrgId()}/members/${userId}`);
        return response.data;
    }
};
