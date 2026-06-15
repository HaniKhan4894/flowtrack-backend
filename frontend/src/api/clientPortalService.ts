import axios from 'axios';
import type { Invoice } from './invoiceService';

const apiBaseUrl =
  import.meta.env.VITE_API_URL ||
  'https://2310-154-192-119-80.ngrok-free.app/flowtrack-backend/public/api/v1';

const usesNgrok = apiBaseUrl.includes('ngrok');

const portalClient = axios.create({
  baseURL: apiBaseUrl,
  headers: {
    'Content-Type': 'application/json',
    ...(usesNgrok ? { 'ngrok-skip-browser-warning': 'true' } : {}),
  },
});

export interface PortalInvoice extends Invoice {
  payments?: { id: number; amount: string | number; method: string; reference?: string; paid_at: string }[];
  amount_paid?: number;
  balance_due?: number;
  client_approved_at?: string | null;
  portal_url?: string;
  currency?: string;
}

export const clientPortalService = {
  getInvoice: async (token: string) => {
    const res = await portalClient.get<{ data: PortalInvoice }>(`/portal/invoice/${token}`);
    return res.data;
  },

  approve: async (token: string, note?: string) => {
    const res = await portalClient.post(`/portal/invoice/${token}/approve`, { note });
    return res.data;
  },

  recordPayment: async (token: string, data: { amount: number; method?: string; reference?: string; note?: string }) => {
    const res = await portalClient.post(`/portal/invoice/${token}/payment`, data);
    return res.data;
  },
};
