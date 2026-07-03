import client from './client';

export interface JiraIssue {
    key: string;
    summary: string;
    status: string;
    project: string;
    url: string;
    updated: string | null;
}

export interface JiraIssuesResult {
    connected: boolean;
    issues: JiraIssue[];
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

export const jiraService = {
    issues: async (): Promise<{ data: JiraIssuesResult }> => {
        const response = await client.get('/integrations/jira/issues');
        return response.data;
    },

    logTime: async (payload: JiraLogTimePayload): Promise<{ data: { worklog_pushed: boolean } }> => {
        const response = await client.post('/integrations/jira/log-time', payload);
        return response.data;
    },
};
