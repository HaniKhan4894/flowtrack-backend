import client from './client';
import type { TimesheetPeriod, TimesheetWeekGrid } from '../types';

export const timesheetService = {
    getAll: async (params?: {
        user_id?: number;
        status?: string;
        week_start?: string;
        page?: number;
        per_page?: number;
    }): Promise<{ data: TimesheetPeriod[]; pagination?: Record<string, number> }> => {
        const response = await client.get('/timesheets', { params });
        return response.data;
    },

    getCurrentWeek: async (params?: {
        user_id?: number;
        week_start?: string;
    }): Promise<{ data: TimesheetWeekGrid }> => {
        const response = await client.get('/timesheets/current-week', { params });
        return response.data;
    },

    submit: async (id: number): Promise<{ data: TimesheetPeriod }> => {
        const response = await client.post(`/timesheets/${id}/submit`);
        return response.data;
    },

    approve: async (id: number): Promise<{ data: TimesheetPeriod }> => {
        const response = await client.post(`/timesheets/${id}/approve`);
        return response.data;
    },

    reject: async (id: number, reason: string): Promise<{ data: TimesheetPeriod }> => {
        const response = await client.post(`/timesheets/${id}/reject`, { reason });
        return response.data;
    },
};
