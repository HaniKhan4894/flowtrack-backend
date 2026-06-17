import client from './client';
import type { InvoiceItem } from '../types';

export interface Invoice {
    id: number;
    invoice_number: string;
    client_name: string;
    client_email?: string;
    client_id?: number;
    project_name?: string;
    project_id?: number;
    amount?: number;
    subtotal?: number;
    tax_amount?: number;
    tax_rate?: number;
    total?: number;
    status: 'draft' | 'sent' | 'pending_approval' | 'approved' | 'partially_paid' | 'paid' | 'cancelled' | 'overdue';
    issue_date: string;
    due_date: string;
    notes?: string;
    items?: InvoiceItem[];
    amount_paid?: number;
    client_approved_at?: string | null;
    currency?: string;
}

export const invoiceService = {
    getAll: async () => {
        const response = await client.get<{ data: Invoice[], pagination: any }>('/invoices');
        return response.data;
    },

    getStats: async () => {
        // Since there is no dedicated stats endpoint, we calculate from all invoices for now
        // or we could add a stats endpoint later. 
        // For now, let's assume we fetch all and calculate on frontend or use a (mock) helper
        // But better to request backend.
        // Let's stick to getAll for now and we will calculate on frontend.
        return {
            total_invoiced: 0,
            paid_amount: 0,
            outstanding: 0
        };
    },

    create: async (data: {
        client_name: string;
        client_email?: string;
        client_id?: number;
        project_id?: number;
        due_date: string;
        notes?: string;
        tax_rate?: number;
    }) => {
        const response = await client.post('/invoices', data);
        return response.data;
    },

    generateFromTime: async (data: {
        start_date: string;
        end_date: string;
        due_date: string;
        client_name?: string;
        client_email?: string;
        client_id?: number;
        project_id?: number;
        tax_rate?: number;
        notes?: string;
        default_rate?: number;
    }) => {
        const response = await client.post('/invoices/generate-from-time', data);
        return response.data;
    },

    update: async (
        id: number,
        data: Partial<{
            client_name: string;
            client_email: string | null;
            client_id: number | null;
            project_id: number | null;
            due_date: string;
            notes: string | null;
            tax_rate: number;
        }>,
    ) => {
        const response = await client.put(`/invoices/${id}`, data);
        return response.data;
    },

    populateFromTime: async (id: number, data: { start_date: string; end_date: string; project_id?: number }) => {
        const response = await client.post(`/invoices/${id}/populate-from-time`, data);
        return response.data;
    },

    get: async (id: number) => {
        const response = await client.get<{ data: Invoice }>(`/invoices/${id}`);
        return response.data;
    },

    getById: async (id: number) => {
        const response = await client.get<{ data: Invoice }>(`/invoices/${id}`);
        return response.data;
    },

    addItem: async (
        id: number,
        data: { description: string; quantity: number; unit_price: number },
    ) => {
        const response = await client.post(`/invoices/${id}/items`, data);
        return response.data;
    },

    send: async (id: number) => {
        const response = await client.post(`/invoices/${id}/send`);
        return response.data;
    },

    updateStatus: async (id: number, status: Invoice['status']) => {
        const response = await client.put(`/invoices/${id}/status`, { status });
        return response.data;
    },

    downloadPdf: async (id: number, filename?: string) => {
        const response = await client.get(`/invoices/${id}/pdf`, { responseType: 'blob' });
        const blob = response.data as Blob;
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename ?? `invoice-${id}.pdf`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
        return blob;
    },

    getPortalLink: async (id: number) => {
        const response = await client.get<{ data: { token: string; url: string } }>(`/invoices/${id}/portal`);
        return response.data;
    },

    getPayments: async (id: number) => {
        const response = await client.get<{ data: { id: number; amount: number; method: string; reference?: string; paid_at: string }[] }>(`/invoices/${id}/payments`);
        return response.data;
    },
};
