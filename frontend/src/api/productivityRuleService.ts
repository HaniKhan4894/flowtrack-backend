import client from './client';
import type { ProductivityRule } from '../types';

export const productivityRuleService = {
    getAll: async (params?: {
        is_active?: number | string;
        rule_type?: string;
        search?: string;
        page?: number;
        per_page?: number;
    }): Promise<{ data: ProductivityRule[]; pagination?: Record<string, number> }> => {
        const response = await client.get('/productivity-rules', { params });
        return response.data;
    },

    create: async (data: {
        rule_type: ProductivityRule['rule_type'];
        pattern: string;
        category: ProductivityRule['category'];
        is_active?: boolean;
    }): Promise<{ data: ProductivityRule }> => {
        const response = await client.post('/productivity-rules', data);
        return response.data;
    },

    update: async (
        id: number,
        data: Partial<Pick<ProductivityRule, 'rule_type' | 'pattern' | 'category' | 'is_active'>>,
    ): Promise<{ data: ProductivityRule }> => {
        const response = await client.put(`/productivity-rules/${id}`, data);
        return response.data;
    },

    delete: async (id: number): Promise<void> => {
        await client.delete(`/productivity-rules/${id}`);
    },
};

export const activityRecategorizeService = {
    recategorize: async (fromDate?: string): Promise<{ updated: number; message: string }> => {
        const response = await client.post('/activity-logs/recategorize', fromDate ? { from_date: fromDate } : {});
        return response.data;
    },
};
