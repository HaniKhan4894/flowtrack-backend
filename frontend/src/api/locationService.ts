import client from './client';
import type { Country, State, City, TimezoneOption } from '../types';

export const locationService = {
    getCountries: async (): Promise<{ data: Country[] }> => {
        const response = await client.get('/locations/countries');
        return response.data;
    },
    getStates: async (countryId: number): Promise<{ data: State[] }> => {
        const response = await client.get('/locations/states', { params: { country_id: countryId } });
        return response.data;
    },
    searchCities: async (stateId: number, q?: string, includeId?: number, page = 1): Promise<{ data: City[]; pagination: any }> => {
        const params: Record<string, string | number> = { state_id: stateId, page, per_page: 30 };
        if (q) params.q = q;
        if (includeId) params.include_id = includeId;
        const response = await client.get('/locations/cities', { params });
        return response.data;
    },
    getTimezones: async (): Promise<{ data: TimezoneOption[]; grouped: Record<string, TimezoneOption[]> }> => {
        const response = await client.get('/locations/timezones');
        return response.data;
    },
};
