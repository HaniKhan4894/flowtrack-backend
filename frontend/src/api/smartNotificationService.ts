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

export const smartNotificationService = {
  list: async (): Promise<{ data: SmartNotificationRule[] }> => {
    const res = await client.get('/smart-notifications');
    return res.data;
  },
  templates: async (): Promise<{ data: SmartNotificationTemplate[] }> => {
    const res = await client.get('/smart-notifications/templates');
    return res.data;
  },
  create: async (data: Partial<SmartNotificationRule>): Promise<{ data: SmartNotificationRule }> => {
    const res = await client.post('/smart-notifications', data);
    return res.data;
  },
  update: async (id: number, data: Partial<SmartNotificationRule>): Promise<{ data: SmartNotificationRule }> => {
    const res = await client.put(`/smart-notifications/${id}`, data);
    return res.data;
  },
  delete: async (id: number): Promise<void> => {
    await client.delete(`/smart-notifications/${id}`);
  },
};
