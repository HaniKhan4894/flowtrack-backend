import client, { API_BASE_URL } from './client';

export interface StreamHandlers {
  onNotification?: (n: Record<string, unknown>) => void;
  onUnread?: (count: number) => void;
  onError?: () => void;
}

export const notificationService = {
  list: async () => {
    const response = await client.get('/notifications');
    return response.data;
  },
  unreadCount: async () => {
    const response = await client.get('/notifications/unread-count');
    return response.data;
  },
  markRead: async (id: number) => {
    const response = await client.post(`/notifications/${id}/read`);
    return response.data;
  },
  markAllRead: async () => {
    const response = await client.post('/notifications/read-all');
    return response.data;
  },

  /**
   * Open a Server-Sent Events connection for real-time notifications.
   * Returns the EventSource so the caller can close it. The browser reconnects
   * automatically when the bounded server window ends.
   */
  openStream: (handlers: StreamHandlers, since = 0): EventSource | null => {
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') return null;
    const token = localStorage.getItem('access_token');
    if (!token) return null;

    const params = new URLSearchParams({ token });
    if (since > 0) params.set('since', String(since));
    const es = new EventSource(`${API_BASE_URL}/notifications/stream?${params.toString()}`);

    es.addEventListener('notification', (e) => {
      try {
        handlers.onNotification?.(JSON.parse((e as MessageEvent).data));
      } catch {
        /* ignore malformed frame */
      }
    });
    es.addEventListener('unread', (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data);
        handlers.onUnread?.(Number(data.count ?? 0));
      } catch {
        /* ignore */
      }
    });
    es.onerror = () => handlers.onError?.();

    return es;
  },
};
