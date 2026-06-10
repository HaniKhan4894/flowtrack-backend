export interface MemberMonitoringSettings {
    tracking_enabled: boolean;
    screenshots_enabled: boolean;
    screenshot_disabled_until?: string | null;
    screenshot_disabled_from?: string | null;
    screenshot_disabled_to?: string | null;
    screenshots_active?: boolean;
}

export interface User {
    id: number;
    email: string;
    first_name: string;
    last_name: string;
    role: 'admin' | 'owner' | 'member' | 'manager';
    organization_id?: number;
    organization_role?: 'admin' | 'owner' | 'member' | 'manager';
    is_org_admin?: boolean;
    permissions?: string[];
    monitoring?: MemberMonitoringSettings | null;
    profile_photo?: string;
}

export interface Organization {
    id: number;
    name: string;
    slug: string;
}

export interface Plan {
    id: number;
    name: string;
    slug: string;
    pricing_model: 'fixed' | 'per_user';
    price_monthly: number;
    price_yearly: number;
    base_price: number;
    price_per_user: number;
}

export interface Subscription {
    id: number;
    plan_id: number;
    status: 'active' | 'trial' | 'cancelled';
    trial_ends_at?: string;
    current_period_end: string;
    user_count: number;
    amount: number;
}

export interface TimeEntry {
    id: number;
    user_id?: number;
    organization_id?: number;
    project_id?: number;
    task_id?: number;
    description: string;
    started_at: string;
    ended_at: string | null;
    is_billable?: boolean;
    paused_at?: string | null;
    paused_duration_seconds?: number;
    duration_seconds: number;
}
