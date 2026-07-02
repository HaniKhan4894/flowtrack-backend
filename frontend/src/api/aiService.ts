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
};
