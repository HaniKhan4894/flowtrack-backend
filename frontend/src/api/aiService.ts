import client from './client';

export interface AiAskResult {
    answer: string;
    period: { start: string; end: string } | null;
    model: string;
}

export interface AiWeeklyNarrative {
    narrative: string;
    model: string;
    summary: Record<string, unknown>;
}

export interface AiSuggestion {
    project_id: number | null;
    project_name: string | null;
    description: string;
    duration_minutes: number;
    confidence: number;
    rationale: string;
}

export interface AiCategorizeResult {
    date: string;
    suggestions: AiSuggestion[];
    based_on: { activity_clusters: number; commits: number; projects: number };
    model: string;
    source: string;
    message?: string;
}

export interface AiStandupResult {
    date: string;
    user: { id: number; name: string; email: string };
    stats: {
        tracked_minutes: number;
        entries: number;
        productive_percent: number;
        productivity: Record<string, number>;
    };
    standup: string;
    model: string;
    source: string;
}

export const aiService = {
    status: async (): Promise<{ data: { enabled: boolean } }> => {
        const response = await client.get('/ai/status');
        return response.data;
    },

    ask: async (question: string): Promise<{ data: AiAskResult }> => {
        const response = await client.post('/ai/ask', { question });
        return response.data;
    },

    weeklyNarrative: async (): Promise<{ data: AiWeeklyNarrative }> => {
        const response = await client.get('/ai/weekly-narrative');
        return response.data;
    },

    categorize: async (date?: string): Promise<{ data: AiCategorizeResult }> => {
        const response = await client.get('/ai/categorize', { params: date ? { date } : {} });
        return response.data;
    },

    standup: async (date?: string, userId?: number): Promise<{ data: AiStandupResult }> => {
        const params: Record<string, string | number> = {};
        if (date) params.date = date;
        if (userId) params.user_id = userId;
        const response = await client.get('/ai/standup', { params });
        return response.data;
    },
};
