import client from './client';

export interface ScheduledReport {
    id: number;
    organization_id: number;
    report_type: string;
    cadence: 'daily' | 'weekly' | 'monthly';
    recipients: string[];
    format: 'csv' | 'pdf' | 'xlsx';
    is_active: boolean;
    last_sent_at?: string | null;
    created_by: number;
    created_at?: string;
}

export const scheduledReportService = {
    getAll: async (): Promise<{ data: ScheduledReport[] }> => {
        const response = await client.get('/scheduled-reports');
        return response.data;
    },

    create: async (data: Partial<ScheduledReport>): Promise<{ data: ScheduledReport }> => {
        const response = await client.post('/scheduled-reports', data);
        return response.data;
    },

    update: async (id: number, data: Partial<ScheduledReport>): Promise<{ data: ScheduledReport }> => {
        const response = await client.put(`/scheduled-reports/${id}`, data);
        return response.data;
    },

    delete: async (id: number): Promise<void> => {
        await client.delete(`/scheduled-reports/${id}`);
    },
};
