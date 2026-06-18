import client from './client';

export interface LeaveType {
    id: number;
    organization_id: number;
    name: string;
    days_per_year: number;
    is_paid: boolean;
    is_active: boolean;
}

export interface LeaveBalance {
    id: number;
    user_id: number;
    leave_type_id: number;
    leave_type_name: string;
    is_paid: boolean;
    balance_days: number;
    used_days: number;
    year: number;
    first_name?: string;
    last_name?: string;
    email?: string;
}

export interface LeaveRequest {
    id: number;
    user_id: number;
    leave_type_id: number;
    leave_type_name?: string;
    start_date: string;
    end_date: string;
    days_requested: number;
    status: 'pending' | 'approved' | 'rejected' | 'cancelled';
    reason?: string | null;
    reviewer_notes?: string | null;
    first_name?: string;
    last_name?: string;
    email?: string;
    created_at?: string;
}

export const leaveService = {
    getTypes: async (): Promise<{ data: LeaveType[] }> => {
        const response = await client.get('/leave/types');
        return response.data;
    },

    createType: async (data: Partial<LeaveType>): Promise<{ data: LeaveType }> => {
        const response = await client.post('/leave/types', data);
        return response.data;
    },

    updateType: async (id: number, data: Partial<LeaveType>): Promise<{ data: LeaveType }> => {
        const response = await client.put(`/leave/types/${id}`, data);
        return response.data;
    },

    getBalances: async (params?: { user_id?: number; year?: number }): Promise<{ data: LeaveBalance[] }> => {
        const response = await client.get('/leave/balances', { params });
        return response.data;
    },

    getRequests: async (params?: { user_id?: number; status?: string }): Promise<{ data: LeaveRequest[] }> => {
        const response = await client.get('/leave/requests', { params });
        return response.data;
    },

    requestLeave: async (data: {
        leave_type_id: number;
        start_date: string;
        end_date: string;
        reason?: string;
    }): Promise<{ data: LeaveRequest }> => {
        const response = await client.post('/leave/requests', data);
        return response.data;
    },

    reviewRequest: async (id: number, data: { status: 'approved' | 'rejected'; reviewer_notes?: string }): Promise<{ data: LeaveRequest }> => {
        const action = data.status === 'approved' ? 'approve' : 'reject';
        const response = await client.post(`/leave/requests/${id}/review`, {
            action,
            reason: data.reviewer_notes,
        });
        return response.data;
    },

    cancelRequest: async (id: number): Promise<{ data: LeaveRequest }> => {
        const response = await client.post(`/leave/requests/${id}/cancel`);
        return response.data;
    },
};
