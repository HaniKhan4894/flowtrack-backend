import client from './client';

export interface Integration {
    provider: string;
    connected: boolean;
    is_enabled: boolean;
    auth_type: 'api_key' | 'oauth';
    external_account_id: string | null;
    settings: Record<string, unknown> & { model?: string; base_url?: string; key_hint?: string };
    updated_at?: string | null;
}

export const integrationsService = {
    list: async (): Promise<{ data: Integration[] }> => {
        const response = await client.get('/integrations');
        return response.data;
    },

    get: async (provider: string): Promise<{ data: Integration }> => {
        const response = await client.get(`/integrations/${provider}`);
        return response.data;
    },

    save: async (
        provider: string,
        payload: { api_key?: string; model?: string; base_url?: string },
    ): Promise<{ data: Integration }> => {
        const response = await client.put(`/integrations/${provider}`, payload);
        return response.data;
    },

    connect: async (provider: string): Promise<{ data: { url: string } }> => {
        const response = await client.post(`/integrations/${provider}/connect`, {});
        return response.data;
    },

    toggle: async (provider: string, enabled: boolean): Promise<{ data: Integration }> => {
        const response = await client.post(`/integrations/${provider}/toggle`, { enabled });
        return response.data;
    },

    disconnect: async (provider: string): Promise<{ success: boolean }> => {
        const response = await client.delete(`/integrations/${provider}`);
        return response.data;
    },
};
