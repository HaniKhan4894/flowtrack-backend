import client from './client';

export interface Invoice {
    id: number;
    invoice_number: string;
    client_name: string;
    project_name?: string;
    amount?: number;
    subtotal?: number;
    total?: number;
    status: 'draft' | 'sent' | 'paid' | 'overdue';
    issue_date: string;
    due_date: string;
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
    }
};
