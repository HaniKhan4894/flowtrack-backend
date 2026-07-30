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
    currency?: string;
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
    payroll?: boolean;
    ai_insights?: boolean;
    wellbeing?: boolean;
    proof_of_work?: boolean;
    integrations?: boolean;
    advanced_monitoring?: boolean;
    api_access?: boolean | string;
    max_users?: number | string;
    max_projects?: number | string;
    screenshot_interval?: number;
    [key: string]: boolean | number | string | undefined;
}

export interface OnboardingStep {
    key: string;
    label: string;
    completed: boolean;
}

export interface OnboardingProgress {
    steps: OnboardingStep[];
    completed_count: number;
    total_steps: number;
    percent: number;
    is_complete: boolean;
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
    is_team_lead?: boolean;
    can_view_team?: boolean;
    permissions?: string[];
    monitoring?: MemberMonitoringSettings | null;
    organization?: OrganizationContext | null;
    plan?: PlanInfo | null;
    features?: PlanFeatures | null;
    tracking_config?: OrgTrackingSettings | null;
    advanced_monitoring?: {
        active: boolean;
        session_id: number;
        started_at: string;
        reason?: string | null;
        screenshot_frequency_minutes?: number;
    } | null;
    profile_photo?: string;
    avatar_url?: string;
    onboarding?: OnboardingProgress | null;
    two_factor_enabled?: boolean;
}

export interface ProductivityRule {
    id: number;
    organization_id: number;
    rule_type: 'app' | 'url' | 'keyword';
    pattern: string;
    category: 'productive' | 'unproductive' | 'neutral';
    is_active: boolean;
    created_by?: number;
    created_at?: string;
    updated_at?: string;
}

export interface Task {
    id: number;
    uuid?: string;
    project_id: number;
    name: string;
    description?: string | null;
    estimated_hours?: number | null;
    is_active: boolean;
    created_at?: string;
    updated_at?: string;
}

export interface TimesheetDay {
    date: string;
    day_of_week: number;
    total_seconds: number;
    total_hours: number;
    entries: TimeEntry[];
}

export interface TimesheetPeriod {
    id: number;
    organization_id: number;
    user_id: number;
    week_start: string;
    status: 'draft' | 'submitted' | 'approved' | 'rejected';
    submitted_at?: string | null;
    approved_at?: string | null;
    approved_by?: number | null;
    rejected_at?: string | null;
    rejected_by?: number | null;
    rejection_reason?: string | null;
    created_at?: string;
    updated_at?: string;
}

export interface TimesheetWeekGrid {
    period: TimesheetPeriod;
    week_start: string;
    week_end: string;
    pay_period?: 'weekly' | 'biweekly' | 'monthly';
    total_seconds: number;
    total_hours: number;
    days: TimesheetDay[];
}

export interface NotificationPreference {
    event_key: string;
    label: string;
    email_enabled: boolean;
    in_app_enabled: boolean;
}

export interface Permission {
    id: number;
    slug: string;
    name: string;
    description?: string;
    category: string;
}

export interface Role {
    id: number;
    name: string;
    slug: string;
    description?: string | null;
    organization_id?: number | null;
    is_system: boolean;
    permission_ids?: number[];
    created_at?: string;
    updated_at?: string;
}

export interface InvoiceItem {
    id: number;
    invoice_id: number;
    description: string;
    quantity: number;
    unit_price: number;
    amount: number;
}

export interface OrgTrackingSettings {
    screenshot_enabled: boolean;
    screenshot_only_while_timer: boolean;
    screenshot_frequency_minutes: number;
    screenshot_quality: 'normal' | 'high' | 'very_high';
    screenshot_retention_days: number;
    screenshot_hide_from_users: boolean;
    screenshot_disallow_deleting: boolean;
    screenshot_suppress_notifications: boolean;
    activity_tracking_enabled: boolean;
    url_tracking_enabled: boolean;
    idle_timeout_minutes: number;
    keep_idle_time: 'prompt' | 'always' | 'never';
    /** Timers running longer than this are auto-stopped. 0 disables the guard. */
    max_session_hours: number;
    timer_tolerance_minutes: number;
    timer_reminder_enabled: boolean;
    automated_tracking: boolean;
}

export interface OrgTimesheetSettings {
    require_approval: boolean;
    pay_period: 'weekly' | 'biweekly' | 'monthly';
    allow_modify_time: boolean;
    require_reason_on_edit: boolean;
}

export interface OrgOfficeSettings {
    auto_detect_enabled: boolean;
}

export interface OrgPlanCaps {
    screenshots: boolean;
    screenshot_interval_min: number;
    data_retention_days: number | null;
    activity_tracking: boolean;
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
    currency?: string;
    settings?: {
        default_daily_hours?: number;
        tracking?: OrgTrackingSettings;
        timesheet?: OrgTimesheetSettings;
        office?: OrgOfficeSettings;
        [key: string]: unknown;
    };
    plan_caps?: OrgPlanCaps;
    effective_tracking?: OrgTrackingSettings;
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

export interface HourBucketApp {
    app_name: string;
    category: string;
    seconds: number;
}

export interface HourBucket {
    hour: number;
    label: string;
    total_seconds: number;
    productive_seconds: number;
    unproductive_seconds: number;
    neutral_seconds: number;
    apps: HourBucketApp[];
}

export interface HourlyTimelineData {
    date: string;
    timezone: string;
    user_id: number;
    hours: HourBucket[];
    summary: {
        total_seconds: number;
        productive_seconds: number;
        unproductive_seconds: number;
        neutral_seconds: number;
        focus_score: number;
    };
}

export interface PayrollCompensation {
    id: number;
    organization_id: number;
    user_id: number;
    pay_type: 'hourly' | 'fixed' | 'custom';
    hourly_rate: number | null;
    fixed_amount: number | null;
    currency: string;
    is_active: boolean;
    notes?: string | null;
    first_name?: string;
    last_name?: string;
    email?: string;
}

export interface PayrollAdjustment {
    id: number;
    payroll_item_id: number;
    type: 'bonus' | 'deduction';
    label: string;
    amount: number;
    created_at?: string;
}

export interface PayrollPayment {
    id: number;
    payroll_item_id: number;
    amount: number;
    method: string;
    reference?: string | null;
    status: 'recorded' | 'completed';
    paid_at: string;
}

export interface PayrollItem {
    id: number;
    payroll_run_id: number;
    organization_id: number;
    user_id: number;
    pay_type: 'hourly' | 'fixed' | 'custom';
    tracked_seconds: number;
    hourly_rate: number | null;
    base_amount: number;
    bonus_total: number;
    deduction_total: number;
    gross_amount: number;
    paid_amount: number;
    status: 'pending' | 'partial' | 'paid';
    notes?: string | null;
    first_name?: string;
    last_name?: string;
    email?: string;
    adjustments?: PayrollAdjustment[];
    payments?: PayrollPayment[];
}

export interface PayrollRun {
    id: number;
    organization_id: number;
    title: string;
    period_start: string;
    period_end: string;
    status: 'draft' | 'finalized' | 'paid' | 'partially_paid';
    currency: string;
    total_gross: number;
    total_paid: number;
    created_by?: number;
    finalized_at?: string | null;
    created_at?: string;
    items?: PayrollItem[];
}

export interface PayrollSummary {
    total_gross: number;
    total_paid: number;
    total_pending: number;
    runs_count: number;
    members_with_compensation: number;
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
