import client from './client';

export interface JiraIssue {
    key: string;
    summary: string;
    status: string;
    project: string;
    url: string;
    updated: string | null;
    priority?: string;
    type?: string;
    assignee?: string;
}

export interface JiraIssuesResult {
    connected: boolean;
    issues: JiraIssue[];
    has_more?: boolean;
    next_page_token?: string | null;
    page?: number;
    per_page?: number;
}

export interface JiraIssueDetail extends JiraIssue {
    description: string;
    status_id: string;
    reporter: string;
    created: string | null;
    comments: Array<{ id: string; author: string; body: string; created: string | null }>;
}

export interface JiraTransition {
    id: string;
    name: string;
    to_status: string;
}

export interface JiraLogTimePayload {
    issue_key: string;
    summary: string;
    url?: string;
    project?: string;
    project_id?: number;
    duration_minutes?: number;
    push_worklog?: boolean;
}

export interface JiraIssuesParams {
    jql?: string;
    page?: number;
    pageToken?: string | null;
    perPage?: number;
}

export const jiraService = {
    issues: async (params: JiraIssuesParams = {}): Promise<{ data: JiraIssuesResult }> => {
        const query: Record<string, string | number> = {};
        if (params.jql) query.jql = params.jql;
        if (params.page) query.page = params.page;
        if (params.pageToken) query.page_token = params.pageToken;
        if (params.perPage) query.max = params.perPage;
        const response = await client.get('/integrations/jira/issues', { params: query });
        return response.data;
    },

    issue: async (key: string): Promise<{ data: JiraIssueDetail }> => {
        const response = await client.get(`/integrations/jira/issues/${encodeURIComponent(key)}`);
        return response.data;
    },

    transitions: async (key: string): Promise<{ data: JiraTransition[] }> => {
        const response = await client.get(`/integrations/jira/issues/${encodeURIComponent(key)}/transitions`);
        return response.data;
    },

    transition: async (key: string, transitionId: string) => {
        const response = await client.post(`/integrations/jira/issues/${encodeURIComponent(key)}/transition`, {
            transition_id: transitionId,
        });
        return response.data;
    },

    comment: async (key: string, body: string) => {
        const response = await client.post(`/integrations/jira/issues/${encodeURIComponent(key)}/comment`, { body });
        return response.data;
    },

    logTime: async (payload: JiraLogTimePayload): Promise<{ data: { worklog_pushed: boolean } }> => {
        const response = await client.post('/integrations/jira/log-time', payload);
        return response.data;
    },
};
