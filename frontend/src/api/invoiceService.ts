import client from './client';
import type { InvoiceItem } from '../types';

export interface Invoice {
    id: number;
    invoice_number: string;
    client_name: string;
    client_email?: string;
    project_name?: string;
    project_id?: number;
    amount?: number;
    subtotal?: number;
    tax_amount?: number;
    total?: number;
    status: 'draft' | 'sent' | 'paid' | 'overdue';
    issue_date: string;
    due_date: string;
    notes?: string;
    items?: InvoiceItem[];
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

    create: async (data: any) => {
        const response = await client.post('/invoices', data);
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
};
