import client from './client';

export const slackService = {
    test: async () => {
        const response = await client.post('/integrations/slack/test', {});
        return response.data;
    },

    send: async (text: string) => {
        const response = await client.post('/integrations/slack/send', { text });
        return response.data;
    },
};
