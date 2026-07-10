<?php

namespace App\Services;

use Config\OAuth as OAuthConfig;

/**
 * Reads/writes a connected organization's Jira Cloud data via the Atlassian
 * OAuth 2.0 (3LO) token. Handles automatic access-token refresh (offline_access).
 */
class JiraService
{
    protected IntegrationService $integrations;
    protected OAuthConfig $oauth;

    public function __construct()
    {
        $this->integrations = new IntegrationService();
        $this->oauth = new OAuthConfig();
    }

    public function isConnected(int $organizationId): bool
    {
        $conn = $this->integrations->get($organizationId, 'jira');
        return $conn !== null && $conn['is_enabled']
            && !empty($conn['secrets']['access_token'])
            && !empty($conn['settings']['cloud_id']);
    }

    /**
     * Search issues with cursor-based pagination (Jira enhanced JQL API).
     *
     * @return array{issues:array<int,array>, next_page_token:?string, has_more:bool}
     */
    public function searchIssues(
        int $organizationId,
        ?string $jql = null,
        int $maxResults = 25,
        ?string $nextPageToken = null
    ): array {
        $conn = $this->requireConnection($organizationId);
        $siteUrl = rtrim((string) ($conn['settings']['site_url'] ?? ''), '/');
        $query = $jql !== null && trim($jql) !== ''
            ? trim($jql)
            : 'assignee = currentUser() ORDER BY updated DESC';

        $payload = [
            'jql'        => $query,
            'maxResults' => max(1, min(50, $maxResults)),
            'fields'     => ['summary', 'status', 'updated', 'project', 'assignee', 'priority', 'issuetype'],
        ];
        if ($nextPageToken !== null && $nextPageToken !== '') {
            $payload['nextPageToken'] = $nextPageToken;
        }

        $body = $this->request($organizationId, 'post', '/rest/api/3/search/jql', [
            'headers' => ['Content-Type' => 'application/json'],
            'body' => json_encode($payload),
        ]);

        $out = [];
        foreach ($body['issues'] ?? [] as $issue) {
            $key = (string) ($issue['key'] ?? '');
            $fields = $issue['fields'] ?? [];
            $out[] = [
                'key'      => $key,
                'summary'  => (string) ($fields['summary'] ?? ''),
                'status'   => (string) ($fields['status']['name'] ?? ''),
                'project'  => (string) ($fields['project']['name'] ?? ''),
                'url'      => $siteUrl !== '' ? $siteUrl . '/browse/' . $key : '',
                'updated'  => $fields['updated'] ?? null,
                'priority' => (string) ($fields['priority']['name'] ?? ''),
                'type'     => (string) ($fields['issuetype']['name'] ?? ''),
                'assignee' => (string) ($fields['assignee']['displayName'] ?? ''),
            ];
        }

        $token = isset($body['nextPageToken']) && is_string($body['nextPageToken']) && $body['nextPageToken'] !== ''
            ? $body['nextPageToken']
            : null;

        return [
            'issues'           => $out,
            'next_page_token'  => $token,
            'has_more'         => $token !== null,
        ];
    }

    /**
     * @deprecated Use searchIssues() for pagination support.
     *
     * @return array<int, array{key:string, summary:string, status:string, project:string, url:string, updated:?string}>
     */
    public function recentIssues(int $organizationId, int $max = 30, ?string $jql = null): array
    {
        return $this->searchIssues($organizationId, $jql, $max)['issues'];
    }

    /**
     * Full issue detail for in-app workspace.
     *
     * @return array<string,mixed>
     */
    public function getIssue(int $organizationId, string $issueKey): array
    {
        $conn = $this->requireConnection($organizationId);
        $siteUrl = rtrim((string) ($conn['settings']['site_url'] ?? ''), '/');

        $body = $this->request($organizationId, 'get', '/rest/api/3/issue/' . rawurlencode($issueKey), [
            'query' => ['fields' => 'summary,description,status,assignee,reporter,priority,issuetype,project,updated,created,comment'],
        ]);

        $fields = $body['fields'] ?? [];
        $description = $this->adfToPlainText($fields['description'] ?? null);

        $comments = [];
        foreach ($fields['comment']['comments'] ?? [] as $c) {
            $comments[] = [
                'id'      => (string) ($c['id'] ?? ''),
                'author'  => (string) ($c['author']['displayName'] ?? ''),
                'body'    => $this->adfToPlainText($c['body'] ?? null),
                'created' => $c['created'] ?? null,
            ];
        }

        return [
            'key'         => (string) ($body['key'] ?? $issueKey),
            'summary'     => (string) ($fields['summary'] ?? ''),
            'description' => $description,
            'status'      => (string) ($fields['status']['name'] ?? ''),
            'status_id'   => (string) ($fields['status']['id'] ?? ''),
            'assignee'    => (string) ($fields['assignee']['displayName'] ?? ''),
            'reporter'    => (string) ($fields['reporter']['displayName'] ?? ''),
            'priority'    => (string) ($fields['priority']['name'] ?? ''),
            'type'        => (string) ($fields['issuetype']['name'] ?? ''),
            'project'     => (string) ($fields['project']['name'] ?? ''),
            'url'         => $siteUrl !== '' ? $siteUrl . '/browse/' . ($body['key'] ?? $issueKey) : '',
            'updated'     => $fields['updated'] ?? null,
            'created'     => $fields['created'] ?? null,
            'comments'    => $comments,
        ];
    }

    /**
     * @return array<int, array{id:string, name:string, to_status:string}>
     */
    public function getTransitions(int $organizationId, string $issueKey): array
    {
        $body = $this->request($organizationId, 'get', '/rest/api/3/issue/' . rawurlencode($issueKey) . '/transitions');
        $out = [];
        foreach ($body['transitions'] ?? [] as $t) {
            $out[] = [
                'id'        => (string) ($t['id'] ?? ''),
                'name'      => (string) ($t['name'] ?? ''),
                'to_status' => (string) ($t['to']['name'] ?? ''),
            ];
        }
        return $out;
    }

    public function transitionIssue(int $organizationId, string $issueKey, string $transitionId): bool
    {
        $this->request($organizationId, 'post', '/rest/api/3/issue/' . rawurlencode($issueKey) . '/transitions', [
            'headers' => ['Content-Type' => 'application/json'],
            'body' => json_encode(['transition' => ['id' => $transitionId]]),
        ]);
        return true;
    }

    /**
     * @return array{id:string, author:string, body:string, created:?string}
     */
    public function addComment(int $organizationId, string $issueKey, string $text): array
    {
        $text = trim($text);
        if ($text === '') {
            throw new \InvalidArgumentException('Comment text is required.');
        }

        $body = $this->request($organizationId, 'post', '/rest/api/3/issue/' . rawurlencode($issueKey) . '/comment', [
            'headers' => ['Content-Type' => 'application/json'],
            'body' => json_encode([
                'body' => [
                    'type'    => 'doc',
                    'version' => 1,
                    'content' => [[
                        'type'    => 'paragraph',
                        'content' => [['type' => 'text', 'text' => mb_substr($text, 0, 5000)]],
                    ]],
                ],
            ]),
        ]);

        return [
            'id'      => (string) ($body['id'] ?? ''),
            'author'  => (string) ($body['author']['displayName'] ?? ''),
            'body'    => $text,
            'created' => $body['created'] ?? null,
        ];
    }

    /**
     * Push a worklog to a Jira issue. Best-effort; returns true on success.
     */
    public function addWorklog(int $organizationId, string $issueKey, int $seconds, string $startedAtUtc, string $comment = ''): bool
    {
        $seconds = max(60, $seconds);
        // Jira expects e.g. 2021-01-17T12:34:56.000+0000
        $started = date('Y-m-d\TH:i:s.000O', strtotime($startedAtUtc) ?: time());

        $payload = [
            'timeSpentSeconds' => $seconds,
            'started'          => $started,
        ];

        if ($comment !== '') {
            $payload['comment'] = [
                'type'    => 'doc',
                'version' => 1,
                'content' => [[
                    'type'    => 'paragraph',
                    'content' => [['type' => 'text', 'text' => mb_substr($comment, 0, 500)]],
                ]],
            ];
        }

        $this->request($organizationId, 'post', '/rest/api/3/issue/' . rawurlencode($issueKey) . '/worklog', [
            'headers' => ['Content-Type' => 'application/json'],
            'body' => json_encode($payload),
        ]);

        return true;
    }

    /**
     * Perform an authenticated Jira Cloud API call, refreshing the token on 401.
     *
     * @param array<string,mixed> $options
     * @return array<string,mixed>
     */
    private function request(int $organizationId, string $method, string $path, array $options = [], bool $retry = true): array
    {
        [$token, $cloudId] = $this->accessToken($organizationId);
        $cfg = $this->oauth->provider('jira');
        $url = rtrim((string) $cfg['api_base'], '/') . '/' . $cloudId . $path;

        $client = \Config\Services::curlrequest(['timeout' => 25, 'http_errors' => false]);
        $options['headers'] = array_merge([
            'Authorization' => 'Bearer ' . $token,
            'Accept'        => 'application/json',
        ], $options['headers'] ?? []);

        $response = $client->request(strtoupper($method), $url, $options);
        $status = $response->getStatusCode();

        if ($status === 401 && $retry) {
            $this->refresh($organizationId);
            return $this->request($organizationId, $method, $path, $options, false);
        }

        $raw = (string) $response->getBody();
        $body = $raw !== '' ? json_decode($raw, true) : [];

        if ($status >= 400) {
            $msg = is_array($body) ? ($body['errorMessages'][0] ?? ($body['error'] ?? null)) : null;
            throw new \RuntimeException($msg ? ('Jira error: ' . $msg) : 'Jira request failed (' . $status . ').');
        }

        return is_array($body) ? $body : [];
    }

    /**
     * Current access token + cloud id, refreshing proactively if near expiry.
     *
     * @return array{0:string,1:string}
     */
    private function accessToken(int $organizationId): array
    {
        $conn = $this->requireConnection($organizationId);
        $expiresAt = $conn['settings']['expires_at'] ?? null;

        if ($expiresAt && strtotime((string) $expiresAt) <= time() + 60 && !empty($conn['secrets']['refresh_token'])) {
            return $this->refresh($organizationId);
        }

        return [(string) $conn['secrets']['access_token'], (string) $conn['settings']['cloud_id']];
    }

    /**
     * Exchange the stored refresh token for a fresh access token.
     *
     * @return array{0:string,1:string}
     */
    private function refresh(int $organizationId): array
    {
        $conn = $this->requireConnection($organizationId);
        $refreshToken = $conn['secrets']['refresh_token'] ?? null;
        if (!$refreshToken) {
            throw new \RuntimeException('Jira session expired. Please reconnect Jira in Settings → Integrations.');
        }

        $cfg = $this->oauth->provider('jira');
        $client = \Config\Services::curlrequest(['timeout' => 20, 'http_errors' => false]);

        $response = $client->post($cfg['token_url'], [
            'headers' => ['Accept' => 'application/json', 'Content-Type' => 'application/json'],
            'body' => json_encode([
                'grant_type'    => 'refresh_token',
                'client_id'     => $cfg['client_id'],
                'client_secret' => $cfg['client_secret'],
                'refresh_token' => $refreshToken,
            ]),
        ]);

        $body = json_decode((string) $response->getBody(), true);
        if (!is_array($body) || empty($body['access_token'])) {
            throw new \RuntimeException('Jira session expired. Please reconnect Jira in Settings → Integrations.');
        }

        $access = (string) $body['access_token'];
        $expiresIn = (int) ($body['expires_in'] ?? 3600);
        $cloudId = (string) $conn['settings']['cloud_id'];

        $this->integrations->saveOAuth(
            $organizationId,
            'jira',
            $conn['external_account_id'],
            array_filter([
                'access_token'  => $access,
                'refresh_token' => $body['refresh_token'] ?? $refreshToken,
            ]),
            ['expires_at' => date('Y-m-d H:i:s', time() + $expiresIn)],
            null
        );

        return [$access, $cloudId];
    }

    private function requireConnection(int $organizationId): array
    {
        $conn = $this->integrations->get($organizationId, 'jira');
        if (!$conn || !$conn['is_enabled'] || empty($conn['secrets']['access_token']) || empty($conn['settings']['cloud_id'])) {
            throw new \RuntimeException('Jira is not connected for this organization.');
        }
        return $conn;
    }

    /**
     * Best-effort plain text from Atlassian Document Format.
     *
     * @param mixed $adf
     */
    private function adfToPlainText($adf): string
    {
        if (!is_array($adf)) {
            return is_string($adf) ? $adf : '';
        }

        $parts = [];
        foreach ($adf['content'] ?? [] as $block) {
            foreach ($block['content'] ?? [] as $inline) {
                if (($inline['type'] ?? '') === 'text' && isset($inline['text'])) {
                    $parts[] = (string) $inline['text'];
                }
            }
        }

        return trim(implode("\n", $parts));
    }
}
