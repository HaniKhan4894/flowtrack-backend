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

export interface GithubPagination {
    page: number;
    per_page: number;
    total: number;
    total_pages: number;
    has_more: boolean;
}

export interface GithubActivity {
    connected: boolean;
    login: string | null;
    commits: GithubCommit[];
    pull_requests: GithubPullRequest[];
    commits_pagination?: GithubPagination;
    pull_requests_pagination?: GithubPagination;
}

export interface GithubRepo {
    full_name: string;
    name: string;
    private: boolean;
    url: string;
}

export interface GithubPullRequestDetail {
    number: number;
    title: string;
    body: string;
    state: string;
    merged: boolean;
    mergeable: boolean | null;
    user: string;
    head: string;
    base: string;
    url: string;
    created_at: string | null;
    updated_at: string | null;
    repo: string;
    comments: Array<{ id: number; author: string; body: string; created_at: string | null }>;
    reviews: Array<{ id: number; author: string; state: string; body: string; submitted_at: string | null }>;
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
    activity: async (params: {
        days?: number;
        prPage?: number;
        commitPage?: number;
        perPage?: number;
    } = {}): Promise<{ data: GithubActivity }> => {
        const response = await client.get('/integrations/github/activity', {
            params: {
                days: params.days ?? 14,
                pr_page: params.prPage ?? 1,
                commit_page: params.commitPage ?? 1,
                per_page: params.perPage ?? 20,
            },
        });
        return response.data;
    },

    repos: async (): Promise<{ data: { connected: boolean; repos: GithubRepo[] } }> => {
        const response = await client.get('/integrations/github/repos');
        return response.data;
    },

    pullRequest: async (owner: string, repo: string, number: number): Promise<{ data: GithubPullRequestDetail }> => {
        const response = await client.get(
            `/integrations/github/pulls/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${number}`,
        );
        return response.data;
    },

    commentPull: async (owner: string, repo: string, number: number, body: string) => {
        const response = await client.post(
            `/integrations/github/pulls/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${number}/comment`,
            { body },
        );
        return response.data;
    },

    mergePull: async (owner: string, repo: string, number: number) => {
        const response = await client.post(
            `/integrations/github/pulls/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${number}/merge`,
        );
        return response.data;
    },

    updatePullState: async (owner: string, repo: string, number: number, state: 'open' | 'closed') => {
        const response = await client.post(
            `/integrations/github/pulls/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${number}/state`,
            { state },
        );
        return response.data;
    },

    logTime: async (payload: GithubLogTimePayload) => {
        const response = await client.post('/integrations/github/log-time', payload);
        return response.data;
    },
};
