import client from './client';

export interface SlackWorkspaceMeta {
    connected: boolean;
    team_name: string | null;
    can_read: boolean;
    default_channel: string | null;
    default_channel_id: string | null;
}

export interface SlackChannel {
    id: string;
    name: string;
    is_private: boolean;
    num_members: number;
    topic: string;
}

export interface SlackMessage {
    ts: string;
    author: string;
    text: string;
    thread_ts: string | null;
    created_at: string | null;
}

export interface SlackChannelsResult {
    connected?: boolean;
    channels: SlackChannel[];
    next_cursor?: string | null;
    has_more: boolean;
}

export interface SlackMessagesResult {
    messages: SlackMessage[];
    next_cursor?: string | null;
    has_more: boolean;
}

export const slackService = {
    meta: async (): Promise<{ data: SlackWorkspaceMeta }> => {
        const response = await client.get('/integrations/slack/meta');
        return response.data;
    },

    channels: async (cursor?: string): Promise<{ data: SlackChannelsResult }> => {
        const response = await client.get('/integrations/slack/channels', {
            params: cursor ? { cursor } : {},
        });
        return response.data;
    },

    messages: async (channelId: string, cursor?: string): Promise<{ data: SlackMessagesResult }> => {
        const response = await client.get(
            `/integrations/slack/channels/${encodeURIComponent(channelId)}/messages`,
            { params: cursor ? { cursor } : {} },
        );
        return response.data;
    },

    sendToChannel: async (channelId: string, text: string) => {
        const response = await client.post(
            `/integrations/slack/channels/${encodeURIComponent(channelId)}/message`,
            { text },
        );
        return response.data;
    },

    test: async () => {
        const response = await client.post('/integrations/slack/test', {});
        return response.data;
    },

    send: async (text: string, channelId?: string) => {
        const response = await client.post('/integrations/slack/send', {
            text,
            ...(channelId ? { channel_id: channelId } : {}),
        });
        return response.data;
    },
};
