import client from './client';

export interface OfficeLocation {
  id: number;
  organization_id: number;
  name: string;
  public_ip?: string | null;
  router_mac?: string | null;
  location_type: 'office' | 'non_office';
  is_auto_detected: boolean;
  last_active_at?: string | null;
}

export interface LocationBreakdown {
  work_location: string;
  hours: number;
  percent: number;
}

export const officeLocationService = {
  list: async (type?: string): Promise<{ data: OfficeLocation[] }> => {
    const res = await client.get('/office-locations', { params: type ? { type } : {} });
    return res.data;
  },
  create: async (data: Partial<OfficeLocation>): Promise<{ data: OfficeLocation }> => {
    const res = await client.post('/office-locations', data);
    return res.data;
  },
  update: async (id: number, data: Partial<OfficeLocation>): Promise<{ data: OfficeLocation }> => {
    const res = await client.put(`/office-locations/${id}`, data);
    return res.data;
  },
  delete: async (id: number): Promise<void> => {
    await client.delete(`/office-locations/${id}`);
  },
  runAutoDetect: async (): Promise<{ data: { created: number } }> => {
    const res = await client.post('/office-locations/auto-detect');
    return res.data;
  },
  breakdown: async (startDate: string, endDate: string): Promise<{ data: LocationBreakdown[] }> => {
    const res = await client.get('/office-locations/breakdown', { params: { start_date: startDate, end_date: endDate } });
    return res.data;
  },
};
