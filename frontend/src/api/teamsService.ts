import client from './client';

export const teamsService = {
  test: async () => {
    const response = await client.post('/integrations/teams/test', {});
    return response.data;
  },

  send: async (text: string, title?: string) => {
    const response = await client.post('/integrations/teams/send', { text, title });
    return response.data;
  },
};
