import client from './client';

export interface LedgerRecord {
    sequence: number;
    action: 'record' | 'amend' | 'delete';
    entry_type: string;
    reference_id: number | null;
    hash: string;
    prev_hash: string;
    created_at: string;
    first_name?: string | null;
    last_name?: string | null;
}

export interface LedgerSummary {
    records: number;
    last_hash: string | null;
    last_sequence: number;
    last_recorded_at: string | null;
}

export interface LedgerOverview {
    summary: LedgerSummary;
    records: LedgerRecord[];
}

export interface LedgerTamper {
    reference_id: number;
    issue: 'deleted' | 'modified' | 'reappeared';
    sequence: number;
}

export interface LedgerVerification {
    chain_valid: boolean;
    records: number;
    first_broken_sequence: number | null;
    data_valid: boolean;
    tampered: LedgerTamper[];
    verified_entries: number;
}

export const ledgerService = {
    overview: async (): Promise<{ data: LedgerOverview }> => {
        const response = await client.get('/ledger');
        return response.data;
    },

    verify: async (): Promise<{ data: LedgerVerification }> => {
        const response = await client.get('/ledger/verify');
        return response.data;
    },
};
