import client from './client';
import type {
    AdminAnnouncement,
    AdminAuditLog,
    AdminInvoice,
    AdminOrganizationDetail,
    AdminOrganizationSummary,
    AdminOverview,
    AdminPlan,
    AdminPlatformSettings,
    AdminRevenuePoint,
    AdminSecurityOverview,
    AdminSubscription,
    AdminSubscriptionSummary,
    AdminSystemHealth,
    AdminUsageOverview,
    AdminUserDetail,
    AdminUserSummary,
    BillingSettings,
    ImpersonationSession,
    Paginated,
} from '../types/admin';

type Params = Record<string, string | number | undefined>;

const cleanParams = (params: Params = {}): Params =>
    Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== ''));

export const adminService = {
    // Overview & metrics
    getOverview: async (days = 30): Promise<{ data: AdminOverview }> => {
        const response = await client.get('/admin/overview', { params: { days } });
        return response.data;
    },
    getMetrics: async () => {
        const response = await client.get('/admin/metrics');
        return response.data;
    },
    getTimeseries: async (days = 30) => {
        const response = await client.get('/admin/timeseries', { params: { days } });
        return response.data;
    },
    getActivityOverview: async () => {
        const response = await client.get('/admin/activity/overview');
        return response.data;
    },

    // Organizations
    getOrganizations: async (params: Params = {}): Promise<Paginated<AdminOrganizationSummary>> => {
        const response = await client.get('/admin/orgs', { params: cleanParams(params) });
        return response.data;
    },
    getOrganizationDetail: async (id: number): Promise<{ data: AdminOrganizationDetail }> => {
        const response = await client.get(`/admin/orgs/${id}`);
        return response.data;
    },
    updateOrganization: async (id: number, payload: Record<string, unknown>) => {
        const response = await client.put(`/admin/orgs/${id}`, payload);
        return response.data;
    },
    suspendOrganization: async (id: number, reason?: string) => {
        const response = await client.post(`/admin/orgs/${id}/suspend`, { reason });
        return response.data;
    },
    activateOrganization: async (id: number) => {
        const response = await client.post(`/admin/orgs/${id}/activate`);
        return response.data;
    },
    changeOrganizationPlan: async (
        id: number,
        payload: { plan_id: number; billing_cycle?: string; status?: string; reason?: string },
    ) => {
        const response = await client.put(`/admin/orgs/${id}/plan`, payload);
        return response.data;
    },
    extendTrial: async (id: number, days: number) => {
        const response = await client.post(`/admin/orgs/${id}/extend-trial`, { days });
        return response.data;
    },
    deleteOrganization: async (id: number, reason?: string) => {
        const response = await client.delete(`/admin/orgs/${id}`, { params: cleanParams({ reason }) });
        return response.data;
    },

    // Users
    getUsers: async (params: Params = {}): Promise<Paginated<AdminUserSummary>> => {
        const response = await client.get('/admin/users', { params: cleanParams(params) });
        return response.data;
    },
    getUserDetail: async (id: number): Promise<{ data: AdminUserDetail }> => {
        const response = await client.get(`/admin/users/${id}`);
        return response.data;
    },
    setUserActive: async (id: number, isActive: boolean) => {
        const response = await client.post(`/admin/users/${id}/${isActive ? 'activate' : 'deactivate'}`);
        return response.data;
    },
    setSuperAdmin: async (id: number, isSuperAdmin: boolean) => {
        const response = await client.put(`/admin/users/${id}/super-admin`, { is_super_admin: isSuperAdmin });
        return response.data;
    },
    verifyUserEmail: async (id: number) => {
        const response = await client.post(`/admin/users/${id}/verify-email`);
        return response.data;
    },
    sendUserPasswordReset: async (id: number) => {
        const response = await client.post(`/admin/users/${id}/password-reset`);
        return response.data;
    },
    revokeUserSessions: async (id: number) => {
        const response = await client.post(`/admin/users/${id}/revoke-sessions`);
        return response.data;
    },
    deleteUser: async (id: number, reason?: string) => {
        const response = await client.delete(`/admin/users/${id}`, { params: cleanParams({ reason }) });
        return response.data;
    },
    impersonate: async (
        id: number,
        payload: { organization_id?: number; reason?: string } = {},
    ): Promise<{ data: ImpersonationSession }> => {
        const response = await client.post(`/admin/users/${id}/impersonate`, payload);
        return response.data;
    },
    stopImpersonation: async (sessionId: number) => {
        const response = await client.post(`/admin/impersonation/${sessionId}/stop`);
        return response.data;
    },
    getImpersonationHistory: async (limit = 50) => {
        const response = await client.get('/admin/impersonation', { params: { limit } });
        return response.data;
    },

    // Billing
    getSubscriptions: async (
        params: Params = {},
    ): Promise<Paginated<AdminSubscription> & { summary: AdminSubscriptionSummary }> => {
        const response = await client.get('/admin/subscriptions', { params: cleanParams(params) });
        return response.data;
    },
    getSubscriptionStats: async () => {
        const response = await client.get('/admin/subscriptions/stats');
        return response.data;
    },
    updateSubscriptionStatus: async (id: number, status: string, reason?: string) => {
        const response = await client.put(`/admin/subscriptions/${id}/status`, { status, reason });
        return response.data;
    },
    getRevenueTrend: async (months = 12): Promise<{ data: AdminRevenuePoint[] }> => {
        const response = await client.get('/admin/revenue/trend', { params: { months } });
        return response.data;
    },
    getInvoices: async (
        params: Params = {},
    ): Promise<Paginated<AdminInvoice> & { totals_by_status: Array<{ status: string; count: number; amount: string }> }> => {
        const response = await client.get('/admin/invoices', { params: cleanParams(params) });
        return response.data;
    },

    // Plans
    getPlans: async (): Promise<{
        data: { plans: AdminPlan[]; feature_keys: Record<string, string>; billing_settings: BillingSettings };
    }> => {
        const response = await client.get('/admin/plans');
        return response.data;
    },
    createPlan: async (payload: Record<string, unknown>) => {
        const response = await client.post('/admin/plans', payload);
        return response.data;
    },
    updatePlan: async (id: number, payload: Record<string, unknown>) => {
        const response = await client.put(`/admin/plans/${id}`, payload);
        return response.data;
    },
    deletePlan: async (id: number) => {
        const response = await client.delete(`/admin/plans/${id}`);
        return response.data;
    },
    upsertPlanFeature: async (planId: number, payload: Record<string, unknown>) => {
        const response = await client.put(`/admin/plans/${planId}/features`, payload);
        return response.data;
    },
    deletePlanFeature: async (planId: number, featureId: number) => {
        const response = await client.delete(`/admin/plans/${planId}/features/${featureId}`);
        return response.data;
    },
    updateBillingSettings: async (payload: Record<string, unknown>) => {
        const response = await client.put('/admin/billing-settings', payload);
        return response.data;
    },

    // Usage
    getUsage: async (days = 30): Promise<{ data: AdminUsageOverview }> => {
        const response = await client.get('/admin/usage', { params: { days } });
        return response.data;
    },

    // Audit & security
    getAuditLogs: async (params: Params = {}): Promise<Paginated<AdminAuditLog>> => {
        const response = await client.get('/admin/audit-logs', { params: cleanParams(params) });
        return response.data;
    },
    getAuditOptions: async (): Promise<{ data: { actions: string[]; entity_types: string[] } }> => {
        const response = await client.get('/admin/audit-logs/options');
        return response.data;
    },
    getSecurityOverview: async (): Promise<{ data: AdminSecurityOverview }> => {
        const response = await client.get('/admin/security');
        return response.data;
    },

    // Announcements
    getAnnouncements: async (): Promise<{ data: AdminAnnouncement[] }> => {
        const response = await client.get('/admin/announcements');
        return response.data;
    },
    createAnnouncement: async (payload: Record<string, unknown>) => {
        const response = await client.post('/admin/announcements', payload);
        return response.data;
    },
    updateAnnouncement: async (id: number, payload: Record<string, unknown>) => {
        const response = await client.put(`/admin/announcements/${id}`, payload);
        return response.data;
    },
    deleteAnnouncement: async (id: number) => {
        const response = await client.delete(`/admin/announcements/${id}`);
        return response.data;
    },
    resendAnnouncement: async (id: number) => {
        const response = await client.post(`/admin/announcements/${id}/resend`);
        return response.data;
    },

    // System
    getSystemHealth: async (): Promise<{ data: AdminSystemHealth }> => {
        const response = await client.get('/admin/system/health');
        return response.data;
    },
    getSystemLogs: async (limit = 40) => {
        const response = await client.get('/admin/system/logs', { params: { limit } });
        return response.data;
    },
    updatePlatformSettings: async (payload: Record<string, unknown>): Promise<{ data: AdminPlatformSettings }> => {
        const response = await client.put('/admin/system/settings', payload);
        return response.data;
    },
    closeStaleTimers: async (hours = 16) => {
        const response = await client.post('/admin/system/close-stale-timers', { hours });
        return response.data;
    },
};
