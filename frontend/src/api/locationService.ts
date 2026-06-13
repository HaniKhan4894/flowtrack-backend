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
    searchCities: async (stateId: number, q?: string, page = 1): Promise<{ data: City[]; pagination: any }> => {
        const response = await client.get('/locations/cities', { params: { state_id: stateId, q, page, per_page: 30 } });
        return response.data;
    },
    getTimezones: async (): Promise<{ data: TimezoneOption[]; grouped: Record<string, TimezoneOption[]> }> => {
        const response = await client.get('/locations/timezones');
        return response.data;
    },
};
