import client from './client';

export interface WellbeingFactor {
    label: string;
    detail: string;
    impact: number;
}

export interface WellbeingMetrics {
    total_hours: number;
    active_days: number;
    avg_daily_hours: number;
    max_day_hours: number;
    longest_session_hours: number;
    after_hours_ratio: number;
    weekend_ratio: number;
    break_ratio: number | null;
    longest_streak_days: number;
}

export type RiskLevel = 'low' | 'moderate' | 'high';

export interface WellbeingReport {
    user: { id: number; name: string; email: string };
    period: { days: number; start: string; end: string };
    metrics: WellbeingMetrics;
    score: number;
    level: RiskLevel;
    factors: WellbeingFactor[];
    recommendations: string[];
}

export interface WellbeingTeamMember {
    user: { id: number; name: string; email: string };
    score: number;
    level: RiskLevel;
    tracked_hours: number;
    avg_daily: number;
    top_factor: string | null;
}

export interface WellbeingTeamReport {
    period: { days: number };
    summary: { members: number; high_risk: number; moderate: number; low_risk: number };
    members: WellbeingTeamMember[];
}

export const wellbeingService = {
    me: async (days = 14): Promise<{ data: WellbeingReport }> => {
        const response = await client.get('/wellbeing/me', { params: { days } });
        return response.data;
    },

    team: async (days = 14): Promise<{ data: WellbeingTeamReport }> => {
        const response = await client.get('/wellbeing/team', { params: { days } });
        return response.data;
    },
};
