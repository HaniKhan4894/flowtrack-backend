import type { Pagination } from './admin';

/* ------------------------------------------------------------------ payments */

export type PaymentStatus =
    | 'paid'
    | 'open'
    | 'failed'
    | 'refunded'
    | 'partially_refunded'
    | 'void'
    | 'uncollectible';

export interface PlatformPayment {
    id: number;
    organization_id: number | null;
    organization_name: string | null;
    plan_name: string | null;
    status: PaymentStatus;
    amount: number;
    amount_refunded: number;
    net_amount: number;
    discount_amount: number;
    currency: string;
    billing_reason: string | null;
    billing_cycle: string | null;
    seats: number | null;
    coupon_code: string | null;
    attempt_count: number;
    failure_code: string | null;
    failure_message: string | null;
    invoice_number: string | null;
    stripe_invoice_id: string | null;
    hosted_invoice_url: string | null;
    invoice_pdf_url: string | null;
    period_start: string | null;
    period_end: string | null;
    paid_at: string | null;
    failed_at: string | null;
    refunded_at: string | null;
    source: string | null;
    can_refund: boolean;
    created_at: string | null;
}

export interface PaymentSummary {
    collected: number;
    refunded: number;
    net: number;
    failed_amount: number;
    discounts: number;
    paid_count: number;
    failed_count: number;
    open_count: number;
    paying_organizations: number;
    average_invoice: number;
    payment_success_rate: number;
    lifetime_net: number;
    average_lifetime_value: number;
}

export interface RevenueTrendPoint {
    month: string;
    collected: number;
    refunded: number;
    net: number;
    discounts: number;
    new_business: number;
    renewals: number;
    expansion: number;
    invoices: number;
    organizations: number;
    failed_amount: number;
    failed_count: number;
}

export interface RevenueReport {
    trend: RevenueTrendPoint[];
    by_plan: Array<{ plan_name: string; revenue: number; invoices: number; organizations: number }>;
    top_organizations: Array<{
        organization_id: number | null;
        organization_name: string | null;
        lifetime_value: number;
        invoices: number;
        last_payment_at: string | null;
    }>;
    by_currency: Array<{ currency: string; revenue: number; invoices: number }>;
}

export interface DunningQueue {
    failed_invoices: Array<{
        id: number;
        organization_id: number | null;
        organization_name: string | null;
        plan_name: string | null;
        owner_email: string | null;
        amount: number;
        currency: string;
        attempt_count: number;
        failure_message: string | null;
        failed_at: string | null;
        days_overdue: number;
        subscription_status: string | null;
        hosted_invoice_url: string | null;
        can_retry: boolean;
    }>;
    past_due_subscriptions: Array<{
        organization_id: number;
        organization_name: string | null;
        plan_name: string | null;
        owner_email: string | null;
        amount: number;
        billing_cycle: string | null;
        current_period_end: string | null;
        days_overdue: number;
    }>;
    mrr_at_risk: number;
    failed_count: number;
    past_due_count: number;
}

export interface OrganizationPayments {
    payments: PlatformPayment[];
    totals: {
        lifetime_value: number;
        refunded: number;
        failed_count: number;
        first_payment_at: string | null;
        last_payment_at: string | null;
    };
}

/* ------------------------------------------------------------------- coupons */

export type CouponPurpose = 'acquisition' | 'winback' | 'retention' | 'upgrade' | 'other';

export interface Coupon {
    id: number;
    code: string;
    name: string;
    description: string | null;
    discount_type: 'percent' | 'amount';
    percent_off: number | null;
    amount_off: number | null;
    currency: string;
    duration: 'once' | 'repeating' | 'forever';
    duration_in_months: number | null;
    max_redemptions: number | null;
    redemption_count: number;
    plan_ids: number[];
    purpose: CouponPurpose;
    expires_at: string | null;
    is_active: boolean;
    discount_label: string;
    state: 'active' | 'expired' | 'exhausted' | 'disabled';
    stripe_synced: boolean;
    sync_error: string | null;
    total_discounted: number | null;
    created_at: string | null;
}

export interface CouponSummary {
    total: number;
    active: number;
    redemptions: number;
    total_discounted: number;
    discounted_30d: number;
    revenue_after_redemption: number;
}

export interface CouponDetail {
    coupon: Coupon;
    redemptions: Array<{
        id: number;
        organization_id: number | null;
        organization_name: string | null;
        campaign_name: string | null;
        amount_discounted: number;
        created_at: string | null;
    }>;
}

/* ----------------------------------------------------------------- campaigns */

export type CampaignGoal =
    | 'acquisition'
    | 'onboarding'
    | 'engagement'
    | 'retention'
    | 'winback'
    | 'expansion'
    | 'dunning'
    | 'announcement';

export type CampaignStatus = 'draft' | 'scheduled' | 'sending' | 'sent' | 'active' | 'paused' | 'archived';

export interface Campaign {
    id: number;
    name: string;
    goal: CampaignGoal;
    segment_key: string;
    segment_config: Record<string, string | number>;
    channel: 'email' | 'in_app' | 'both';
    subject: string;
    body: string;
    cta_label: string | null;
    cta_url: string | null;
    coupon_id: number | null;
    coupon_code: string | null;
    coupon_name: string | null;
    status: CampaignStatus;
    mode: 'one_off' | 'recurring';
    scheduled_at: string | null;
    interval_hours: number;
    cooldown_days: number;
    max_per_run: number;
    attribution_days: number;
    last_run_at: string | null;
    next_run_at: string | null;
    total_recipients: number;
    total_sent: number;
    total_failed: number;
    total_opened: number;
    total_clicked: number;
    total_converted: number;
    converted_revenue: number;
    open_rate: number;
    click_rate: number;
    conversion_rate: number;
    is_playbook: boolean;
    playbook_key: string | null;
    created_at: string | null;
    updated_at: string | null;
}

export interface CampaignPerformance {
    campaigns: number;
    sent: number;
    opened: number;
    clicked: number;
    converted: number;
    revenue: number;
    open_rate: number;
    click_rate: number;
    conversion_rate: number;
    by_goal: Array<{
        goal: CampaignGoal;
        campaigns: number;
        sent: number;
        opened: number;
        clicked: number;
        converted: number;
        revenue: number;
        open_rate: number;
        conversion_rate: number;
    }>;
}

export interface CampaignDetail {
    campaign: Campaign;
    timeline: Array<{
        day: string;
        sent: number;
        opened: number;
        clicked: number;
        converted: number;
        revenue: number;
    }>;
    recent_sends: Array<{
        id: number;
        organization_id: number | null;
        organization_name: string | null;
        email: string | null;
        status: 'sent' | 'failed' | 'skipped';
        channel: string;
        error: string | null;
        sent_at: string | null;
        opened_at: string | null;
        clicked_at: string | null;
        converted_at: string | null;
        conversion_amount: number;
    }>;
}

export interface Playbook {
    key: string;
    name: string;
    goal: CampaignGoal;
    segment_key: string;
    segment_config: Record<string, number>;
    mode: 'one_off' | 'recurring';
    interval_hours: number;
    cooldown_days: number;
    channel: 'email' | 'in_app' | 'both';
    subject: string;
    body: string;
    cta_label: string;
    cta_url: string;
}

export interface AudiencePreview {
    organizations: number;
    recipients: number;
    mrr: number;
    sample: Array<{
        organization_id: number;
        organization_name: string;
        plan_name: string | null;
        mrr: number;
        context: string | null;
        user_id: number;
        email: string;
        first_name: string | null;
        last_name: string | null;
    }>;
}

/* ------------------------------------------------------------------- growth */

export interface SegmentConfigField {
    key: string;
    label: string;
    default: number;
    min: number;
    max: number;
}

export interface SegmentDefinition {
    key: string;
    label: string;
    description: string;
    goal: CampaignGoal;
    config: SegmentConfigField[];
    organizations?: number;
    recipients?: number;
    mrr?: number;
}

export interface SegmentOrganization {
    organization_id: number;
    organization_name: string;
    owner_email: string | null;
    plan_name: string | null;
    mrr: number;
    context: string | null;
    members: number;
    hours_30d: number;
    last_activity_at: string | null;
    lifetime_value: number;
    created_at: string | null;
}

export interface GrowthKeyMetrics {
    mrr: number;
    arr: number;
    paying_accounts: number;
    trials: number;
    past_due: number;
    pending_cancellations: number;
    collected_30d: number;
    collected_growth_percent: number | null;
    lifetime_revenue: number;
    average_revenue_per_account: number;
    trial_conversion_percent: number;
    campaigns: {
        total: number;
        running: number;
        emails_sent: number;
        conversions: number;
        attributed_revenue: number;
    };
}

export interface GrowthFunnel {
    days: number;
    stages: Array<{
        key: string;
        label: string;
        count: number;
        percent_of_signups: number;
        step_conversion: number;
        drop_off: number;
    }>;
}

export interface GrowthOverview {
    metrics: GrowthKeyMetrics;
    funnel: GrowthFunnel;
    engagement: Array<{ bucket: string; count: number }>;
    segments: SegmentDefinition[];
    campaigns: CampaignPerformance;
}

export interface CohortReport {
    months: number;
    cohorts: Array<{
        cohort: string;
        size: number;
        converted: number;
        conversion_percent: number;
        revenue: number;
        revenue_per_signup: number;
        periods: Array<{ offset: number; active: number; percent: number }>;
    }>;
}

export interface ChurnReport {
    churn: {
        trend: Array<{
            month: string;
            churned: number;
            started: number;
            net_accounts: number;
            mrr_lost: number;
            mrr_added: number;
            net_mrr: number;
            avg_tenure_days: number;
        }>;
        by_plan: Array<{ plan_name: string; churned: number; mrr_lost: number; avg_tenure_days: number }>;
        tenure_buckets: Array<{ label: string; count: number }>;
        recovered_accounts: number;
    };
    revenue_movement: Array<{
        month: string;
        starting_revenue: number;
        new: number;
        expansion: number;
        contraction: number;
        churned: number;
        ending_revenue: number;
        net_retention_percent: number;
        gross_retention_percent: number;
    }>;
}

export interface HealthAccount {
    organization_id: number;
    organization_name: string;
    plan_name: string | null;
    status: string;
    mrr: number;
    lifetime_value: number;
    members: number;
    active_members: number;
    seat_adoption_percent: number;
    hours_30d: number;
    hours_prev_30d: number;
    usage_trend_percent: number | null;
    days_idle: number | null;
    failed_payments: number;
    health_score: number;
    health_band: 'healthy' | 'watch' | 'at_risk';
    risk_reasons: string[];
    opportunities: string[];
    last_activity_at: string | null;
}

export interface HealthReport {
    accounts: HealthAccount[];
    bands: { healthy: number; watch: number; at_risk: number };
    mrr_at_risk: number;
}

export interface ListMeta {
    page: number;
    per_page: number;
    total: number;
    total_pages: number;
}

export interface PaginatedList<T> {
    data: T[];
    meta: ListMeta;
}

/** Adapt the `meta` shape used by the growth endpoints to the shared pagination bar. */
export const toPagination = (meta: ListMeta | null | undefined): Pagination | null =>
    meta
        ? {
              current_page: meta.page,
              per_page: meta.per_page,
              total: meta.total,
              total_pages: meta.total_pages,
          }
        : null;
