<?php

namespace App\Services;

/**
 * Reads a connected organization's GitHub data (commits, pull requests) using
 * the OAuth token stored in the `github` integration. Used to link development
 * work to tracked time.
 */
class GitHubService
{
    protected IntegrationService $integrations;

    public function __construct()
    {
        $this->integrations = new IntegrationService();
    }

    public function isConnected(int $organizationId): bool
    {
        $conn = $this->integrations->get($organizationId, 'github');
        return $conn !== null && $conn['is_enabled'] && !empty($conn['secrets']['access_token']);
    }

    /**
     * Recent commits + pull requests authored by the connected account.
     *
     * @return array{login:?string, commits:array<int,array>, pull_requests:array<int,array>, commits_pagination:array, pull_requests_pagination:array}
     */
    public function recentActivity(
        int $organizationId,
        int $days = 7,
        int $prPage = 1,
        int $commitPage = 1,
        int $perPage = 20
    ): array {
        $conn = $this->requireConnection($organizationId);
        $token = (string) $conn['secrets']['access_token'];
        $login = (string) ($conn['settings']['login'] ?? '');

        if ($login === '') {
            $login = $this->resolveLogin($token) ?? '';
        }
        if ($login === '') {
            throw new \RuntimeException('Could not determine the connected GitHub account.');
        }

        $since = date('Y-m-d', strtotime('-' . max(1, $days) . ' days'));
        $perPage = max(1, min(50, $perPage));
        $prPage = max(1, $prPage);
        $commitPage = max(1, $commitPage);

        $prs = $this->searchPullRequests($token, $login, $since, $prPage, $perPage);
        $commits = $this->searchCommits($token, $login, $since, $commitPage, $perPage);

        return [
            'login'                    => $login,
            'commits'                  => $commits['items'],
            'pull_requests'            => $prs['items'],
            'commits_pagination'       => $commits['pagination'],
            'pull_requests_pagination' => $prs['pagination'],
        ];
    }

    /**
     * @return array{items:array<int,array>, pagination:array{page:int, per_page:int, total:int, total_pages:int, has_more:bool}}
     */
    private function searchCommits(string $token, string $login, string $since, int $page = 1, int $perPage = 20): array
    {
        $query = sprintf('author:%s author-date:>=%s', $login, $since);
        $body = $this->apiGet($token, 'https://api.github.com/search/commits', [
            'q'        => $query,
            'sort'     => 'author-date',
            'order'    => 'desc',
            'per_page' => $perPage,
            'page'     => $page,
        ], 'application/vnd.github.cloak-preview+json');

        $items = $body['items'] ?? [];
        $out = [];
        foreach ($items as $item) {
            $sha = (string) ($item['sha'] ?? '');
            $out[] = [
                'repo'        => $item['repository']['full_name'] ?? '',
                'sha'         => $sha,
                'short_sha'   => substr($sha, 0, 7),
                'message'     => $this->firstLine((string) ($item['commit']['message'] ?? '')),
                'url'         => $item['html_url'] ?? '',
                'authored_at' => $item['commit']['author']['date'] ?? null,
            ];
        }

        $total = (int) ($body['total_count'] ?? count($out));
        $totalPages = $perPage > 0 ? (int) ceil($total / $perPage) : 1;

        return [
            'items'      => $out,
            'pagination' => [
                'page'        => $page,
                'per_page'    => $perPage,
                'total'       => $total,
                'total_pages' => max(1, $totalPages),
                'has_more'    => $page < $totalPages,
            ],
        ];
    }

    /**
     * @return array{items:array<int,array>, pagination:array{page:int, per_page:int, total:int, total_pages:int, has_more:bool}}
     */
    private function searchPullRequests(string $token, string $login, string $since, int $page = 1, int $perPage = 20): array
    {
        $query = sprintf('author:%s type:pr updated:>=%s', $login, $since);
        $body = $this->apiGet($token, 'https://api.github.com/search/issues', [
            'q'        => $query,
            'sort'     => 'updated',
            'order'    => 'desc',
            'per_page' => $perPage,
            'page'     => $page,
        ]);

        $items = $body['items'] ?? [];
        $out = [];
        foreach ($items as $item) {
            $repo = '';
            if (!empty($item['repository_url'])) {
                $repo = preg_replace('#^https://api\.github\.com/repos/#', '', (string) $item['repository_url']);
            }
            $out[] = [
                'repo'       => $repo,
                'number'     => (int) ($item['number'] ?? 0),
                'title'      => (string) ($item['title'] ?? ''),
                'state'      => (string) ($item['state'] ?? ''),
                'url'        => (string) ($item['html_url'] ?? ''),
                'updated_at' => $item['updated_at'] ?? null,
                'merged'     => !empty($item['pull_request']['merged_at']),
            ];
        }

        $total = (int) ($body['total_count'] ?? count($out));
        $totalPages = $perPage > 0 ? (int) ceil($total / $perPage) : 1;

        return [
            'items'      => $out,
            'pagination' => [
                'page'        => $page,
                'per_page'    => $perPage,
                'total'       => $total,
                'total_pages' => max(1, $totalPages),
                'has_more'    => $page < $totalPages,
            ],
        ];
    }

    /**
     * @return array<int, array{full_name:string, name:string, private:bool, url:string}>
     */
    public function listRepos(int $organizationId, int $max = 30): array
    {
        $conn = $this->requireConnection($organizationId);
        $token = (string) $conn['secrets']['access_token'];

        $body = $this->apiGet($token, 'https://api.github.com/user/repos', [
            'sort'     => 'updated',
            'direction'=> 'desc',
            'per_page' => max(1, min(100, $max)),
        ]);

        if (!is_array($body)) {
            return [];
        }

        $out = [];
        foreach ($body as $repo) {
            if (!is_array($repo)) {
                continue;
            }
            $out[] = [
                'full_name' => (string) ($repo['full_name'] ?? ''),
                'name'      => (string) ($repo['name'] ?? ''),
                'private'   => !empty($repo['private']),
                'url'       => (string) ($repo['html_url'] ?? ''),
            ];
        }
        return $out;
    }

    /**
     * @return array<string,mixed>
     */
    public function getPullRequest(int $organizationId, string $owner, string $repo, int $number): array
    {
        $conn = $this->requireConnection($organizationId);
        $token = (string) $conn['secrets']['access_token'];
        $path = sprintf('https://api.github.com/repos/%s/%s/pulls/%d', rawurlencode($owner), rawurlencode($repo), $number);

        $pr = $this->apiGet($token, $path, []);
        $comments = $this->apiGet($token, sprintf('https://api.github.com/repos/%s/%s/issues/%d/comments', rawurlencode($owner), rawurlencode($repo), $number), ['per_page' => 50]);
        $reviews = $this->apiGet($token, sprintf('%s/reviews', $path), ['per_page' => 20]);

        $commentList = [];
        if (is_array($comments)) {
            foreach ($comments as $c) {
                if (!is_array($c)) {
                    continue;
                }
                $commentList[] = [
                    'id'        => (int) ($c['id'] ?? 0),
                    'author'    => (string) ($c['user']['login'] ?? ''),
                    'body'      => (string) ($c['body'] ?? ''),
                    'created_at'=> $c['created_at'] ?? null,
                ];
            }
        }

        $reviewList = [];
        if (is_array($reviews)) {
            foreach ($reviews as $r) {
                if (!is_array($r)) {
                    continue;
                }
                $reviewList[] = [
                    'id'        => (int) ($r['id'] ?? 0),
                    'author'    => (string) ($r['user']['login'] ?? ''),
                    'state'     => (string) ($r['state'] ?? ''),
                    'body'      => (string) ($r['body'] ?? ''),
                    'submitted_at' => $r['submitted_at'] ?? null,
                ];
            }
        }

        return [
            'number'       => (int) ($pr['number'] ?? $number),
            'title'        => (string) ($pr['title'] ?? ''),
            'body'         => (string) ($pr['body'] ?? ''),
            'state'        => (string) ($pr['state'] ?? ''),
            'merged'       => !empty($pr['merged_at']),
            'mergeable'    => $pr['mergeable'] ?? null,
            'user'         => (string) ($pr['user']['login'] ?? ''),
            'head'         => (string) ($pr['head']['ref'] ?? ''),
            'base'         => (string) ($pr['base']['ref'] ?? ''),
            'url'          => (string) ($pr['html_url'] ?? ''),
            'created_at'   => $pr['created_at'] ?? null,
            'updated_at'   => $pr['updated_at'] ?? null,
            'comments'     => $commentList,
            'reviews'      => $reviewList,
            'repo'         => $owner . '/' . $repo,
        ];
    }

    /**
     * @return array{id:int, author:string, body:string, created_at:?string}
     */
    public function addPullRequestComment(int $organizationId, string $owner, string $repo, int $number, string $body): array
    {
        $text = trim($body);
        if ($text === '') {
            throw new \InvalidArgumentException('Comment text is required.');
        }

        $conn = $this->requireConnection($organizationId);
        $token = (string) $conn['secrets']['access_token'];
        $url = sprintf('https://api.github.com/repos/%s/%s/issues/%d/comments', rawurlencode($owner), rawurlencode($repo), $number);

        $result = $this->apiPost($token, $url, ['body' => mb_substr($text, 0, 5000)]);

        return [
            'id'         => (int) ($result['id'] ?? 0),
            'author'     => (string) ($result['user']['login'] ?? ''),
            'body'       => $text,
            'created_at' => $result['created_at'] ?? null,
        ];
    }

    public function mergePullRequest(int $organizationId, string $owner, string $repo, int $number): array
    {
        $conn = $this->requireConnection($organizationId);
        $token = (string) $conn['secrets']['access_token'];
        $url = sprintf('https://api.github.com/repos/%s/%s/pulls/%d/merge', rawurlencode($owner), rawurlencode($repo), $number);

        return $this->apiPut($token, $url, []);
    }

    public function updatePullRequest(int $organizationId, string $owner, string $repo, int $number, string $state): array
    {
        $state = strtolower($state) === 'open' ? 'open' : 'closed';
        $conn = $this->requireConnection($organizationId);
        $token = (string) $conn['secrets']['access_token'];
        $url = sprintf('https://api.github.com/repos/%s/%s/pulls/%d', rawurlencode($owner), rawurlencode($repo), $number);

        return $this->apiPatch($token, $url, ['state' => $state]);
    }

    private function resolveLogin(string $token): ?string
    {
        $body = $this->apiGet($token, 'https://api.github.com/user', []);
        return $body['login'] ?? null;
    }

    /**
     * @param array<string,mixed> $query
     * @return array<string,mixed>
     */
    private function apiGet(string $token, string $url, array $query, string $accept = 'application/vnd.github+json'): array
    {
        $client = \Config\Services::curlrequest(['timeout' => 25, 'http_errors' => false]);
        $response = $client->get($url, [
            'headers' => [
                'Authorization' => 'Bearer ' . $token,
                'Accept'        => $accept,
                'User-Agent'    => 'FlowTrack',
            ],
            'query' => $query,
        ]);

        $status = $response->getStatusCode();
        $body = json_decode((string) $response->getBody(), true);

        if ($status === 401) {
            throw new \RuntimeException('GitHub authorization expired. Please reconnect GitHub in Settings → Integrations.');
        }
        if ($status >= 400 || !is_array($body)) {
            $msg = is_array($body) ? ($body['message'] ?? null) : null;
            throw new \RuntimeException($msg ? ('GitHub error: ' . $msg) : 'Failed to reach GitHub.');
        }

        return $body;
    }

    /**
     * @param array<string,mixed> $payload
     * @return array<string,mixed>
     */
    private function apiPost(string $token, string $url, array $payload): array
    {
        $client = \Config\Services::curlrequest(['timeout' => 25, 'http_errors' => false]);
        $response = $client->post($url, [
            'headers' => [
                'Authorization' => 'Bearer ' . $token,
                'Accept'        => 'application/vnd.github+json',
                'User-Agent'    => 'FlowTrack',
                'Content-Type'  => 'application/json',
            ],
            'body' => json_encode($payload),
        ]);

        return $this->parseGithubResponse($response);
    }

    /**
     * @param array<string,mixed> $payload
     * @return array<string,mixed>
     */
    private function apiPut(string $token, string $url, array $payload): array
    {
        $client = \Config\Services::curlrequest(['timeout' => 25, 'http_errors' => false]);
        $response = $client->put($url, [
            'headers' => [
                'Authorization' => 'Bearer ' . $token,
                'Accept'        => 'application/vnd.github+json',
                'User-Agent'    => 'FlowTrack',
                'Content-Type'  => 'application/json',
            ],
            'body' => json_encode($payload),
        ]);

        return $this->parseGithubResponse($response);
    }

    /**
     * @param array<string,mixed> $payload
     * @return array<string,mixed>
     */
    private function apiPatch(string $token, string $url, array $payload): array
    {
        $client = \Config\Services::curlrequest(['timeout' => 25, 'http_errors' => false]);
        $response = $client->patch($url, [
            'headers' => [
                'Authorization' => 'Bearer ' . $token,
                'Accept'        => 'application/vnd.github+json',
                'User-Agent'    => 'FlowTrack',
                'Content-Type'  => 'application/json',
            ],
            'body' => json_encode($payload),
        ]);

        return $this->parseGithubResponse($response);
    }

    /**
     * @param mixed $response
     * @return array<string,mixed>
     */
    private function parseGithubResponse($response): array
    {
        $status = $response->getStatusCode();
        $body = json_decode((string) $response->getBody(), true);

        if ($status === 401) {
            throw new \RuntimeException('GitHub authorization expired. Please reconnect GitHub in Integrations.');
        }
        if ($status >= 400 || !is_array($body)) {
            $msg = is_array($body) ? ($body['message'] ?? null) : null;
            throw new \RuntimeException($msg ? ('GitHub error: ' . $msg) : 'Failed to reach GitHub.');
        }

        return $body;
    }

    private function firstLine(string $message): string
    {
        $line = strtok($message, "\n");
        $line = $line === false ? $message : $line;
        return mb_strlen($line) > 200 ? mb_substr($line, 0, 200) : $line;
    }

    private function requireConnection(int $organizationId): array
    {
        $conn = $this->integrations->get($organizationId, 'github');
        if (!$conn || !$conn['is_enabled'] || empty($conn['secrets']['access_token'])) {
            throw new \RuntimeException('GitHub is not connected for this organization.');
        }
        return $conn;
    }
}
