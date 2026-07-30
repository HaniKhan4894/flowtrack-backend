import type { User } from './index';

export interface Pagination {
    current_page: number;
    per_page: number;
    total: number;
    total_pages: number;
}

export interface Paginated<T> {
    success: boolean;
    data: T[];
    pagination: Pagination;
}

export interface GrowthPoint {
    current: number;
    previous: number;
    change_percent: number;
}

export interface AdminMetrics {
    totals: {
        organizations: number;
        organizations_active: number;
        organizations_suspended: number;
        users: number;
        users_active: number;
        users_unverified: number;
        super_admins: number;
        projects: number;
        time_entries: number;
        subscriptions_by_status: Record<string, number>;
        plans: number;
    };
    revenue: {
        mrr: number;
        arr: number;
        arpa: number;
        paying_accounts: number;
        billed_seats: number;
        trial_pipeline_mrr: number;
        trial_accounts: number;
        past_due_mrr: number;
        past_due_accounts: number;
        invoiced_to_clients: number;
    };
    growth: {
        organizations: GrowthPoint;
        users: GrowthPoint;
        subscriptions: GrowthPoint;
    };
    churn: {
        cancelled_30d: number;
        active_at_period_start: number;
        churn_rate_percent: number;
        pending_cancellations: number;
        trials_started_90d: number;
        trial_conversions_90d: number;
        trial_conversion_percent: number;
    };
    engagement: {
        dau: number;
        wau: number;
        mau: number;
        stickiness_percent: number;
        live_sessions: number;
        hours_today: number;
        hours_7d: number;
        hours_30d: number;
        screenshots_30d: number;
    };
    attention: {
        trials_expiring: Array<{
            id: number;
            organization_id: number;
            organization_name: string;
            plan_name: string | null;
            trial_ends_at: string | null;
            user_count: number;
        }>;
        past_due: Array<{
            id: number;
            organization_id: number;
            organization_name: string;
            plan_name: string | null;
            amount: string;
            billing_cycle: string;
            current_period_end: string | null;
        }>;
        dormant_organizations: Array<{
            id: number;
            name: string;
            created_at: string;
            last_activity: string | null;
        }>;
        failed_webhooks_24h: number;
    };
    plan_distribution: Array<{
        id: number;
        name: string;
        slug: string;
        price_monthly: string;
        accounts: string;
        active_accounts: string;
        trial_accounts: string;
        mrr: string;
    }>;
}

export interface AdminTimeseriesPoint {
    day: string;
    label: string;
    signups: number;
    organizations: number;
    hours: number;
    active_users: number;
    revenue: number;
}

export interface AdminOverview {
    metrics: AdminMetrics;
    timeseries: AdminTimeseriesPoint[];
    recent: {
        signups: Array<{
            id: number;
            first_name: string | null;
            last_name: string | null;
            email: string;
            created_at: string;
            email_verified_at: string | null;
            organization_id: number | null;
            organization_name: string | null;
        }>;
        subscription_events: Array<{
            id: number;
            organization_id: number;
            organization_name: string | null;
            action: string;
            amount: string | null;
            billing_cycle: string | null;
            created_at: string;
            from_plan: string | null;
            to_plan: string | null;
        }>;
    };
}

export interface AdminOrganizationSummary {
    id: number;
    uuid: string;
    name: string;
    slug: string;
    is_active: boolean;
    php_timezone: string;
    currency: string;
    created_at: string;
    owner: { id: number | null; name: string | null; email: string | null };
    plan: { id: number | null; name: string; slug: string | null };
    subscription: {
        id: number | null;
        status: string | null;
        billing_cycle: string | null;
        amount: number;
        mrr: number;
        user_count: number;
        current_period_end: string | null;
        trial_ends_at: string | null;
        cancel_at_period_end: boolean;
        is_stripe_linked: boolean;
    };
    member_count: number;
    project_count: number;
    hours_30d: number;
    last_activity_at: string | null;
}

export interface AdminOrganizationDetail {
    organization: {
        id: number;
        uuid: string;
        name: string;
        slug: string;
        is_active: boolean;
        currency: string;
        php_timezone: string;
        trial_ends_at: string | null;
        created_at: string;
        settings: Record<string, unknown> | null;
    };
    owner: { id: number; first_name: string | null; last_name: string | null; email: string; created_at: string } | null;
    members: Array<{
        id: number;
        user_id: number;
        role: string;
        role_name: string | null;
        hourly_rate: string | null;
        joined_at: string | null;
        first_name: string | null;
        last_name: string | null;
        email: string;
        is_active: boolean;
        email_verified_at: string | null;
        hours_30d: number;
    }>;
    subscription: Record<string, unknown> | null;
    subscription_history: Array<{
        id: number;
        action: string;
        amount: string | null;
        billing_cycle: string | null;
        from_plan: string | null;
        to_plan: string | null;
        notes: string | null;
        created_at: string;
    }>;
    usage: {
        projects: number;
        tasks: number;
        time_entries: number;
        total_hours: number;
        hours_30d: number;
        screenshots: number;
        invoices: number;
        clients: number;
        api_keys: number;
        pending_invitations: number;
    };
    daily_hours: Array<{ day: string; label: string; hours: number }>;
    integrations: Array<{ provider: string; is_enabled: string | number; updated_at: string | null }>;
    active_sessions: Array<{
        id: number;
        user_id: number;
        started_at: string;
        first_name: string | null;
        last_name: string | null;
        project_name: string | null;
    }>;
    audit_logs: Array<{
        id: number;
        action: string;
        entity_type: string | null;
        entity_id: number | null;
        created_at: string;
        first_name: string | null;
        last_name: string | null;
    }>;
}

export interface AdminUserSummary {
    id: number;
    uuid: string;
    email: string;
    name: string;
    first_name: string | null;
    last_name: string | null;
    role: string;
    avatar_url: string | null;
    timezone: string | null;
    is_active: boolean;
    is_super_admin: boolean;
    is_verified: boolean;
    email_verified_at: string | null;
    created_at: string;
    organization_count: number;
    organizations: Array<{ id: number; name: string; role: string }>;
    last_session_at: string | null;
    last_activity_at: string | null;
    hours_30d: number;
}

export interface AdminUserDetail {
    user: {
        id: number;
        uuid: string;
        email: string;
        name: string;
        first_name: string | null;
        last_name: string | null;
        role: string;
        avatar_url: string | null;
        timezone: string | null;
        is_active: boolean;
        is_super_admin: boolean;
        is_verified: boolean;
        two_factor_enabled: boolean;
        created_at: string;
    };
    memberships: Array<{
        organization_id: number;
        organization_name: string;
        organization_active: string | number;
        role: string;
        role_name: string | null;
        joined_at: string | null;
    }>;
    sessions: Array<{
        id: number;
        device_info: string | null;
        ip_address: string | null;
        created_at: string;
        expires_at: string;
        revoked_at: string | null;
    }>;
    activity: {
        total_entries: number;
        total_hours: number;
        hours_30d: number;
        last_activity_at: string | null;
    };
    impersonation_history: Array<{
        id: number;
        reason: string | null;
        created_at: string;
        ended_at: string | null;
        admin_email: string | null;
    }>;
}

export interface ImpersonationSession {
    session_id: number;
    access_token: string;
    token_type: string;
    expires_in: number;
    expires_at: string;
    organization_id: number | null;
    user: User;
}

export interface AdminSubscription {
    id: number;
    organization_id: number;
    plan_id: number | null;
    user_count: number;
    amount: number;
    mrr: number;
    billing_cycle: string;
    status: string;
    trial_ends_at: string | null;
    current_period_start: string | null;
    current_period_end: string | null;
    cancel_at_period_end: boolean;
    cancelled_at: string | null;
    stripe_subscription_id: string | null;
    stripe_customer_id: string | null;
    created_at: string;
    organization_name: string;
    organization_slug: string;
    organization_active: boolean;
    plan_name: string | null;
    plan_slug: string | null;
    owner_email: string | null;
    is_stripe_linked: boolean;
}

export type AdminSubscriptionSummary = Record<string, { accounts: number; mrr: number; seats: number }>;

export interface AdminRevenuePoint {
    month: string;
    label: string;
    new_revenue: number;
    expansion_revenue: number;
    cancellations: number;
    events: number;
}

export interface AdminInvoice {
    id: number;
    invoice_number: string;
    organization_id: number;
    organization_name: string | null;
    client_name: string;
    client_email: string | null;
    status: string;
    total: string;
    currency: string;
    issue_date: string;
    due_date: string;
    paid_at: string | null;
    created_at: string;
}

export interface AdminPlanFeature {
    id: number;
    feature_key: string;
    feature_value: string;
    display_name: string;
    is_enabled: boolean;
    show_on_pricing: boolean;
    sort_order: number;
}

export interface AdminPlan {
    id: number;
    name: string;
    slug: string;
    description: string | null;
    pricing_model: 'fixed' | 'per_user';
    price_monthly: number;
    price_yearly: number;
    base_price: number;
    price_per_user: number;
    min_users: number;
    max_users: number | null;
    trial_days: number;
    is_active: boolean;
    is_popular: boolean;
    sort_order: number;
    stripe_price_id_monthly: string | null;
    stripe_price_id_yearly: string | null;
    features: AdminPlanFeature[];
    usage: { accounts: number; active_accounts: number; trial_accounts: number; mrr: number };
}

export interface BillingSettings {
    slider_min: number;
    slider_max: number;
    slider_step: number;
    slider_default: number;
    slider_marks: number[];
    yearly_discount_percent: number;
}

export interface AdminUsageOverview {
    range_days: number;
    platform: {
        time_entries: number;
        active_users: number;
        active_organizations: number;
        hours: number;
        billable_hours: number;
        manual_entries: number;
        screenshots: number;
        activity_rows: number;
        invoices_created: number;
    };
    top_organizations: Array<{
        organization_id: number;
        organization_name: string;
        plan_name: string;
        hours: number;
        active_users: number;
        entries: number;
        screenshots: number;
    }>;
    top_users: Array<{
        user_id: number;
        name: string;
        email: string;
        organization_name: string | null;
        hours: number;
        entries: number;
    }>;
    feature_adoption: Array<{ feature: string; organizations: number; adoption_percent: number }>;
    api_usage: {
        keys_total: number;
        keys_active: number;
        keys_used_7d: number;
        recent_keys: Array<{
            id: number;
            name: string;
            key_prefix: string;
            last_used_at: string | null;
            is_active: string | number;
            organization_name: string | null;
        }>;
    };
    hourly_distribution: Array<{ hour: number; label: string; entries: number; hours: number }>;
}

export interface AdminAuditLog {
    id: number;
    action: string;
    is_platform_action: boolean;
    entity_type: string | null;
    entity_id: number | null;
    organization_id: number | null;
    organization_name: string | null;
    user_id: number | null;
    user_email: string | null;
    user_name: string | null;
    is_super_admin: boolean;
    changes: Record<string, unknown> | string | null;
    ip_address: string | null;
    created_at: string;
}

export interface AdminSecurityOverview {
    platform_actions_7d: number;
    impersonations_30d: number;
    sessions_total: number;
    sessions_active: number;
    sessions_created_24h: number;
    users_with_2fa: number;
    top_admins_30d: Array<{ id: number; email: string; actions: string }>;
}

export interface AdminAnnouncement {
    id: number;
    title: string;
    message: string;
    level: 'info' | 'success' | 'warning' | 'critical';
    audience: 'all' | 'plan' | 'organization';
    plan_id: number | null;
    plan_name: string | null;
    organization_id: number | null;
    organization_name: string | null;
    is_active: boolean;
    is_dismissible: boolean;
    send_email: boolean;
    emailed_at: string | null;
    email_recipients: number;
    starts_at: string | null;
    ends_at: string | null;
    created_by_email: string | null;
    created_at: string;
    dismissals: number;
    delivery?: { notified: number; emailed: number };
}

export interface AdminPlatformSettings {
    maintenance_mode: boolean;
    maintenance_message: string;
    signups_enabled: boolean;
    default_trial_days: number;
    support_email: string;
}

export interface AdminSystemHealth {
    checked_at: string;
    environment: {
        ci_environment: string;
        php_version: string;
        server_time: string;
        timezone: string;
    };
    database: {
        connected: boolean;
        latency_ms: number;
        driver: string;
        database: string;
        total_size_mb: number;
        largest_tables: Array<{ name: string; approx_rows: number; size_mb: number }>;
    };
    storage: {
        writable_path: string;
        writable: boolean;
        disk_free_gb: number;
        disk_total_gb: number;
        log_size_mb: number;
        uploads_size_mb: number;
        screenshot_records: number;
    };
    integrations: {
        configured: Record<string, boolean>;
        per_provider: Array<{ provider: string; organizations: string; enabled: string }>;
    };
    webhooks: {
        available: boolean;
        endpoints_total?: number;
        endpoints_active?: number;
        deliveries_24h?: number;
        succeeded_24h?: number;
        failed_24h?: number;
        success_rate_percent?: number;
        recent_failures?: Array<{
            id: number;
            event: string;
            status_code: number | null;
            attempts: number;
            response_snippet: string | null;
            created_at: string;
            url: string | null;
            organization_name: string | null;
        }>;
    };
    jobs: {
        scheduled_reports: { total: string; active: string; last_sent_at: string | null } | null;
        automations: { total: string; active: string } | null;
        stale_timers: string | number;
        expired_trials_not_closed: string | number;
    };
    errors: Array<{ level: string; logged_at: string; message: string }>;
    settings: AdminPlatformSettings;
}

export interface PlatformAnnouncementBanner {
    id: number;
    title: string;
    message: string;
    level: 'info' | 'success' | 'warning' | 'critical';
    is_dismissible: boolean;
    starts_at: string | null;
    ends_at: string | null;
}
