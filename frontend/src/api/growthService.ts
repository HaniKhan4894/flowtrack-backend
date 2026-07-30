import client from './client';
import type {
    AudiencePreview,
    Campaign,
    CampaignDetail,
    CampaignPerformance,
    ChurnReport,
    CohortReport,
    Coupon,
    CouponDetail,
    CouponSummary,
    DunningQueue,
    GrowthOverview,
    HealthReport,
    OrganizationPayments,
    PaginatedList,
    PaymentSummary,
    Playbook,
    PlatformPayment,
    RevenueReport,
    SegmentDefinition,
    SegmentOrganization,
} from '../types/growth';

type Params = Record<string, string | number | undefined>;

const cleanParams = (params: Params = {}): Params =>
    Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== ''));

export const growthService = {
    /* -------------------------------------------------------------- payments */
    getPayments: async (params: Params = {}): Promise<{ data: PaginatedList<PlatformPayment> }> => {
        const response = await client.get('/admin/payments', { params: cleanParams(params) });
        return response.data;
    },
    getPaymentSummary: async (params: Params = {}): Promise<{ data: PaymentSummary }> => {
        const response = await client.get('/admin/payments/summary', { params: cleanParams(params) });
        return response.data;
    },
    getRevenueReport: async (months = 12): Promise<{ data: RevenueReport }> => {
        const response = await client.get('/admin/payments/revenue', { params: { months } });
        return response.data;
    },
    getDunningQueue: async (): Promise<{ data: DunningQueue }> => {
        const response = await client.get('/admin/payments/dunning');
        return response.data;
    },
    getOrganizationPayments: async (organizationId: number, limit = 50): Promise<{ data: OrganizationPayments }> => {
        const response = await client.get(`/admin/payments/organization/${organizationId}`, { params: { limit } });
        return response.data;
    },
    retryPayment: async (paymentId: number) => {
        const response = await client.post(`/admin/payments/${paymentId}/retry`);
        return response.data;
    },
    refundPayment: async (paymentId: number, payload: { amount?: number; reason: string }) => {
        const response = await client.post(`/admin/payments/${paymentId}/refund`, payload);
        return response.data;
    },
    recordManualPayment: async (payload: Record<string, unknown>) => {
        const response = await client.post('/admin/payments', payload);
        return response.data;
    },
    paymentsExportUrl: (params: Params = {}): string => {
        const query = new URLSearchParams(
            Object.entries(cleanParams(params)).map(([k, v]) => [k, String(v)]),
        ).toString();
        return `/admin/payments/export${query ? `?${query}` : ''}`;
    },
    downloadPaymentsCsv: async (params: Params = {}): Promise<Blob> => {
        const response = await client.get('/admin/payments/export', {
            params: cleanParams(params),
            responseType: 'blob',
        });
        return response.data as Blob;
    },

    /* --------------------------------------------------------------- coupons */
    getCoupons: async (
        params: Params = {},
    ): Promise<{ data: { coupons: PaginatedList<Coupon>; summary: CouponSummary } }> => {
        const response = await client.get('/admin/coupons', { params: cleanParams(params) });
        return response.data;
    },
    getCoupon: async (couponId: number): Promise<{ data: CouponDetail }> => {
        const response = await client.get(`/admin/coupons/${couponId}`);
        return response.data;
    },
    createCoupon: async (payload: Record<string, unknown>): Promise<{ data: Coupon }> => {
        const response = await client.post('/admin/coupons', payload);
        return response.data;
    },
    updateCoupon: async (couponId: number, payload: Record<string, unknown>): Promise<{ data: Coupon }> => {
        const response = await client.put(`/admin/coupons/${couponId}`, payload);
        return response.data;
    },
    deleteCoupon: async (couponId: number) => {
        const response = await client.delete(`/admin/coupons/${couponId}`);
        return response.data;
    },
    resyncCoupon: async (couponId: number) => {
        const response = await client.post(`/admin/coupons/${couponId}/resync`);
        return response.data;
    },

    /* ---------------------------------------------------------------- growth */
    getGrowthOverview: async (funnelDays = 90): Promise<{ data: GrowthOverview }> => {
        const response = await client.get('/admin/growth/overview', { params: { funnel_days: funnelDays } });
        return response.data;
    },
    getCohorts: async (months = 9): Promise<{ data: CohortReport }> => {
        const response = await client.get('/admin/growth/cohorts', { params: { months } });
        return response.data;
    },
    getChurnReport: async (months = 12): Promise<{ data: ChurnReport }> => {
        const response = await client.get('/admin/growth/churn', { params: { months } });
        return response.data;
    },
    getHealthScores: async (limit = 60): Promise<{ data: HealthReport }> => {
        const response = await client.get('/admin/growth/health', { params: { limit } });
        return response.data;
    },
    getSegments: async (): Promise<{ data: { definitions: SegmentDefinition[]; overview: SegmentDefinition[] } }> => {
        const response = await client.get('/admin/growth/segments');
        return response.data;
    },
    getSegmentMembers: async (
        key: string,
        params: Params = {},
    ): Promise<{
        data: {
            stats: { organizations: number; recipients: number; mrr: number };
            organizations: SegmentOrganization[];
        };
    }> => {
        const response = await client.get(`/admin/growth/segments/${key}`, { params: cleanParams(params) });
        return response.data;
    },

    /* ------------------------------------------------------------- campaigns */
    getCampaigns: async (
        params: Params = {},
    ): Promise<{ data: { campaigns: PaginatedList<Campaign>; performance: CampaignPerformance } }> => {
        const response = await client.get('/admin/campaigns', { params: cleanParams(params) });
        return response.data;
    },
    getCampaign: async (campaignId: number): Promise<{ data: CampaignDetail }> => {
        const response = await client.get(`/admin/campaigns/${campaignId}`);
        return response.data;
    },
    createCampaign: async (payload: Record<string, unknown>): Promise<{ data: Campaign }> => {
        const response = await client.post('/admin/campaigns', payload);
        return response.data;
    },
    updateCampaign: async (campaignId: number, payload: Record<string, unknown>): Promise<{ data: Campaign }> => {
        const response = await client.put(`/admin/campaigns/${campaignId}`, payload);
        return response.data;
    },
    deleteCampaign: async (campaignId: number) => {
        const response = await client.delete(`/admin/campaigns/${campaignId}`);
        return response.data;
    },
    duplicateCampaign: async (campaignId: number): Promise<{ data: Campaign }> => {
        const response = await client.post(`/admin/campaigns/${campaignId}/duplicate`);
        return response.data;
    },
    previewAudience: async (
        segmentKey: string,
        segmentConfig: Record<string, string | number> = {},
    ): Promise<{ data: AudiencePreview }> => {
        const response = await client.post('/admin/campaigns/preview', {
            segment_key: segmentKey,
            segment_config: segmentConfig,
        });
        return response.data;
    },
    sendCampaign: async (
        campaignId: number,
    ): Promise<{ data: { recipients: number; sent: number; failed: number; skipped: number } }> => {
        const response = await client.post(`/admin/campaigns/${campaignId}/send`);
        return response.data;
    },
    sendCampaignTest: async (campaignId: number, email: string) => {
        const response = await client.post(`/admin/campaigns/${campaignId}/test`, { email });
        return response.data;
    },
    setCampaignStatus: async (campaignId: number, status: string): Promise<{ data: Campaign }> => {
        const response = await client.put(`/admin/campaigns/${campaignId}/status`, { status });
        return response.data;
    },
    getPlaybooks: async (): Promise<{ data: Playbook[] }> => {
        const response = await client.get('/admin/campaigns/playbooks');
        return response.data;
    },
    installPlaybook: async (key: string, couponId?: number): Promise<{ data: Campaign }> => {
        const response = await client.post('/admin/campaigns/playbooks', { key, coupon_id: couponId });
        return response.data;
    },
};
