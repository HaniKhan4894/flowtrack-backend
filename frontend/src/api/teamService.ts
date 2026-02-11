import client from './client';
import type { User } from '../types';

export interface TeamMember extends User {
    joined_at: string;
}

export const teamService = {
    getAll: async (): Promise<{ data: TeamMember[] }> => {
        // Assuming organization members endpoint
        const response = await client.get('/organizations/1/members'); // Hardcoded ID for now, should be from auth
        return response.data;
    },

    invite: async (email: string, role: string): Promise<any> => {
        const response = await client.post('/organizations/1/members', { email, role });
        return response.data;
    },

    remove: async (id: string): Promise<any> => {
        const response = await client.delete(`/organizations/1/members/${id}`);
        return response.data;
    }
};
