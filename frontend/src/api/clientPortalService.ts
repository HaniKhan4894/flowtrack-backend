import axios from 'axios';
import type { Invoice } from './invoiceService';

const apiBaseUrl =
  import.meta.env.VITE_API_URL ||
  'https://violation-blade-pretty.ngrok-free.dev/flowtrack-backend/public/api/v1';

export const usesNgrok = apiBaseUrl.includes('ngrok');

const portalClient = axios.create({
  baseURL: apiBaseUrl,
  headers: {
    'Content-Type': 'application/json',
    ...(usesNgrok ? { 'ngrok-skip-browser-warning': 'true' } : {}),
  },
});

export interface ProofPackIntegrity {
  score: number;
  grade: string;
  components: { label: string; score: number; weight: number }[];
}

export interface ProofPackScreenshot {
  id: number;
  captured_at: string;
  activity_level: number;
  is_blurred: boolean;
  thumbnail_url: string;
}

export interface WorkCertificate {
  certificate_id: string;
  issuer: string;
  organization: string;
  period: string;
  tracked_hours: number;
  billed_hours: number;
  time_entries: number;
  integrity_score: number;
  work_integrity: { score: number; grade: string; flags: string[] };
  ledger: { records: number; last_hash: string | null; chain_valid: boolean; data_valid: boolean };
  issued_at: string;
  signature: string;
  algorithm: string;
}

export interface ProofPack {
  available: boolean;
  organization_name: string;
  period: { start_date: string; end_date: string; label: string };
  summary: {
    tracked_hours: number;
    billed_hours: number;
    time_entry_count: number;
    screenshot_count: number;
    contributor_count: number;
  };
  integrity: ProofPackIntegrity;
  productivity: { category: string; seconds: number; hours: number; percent: number }[];
  top_apps: { app_name: string; category: string; hours: number; percent: number }[];
  contributors: { display_name: string; hours: number }[];
  screenshots: ProofPackScreenshot[];
  highlights: string[];
  certificate?: WorkCertificate;
}

export interface PortalInvoice extends Invoice {
  payments?: { id: number; amount: string | number; method: string; reference?: string; paid_at: string }[];
  amount_paid?: number;
  balance_due?: number;
  client_approved_at?: string | null;
  portal_url?: string;
  currency?: string;
  proof_pack?: ProofPack;
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

  fetchScreenshotBlob: async (url: string) => {
    const res = await axios.get(url, {
      responseType: 'blob',
      headers: usesNgrok ? { 'ngrok-skip-browser-warning': 'true' } : {},
    });
    return URL.createObjectURL(res.data);
  },

  getCertificate: async (token: string) => {
    const res = await portalClient.get<{
      data: { certificate: WorkCertificate; signature_valid: boolean; verified_at: string };
    }>(`/portal/invoice/${token}/certificate`);
    return res.data;
  },

  verifyCertificate: async (certificate: WorkCertificate) => {
    const res = await portalClient.post<{
      data: { valid: boolean; certificate_id: string | null; organization: string | null; issued_at: string | null; message: string };
    }>(`/portal/certificate/verify`, { certificate });
    return res.data;
  },
};
