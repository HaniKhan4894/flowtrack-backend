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
    cancel: async (): Promise<any> => {
        const response = await client.delete('/subscriptions/current');
        return response.data;
    }
};
