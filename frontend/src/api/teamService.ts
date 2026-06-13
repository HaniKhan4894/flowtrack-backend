import client from './client';
import type { User, MemberMonitoringSettings } from '../types';
import { useAuthStore } from '../store/authStore';

export interface TeamMember extends User {
    joined_at: string;
    user_id?: number;
    team_id?: number | null;
    daily_hours_target?: number | null;
    tracking_enabled?: boolean;
    screenshots_enabled?: boolean;
    screenshot_disabled_until?: string | null;
    screenshot_disabled_from?: string | null;
    screenshot_disabled_to?: string | null;
}

export interface TeamGroup {
    id: number;
    organization_id: number;
    name: string;
    lead_user_id?: number | null;
    member_count: number;
    members: Array<{ user_id: number; first_name: string; last_name: string; email: string }>;
    lead?: { id: number; first_name: string; last_name: string; email: string } | null;
}

function getOrgId(): number {
    const user = useAuthStore.getState().user;
    const orgId = user?.organization_id;
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

    updateMember: async (userId: string | number, data: { daily_hours_target?: number | null; role?: string }): Promise<{ data: TeamMember }> => {
        const response = await client.put(`/organizations/${getOrgId()}/members/${userId}`, data);
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

    getTeams: async (): Promise<{ data: TeamGroup[] }> => {
        const response = await client.get('/teams');
        return response.data;
    },

    getTeam: async (teamId: number): Promise<{ data: TeamGroup }> => {
        const response = await client.get(`/teams/${teamId}`);
        return response.data;
    },

    createTeam: async (data: { name: string; lead_user_id?: number; member_ids?: number[] }): Promise<{ data: TeamGroup }> => {
        const response = await client.post('/teams', data);
        return response.data;
    },

    updateTeam: async (teamId: number, data: { name?: string; lead_user_id?: number | null }): Promise<{ data: TeamGroup }> => {
        const response = await client.put(`/teams/${teamId}`, data);
        return response.data;
    },

    deleteTeam: async (teamId: number): Promise<void> => {
        await client.delete(`/teams/${teamId}`);
    },

    assignMembers: async (teamId: number, memberIds: number[]): Promise<{ data: TeamGroup }> => {
        const response = await client.post(`/teams/${teamId}/members`, { member_ids: memberIds });
        return response.data;
    },

    removeTeamMember: async (teamId: number, userId: number): Promise<{ data: TeamGroup }> => {
        const response = await client.delete(`/teams/${teamId}/members/${userId}`);
        return response.data;
    },

    setTeamLead: async (teamId: number, leadUserId: number | null): Promise<{ data: TeamGroup }> => {
        const response = await client.put(`/teams/${teamId}/lead`, { lead_user_id: leadUserId });
        return response.data;
    },
};
