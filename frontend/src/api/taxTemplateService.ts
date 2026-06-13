import client from './client';

export interface PayrollTaxTemplate {
    id: number;
    organization_id: number;
    name: string;
    type: 'percentage' | 'fixed';
    rate?: number | null;
    amount?: number | null;
    is_active: boolean;
    created_at?: string;
    updated_at?: string;
}

export const taxTemplateService = {
    getAll: async (): Promise<{ data: PayrollTaxTemplate[] }> => {
        const response = await client.get('/payroll/tax-templates');
        return response.data;
    },

    create: async (data: Partial<PayrollTaxTemplate>): Promise<{ data: PayrollTaxTemplate }> => {
        const response = await client.post('/payroll/tax-templates', data);
        return response.data;
    },

    update: async (id: number, data: Partial<PayrollTaxTemplate>): Promise<{ data: PayrollTaxTemplate }> => {
        const response = await client.put(`/payroll/tax-templates/${id}`, data);
        return response.data;
    },

    delete: async (id: number): Promise<void> => {
        await client.delete(`/payroll/tax-templates/${id}`);
    },
};
