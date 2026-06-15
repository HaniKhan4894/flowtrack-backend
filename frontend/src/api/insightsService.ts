import client from './client';

export interface WeeklySummary {
  period: { start: string; end: string };
  comparison_period: { start: string; end: string };
  total_hours: number;
  hours_delta: number;
  productive_percent: number;
  productive_delta: number;
  highlights: string[];
  top_members: { name: string; hours: number }[];
  top_distractions: { name: string; hours: number }[];
}

export interface BenchmarkProject {
  project_id: number;
  project_name: string;
  hours: number;
  total_hours?: number;
  budget_hours?: number;
  vs_org_avg_hours?: number;
  budget_utilization?: number | null;
}

export interface Benchmarks {
  period: { start: string; end: string };
  org_avg_project_hours: number;
  by_project: BenchmarkProject[];
  by_role: { role: string; slug: string; hours: number }[];
  by_sprint: { sprint_id: number; name: string; start_date: string; end_date: string; hours: number }[];
}

export interface WorkPatterns {
  peak_hour: number;
  hourly_distribution: number[];
  day_of_week_hours: number[];
  category_split: Record<string, number>;
  top_apps: { name: string; hours: number }[];
  insights: string[];
}

export interface CoachSuggestion {
  type: string;
  priority: string;
  title: string;
  message: string;
}

export interface DeliveryRisk {
  project_id: number;
  project_name: string;
  severity: string;
  reason: string;
  logged_hours: number;
  budget_hours: number;
  open_tasks?: number;
}

export const insightsService = {
  getWeeklySummary: async () => {
    const res = await client.get<{ data: WeeklySummary }>('/insights/weekly-summary');
    return res.data;
  },

  getBenchmarks: async (params?: { start_date?: string; end_date?: string }) => {
    const res = await client.get<{ data: Benchmarks }>('/insights/benchmarks', { params });
    return res.data;
  },

  getWorkPatterns: async (params?: { user_id?: number; days?: number }) => {
    const res = await client.get<{ data: WorkPatterns }>('/insights/work-patterns', { params });
    return res.data;
  },

  getCoach: async (params?: { user_id?: number }) => {
    const res = await client.get<{ data: { productive_percent: number; suggestions: CoachSuggestion[]; focus_window: { start_hour: number; end_hour: number } } }>('/insights/coach', { params });
    return res.data;
  },

  getDeliveryRisks: async () => {
    const res = await client.get<{ data: { project_risks: DeliveryRisk[]; capacity: { team_size: number; weekly_hours_logged: number; expected_weekly_capacity: number; utilization_percent: number; forecast: string } } }>('/insights/delivery-risks');
    return res.data;
  },

  getSprints: async () => {
    const res = await client.get<{ data: { id: number; name: string; start_date: string; end_date: string; project_id?: number }[] }>('/insights/sprints');
    return res.data;
  },

  createSprint: async (data: { name: string; start_date: string; end_date: string; project_id?: number }) => {
    const res = await client.post('/insights/sprints', data);
    return res.data;
  },
};
