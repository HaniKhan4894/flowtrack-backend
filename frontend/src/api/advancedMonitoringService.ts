import client from './client';
import { useAuthStore } from '../store/authStore';

export interface AdvancedMonitoringSession {
  id: number;
  organization_id: number;
  user_id: number;
  started_by: number;
  reason?: string | null;
  status: 'active' | 'closed';
  screenshot_frequency_minutes: number;
  force_screenshots: boolean;
  notify_member: boolean;
  member_notified_at?: string | null;
  result_summary?: string | null;
  started_at: string;
  ended_at?: string | null;
}

export interface AdvancedMonitoringStatus {
  active: AdvancedMonitoringSession | null;
  history: AdvancedMonitoringSession[];
  plan_available: boolean;
}

export interface AdvancedMonitoringReport {
  period: { start_date: string; end_date: string };
  active_session: AdvancedMonitoringSession | null;
  summary: {
    total_hours: number;
    productivity_score: number;
    productive_hours: number;
    unproductive_hours: number;
    idle_percent: number;
    idle_hours: number;
    screenshot_count: number;
    avg_screenshot_activity: number;
    min_screenshot_activity: number;
    max_screenshot_activity: number;
    integrity_score: number;
    integrity_grade: string;
  };
  integrity_components: Array<{ label: string; score: number; weight: number }>;
  unusual_activity: {
    instances?: Array<{
      tier: string;
      start_at?: string;
      end_at?: string;
      duration_minutes?: number;
      input_score?: number;
      top_app?: string;
    }>;
    summary?: Record<string, number>;
  };
  top_apps: Array<{ app_name: string; category: string; duration_seconds: number; percentage: number }>;
  top_urls: Array<{ url: string; category: string; duration_seconds: number; percentage: number }>;
  recent_screenshots: Array<{
    id: number;
    captured_at: string;
    activity_level: number;
    thumb_url?: string;
    view_url?: string;
  }>;
  sessions: AdvancedMonitoringSession[];
}

export const advancedMonitoringService = {
  getStatus: async (userId: number): Promise<{ data: AdvancedMonitoringStatus }> => {
    const orgId = useAuthStore.getState().user?.organization_id;
    const response = await client.get(`/organizations/${orgId}/members/${userId}/advanced-monitoring`);
    return response.data;
  },

  enable: async (
    userId: number,
    payload: { reason?: string; screenshot_frequency_minutes?: number; notify_member?: boolean },
  ): Promise<{ data: AdvancedMonitoringSession }> => {
    const orgId = useAuthStore.getState().user?.organization_id;
    const response = await client.post(`/organizations/${orgId}/members/${userId}/advanced-monitoring`, payload);
    return response.data;
  },

  close: async (
    userId: number,
    payload: { result_summary?: string; notify_member?: boolean },
  ): Promise<{ data: AdvancedMonitoringSession }> => {
    const orgId = useAuthStore.getState().user?.organization_id;
    const response = await client.post(`/organizations/${orgId}/members/${userId}/advanced-monitoring/close`, payload);
    return response.data;
  },

  getReport: async (userId: number, startDate: string, endDate: string): Promise<{ data: AdvancedMonitoringReport }> => {
    const response = await client.get('/reports/advanced-monitoring', {
      params: { user_id: userId, start_date: startDate, end_date: endDate },
    });
    return response.data;
  },
};
