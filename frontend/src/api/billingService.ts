import client from './client';

export interface Subscription {
    id: number;
    plan_id: number;
    status: 'active' | 'trial' | 'cancelled';
    billing_cycle: 'monthly' | 'yearly';
    amount: number;
    current_period_end: string;
}

export const billingService = {
    getSubscription: async (): Promise<{ data: Subscription | null }> => {
        const response = await client.get('/subscriptions/current');
        return response.data;
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
        return response.data;
    },
    cancel: async (): Promise<any> => {
        const response = await client.post('/subscriptions/cancel');
        return response.data;
    },
    getPlans: async (): Promise<{ data: any[] }> => {
        const response = await client.get('/plans');
        return response.data;
    },
};
