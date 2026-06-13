import client from './client';

export const adminService = {
    getOrganizations: async () => {
        const response = await client.get('/admin/organizations');
        return response.data;
    },
    getSubscriptionStats: async () => {
        const response = await client.get('/admin/subscriptions/stats');
        return response.data;
    },
    getActivityOverview: async () => {
        const response = await client.get('/admin/activity/overview');
        return response.data;
    },
    getOrganizationDetail: async (id: number) => {
        const response = await client.get(`/admin/organizations/${id}`);
        return response.data;
    },
};
