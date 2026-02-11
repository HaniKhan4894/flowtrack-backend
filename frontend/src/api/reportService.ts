import client from './client';

export interface TimeSummary {
    total_entries: number;
    total_hours: number;
    avg_hours: number;
    billable_hours: number;
    non_billable_hours: number;
}

export interface ProjectBreakdown {
    id: number;
    name: string;
    client_name: string | null;
    entries_count: number;
    total_seconds: number;
    total_hours: number;
}

export interface TeamLeaderboard {
    id: number;
    first_name: string;
    last_name: string;
    email: string;
    entries_count: number;
    rank: number;
    total_hours: number;
}

export const reportService = {
    getTimeSummary: async (params?: any): Promise<{ data: TimeSummary }> => {
        const response = await client.get('/reports/time-summary', { params });
        return response.data;
    },
    getProjectBreakdown: async (params?: any): Promise<{ data: ProjectBreakdown[] }> => {
        const response = await client.get('/reports/project-breakdown', { params });
        return response.data;
    },
    getTeamLeaderboard: async (params?: any): Promise<{ data: TeamLeaderboard[] }> => {
        const response = await client.get('/reports/team-leaderboard', { params });
        return response.data;
    }
};
