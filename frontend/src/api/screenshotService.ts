import client from './client';

export type ScreenshotItem = {
    id: number;
    captured_at?: string;
    activity_level?: number;
    is_blurred?: boolean | string;
    thumb_url?: string;
    view_url?: string;
    [key: string]: unknown;
};

/** Prefer signed URL from list payload; fall back to authenticated blob fetch for legacy rows. */
export async function resolveScreenshotMediaUrl(
    item: { id: number; thumb_url?: string; view_url?: string },
    mode: 'thumb' | 'view',
): Promise<string> {
    const signed = mode === 'thumb' ? item.thumb_url : item.view_url;
    if (signed) {
        return signed;
    }
    return mode === 'thumb'
        ? screenshotService.getThumbnailBlobUrl(item.id)
        : screenshotService.getImageBlobUrl(item.id);
}

export function screenshotThumbSrc(item: { id: number; thumb_url?: string }): string {
    return item.thumb_url || '';
}

export function screenshotViewSrc(item: { id: number; view_url?: string }): string {
    return item.view_url || '';
}

export const screenshotService = {
    getAll: async (filters: Record<string, unknown> = {}) => {
        const response = await client.get('/screenshots', { params: filters });
        return response.data;
    },

    getByTimeEntry: async (timeEntryId: number) => {
        const response = await client.get(`/screenshots/time-entry/${timeEntryId}`);
        return response.data;
    },

    upload: async (formData: FormData) => {
        const response = await client.post('/screenshots/upload', formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });
        return response.data;
    },

    delete: async (id: number) => {
        const response = await client.delete(`/screenshots/${id}`);
        return response.data;
    },

    /** Legacy fallback when list rows lack signed URLs. Prefer thumb_url on <img src>. */
    getThumbnailBlobUrl: async (id: number): Promise<string> => {
        const response = await client.get(`/screenshots/thumb/${id}`, {
            responseType: 'blob',
        });
        return URL.createObjectURL(response.data);
    },

    /** Legacy fallback when list rows lack signed URLs. Prefer view_url on <img src>. */
    getImageBlobUrl: async (id: number): Promise<string> => {
        const response = await client.get(`/screenshots/view/${id}`, {
            responseType: 'blob',
        });
        return URL.createObjectURL(response.data);
    },
};
