import client from './client';

export interface DashboardStats {
    total_hours: number;
    productivity_score: number;
    team_count: number;
    active_timers: number;
    recent_activity: any[];
    weekly_stats: {
        day: string;
        hours: number;
    }[];
    hours_today?: number;
    daily_target?: number;
    pct_of_target?: number;
    scope?: 'own' | 'organization' | 'team';
}

export const dashboardService = {
    getStats: async (): Promise<{ data: DashboardStats }> => {
        const response = await client.get('/reports/summary');
        return response.data;
    },
};
