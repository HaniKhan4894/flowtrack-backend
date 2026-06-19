import client from './client';

export interface SmartNotificationRule {
  id: number;
  organization_id: number;
  name: string;
  rule_type: string;
  threshold?: number | null;
  target_scope: string;
  frequency: 'hourly' | 'daily' | 'weekly';
  channels: string[];
  config?: Record<string, unknown> | null;
  is_active: boolean;
  created_by?: number;
}

export interface SmartNotificationTemplate {
  name: string;
  rule_type: string;
  frequency: string;
  channels: string[];
  threshold: number;
}

function normalizeChannels(channels: unknown): string[] {
  if (Array.isArray(channels)) return channels.map(String);
  if (typeof channels === 'string') {
    try {
      const parsed = JSON.parse(channels);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function normalizeRule(rule: Record<string, unknown>): SmartNotificationRule {
  const rawActive = rule.is_active;
  return {
    id: Number(rule.id),
    organization_id: Number(rule.organization_id),
    name: String(rule.name ?? ''),
    rule_type: String(rule.rule_type ?? ''),
    threshold: rule.threshold != null ? Number(rule.threshold) : null,
    target_scope: String(rule.target_scope ?? 'all_members'),
    frequency: (rule.frequency as SmartNotificationRule['frequency']) ?? 'daily',
    channels: normalizeChannels(rule.channels),
    config: (rule.config as Record<string, unknown> | null) ?? null,
    is_active: rawActive === true || rawActive === '1' || rawActive === 1,
    created_by: rule.created_by != null ? Number(rule.created_by) : undefined,
  };
}

export const smartNotificationService = {
  list: async (): Promise<{ data: SmartNotificationRule[] }> => {
    const res = await client.get('/smart-notifications');
    return {
      ...res.data,
      data: (res.data?.data ?? []).map((r: Record<string, unknown>) => normalizeRule(r)),
    };
  },
  templates: async (): Promise<{ data: SmartNotificationTemplate[] }> => {
    const res = await client.get('/smart-notifications/templates');
    return {
      ...res.data,
      data: (res.data?.data ?? []).map((t: SmartNotificationTemplate) => ({
        ...t,
        channels: normalizeChannels(t.channels),
      })),
    };
  },
  create: async (data: Partial<SmartNotificationRule>): Promise<{ data: SmartNotificationRule }> => {
    const res = await client.post('/smart-notifications', data);
    return { ...res.data, data: normalizeRule(res.data.data as Record<string, unknown>) };
  },
  update: async (id: number, data: Partial<SmartNotificationRule>): Promise<{ data: SmartNotificationRule }> => {
    const res = await client.put(`/smart-notifications/${id}`, data);
    return { ...res.data, data: normalizeRule(res.data.data as Record<string, unknown>) };
  },
  delete: async (id: number): Promise<void> => {
    await client.delete(`/smart-notifications/${id}`);
  },
};
