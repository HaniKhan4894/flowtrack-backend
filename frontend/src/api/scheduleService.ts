import client from './client';

export interface ScheduleDay {
    day_of_week: number;
    start_time: string;
    end_time: string;
    is_working_day: boolean;
}

export const scheduleService = {
    get: async (userId?: number): Promise<{ data: ScheduleDay[] }> => {
        const response = await client.get('/schedules', { params: userId ? { user_id: userId } : undefined });
        return response.data;
    },

    upsert: async (data: { user_id?: number; days: ScheduleDay[] }): Promise<{ data: ScheduleDay[] }> => {
        const response = await client.put('/schedules', data);
        return response.data;
    },

    deleteDay: async (dayOfWeek: number, userId?: number): Promise<void> => {
        await client.delete(`/schedules/${dayOfWeek}`, { params: userId ? { user_id: userId } : undefined });
    },

    getExpectedVsActual: async (params: { start_date: string; end_date: string; user_id?: number }): Promise<{ data: unknown }> => {
        const response = await client.get('/schedules/expected-vs-actual', { params });
        return response.data;
    },

    getOvertimeRules: async (): Promise<{ data: unknown }> => {
        const response = await client.get('/overtime/rules');
        return response.data;
    },

    upsertOvertimeRules: async (data: Record<string, unknown>): Promise<{ data: unknown }> => {
        const response = await client.put('/overtime/rules', data);
        return response.data;
    },

    calculateOvertime: async (params: { start_date: string; end_date: string; user_id?: number }): Promise<{ data: unknown }> => {
        const response = await client.get('/overtime/calculate', { params });
        return response.data;
    },
};
