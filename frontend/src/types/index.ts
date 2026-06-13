export interface MemberMonitoringSettings {
    tracking_enabled: boolean;
    screenshots_enabled: boolean;
    screenshot_disabled_until?: string | null;
    screenshot_disabled_from?: string | null;
    screenshot_disabled_to?: string | null;
    screenshots_active?: boolean;
}

export interface OrgTimezone {
    id: number;
    timezone: string;
    php_timezone: string;
    zone_group?: string;
}

export interface OrganizationContext {
    id: number;
    name: string;
    php_timezone: string;
    country_id?: number | null;
    state_id?: number | null;
    city_id?: number | null;
    timezone_id?: number | null;
    timezone?: OrgTimezone | null;
}

export interface PlanInfo {
    id: number;
    name: string;
    slug: string;
}

export interface PlanFeatures {
    screenshots?: boolean;
    activity_tracking?: boolean;
    invoicing?: boolean;
    max_users?: number | string;
    max_projects?: number | string;
    screenshot_interval?: number;
    [key: string]: boolean | number | string | undefined;
}

export interface User {
    id: number;
    email: string;
    first_name: string;
    last_name: string;
    role: 'admin' | 'owner' | 'member' | 'manager' | 'team_lead';
    organization_id?: number;
    organization_role?: 'admin' | 'owner' | 'member' | 'manager' | 'team_lead';
    is_org_admin?: boolean;
    is_super_admin?: boolean;
    permissions?: string[];
    monitoring?: MemberMonitoringSettings | null;
    organization?: OrganizationContext | null;
    plan?: PlanInfo | null;
    features?: PlanFeatures | null;
    profile_photo?: string;
    avatar_url?: string;
}

export interface Organization {
    id: number;
    name: string;
    slug: string;
    country_id?: number | null;
    state_id?: number | null;
    city_id?: number | null;
    timezone_id?: number | null;
    php_timezone?: string;
    country?: { id: number; name: string } | null;
    state?: { id: number; name: string } | null;
    city?: { id: number; name: string } | null;
    timezone?: OrgTimezone | null;
}

export interface Plan {
    id: number;
    name: string;
    slug: string;
    description?: string;
    pricing_model: 'fixed' | 'per_user';
    price_monthly: number;
    price_yearly: number;
    base_price: number;
    price_per_user: number;
    features?: Array<{ feature_key: string; feature_value: string }>;
}

export interface Subscription {
    id: number;
    plan_id: number;
    status: 'active' | 'trial' | 'cancelled';
    trial_ends_at?: string;
    current_period_end: string;
    user_count: number;
    amount: number;
    plan?: Plan;
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
    elapsed_seconds?: number;
    server_now?: string;
    started_at_local?: string;
    ended_at_local?: string | null;
    paused_at_local?: string | null;
    timezone?: string;
}

export interface Country {
    id: number;
    name: string;
    iso2?: string;
    phonecode?: string;
    emoji?: string;
}

export interface State {
    id: number;
    name: string;
    country_id: number;
    country_code?: string;
    iso2?: string;
}

export interface City {
    id: number;
    name: string;
    state_id: number;
    country_id: number;
    country_code?: string;
}

export interface TimezoneOption {
    id: number;
    zone_group: string;
    timezone: string;
    php_timezone: string;
    sdt?: string;
    dst?: string;
}
