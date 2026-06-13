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

export interface TopUrl {
    url: string;
    category: string;
    total_seconds: number;
    total_hours: number;
    visit_count: number;
    percentage: number;
}

export interface OrgProductivityMember {
    user_id: number;
    first_name: string;
    last_name: string;
    total_hours: number;
    productivity_score: number;
    productive_hours: number;
}

export interface ProjectProfitability {
    project_id: number;
    project_name: string;
    client_name: string | null;
    total_hours: number;
    billable_hours: number;
    estimated_revenue: number | null;
    budget_amount: number | null;
    margin: number | null;
}

export interface IdleBreakdownUser {
    user_id: number;
    first_name: string;
    last_name: string;
    idle_seconds: number;
    active_seconds: number;
    idle_hours: number;
    active_hours: number;
}

export interface ActiveSession {
    time_entry_id: number;
    user_id: number;
    user_name: string;
    email?: string | null;
    project_name: string;
    started_at: string;
    is_paused: boolean;
    elapsed_seconds: number;
    elapsed: string;
}

type ExportFormat = 'csv' | 'pdf' | 'xlsx';

async function triggerDownload(url: string, filename: string) {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

export const reportService = {
    getHourlyTimeline: async (params: { date: string; user_id?: number }): Promise<{ data: import('../types').HourlyTimelineData }> => {
        const response = await client.get('/reports/hourly-timeline', { params });
        return response.data;
    },
    getTimeSummary: async (params?: Record<string, string>): Promise<{ data: TimeSummary }> => {
        const response = await client.get('/reports/time-summary', { params });
        return response.data;
    },
    getProjectBreakdown: async (params?: Record<string, string>): Promise<{ data: ProjectBreakdown[] }> => {
        const response = await client.get('/reports/project-breakdown', { params });
        return response.data;
    },
    getTeamLeaderboard: async (params?: Record<string, string>): Promise<{ data: TeamLeaderboard[] }> => {
        const response = await client.get('/reports/team-leaderboard', { params });
        return response.data;
    },
    getTopUrls: async (params: { start_date: string; end_date: string; user_id?: number }): Promise<{ data: { urls: TopUrl[]; total_seconds: number } }> => {
        const response = await client.get('/reports/top-urls', { params });
        return response.data;
    },
    getOrgProductivity: async (params: { start_date: string; end_date: string }): Promise<{ data: { members: OrgProductivityMember[] } }> => {
        const response = await client.get('/reports/org-productivity', { params });
        return response.data;
    },
    getIdleBreakdown: async (params: { start_date: string; end_date: string; user_id?: number }): Promise<{ data: { users: IdleBreakdownUser[]; total_idle_seconds: number; total_active_seconds: number } }> => {
        const response = await client.get('/reports/idle-breakdown', { params });
        return response.data;
    },
    getProjectProfitability: async (params: { start_date: string; end_date: string }): Promise<{ data: { projects: ProjectProfitability[] } }> => {
        const response = await client.get('/reports/project-profitability', { params });
        return response.data;
    },
    getActiveSessions: async (): Promise<{ data: ActiveSession[] }> => {
        const response = await client.get('/reports/active-sessions');
        return response.data;
    },
    exportReport: async (filename: string, reportData: unknown[], format: ExportFormat = 'csv', title?: string) => {
        const response = await client.post('/reports/export', {
            filename,
            report_data: reportData,
            format,
            title,
        });
        const downloadUrl = response.data?.data?.download_url;
        if (downloadUrl) {
            triggerDownload(downloadUrl, filename);
        }
        return response.data;
    },
    exportCsv: async (filename: string, reportData: unknown[]) => {
        return reportService.exportReport(filename, reportData, 'csv');
    },
    exportPdf: async (filename: string, reportData: unknown[], title?: string) => {
        return reportService.exportReport(filename, reportData, 'pdf', title);
    },
    exportExcel: async (filename: string, reportData: unknown[]) => {
        return reportService.exportReport(filename.endsWith('.xlsx') ? filename : filename.replace(/\.[^.]+$/, '.xlsx'), reportData, 'xlsx');
    },
};
