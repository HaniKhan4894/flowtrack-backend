import client from './client';
import { normalizeBillingSettings, type BillingSliderSettings } from '../features/billing/pricingMath';

export interface Subscription {
    id: number;
    plan_id: number;
    status: 'active' | 'trial' | 'cancelled' | 'expired' | 'past_due';
    billing_cycle: 'monthly' | 'yearly';
    amount: number;
    current_period_start?: string;
    current_period_end: string;
    trial_ends_at?: string | null;
    cancel_at_period_end?: boolean;
    stripe_subscription_id?: string | null;
    stripe_customer_id?: string | null;
    user_count?: number;
}

/** Raw API shape — MySQL booleans may arrive as 0/1 or "0"/"1". */
type ApiSubscription = Omit<Subscription, 'cancel_at_period_end'> & {
    cancel_at_period_end?: boolean | number | string;
};

function isTruthyFlag(value: unknown): boolean {
    return value === true || value === 1 || value === '1';
}

function normalizeSubscription(raw: ApiSubscription | null): Subscription | null {
    if (!raw) return null;
    return {
        ...raw,
        cancel_at_period_end: isTruthyFlag(raw.cancel_at_period_end),
    };
}

export interface SubscriptionUsage {
    users: {
        current: number;
        members: number;
        pending_invites: number;
        limit: number | 'unlimited';
        percentage: number;
    };
    projects: {
        current: number;
        limit: number | 'unlimited';
        percentage: number;
    };
}

export const billingService = {
    getSubscription: async (): Promise<{ data: Subscription | null }> => {
        const response = await client.get('/subscriptions/current');
        return {
            ...response.data,
            data: normalizeSubscription(response.data?.data ?? null),
        };
    },
    subscribe: async (planId: number, cycle: 'monthly' | 'yearly'): Promise<any> => {
        const response = await client.post('/subscriptions', { plan_id: planId, billing_cycle: cycle });
        return response.data;
    },
    createCheckoutSession: async (planId: number, cycle: 'monthly' | 'yearly'): Promise<{ data: { id: string; url: string } }> => {
        const response = await client.post('/subscriptions/checkout-session', { plan_id: planId, billing_cycle: cycle });
        return response.data;
    },
    confirmCheckout: async (sessionId: string): Promise<any> => {
        const response = await client.post('/subscriptions/confirm-checkout', { session_id: sessionId });
        if (response.data?.data) {
            response.data.data = normalizeSubscription(response.data.data);
        }
        return response.data;
    },
    openBillingPortal: async (): Promise<{ data: { url: string } }> => {
        const response = await client.post('/subscriptions/billing-portal');
        return response.data;
    },
    cancel: async (): Promise<any> => {
        const response = await client.post('/subscriptions/cancel');
        return response.data;
    },
    getPlans: async (): Promise<{ data: any[]; billingSettings: BillingSliderSettings }> => {
        const response = await client.get('/plans');
        return {
            data: response.data?.data ?? [],
            billingSettings: normalizeBillingSettings(response.data?.billing_settings),
        };
    },
    getUsage: async (): Promise<{ data: SubscriptionUsage }> => {
        const response = await client.get('/subscriptions/usage');
        return response.data;
    },
};
