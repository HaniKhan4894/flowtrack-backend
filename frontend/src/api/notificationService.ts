import client from './client';

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
};
