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
     * @return array{login:?string, commits:array<int,array>, pull_requests:array<int,array>}
     */
    public function recentActivity(int $organizationId, int $days = 7): array
    {
        $conn = $this->requireConnection($organizationId);
        $token = (string) $conn['secrets']['access_token'];
        $login = (string) ($conn['settings']['login'] ?? '');

        if ($login === '') {
            // Fall back to resolving the login from the token.
            $login = $this->resolveLogin($token) ?? '';
        }
        if ($login === '') {
            throw new \RuntimeException('Could not determine the connected GitHub account.');
        }

        $since = date('Y-m-d', strtotime('-' . max(1, $days) . ' days'));

        return [
            'login'         => $login,
            'commits'       => $this->searchCommits($token, $login, $since),
            'pull_requests' => $this->searchPullRequests($token, $login, $since),
        ];
    }

    /**
     * @return array<int, array{repo:string, sha:string, short_sha:string, message:string, url:string, authored_at:?string}>
     */
    private function searchCommits(string $token, string $login, string $since): array
    {
        $query = sprintf('author:%s author-date:>=%s', $login, $since);
        $body = $this->apiGet($token, 'https://api.github.com/search/commits', [
            'q'        => $query,
            'sort'     => 'author-date',
            'order'    => 'desc',
            'per_page' => 30,
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
        return $out;
    }

    /**
     * @return array<int, array{repo:string, number:int, title:string, state:string, url:string, updated_at:?string, merged:bool}>
     */
    private function searchPullRequests(string $token, string $login, string $since): array
    {
        $query = sprintf('author:%s type:pr updated:>=%s', $login, $since);
        $body = $this->apiGet($token, 'https://api.github.com/search/issues', [
            'q'        => $query,
            'sort'     => 'updated',
            'order'    => 'desc',
            'per_page' => 30,
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
        return $out;
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
