import client from './client';

export interface ApiKey {
  id: number;
  name: string;
  key_prefix: string;
  masked: string;
  is_active: boolean;
  last_used_at: string | null;
  created_at: string | null;
}

export interface CreatedApiKey {
  id: number;
  name: string;
  key_prefix: string;
  plaintext: string;
}

export interface WebhookEndpoint {
  id: number;
  url: string;
  events: string[];
  is_active: boolean;
  secret_hint?: string;
  last_status?: number | null;
  last_delivered_at?: string | null;
  created_at?: string | null;
}

export interface CreatedWebhook {
  id: number;
  url: string;
  events: string[];
  secret: string;
}

export interface AutomationCondition {
  field: string;
  op: '==' | '!=' | '>' | '>=' | '<' | '<=' | 'contains';
  value: string | number | null;
}

export interface AutomationAction {
  type: 'slack_post' | 'webhook' | 'notify_managers';
  config: Record<string, unknown>;
}

export interface AutomationMeta {
  triggers: string[];
  actions: string[];
}

export interface Automation {
  id: number;
  name: string;
  trigger_event: string;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
  is_active: boolean;
  last_run_at?: string | null;
  run_count?: number;
  created_at?: string | null;
}

export interface AutomationPayload {
  name: string;
  trigger_event: string;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
  is_active: boolean;
}

export const developerService = {
  // ── API keys ────────────────────────────────────────────────────────────
  listApiKeys: async (): Promise<{ data: ApiKey[] }> => {
    const res = await client.get('/developer/api-keys');
    return res.data;
  },
  createApiKey: async (name: string): Promise<{ data: CreatedApiKey }> => {
    const res = await client.post('/developer/api-keys', { name });
    return res.data;
  },
  revokeApiKey: async (id: number): Promise<{ success: boolean }> => {
    const res = await client.delete(`/developer/api-keys/${id}`);
    return res.data;
  },

  // ── Webhooks ────────────────────────────────────────────────────────────
  listWebhooks: async (): Promise<{ data: { endpoints: WebhookEndpoint[]; events: string[] } }> => {
    const res = await client.get('/developer/webhooks');
    return res.data;
  },
  createWebhook: async (url: string, events: string[]): Promise<{ data: CreatedWebhook }> => {
    const res = await client.post('/developer/webhooks', { url, events });
    return res.data;
  },
  testWebhook: async (id: number): Promise<{ data: unknown }> => {
    const res = await client.post(`/developer/webhooks/${id}/test`, {});
    return res.data;
  },
  deleteWebhook: async (id: number): Promise<{ success: boolean }> => {
    const res = await client.delete(`/developer/webhooks/${id}`);
    return res.data;
  },

  // ── Automations ─────────────────────────────────────────────────────────
  listAutomations: async (): Promise<{ data: { automations: Automation[]; meta: AutomationMeta } }> => {
    const res = await client.get('/developer/automations');
    return res.data;
  },
  createAutomation: async (payload: AutomationPayload): Promise<{ data: Automation }> => {
    const res = await client.post('/developer/automations', payload);
    return res.data;
  },
  updateAutomation: async (id: number, payload: Partial<AutomationPayload>): Promise<{ data: Automation }> => {
    const res = await client.put(`/developer/automations/${id}`, payload);
    return res.data;
  },
  deleteAutomation: async (id: number): Promise<{ success: boolean }> => {
    const res = await client.delete(`/developer/automations/${id}`);
    return res.data;
  },
};
