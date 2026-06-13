import client from './client';
import type { PayrollCompensation, PayrollRun, PayrollSummary } from '../types';

export const payrollService = {
    getSummary: async (): Promise<{ data: PayrollSummary }> => {
        const response = await client.get('/payroll/summary');
        return response.data;
    },

    getCompensations: async (): Promise<{ data: PayrollCompensation[] }> => {
        const response = await client.get('/payroll/compensations');
        return response.data;
    },

    upsertCompensation: async (data: {
        user_id: number;
        pay_type: 'hourly' | 'fixed' | 'custom';
        hourly_rate?: number | null;
        fixed_amount?: number | null;
        currency?: string;
        notes?: string;
    }): Promise<{ data: PayrollCompensation }> => {
        const response = await client.put('/payroll/compensations', data);
        return response.data;
    },

    getRuns: async (page = 1): Promise<{ data: PayrollRun[]; pagination: { page: number; per_page: number; total: number; total_pages: number } }> => {
        const response = await client.get('/payroll/runs', { params: { page } });
        return response.data;
    },

    createRun: async (data: {
        title?: string;
        period_start: string;
        period_end: string;
        currency?: string;
    }): Promise<{ data: PayrollRun }> => {
        const response = await client.post('/payroll/runs', data);
        return response.data;
    },

    getRun: async (id: number): Promise<{ data: PayrollRun }> => {
        const response = await client.get(`/payroll/runs/${id}`);
        return response.data;
    },

    finalizeRun: async (id: number): Promise<{ data: PayrollRun }> => {
        const response = await client.post(`/payroll/runs/${id}/finalize`);
        return response.data;
    },

    updateItem: async (itemId: number, data: {
        base_amount?: number;
        notes?: string;
        pay_type?: string;
        hourly_rate?: number;
    }): Promise<{ data: PayrollRun }> => {
        const response = await client.put(`/payroll/items/${itemId}`, data);
        return response.data;
    },

    addAdjustment: async (itemId: number, data: {
        type: 'bonus' | 'deduction';
        label: string;
        amount: number;
    }): Promise<{ data: PayrollRun }> => {
        const response = await client.post(`/payroll/items/${itemId}/adjustments`, data);
        return response.data;
    },

    recordPayment: async (itemId: number, data: {
        amount: number;
        method?: string;
        reference?: string;
    }): Promise<{ data: PayrollRun }> => {
        const response = await client.post(`/payroll/items/${itemId}/payments`, data);
        return response.data;
    },

    exportRunCsv: async (runId: number, filename?: string): Promise<void> => {
        const response = await client.get(`/payroll/runs/${runId}/export`, { responseType: 'blob' });
        const blob = new Blob([response.data], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename ?? `payroll-run-${runId}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    },

    downloadPayslip: async (itemId: number, filename?: string): Promise<void> => {
        const response = await client.get(`/payroll/items/${itemId}/payslip`, { responseType: 'blob' });
        const blob = new Blob([response.data], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename ?? `payslip-${itemId}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    },
};
