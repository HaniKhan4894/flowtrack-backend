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

export type RiskLevel = 'none' | 'low' | 'medium' | 'high';

export interface ForecastSeriesPoint {
  date: string;
  actual: number | null;
  projected: number | null;
  budget: number | null;
}

export interface ForecastProject {
  project_id: number;
  project_name: string;
  color: string | null;
  budget_hours: number;
  logged_hours: number;
  daily_burn_rate: number;
  trend_per_day: number;
  utilization_percent: number | null;
  projected_overrun_date: string | null;
  days_to_overrun: number | null;
  risk: RiskLevel;
  series: ForecastSeriesPoint[];
}

export interface ForecastSprint {
  sprint_id: number;
  name: string;
  start_date: string;
  end_date: string;
  days_left: number;
  estimated_hours: number;
  logged_hours: number;
  remaining_hours: number;
  recent_daily: number;
  required_daily: number;
  miss_probability: number | null;
  risk: RiskLevel;
}

export interface Forecast {
  generated_at: string;
  history_days: number;
  horizon_days: number;
  projects: ForecastProject[];
  sprints: ForecastSprint[];
  ai: { enabled: boolean; narrative: string | null; model: string | null; source: string | null; error?: string };
}

export type UnusualActivityTier = 'highly_unusual' | 'unusual' | 'slightly_unusual';

export interface UnusualActivityInstance {
  tier: UnusualActivityTier;
  start_at: string;
  end_at: string;
  duration_seconds: number;
  duration_minutes: number;
  input_score: number;
  baseline_median: number;
  baseline_mean: number;
  percentile: number;
  top_app: string | null;
}

export interface UnusualActivityReport {
  user: { id: number; name: string };
  period: { start: string; end: string };
  baseline_period: {
    start: string;
    end: string;
    days: number;
    sample_buckets: number;
    ready: boolean;
  };
  summary: {
    highly_unusual_count: number;
    unusual_count: number;
    slightly_unusual_count: number;
    total_flagged_seconds: number;
    total_flagged_hm: string;
  };
  previous_period: {
    start: string;
    end: string;
    flagged_seconds: number;
    flagged_hm: string;
  };
  instances: UnusualActivityInstance[];
  tiers_filter: UnusualActivityTier[];
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

  getForecast: async (params?: { history_days?: number; horizon_days?: number }) => {
    const res = await client.get<{ data: Forecast }>('/insights/forecast', { params });
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

  getUnusualActivity: async (params: {
    user_id: number;
    start_date?: string;
    end_date?: string;
    tiers?: UnusualActivityTier[];
  }) => {
    const res = await client.get<{ data: UnusualActivityReport }>('/insights/unusual-activity', {
      params: {
        user_id: params.user_id,
        start_date: params.start_date,
        end_date: params.end_date,
        tiers: params.tiers?.join(','),
      },
    });
    return res.data;
  },
};
