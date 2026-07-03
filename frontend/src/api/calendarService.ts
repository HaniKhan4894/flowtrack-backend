import client from './client';

export interface CalendarEvent {
    id: string;
    title: string;
    start_local: string | null;
    end_local: string | null;
    started_at: string | null;
    ended_at: string | null;
    minutes: number;
    attendees: number;
    organizer: string | null;
    all_day: boolean;
}

export interface CalendarEventsResult {
    connected: boolean;
    provider?: string;
    account?: string | null;
    date?: string;
    events: CalendarEvent[];
}

export interface CalendarLogTimePayload {
    title: string;
    started_at: string;
    ended_at: string;
    project_id?: number;
    is_billable?: boolean;
}

export const calendarService = {
    events: async (date?: string): Promise<{ data: CalendarEventsResult }> => {
        const response = await client.get('/integrations/calendar/events', { params: date ? { date } : {} });
        return response.data;
    },

    logTime: async (payload: CalendarLogTimePayload): Promise<{ data: { entry: unknown } }> => {
        const response = await client.post('/integrations/calendar/log-time', payload);
        return response.data;
    },
};
