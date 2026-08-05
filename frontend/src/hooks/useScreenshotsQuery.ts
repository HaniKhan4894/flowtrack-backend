import { useQuery, useQueryClient } from '@tanstack/react-query';
import { screenshotService, type ScreenshotItem } from '../api/screenshotService';

export type ScreenshotsFilters = {
  page?: number;
  per_page?: number;
  start_date?: string;
  end_date?: string;
  user_id?: number | null;
};

export type ScreenshotsListResult = {
  data: ScreenshotItem[];
  pagination: {
    current_page: number;
    per_page: number;
    total: number;
    total_pages: number;
  };
};

export function screenshotsQueryKey(filters: ScreenshotsFilters) {
  return [
    'screenshots',
    {
      page: filters.page ?? 1,
      per_page: filters.per_page ?? 12,
      start_date: filters.start_date ?? null,
      end_date: filters.end_date ?? null,
      user_id: filters.user_id ?? null,
    },
  ] as const;
}

export function useScreenshotsQuery(filters: ScreenshotsFilters, options?: { enabled?: boolean }) {
  return useQuery<ScreenshotsListResult>({
    queryKey: screenshotsQueryKey(filters),
    queryFn: async () => {
      const params: Record<string, string | number> = {
        page: filters.page ?? 1,
        per_page: filters.per_page ?? 12,
      };
      if (filters.start_date) params.start_date = filters.start_date;
      if (filters.end_date) params.end_date = filters.end_date;
      if (filters.user_id) params.user_id = filters.user_id;

      const response = await screenshotService.getAll(params);
      const data = (response.data ?? []) as ScreenshotItem[];
      return {
        data,
        pagination: response.pagination ?? {
          current_page: filters.page ?? 1,
          per_page: filters.per_page ?? 12,
          total: data.length,
          total_pages: 1,
        },
      };
    },
    enabled: options?.enabled !== false,
    staleTime: 3 * 60_000,
  });
}

export function useInvalidateScreenshots() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: ['screenshots'] });
}
