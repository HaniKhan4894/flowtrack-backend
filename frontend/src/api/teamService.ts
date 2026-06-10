import client from './client';
import type { User, MemberMonitoringSettings } from '../types';
import { useAuthStore } from '../store/authStore';

export interface TeamMember extends User {
    joined_at: string;
    user_id?: number;
    tracking_enabled?: boolean;
    screenshots_enabled?: boolean;
    screenshot_disabled_until?: string | null;
    screenshot_disabled_from?: string | null;
    screenshot_disabled_to?: string | null;
}

function getOrgId(): number {
    const user = useAuthStore.getState().user;
    const orgId = (user as any)?.organization_id;
    if (!orgId) {
        throw new Error('Organization context missing');
    }
    return orgId;
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
    },

    getMonitoring: async (userId: string | number): Promise<{ data: MemberMonitoringSettings }> => {
        const response = await client.get(`/organizations/${getOrgId()}/members/${userId}/monitoring`);
        return response.data;
    },

    updateMonitoring: async (userId: string | number, settings: Partial<MemberMonitoringSettings>): Promise<{ data: MemberMonitoringSettings }> => {
        const response = await client.put(`/organizations/${getOrgId()}/members/${userId}/monitoring`, settings);
        return response.data;
    },
};
