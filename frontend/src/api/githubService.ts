import client from './client';

export interface GithubCommit {
    repo: string;
    sha: string;
    short_sha: string;
    message: string;
    url: string;
    authored_at: string | null;
}

export interface GithubPullRequest {
    repo: string;
    number: number;
    title: string;
    state: string;
    url: string;
    updated_at: string | null;
    merged: boolean;
}

export interface GithubActivity {
    connected: boolean;
    login: string | null;
    commits: GithubCommit[];
    pull_requests: GithubPullRequest[];
}

export interface GithubLogTimePayload {
    type: 'commit' | 'pull_request';
    repo?: string;
    external_id?: string;
    title: string;
    url?: string;
    authored_at?: string | null;
    project_id?: number;
    duration_minutes?: number;
    description?: string;
}

export const githubService = {
    activity: async (days = 7): Promise<{ data: GithubActivity }> => {
        const response = await client.get('/integrations/github/activity', { params: { days } });
        return response.data;
    },

    logTime: async (payload: GithubLogTimePayload) => {
        const response = await client.post('/integrations/github/log-time', payload);
        return response.data;
    },
};
